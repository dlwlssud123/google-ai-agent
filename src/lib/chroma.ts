import { ChromaClient } from "chromadb";

// ChromaDB 클라이언트 초기화
// CHROMADB_URL 환경 변수가 설정되어 있지 않으면 기본값으로 http://localhost:8000 사용
const chromaUrl = process.env.CHROMADB_URL || "http://localhost:8000";

let clientInstance: ChromaClient | null = null;

export function getChromaClient(): ChromaClient {
  if (!clientInstance) {
    try {
      const url = new URL(chromaUrl);
      const host = url.hostname;
      const port = url.port ? parseInt(url.port) : (url.protocol === "https:" ? 443 : 80);
      const ssl = url.protocol === "https:";
      
      clientInstance = new ChromaClient({ host, port, ssl });
    } catch (e) {
      console.warn("CHROMADB_URL 파싱 실패, 기본값(localhost:8000)으로 접속합니다.", e);
      clientInstance = new ChromaClient({ host: "localhost", port: 8000 });
    }
  }
  return clientInstance;
}

// 매뉴얼용 컬렉션 이름 지정
export const MANUAL_COLLECTION_NAME = "equipment_manuals";

/**
 * 매뉴얼 컬렉션을 가져오거나 생성합니다.
 */
export async function getOrCreateManualCollection() {
  const client = getChromaClient();
  try {
    // 경고 메시지를 방지하기 위해 더미 임베딩 함수 정의
    const dummyEmbeddingFunction = {
      generate: async (texts: string[]) => {
        return texts.map(() => []);
      },
    };

    return await client.getOrCreateCollection({
      name: MANUAL_COLLECTION_NAME,
      metadata: { "hnsw:space": "cosine" }, // Cosine 유사도로 설정
      embeddingFunction: dummyEmbeddingFunction,
    });
  } catch (error) {
    console.error("ChromaDB 컬렉션 생성/가져오기 중 오류 발생:", error);
    throw error;
  }
}

interface IngestDocument {
  id: string;
  vector: number[];
  text: string;
  metadata: {
    source: string; // 파일명 또는 경로
    page: number;   // 페이지 번호
    [key: string]: any;
  };
}

/**
 * ChromaDB 컬렉션에 문서를 추가(적재)합니다.
 * @param documents 적재할 문서 배열
 */
export async function addDocumentsToVectorDB(documents: IngestDocument[]) {
  const collection = await getOrCreateManualCollection();
  
  // PDF 등에서 추출된 제어 문자, Null 바이트, 반쪽짜리 써로게이트(Unpaired surrogate) 등 
  // ChromaDB JSON 파서 에러를 유발하는 비정상 유니코드 문자열을 완벽하게 정제
  const sanitizeText = (text: string) => {
    if (!text) return "";
    let clean = text;
    // 최신 Node.js의 toWellFormed()를 이용해 깨진 유니코드 쌍을 U+FFFD로 치환
    if (typeof clean.toWellFormed === "function") {
      clean = clean.toWellFormed();
    } else {
      clean = clean.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|([^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1\uFFFD");
    }
    // 제어문자 및 U+FFFD 제거
    return clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g, "");
  };
  
  const ids = documents.map((doc) => sanitizeText(doc.id));
  const embeddings = documents.map((doc) => doc.vector);
  const metadatas = documents.map((doc) => {
    const meta = { ...doc.metadata };
    for (const key in meta) {
      if (typeof meta[key] === "string") {
        meta[key] = sanitizeText(meta[key]);
      }
    }
    return meta;
  });
  const contents = documents.map((doc) => sanitizeText(doc.text));

  try {
    // 너무 큰 JSON 페이로드는 네트워크 절단(Truncation)을 유발하므로 20개씩 청크 분할하여 적재
    const BATCH_SIZE = 20;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      await collection.add({
        ids: ids.slice(i, i + BATCH_SIZE),
        embeddings: embeddings.slice(i, i + BATCH_SIZE),
        metadatas: metadatas.slice(i, i + BATCH_SIZE),
        documents: contents.slice(i, i + BATCH_SIZE),
      });
    }
    console.log(`${documents.length}개의 문서를 ChromaDB에 성공적으로 저장했습니다.`);
  } catch (error) {
    console.error("ChromaDB 문서 추가 중 오류 발생:", error);
    throw error;
  }
}

/**
 * 임베딩 벡터를 사용하여 유사한 문서 청크를 검색합니다.
 * @param queryVector 쿼리 텍스트의 임베딩 벡터
 * @param limit 가져올 상위 결과 개수 (기본값 Top 3)
 * @param filterFileNames 검색 대상을 이 파일명 목록으로 제한 (세션별 RAG 분리용). 비어있으면 전체 검색.
 */
export async function querySimilarityFromVectorDB(queryVector: number[], limit = 3, filterFileNames?: string[]) {
  const collection = await getOrCreateManualCollection();

  // ChromaDB $in 연산자 호환성 문제로 whereClause 대신 클라이언트 사이드 필터링 사용
  // 파일 필터가 있을 때는 더 많은 결과를 가져와서 JS에서 걸러냄
  const fetchLimit = filterFileNames && filterFileNames.length > 0 ? limit * 5 : limit;

  try {
    const results = await collection.query({
      queryEmbeddings: [queryVector],
      nResults: fetchLimit,
      include: ["documents", "metadatas", "distances"] as any,
    });

    // 상세 디버깅 로그 추가
    console.log(`[ChromaDB Debug] 쿼리 원본 결과 개수: ${results.ids?.[0]?.length || 0}`);
    if (filterFileNames && filterFileNames.length > 0) {
      console.log(`[ChromaDB Debug] 필터링 대상 파일 목록: ${JSON.stringify(filterFileNames)}`);
      if (results.metadatas && results.metadatas[0]) {
        const rawSources = results.metadatas[0].map(m => (m as any)?.source || "no-source");
        console.log(`[ChromaDB Debug] 상위 ${fetchLimit}개 원본 문서 소스: ${JSON.stringify(rawSources)}`);
      }
    }

    // 결과를 가독성 좋은 객체 리스트로 매핑
    const queryResults = [];
    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const rawDist = results.distances?.[0]?.[i];
        const meta = results.metadatas ? results.metadatas[0][i] : null;

        // 파일 필터가 있을 때: source 필드가 필터 목록에 포함된 결과만 통과
        if (filterFileNames && filterFileNames.length > 0) {
          const docSource = (meta as any)?.source || "";
          // 파일명 완전일치 또는 경로 끝 파일명 일치
          const baseName = docSource.split(/[/\\]/).pop() || docSource;
          const matched = filterFileNames.some(
            (f) => f === docSource || f === baseName
          );
          if (!matched) {
            console.log(`[ChromaDB Debug] 필터 불일치 스킵: ${docSource} (Base: ${baseName}) vs 필터 목록`);
            continue;
          }
        }

        queryResults.push({
          id: results.ids[0][i],
          distance: (rawDist !== undefined && rawDist !== null) ? rawDist : null,
          metadata: meta,
          document: results.documents ? results.documents[0][i] : null,
        });

        // 필요한 개수만큼 찼으면 중단
        if (queryResults.length >= limit) break;
      }
    }

    if (filterFileNames && filterFileNames.length > 0) {
      console.log(`[ChromaDB] 파일 필터 적용: [${filterFileNames.join(", ")}] → ${queryResults.length}/${fetchLimit}개 결과`);
    }

    return queryResults;
  } catch (error) {
    console.error("ChromaDB 유사도 검색 중 오류 발생:", error);
    throw error;
  }

}

/**
 * 테스트용 컬렉션을 비우는 유틸리티 (필요시 호출)
 */
export async function clearManualCollection() {
  const client = getChromaClient();
  try {
    await client.deleteCollection({ name: MANUAL_COLLECTION_NAME });
    console.log(`컬렉션 '${MANUAL_COLLECTION_NAME}'이 삭제되었습니다.`);
  } catch (error) {
    console.log(`컬렉션 '${MANUAL_COLLECTION_NAME}' 삭제 실패 (존재하지 않을 수 있음):`, error);
  }
}

/**
 * 특정 파일명에 기반하여 관련 ChromaDB 임베딩 문서들을 일괄 영구 제거합니다.
 * @param sourceFileName 제거할 대상 파일명
 */
export async function deleteDocumentsFromVectorDB(sourceFileName: string) {
  const collection = await getOrCreateManualCollection();
  try {
    await collection.delete({
      where: { source: sourceFileName }
    });
    console.log(`ChromaDB에서 소스 '${sourceFileName}' 문서들을 삭제 완료했습니다.`);
  } catch (error) {
    console.error(`ChromaDB 문서 삭제 중 오류 발생 (${sourceFileName}):`, error);
  }
}
