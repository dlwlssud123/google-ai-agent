import fs from 'fs';
import path from 'path';
// @ts-ignore
import pdf = require('pdf-parse');

async function extract() {
  const pdfPath = path.resolve('c:/Users/vbnm9/source/google-ai-agent/docs/UnHarenesedYU_이진녕_7614_A안.pdf');
  const dataBuffer = fs.readFileSync(pdfPath);
  
  try {
    const data = await pdf(dataBuffer);
    const outputPath = path.resolve('c:/Users/vbnm9/source/google-ai-agent/docs/pdf_text.txt');
    fs.writeFileSync(outputPath, data.text);
    console.log('PDF text extracted successfully to:', outputPath);
  } catch (error) {
    console.error('Error parsing PDF:', error);
  }
}

extract();
