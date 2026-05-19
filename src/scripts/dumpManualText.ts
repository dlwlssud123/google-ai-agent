import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as _pdf from "pdf-parse";
// @ts-ignore
const { PDFParse } = _pdf;
import { performScanPdfOCR } from "../lib/gemini";

// .env.local 환경 변수 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const pdfPath = path.resolve(process.cwd(), "data", "소방엔진펌프통합설명서 V24-12_코리아모터펌프(주).pdf");
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  
  // @ts-ignore
  const res = await parser.getText();
  const sortedPages = res.pages.sort((a: any, b: any) => a.num - b.num);
  const rawPages = sortedPages.map((page: any) => page.text);

  console.log("[OCR 분석기 가동 중...]");
  const ocrPages = await performScanPdfOCR(dataBuffer);

  // 페이지 병합 (rawText가 충분히 길면 그대로 쓰고, 비어있거나 짧으면 OCR 텍스트로 보완)
  for (let i = 0; i < rawPages.length; i++) {
    let text = rawPages[i]?.trim() || "";
    if (text.length < 20) {
      if (ocrPages.length === rawPages.length && ocrPages[i]) {
        text = ocrPages[i].trim();
      } else if (ocrPages.length > 0) {
        if (ocrPages[i]) {
          text = ocrPages[i].trim();
        }
      }
    }
    rawPages[i] = text;
  }

  console.log("=== 매뉴얼 PDF 텍스트 덤프 (12-20페이지 - OCR 복원) ===");
  rawPages.forEach((text: string, idx: number) => {
    const pageNum = idx + 1;
    if (pageNum >= 12 && pageNum <= 20) {
      console.log(`\n--- PAGE ${pageNum} ---`);
      console.log(text.trim());
    }
  });
}

main().catch(console.error);
