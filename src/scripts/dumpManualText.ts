import fs from "fs";
import path from "path";
import * as _pdf from "pdf-parse";
// @ts-ignore
const { PDFParse } = _pdf;

async function main() {
  const pdfPath = path.resolve(process.cwd(), "data", "소방엔진펌프통합설명서 V24-12_코리아모터펌프(주).pdf");
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const parser = new PDFParse({ data: new Uint8Array(dataBuffer) });
  
  // @ts-ignore
  const res = await parser.getText();
  const sortedPages = res.pages.sort((a: any, b: any) => a.num - b.num);
  
  console.log("=== 매뉴얼 PDF 텍스트 덤프 ===");
  sortedPages.forEach((page: any, idx: number) => {
    console.log(`\n--- PAGE ${idx + 1} ---`);
    console.log(page.text.trim());
  });
}

main().catch(console.error);
