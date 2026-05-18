import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pdf from "pdf-parse";
import { getEmbedding, analyzeDocumentStructure, performOCR } from "../lib/gemini";
import { addDocumentsToVectorDB, clearManualCollection } from "../lib/chroma";

// .env.local 환경 변수 명시적 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * PDF 파일을 페이지별로 쪼개어 텍스트를 추출합니다.
 * @param pdfPath PDF 파일 절대 경로
 * @returns 페이지별 텍스트 배열
 */
async function parsePdfByPages(pdfPath: string): Promise<string[]> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pages: string[] = [];

  // pdf-parse 커스텀 페이지 렌더러를 정의하여 페이지별로 텍스트 분리
  const options = {
    pagerender: function (pageData: any) {
      return pageData.getTextContent().then(function (textContent: any) {
        let lastY = "", text = "";
        for (const item of textContent.items) {
          if (lastY === item.transform[5] || !lastY) {
            text += item.str;
          } else {
            text += "\n" + item.str;
          }
          lastY = item.transform[5];
        }
        pages.push(text);
        return text;
      });
    }
  };

  await pdf(dataBuffer, options);
  return pages;
}

/**
 * 인제스천 메인 실행 함수
 */
async function runIngestion() {
  console.log("=== [3단계] 데이터 적재 파이프라인 (Data Ingestion) 시작 ===");

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey.includes("YOUR_GEMINI_API_KEY")) {
    console.error("오류: 유효한 GEMINI_API_KEY가 .env.local에 설정되어 있지 않습니다.");
    console.error("인제스천 작업을 중단합니다.");
    process.exit(1);
  }

  const docsDir = path.resolve(process.cwd(), "docs");
  const targetPdfName = "UnHarenesedYU_이진녕_7614_A안.pdf";
  const pdfPath = path.join(docsDir, targetPdfName);

  if (!fs.existsSync(pdfPath)) {
    console.error(`오류: 대상 PDF 파일을 찾을 수 없습니다. 경로: ${pdfPath}`);
    process.exit(1);
  }

  try {
    // 1. 기존 ChromaDB 컬렉션 비우기 (중복 적재 방지 및 테스트 초기화)
    console.log("1. 기존 벡터 컬렉션 초기화 중...");
    await clearManualCollection();

    // 2. PDF 페이지별 파싱
    console.log(`2. PDF 페이지 파싱 시작: ${targetPdfName}`);
    const rawPages = await parsePdfByPages(pdfPath);
    console.log(`파싱 완료. 총 ${rawPages.length}페이지 검출됨.`);

    const documentsToIngest = [];

    // 3. 페이지별 데이터 정제 및 적재
    for (let i = 0; i < rawPages.length; i++) {
      const pageNum = i + 1;
      const rawText = rawPages[i].trim();

      if (!rawText) {
        console.log(`[페이지 ${pageNum}] 텍스트가 비어 있어 건너뜁니다.`);
        continue;
      }

      console.log(`[페이지 ${pageNum}/${rawPages.length}] 구조 해석 및 정제 중...`);
      
      // Gemini LLM을 통한 의미 기반 구조화 및 정제 (표, 리스트 보존)
      const structuredText = await analyzeDocumentStructure(rawText);

      console.log(`[페이지 ${pageNum}/${rawPages.length}] 텍스트 임베딩 생성 중...`);
      // Gemini Embedding API 호출
      const vector = await getEmbedding(structuredText);

      documentsToIngest.push({
        id: `pdf_page_${pageNum}`,
        vector,
        text: structuredText,
        metadata: {
          source: targetPdfName,
          page: pageNum,
          type: "pdf"
        }
      });
    }

    // 4. (추가 기능) 이미지 파일 OCR 및 적재 지원
    // docs 폴더에 샘플 이미지(.png, .jpg, .jpeg)가 있다면 자동으로 OCR하여 적재
    const filesInDocs = fs.readdirSync(docsDir);
    const imageExtensions = [".png", ".jpg", ".jpeg"];
    let virtualPageNum = 100; // 이미지 파일은 가상의 100번대 페이지부터 할당

    for (const file of filesInDocs) {
      const ext = path.extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const imagePath = path.join(docsDir, file);
        console.log(`\n[비정형 이미지 발견] 이미지 OCR 처리 중: ${file}`);
        
        const imageBuffer = fs.readFileSync(imagePath);
        
        let mimeType = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";

        // Gemini Vision을 통한 OCR 텍스트 추출 및 정형화
        const ocrText = await performOCR(imageBuffer, mimeType);
        console.log(`OCR 텍스트 추출 완료! 내용 길이: ${ocrText.length}`);

        console.log(`[${file}] 텍스트 임베딩 생성 중...`);
        const vector = await getEmbedding(ocrText);

        documentsToIngest.push({
          id: `image_ocr_${file.replace(/\.[^/.]+$/, "")}`,
          vector,
          text: ocrText,
          metadata: {
            source: file,
            page: virtualPageNum++,
            type: "image_ocr"
          }
        });
      }
    }

    // 5. ChromaDB 최종 적재
    if (documentsToIngest.length > 0) {
      console.log(`\n3. 총 ${documentsToIngest.length}개의 데이터를 ChromaDB에 적재합니다...`);
      await addDocumentsToVectorDB(documentsToIngest);
      console.log("=== [3단계] 데이터 적재 파이프라인 성공적으로 완료! ===");
    } else {
      console.warn("적재할 문서 데이터가 없습니다.");
    }
  } catch (error) {
    console.error("데이터 적재 파이프라인 수행 중 오류 발생:", error);
    process.exit(1);
  }
}

// 스크립트 실행
runIngestion();
