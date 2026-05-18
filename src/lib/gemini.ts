import { GoogleGenerativeAI } from "@google/generative-ai";

let genAIInstance: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("경고: GEMINI_API_KEY 환경 변수가 세팅되어 있지 않습니다. .env.local 파일을 확인해 주세요.");
  }
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
}

// 텍스트 임베딩 모델 (Gemini 2.x 규격의 최신 다국어 지원 임베딩 모델 사용)
export const EMBEDDING_MODEL_NAME = "gemini-embedding-2";
// 기본 텍스트 및 멀티모달 모델
export const GENERATIVE_MODEL_NAME = "gemini-2.5-flash"; // 최신 고성능 멀티모달 모델

/**
 * 주어진 텍스트의 임베딩 벡터를 반환합니다.
 * @param text 임베딩할 문자열
 * @returns 768차원 또는 1536차원의 실수 배열 (임베딩 벡터)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const genAI = getGeminiClient();
  try {
    const embedModel = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });
    const result = await embedModel.embedContent(text);
    if (!result.embedding || !result.embedding.values) {
      throw new Error("임베딩 반환 값에 데이터가 없습니다.");
    }
    return result.embedding.values;
  } catch (error) {
    console.error("Gemini Embedding API 호출 실패:", error);
    throw error;
  }
}

/**
 * 텍스트 구조 해석 및 의미 청크 생성을 위해 Gemini LLM을 호출합니다.
 * @param text 원문 텍스트 (단락 혹은 페이지 전체)
 * @returns 구조화된 Markdown 형식의 텍스트
 */
export async function analyzeDocumentStructure(text: string): Promise<string> {
  const genAI = getGeminiClient();
  try {
    const model = genAI.getGenerativeModel({ 
      model: GENERATIVE_MODEL_NAME,
      generationConfig: { responseMimeType: "text/plain" }
    });

    const prompt = `
당신은 최고의 기술 문서 분석가이자 데이터 엔지니어입니다.
아래의 텍스트는 설비 유지보수 매뉴얼에서 파싱된 원문입니다.
이 텍스트의 내용을 해석하여, 의미 흐름이 훼손되지 않도록 깨끗하고 가독성 높은 마크다운(Markdown) 형태로 정리해 주세요.

[요구사항]
1. 표(Table)나 수치 목록, 단계별 절차가 있다면 최대한 마크다운 문법(예: | 컬럼 | 또는 1. 2. 3.)으로 유지하고 의미를 살리세요.
2. 불필요한 공백, 인쇄 오류로 인한 노이즈(예: 페이지 헤더/푸터 문구 등)는 제거하세요.
3. 원문의 중요한 정보(수치, 오류 코드, 경고문구)는 한 자도 빠짐없이 보존해야 합니다.
4. 설명이나 서론 없이, 정리된 마크다운 결과물만 즉시 출력해 주세요.

원문:
${text}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini 문서 구조 해석 실패:", error);
    throw error;
  }
}

/**
 * 종이 매뉴얼 이미지 파일을 받아 Gemini Vision(멀티모달)을 통해 OCR 분석을 수행합니다.
 * @param imageBuffer 이미지 파일의 바이너리 버퍼
 * @param mimeType 이미지의 MIME 타입 (image/png, image/jpeg 등)
 * @returns 추출된 구조화된 마크다운 텍스트
 */
export async function performOCR(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const genAI = getGeminiClient();
  try {
    const model = genAI.getGenerativeModel({ model: GENERATIVE_MODEL_NAME });

    // 이미지를 Gemini API 규격에 맞는 Part 객체로 변환
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType
      }
    };

    const prompt = `
이 이미지는 설비 장애 조치 또는 작업 현장 안전에 관련된 비정형 종이 매뉴얼 사진입니다.
이미지 안의 모든 텍스트를 정확하게 읽어서(OCR) 마크다운(Markdown) 문서로 정형화해 주세요.

[요구사항]
1. 표(Table), 리스트, 주의사항(WARNING) 표시가 있다면 마크다운 표 및 강조 문법을 활용해 완벽하게 재구성해 주세요.
2. 줄바꿈이나 기호가 어색하게 깨진 부분은 문맥에 맞춰 자연스러운 한글 문장으로 교정하세요.
3. 이미지의 헤더나 푸터(페이지 번호 제외) 등 본문과 무관한 노이즈는 제외하십시오. (단, 본문의 페이지 번호가 적혀 있다면 반드시 '페이지: X'와 같은 형태로 텍스트 마지막에 출처를 명시해 주세요.)
4. 설명 없이 마크다운 결과물만 단독으로 출력해 주세요.
`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini Vision OCR 수행 실패:", error);
    throw error;
  }
}

/**
 * 쿼리 및 프롬프트를 사용하여 Gemini 답변을 생성합니다.
 * @param prompt 완성된 프롬프트
 * @param systemInstruction 시스템 지침 (가드레일 역할)
 */
export async function generateResponse(prompt: string, systemInstruction?: string): Promise<string> {
  const genAI = getGeminiClient();
  try {
    const model = genAI.getGenerativeModel({ 
      model: GENERATIVE_MODEL_NAME,
      systemInstruction: systemInstruction
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini 텍스트 생성 실패:", error);
    throw error;
  }
}
