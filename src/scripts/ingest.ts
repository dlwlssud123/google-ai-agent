import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as _pdf from "pdf-parse";
// @ts-ignore
const { PDFParse } = _pdf;
import { getEmbedding, analyzeDocumentStructure, performOCR, performScanPdfOCR } from "../lib/gemini";
import { addDocumentsToVectorDB, clearManualCollection, deleteDocumentsFromVectorDB } from "../lib/chroma";
import { addManual, updateManualStatus } from "../lib/db";

// .env.local 환경 변수 명시적 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * PDF 파일을 페이지별로 쪼개어 텍스트를 추출합니다.
 * @param pdfPath PDF 파일 절대 경로
 * @returns 페이지별 텍스트 배열
 */
async function parsePdfByPages(pdfPath: string): Promise<string[]> {
  const dataBuffer = fs.readFileSync(pdfPath);
  // modern PDFParse 인스턴스 생성 및 로드
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  
  // 페이지 데이터 획득 (내부적으로 로드가 자동 처리됨)
  // @ts-ignore
  const res = await parser.getText();
  // 페이지 번호 순으로 정렬
  const sortedPages = res.pages.sort((a: any, b: any) => a.num - b.num);
  return sortedPages.map((page: any) => page.text);
}

/**
 * Gemini API 호출 중 발생할 수 있는 일시적 장애(503) 및 속도 제한(429)을 방지하기 위한 지수 백오프 기반 재시도 유틸리티
 */
async function retryWithDelay<T>(fn: () => Promise<T>, retries = 10, delayMs = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes("429") || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("limit");
    
    // Rate limit 에러가 나면 대기 시간을 대폭 늘림 (기본 15초)
    const activeDelay = isRateLimit ? Math.max(delayMs, 15000) : delayMs;
    
    console.warn(`[Gemini API 오류 발생] ${activeDelay}ms 후 재시도합니다... (남은 횟수: ${retries}) (원인: ${errMsg.substring(0, 100)}...)`);
    await new Promise((resolve) => setTimeout(resolve, activeDelay));
    return retryWithDelay(fn, retries - 1, activeDelay * 1.5);
  }
}

/**
 * 제한된 동시성(Concurrency)으로 비동기 작업을 병렬 처리하는 유틸리티 헬퍼 함수
 */
async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items.entries()];
  
  const workers = Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const [index, item] = next;
      results[index] = await fn(item, index);
      // API Rate Limit (RPM) 안정을 위해 설정된 지연 제공
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  });
  
  await Promise.all(workers);
  return results;
}

/**
 * 인제스천 메인 실행 함수 (웹/서버액션에서 임포트 가능하도록 export)
 * @param options clearDB: true이면 ChromaDB를 초기화하고 data/ 폴더 전체를 새로 적재합니다.
 */
export async function runIngestion(options: { clearDB?: boolean; freeTier?: boolean; targetFile?: string } = { clearDB: true, freeTier: true, targetFile: "" }) {
  console.log("=== [3단계] 데이터 적재 파이프라인 (Data Ingestion) 시작 ===");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.includes("YOUR_GEMINI_API_KEY")) {
    console.error("오류: 유효한 GEMINI_API_KEY가 .env.local에 설정되어 있지 않습니다.");
    console.error("인제스천 작업을 중단합니다.");
    if (require.main === module) process.exit(1);
    throw new Error("유효한 GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  // freeTier 옵션에 따른 동시성 및 딜레이 설정
  const concurrency = options.freeTier ? 1 : 3;
  const delayMs = options.freeTier ? 4000 : 150;
  const imgConcurrency = options.freeTier ? 1 : 2;
  const imgDelayMs = options.freeTier ? 4000 : 150;

  // 대상 디렉터리를 docs/에서 data/로 완벽 단일화 이전
  const dataDir = path.resolve(process.cwd(), "data");
  
  // data 폴더 자동 생성 처리
  if (!fs.existsSync(dataDir)) {
    console.log("data 디렉토리가 존재하지 않아 새로 생성합니다.");
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // data 폴더 내의 모든 PDF 파일 검색
  const filesInDocs = fs.readdirSync(dataDir);
  let pdfFiles = filesInDocs.filter(file => path.extname(file).toLowerCase() === ".pdf");

  // 특정 파일만 임베딩하도록 지정된 경우 필터링
  if (options.targetFile) {
    pdfFiles = pdfFiles.filter(f => f === options.targetFile);
    console.log(`특정 파일 타겟팅 모드: ${options.targetFile} 파일만 임베딩합니다.`);
  }

  console.log(`발견된 RAG PDF 파일 목록: ${pdfFiles.join(", ")}`);

  try {
    // 1. 기존 ChromaDB 컬렉션 비우기 (옵션에 따름)
    if (options.clearDB && !options.targetFile) {
      console.log("1. 기존 벡터 컬렉션 초기화 중...");
      try {
        await clearManualCollection();
      } catch (err) {
        console.log("기존 컬렉션이 없거나 삭제에 실패하여 건너뜁니다.");
      }
    }

    // [중요: 토큰 절약 최적화]
    // 갱신 시 발생하는 Gemini API 2.5 LLM 모델 쿼터 소모를 0으로 낮추기 위해
    // 디폴트값으로 skipLLMStructure를 true로 고정합니다. (원시 텍스트와 임베딩만으로 신속 안전 적재)
    let skipLLMStructure = true;
    const documentsToIngest: any[] = [];

    // 각 PDF 파일 순회하며 처리
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(dataDir, pdfFile);
      console.log(`\n--- PDF 파일 처리 시작: ${pdfFile} ---`);
      
      let stats;
      try {
        stats = fs.statSync(pdfPath);
      } catch (e) {
        console.warn(`[경고] 파일을 찾을 수 없어 건너뜁니다 (도중 삭제됨): ${pdfFile}`);
        continue;
      }
      
      // DB 상태 기록용 데이터 등록 (pending)
      const safeId = pdfFile.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      addManual(pdfFile, stats.size);

      // 개별 파일 적재 전, 중복 청크 적재 방지를 위한 해당 소스 벡터 선제 영구 소거 (멱등성 확보)
      await deleteDocumentsFromVectorDB(pdfFile);

      // 2. PDF 페이지별 파싱
      console.log(`2. PDF 페이지 파싱 시작: ${pdfFile}`);
      let rawPages = await parsePdfByPages(pdfPath);
      console.log(`파싱 완료. 총 ${rawPages.length}페이지 검출됨.`);

      // 스캔본 혹은 하이브리드(일부 스캔본) PDF 여부 검사 (텍스트가 비어 있거나 매우 적은 페이지가 존재하는지 확인)
      let ocrPages: string[] = [];
      const hasEmptyPages = rawPages.some(page => !page || page.trim().length < 20);
      if (hasEmptyPages) {
        console.log(`[경고] '${pdfFile}' 파일의 일부 페이지에 텍스트가 없거나 매우 적습니다. (${rawPages.filter(p => !p || p.trim().length < 20).length}개 페이지)`);
        console.log(`[대응] Gemini Vision PDF OCR 파이프라인을 작동하여 텍스트 복원을 수행합니다...`);
        try {
          const pdfBuffer = fs.readFileSync(pdfPath);
          ocrPages = await performScanPdfOCR(pdfBuffer);
          console.log(`[Gemini OCR 성공] 스캔 이미지로부터 총 ${ocrPages.length}개의 페이지 텍스트를 복원했습니다.`);
        } catch (ocrErr: any) {
          console.error(`[오류] Gemini PDF OCR 수행 도중 실패했습니다. 에러: ${ocrErr.message || ocrErr}`);
        }
      }

      // 페이지 병합 (rawText가 충분히 길면 그대로 쓰고, 비어있거나 짧으면 OCR 텍스트로 보완)
      for (let i = 0; i < rawPages.length; i++) {
        let text = rawPages[i]?.trim() || "";
        if (text.length < 20) {
          if (ocrPages.length === rawPages.length && ocrPages[i]) {
            text = ocrPages[i].trim();
            console.log(`[보완] 페이지 ${i + 1}의 텍스트가 부족하여 OCR 텍스트로 대체했습니다.`);
          } else if (ocrPages.length > 0) {
            if (ocrPages[i]) {
              text = ocrPages[i].trim();
              console.log(`[보완 - 개수 불일치] 페이지 ${i + 1}의 텍스트를 ocrPages[${i}]로 대체했습니다.`);
            }
          }
        }
        rawPages[i] = text;
      }

      let activePageCount = 0;

      // 3. 페이지별 데이터 정제 및 적재 준비 (동시성 1 혹은 3 병렬 처리 적용하여 임베딩 생성)
      console.log(`[${pdfFile}] 임베딩 파이프라인 가동 (동시성 한도: ${concurrency}, 지연 시간: ${delayMs}ms)...`);
      const pageIndices = Array.from({ length: rawPages.length }, (_, idx) => idx);

      await runConcurrent(pageIndices, concurrency, delayMs, async (i) => {
        const pageNum = i + 1;
        const rawText = rawPages[i].trim();

        if (!rawText) {
          console.log(`[${pdfFile} - 페이지 ${pageNum}] 텍스트가 비어 있어 건너뜁니다.`);
          return;
        }

        activePageCount++;
        let structuredText = rawText;

        if (!skipLLMStructure) {
          console.log(`[${pdfFile} - 페이지 ${pageNum}/${rawPages.length}] 구조 해석 및 정제 중...`);
          try {
            structuredText = await retryWithDelay(() => analyzeDocumentStructure(rawText));
          } catch (llmError) {
            console.warn(`[경고] Gemini LLM 구조 정제 실패 (할당량 초과 또는 API 오류). 이후 페이지부터 구조 정제를 건너뛰고 원시 텍스트를 그대로 사용합니다. 에러: ${(llmError as any).message || llmError}`);
            skipLLMStructure = true;
          }
        }

        console.log(`[${pdfFile} - 페이지 ${pageNum}/${rawPages.length}] 텍스트 임베딩 생성 중...`);
        // Gemini Embedding API 호출
        const vector = await retryWithDelay(() => getEmbedding(structuredText));

        // 고유 ID 생성 (파일명과 페이지 번호 결합)
        documentsToIngest.push({
          id: `pdf_${safeId}_page_${pageNum}`,
          vector,
          text: structuredText,
          metadata: {
            source: pdfFile,
            page: pageNum,
            type: "pdf"
          }
        });
      });

      // 인제스천이 완료된 파일 상태를 DB에 성공(success)으로 업데이트
      if (activePageCount > 0) {
        updateManualStatus(safeId, "success");
      } else {
        updateManualStatus(safeId, "failed");
      }
    }

    // 4. (추가 기능) 이미지 파일 OCR 및 적재 지원 (동시성 1 혹은 2 병렬 처리 적용)
    const imageExtensions = [".png", ".jpg", ".jpeg"];
    const imageFilesToProcess = filesInDocs.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    let virtualPageNum = 100; // 이미지 파일은 가상의 100번대 페이지부터 할당

    if (imageFilesToProcess.length > 0) {
      console.log(`\n[비정형 이미지 발견] 총 ${imageFilesToProcess.length}개 이미지 병렬 OCR 및 임베딩 처리 가동...`);
      await runConcurrent(imageFilesToProcess, imgConcurrency, imgDelayMs, async (file) => {
        const ext = path.extname(file).toLowerCase();
        const safeImageId = file.replace(/[^a-zA-Z0-9가-힣]/g, "_");
        try {
          const imagePath = path.join(dataDir, file);
          console.log(`이미지 OCR 처리 중: ${file}`);
          
          addManual(file, fs.statSync(imagePath).size);
          const imageBuffer = fs.readFileSync(imagePath);
          
          let mimeType = "image/png";
          if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";

          // Gemini Vision을 통한 OCR 텍스트 추출 및 정형화
          const ocrText = await retryWithDelay(() => performOCR(imageBuffer, mimeType));
          console.log(`OCR 텍스트 추출 완료! 내용 길이: ${ocrText.length} (${file})`);

          console.log(`[${file}] 텍스트 임베딩 생성 중...`);
          const vector = await retryWithDelay(() => getEmbedding(ocrText));

          documentsToIngest.push({
            id: `image_ocr_${safeImageId}`,
            vector,
            text: ocrText,
            metadata: {
              source: file,
              page: virtualPageNum++,
              type: "image_ocr"
            }
          });

          updateManualStatus(safeImageId, "success");
        } catch (imageError) {
          console.error(`[오류] 이미지 ${file} OCR 처리 실패. 이 이미지는 건너뜁니다. 에러: ${(imageError as any).message || imageError}`);
          updateManualStatus(safeImageId, "failed");
        }
      });
    }

    // 5. ChromaDB 최종 적재
    if (documentsToIngest.length > 0) {
      console.log(`\n3. 총 ${documentsToIngest.length}개의 데이터를 ChromaDB에 적재합니다...`);
      await addDocumentsToVectorDB(documentsToIngest);
      console.log("=== [3단계] 데이터 적재 파이프라인 성공적으로 완료! ===");
      return { success: true, count: documentsToIngest.length, message: "성공적으로 RAG 임베딩이 적재되었습니다." };
    } else {
      console.warn("적재할 문서 데이터가 없습니다.");
      return { success: false, count: 0, message: "적재할 문서가 존재하지 않습니다." };
    }
  } catch (error) {
    console.error("데이터 적재 파이프라인 수행 중 오류 발생:", error);
    if (require.main === module) process.exit(1);
    throw error;
  }
}

// Node CLI 환경에서 직접 실행 시 동작 처리
const currentFilePath = typeof __filename !== 'undefined' ? __filename : '';
const isDirectRun = require.main === module || (process.argv[1] && process.argv[1].endsWith("ingest.ts"));

if (isDirectRun) {
  const clearDBArg = process.argv.find(arg => arg.startsWith("--clearDB="));
  const clearDB = clearDBArg ? clearDBArg.split("=")[1] === "true" : true;

  const freeTierArg = process.argv.find(arg => arg.startsWith("--freeTier="));
  const freeTier = freeTierArg ? freeTierArg.split("=")[1] === "true" : true;
  
  const fileArg = process.argv.find(arg => arg.startsWith("--file="));
  const targetFile = fileArg ? fileArg.split("=")[1] : "";
  
  console.log(`[CLI Run] 인제스천 실행 옵션 - clearDB: ${clearDB}, freeTier: ${freeTier}, targetFile: ${targetFile}`);
  runIngestion({ clearDB, freeTier, targetFile })
    .then(() => {
      console.log("CLI 인제스천 성공적으로 완료");
      process.exit(0);
    })
    .catch((err) => {
      console.error("CLI 인제스천 실행 실패:", err);
      process.exit(1);
    });
}
