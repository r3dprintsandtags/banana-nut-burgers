import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
for (const it of tc.items) {
  if (!it.str || !it.str.trim()) continue;
  const y = it.transform[5];
  if (y > 620 || y < 120 || /Mar|West|Banana|10\/|Pe/.test(it.str)) {
    console.log(it.transform[4].toFixed(1).padStart(7), y.toFixed(1).padStart(7), JSON.stringify(it.str));
  }
}
