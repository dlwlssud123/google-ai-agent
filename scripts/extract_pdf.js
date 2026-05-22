const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function extract() {
  const pdfPath = path.resolve('c:/Users/vbnm9/source/google-ai-agent/docs/UnHarenesedYU_이진녕_7614_A안.pdf');
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  
  try {
    const result = await parser.getText();
    const outputPath = path.resolve('c:/Users/vbnm9/source/google-ai-agent/docs/pdf_text.txt');
    fs.writeFileSync(outputPath, result.text);
    console.log('PDF text extracted successfully to:', outputPath);
  } catch (error) {
    console.error('Error parsing PDF:', error);
  } finally {
    await parser.destroy();
  }
}

extract();
