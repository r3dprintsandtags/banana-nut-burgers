import fs from "fs";
import path from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(path.resolve(file)));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  console.log(`\n== page ${i} ${vp.width.toFixed(0)}x${vp.height.toFixed(0)} ==`);
  for (const item of tc.items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    console.log(`${x.toFixed(1).padStart(7)} ${y.toFixed(1).padStart(7)}  ${item.str}`);
  }
}
