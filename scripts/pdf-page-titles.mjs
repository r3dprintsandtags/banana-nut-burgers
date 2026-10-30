import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
console.log(file, "pages", doc.numPages);
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const bits = tc.items.map((it) => it.str).filter((s) => s && s.trim()).slice(0, 8);
  console.log(`p${i} ${vp.width.toFixed(1)}x${vp.height.toFixed(1)} | ${bits.join(" | ")}`);
}
