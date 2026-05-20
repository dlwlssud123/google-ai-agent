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
 * 에러 발생 시 지수 백오프(Exponential Backoff)를 바탕으로 재시도를 수행하는 공통 헬퍼 함수입니다.
 * 특히 503(Service Unavailable) 및 429(Rate Limit Exceeded) 에러 대응에 효과적입니다.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 4, initialDelay = 1500): Promise<T> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMessage = error?.message || String(error);
      const isTemporaryError = 
        errorMessage.includes("503") || 
        errorMessage.includes("Service Unavailable") ||
        errorMessage.includes("429") || 
        errorMessage.includes("Resource has been exhausted") ||
        errorMessage.includes("high demand") ||
        errorMessage.includes("busy") ||
        errorMessage.includes("fetch failed");

      if (isTemporaryError && attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 200;
        console.warn(`[Gemini API] 일시적 오류 또는 과부하 감지 (${errorMessage.trim()}). ${Math.round(delay)}ms 후 재시도합니다... (시도 ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("최대 재시도 횟수를 초과했습니다.");
}

import path from "path";

let embeddingPipeline: any = null;

/**
 * 주어진 텍스트의 임베딩 벡터를 반환합니다. (로컬 임베딩 전환)
 * @param text 임베딩할 문자열
 * @returns 384차원의 실수 배열 (임베딩 벡터)
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    console.log("[Transformers.js] 로컬 임베딩 모델 로딩 중... (최초 1회 다운로드 발생 가능)");
    
    // Webpack 번들링 및 SSR 런타임 충돌 방지를 위해 동적 임포트 사용
    const { pipeline, env } = await import("@xenova/transformers");
    
    // 로컬 환경 캐시 디렉터리 설정 (Docker 내 nextjs 유저가 쓰기 권한이 있는 data/ 폴더 하위로 지정)
    env.cacheDir = path.resolve(process.cwd(), "data", ".cache", "transformers");
    
    embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("[Transformers.js] 임베딩 모델 로드 완료!");
  }
  
  // 텍스트 임베딩 추출 (mean pooling + 정규화)
  const result = await embeddingPipeline(text, { pooling: "mean", normalize: true });
  return Array.from(result.data);
}

/**
 * 텍스트 구조 해석 및 의미 청크 생성을 위해 Gemini LLM을 호출합니다.
 * @param text 원문 텍스트 (단락 혹은 페이지 전체)
 * @returns 구조화된 Markdown 형식의 텍스트
 */
export async function analyzeDocumentStructure(text: string): Promise<string> {
  return callWithRetry(async () => {
    const genAI = getGeminiClient();
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
  });
}

/**
 * 종이 매뉴얼 이미지 파일을 받아 Gemini Vision(멀티모달)을 통해 OCR 분석을 수행합니다.
 * @param imageBuffer 이미지 파일의 바이너리 버퍼
 * @param mimeType 이미지의 MIME 타입 (image/png, image/jpeg 등)
 * @returns 추출된 구조화된 마크다운 텍스트
 */
export async function performOCR(imageBuffer: Buffer, mimeType: string): Promise<string> {
  return callWithRetry(async () => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: GENERATIVE_MODEL_NAME });

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
  });
}

/**
 * 쿼리 및 프롬프트를 사용하여 Gemini 답변을 생성합니다.
 * @param prompt 완성된 프롬프트
 * @param systemInstruction 시스템 지침 (가드레일 역할)
 */
export async function generateResponse(prompt: string, systemInstruction?: string): Promise<string> {
  return callWithRetry(async () => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ 
      model: GENERATIVE_MODEL_NAME,
      systemInstruction: systemInstruction
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  });
}

/**
 * 스캔본 PDF를 통째로 Gemini 2.5 Flash API에 전달하여, 
 * 각 페이지의 텍스트를 정확하게 판독(OCR)해 달라고 요청합니다.
 * @param pdfBuffer PDF 파일 바이너리 버퍼
 * @returns 페이지별 텍스트의 배열
 */
export async function performScanPdfOCR(pdfBuffer: Buffer): Promise<string[]> {
  return callWithRetry(async () => {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: GENERATIVE_MODEL_NAME });

    const pdfPart = {
      inlineData: {
        data: pdfBuffer.toString("base64"),
        mimeType: "application/pdf"
      }
    };

    const prompt = `
이 파일은 텍스트 정보가 들어 있지 않거나 스캔된 이미지로 구성된 설비 유지보수 매뉴얼 PDF입니다.
이 PDF 문서의 모든 페이지를 꼼꼼하게 읽고 분석하여, 각 페이지의 글자를 추출(OCR)해 주세요.

[요구사항]
1. 각 페이지별로 구분을 명확히 하기 위해 반드시 다음 형태로만 출력해야 합니다:
--- PAGE_START: X ---
[해당 페이지에서 추출 및 정리한 정형화된 마크다운 텍스트]
--- PAGE_END: X ---

2. X는 실제 페이지 번호(1부터 시작)로 기재해 주세요.
3. 이미지 내의 표(Table)나 수치, 경고(WARNING) 사항은 마크다운 문법을 활용해 의미를 보존하며 예쁘게 정리하세요.
4. 어떤 부연 설명이나 서론도 생략하고, 오직 상기 페이지 구분 규격에 따른 마크다운 결과물만 연속해서 출력하세요.
`;

    console.log("[Gemini Vision PDF OCR] 대용량 스캔 PDF에 대한 Gemini API Direct OCR 분석을 구동합니다...");
    const result = await model.generateContent([prompt, pdfPart]);
    const response = await result.response;
    const textResult = response.text().trim();

    const pages: string[] = [];
    const regex = /--- PAGE_START:\s*(\d+)\s*---([\s\S]*?)--- PAGE_END:\s*\1\s*---/g;
    let match;
    while ((match = regex.exec(textResult)) !== null) {
      const pageNum = parseInt(match[1]);
      const pageText = match[2].trim();
      pages.push(pageText);
    }

    if (pages.length === 0) {
      console.warn("[Gemini Vision PDF OCR] 페이지 파싱 규격 매칭 실패. 통째로 단일 페이지로 적재합니다.");
      return [textResult];
    }

    return pages;
  });
}

