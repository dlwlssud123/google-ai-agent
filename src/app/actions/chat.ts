"use server";

import { getEmbedding, getGeminiClient, GENERATIVE_MODEL_NAME } from "../../lib/gemini";
import { querySimilarityFromVectorDB } from "../../lib/chroma";
import { SYSTEM_INSTRUCTION } from "../../lib/prompt";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  status: "success" | "fail-safe";
  answer: string;
  citations: { source: string; page: number }[];
  nextSteps: string[];
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
 */
export async function askAgent(query: string, history: ChatMessage[] = []): Promise<ChatResponse> {
  if (!query || !query.trim()) {
    return {
      status: "fail-safe",
      answer: "올바른 에러 증상 혹은 키워드를 입력해 주십시오.",
      citations: [],
      nextSteps: []
    };
  }

  try {
    // 1. 사용자 쿼리 임베딩 벡터 생성
    const queryVector = await getEmbedding(query);

    // 2. ChromaDB에서 상위 3개 유사 매뉴얼 단락 검색
    const searchResults = await querySimilarityFromVectorDB(queryVector, 3);

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
${contextText || "일치하는 매뉴얼 내용이 없습니다."}

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
    return cleanAndParseJSON(responseText);
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
