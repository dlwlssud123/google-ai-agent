"use server";

import { getEmbedding, getGeminiClient, GENERATIVE_MODEL_NAME } from "../../lib/gemini";
import { querySimilarityFromVectorDB } from "../../lib/chroma";
import { SYSTEM_INSTRUCTION } from "../../lib/prompt";
import { getCachedResponse, saveQACache, getSessionManualFileNames, saveFeedback } from "../../lib/db";
import { filterSensitiveData } from "../../lib/security";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  status: "success" | "fail-safe";
  answer: string;
  citations: { source: string; page: number }[];
  nextSteps: string[];
  isCached?: boolean; // 캐시 적용 여부 플래그
}

/**
 * 텍스트 속에서 JSON 문자열을 찾아 파싱하는 안전한 보조 유틸리티
 */
function cleanAndParseJSON(rawResponse: string): ChatResponse {
  let cleaned = rawResponse.trim();
  
  // 마크다운 코드 블록 제거 기법
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned) as ChatResponse;
  } catch (error) {
    console.error("JSON 파싱 에러 발생, 원문:", rawResponse, error);
    
    // 파싱 오류 발생 시 예외 보완 조치 (Fallback)
    return {
      status: "fail-safe",
      answer: "조치 절차 생성 중 시스템 포맷 변환 오류가 발생했습니다. 원문 매뉴얼을 직접 검토하거나 안전 관리자에게 즉시 문의하십시오.",
      citations: [],
      nextSteps: ["ChromaDB 상태 점검", "시스템 로그 확인"]
    };
  }
}

/**
 * 작업자의 에러 입력(증상)에 기반하여 ChromaDB 벡터 매핑 및 Gemini RAG 분석을 실행합니다.
 * @param query 사용자가 입력한 검색어 또는 증상
 * @param history 대화 흐름을 관리하기 위한 대화 목록 이력
 * @param sessionId 현재 채팅 세션 ID (세션에 연결된 파일로만 RAG 검색 범위 제한)
 */
export async function askAgent(query: string, history: ChatMessage[] = [], sessionId?: string): Promise<ChatResponse> {
  if (!query || !query.trim()) {
    return {
      status: "fail-safe",
      answer: "올바른 에러 증상 혹은 키워드를 입력해 주십시오.",
      citations: [],
      nextSteps: []
    };
  }

  // 외부 LLM API 전송 및 RAG 조회가 일어나기 전 민감 개인정보 및 사내 기밀 단어 마스킹 처리
  query = filterSensitiveData(query);

  // 세션에 연결된 파일 목록 조회 (RAG 검색 범위 제한용)
  const filterFileNames = sessionId ? getSessionManualFileNames(sessionId) : [];

  // 세션에 연결된 파일이 없으면 즉시 안내 반환 (LLM/ChromaDB 호출 절약)
  if (sessionId && filterFileNames.length === 0) {
    return {
      status: "fail-safe",
      answer: "이 채팅방에 연결된 매뉴얼이 없습니다. 사이드바에서 매뉴얼 파일을 업로드하거나 기존 파일을 연결해 주십시오.",
      citations: [],
      nextSteps: ["사이드바에서 PDF 또는 이미지 파일 업로드", "기존 파일 채팅방에 연결"]
    };
  }

  try {
    // 1. 사용자 쿼리 임베딩 벡터 생성 (Embedding API는 일일 호출 한도가 매우 넉넉하여 안전함)
    const queryVector = await getEmbedding(query);

    // [1단계: 토큰 세이버 - 의미 QA 캐싱 확인]
    // 90% 이상 의미적으로 유사한 과거 질문이 데이터베이스에 등록되어 있다면 LLM 호출 생략
    const cacheHit = getCachedResponse(queryVector, 0.90);
    if (cacheHit) {
      console.log(`[⚡ Semantic QA Cache Hit] 질문: "${query}" -> 캐시 히트 성공!`);
      return {
        status: cacheHit.status as "success" | "fail-safe",
        answer: cacheHit.answer,
        citations: cacheHit.citations,
        nextSteps: cacheHit.nextSteps,
        isCached: true
      };
    }

    // 2. ChromaDB에서 상위 8개 유사 매뉴얼 단락 검색 (세션 연결 파일로 범위 제한)
    const searchResults = await querySimilarityFromVectorDB(queryVector, 8, filterFileNames.length > 0 ? filterFileNames : undefined);

    // [2단계: 토큰 세이버 - 로컬 유사도 컷오프 가드레일]
    // Cosine 거리 0~2 스케일에서 1.2 초과(유사도 매우 희박)인 경우만 차단
    // distance가 null(ChromaDB 미반환)이면 안전하게 통과시켜 LLM 판단에 위임
    const limitDistance = 1.2;
    const topDistance = searchResults[0]?.distance;
    const isIrrelevant = searchResults.length === 0 ||
                         (topDistance !== null && topDistance !== undefined && topDistance > limitDistance);

    if (isIrrelevant) {
      console.log(`[🛡️ Local Guardrail Cutoff] 유사도 미달 차단 (거리: ${topDistance !== null && topDistance !== undefined ? topDistance.toFixed(4) : "측정불가"} > 임계치: ${limitDistance} / 결과수: ${searchResults.length})`);
      
      return {
        status: "fail-safe",
        answer: "죄송합니다. 입력하신 에러 현상 또는 질의에 대응하는 정확한 가이드라인이 현재 등록된 설비 유지보수 매뉴얼(data/)에서 발견되지 않았거나 검색 유사도가 너무 낮습니다. 작업자의 안전을 위해 자의적인 임의 조치를 절대 금하며, 즉시 기기 동작을 안전하게 멈추고 현장 전원을 확인한 뒤 사내 기술 정비 부서 또는 지정 전문 파트너 정비 엔지니어에게 기술 지원을 요청하십시오.",
        citations: [],
        nextSteps: ["메인 전원 스위치 차단 및 수동 제어 대기", "사내 기계/전기 안전 관리실 연락", "data/ 폴더에 새 설비 매뉴얼 업로드 후 임베딩 갱신"],
        isCached: false
      };
    }

    // 3. RAG 텍스트 컨텍스트 및 역사 포맷팅
    const contextText = searchResults
      .map(
        (res, idx) =>
          `[매뉴얼 정보 ${idx + 1}]
출처: ${res.metadata?.source || "알 수 없음"} (페이지: ${res.metadata?.page || "알 수 없음"})
유사도 Cosine 거리: ${res.distance !== null ? res.distance.toFixed(4) : "알 수 없음"}
내용:
${res.document}`
      )
      .join("\n\n---\n\n");

    const historyText = history
      .map((msg) => `${msg.role === "user" ? "작업자" : "AI 에이전트"}: ${msg.content}`)
      .join("\n");

    // 4. 최종 Gemini 프롬프트 구성
    const prompt = `
[검색된 매뉴얼 컨텍스트]
${contextText || "일치하는 매뉴얼 내용이 없습니다."}Prefix

[이전 대화 이력]
${historyText || "(이전 대화 내용 없음)"}

[작업자 현상 진술]
사용자 증상/검색어: "${query}"

위의 [검색된 매뉴얼 컨텍스트] 정보만을 기반으로 답변을 생성하십시오.
만약 컨텍스트에 명시되어 있지 않은 내용을 물어보거나 무관하다면, 즉시 "status"를 "fail-safe"로 기록하고 안전 권고 조치를 답변으로 채우십시오.
또한 "citations" 배열에는 인용한 매뉴얼 정보의 source와 page를 완벽하게 수집하여 추가하십시오. (중복되는 출처는 하나로 병합하십시오.)
반드시 명시된 JSON 규격 스키마를 만족하는 결과물만 출력해야 합니다.
`;

    // 5. Gemini 2.5 Flash를 이용한 답변 및 JSON 획득
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: GENERATIVE_MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 6. 획득한 JSON의 파싱 및 클렌징
    const parsedResponse = cleanAndParseJSON(responseText);

    // [3단계: 신규 성공 답변을 미래 캐시 히트를 위해 QA 캐시 등록]
    if (parsedResponse.status === "success") {
      saveQACache(
        query,
        queryVector,
        parsedResponse.answer,
        parsedResponse.citations,
        parsedResponse.nextSteps,
        parsedResponse.status
      );
      console.log(`[⚡ QA Cache Saved] 미래 재질의를 위해 신규 응답을 로컬 캐시 디비에 보존합니다.`);
    }

    return parsedResponse;
  } catch (error) {
    console.error("장애 조치 AI 에이전트 호출 실패:", error);
    return {
      status: "fail-safe",
      answer: "서버 통신 실패 또는 일시적인 API 부하로 인해 장애 조치 안내를 생성하지 못했습니다. 신속히 현장 관리자에게 연락하시기 바랍니다.",
      citations: [],
      nextSteps: ["재시도 버튼 누르기", "장애 신고 접수"]
    };
  }
}

/**
 * 사용자 피드백을 저장하는 서버 액션입니다.
 */
export async function submitFeedbackAction(
  query: string,
  answer: string,
  rating: "helpful" | "unhelpful"
): Promise<{ success: boolean; message: string }> {
  try {
    saveFeedback(query, answer, rating);
    return { success: true, message: "피드백이 성공적으로 기록되었습니다." };
  } catch (error) {
    console.error("[submitFeedbackAction Error]", error);
    return { success: false, message: "피드백 기록 중 오류가 발생했습니다." };
  }
}
