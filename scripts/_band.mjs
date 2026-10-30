import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
const file = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const y0 = Number(process.argv[4] || 0);
const y1 = Number(process.argv[5] || 900);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(pageNo);
const tc = await page.getTextContent();
for (const it of tc.items) {
  const y = it.transform[5];
  if (!it.str || !it.str.trim() || y < y0 || y > y1) continue;
  console.log(it.transform[4].toFixed(1).padStart(7), y.toFixed(1).padStart(7), it.str);
}
