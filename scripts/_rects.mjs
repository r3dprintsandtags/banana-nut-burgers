import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(pageNo);
const op = await page.getOperatorList();
let fill = null;
let n = 0;
for (let i = 0; i < op.fnArray.length; i++) {
  const fn = op.fnArray[i];
  const args = op.argsArray[i];
  if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillCMYKColor) {
    fill = { fn, args };
  }
  if (fn === OPS.constructPath || fn === OPS.rectangle) {
    n++;
    if (n <= 25) {
      const preview = fn === OPS.rectangle ? args : [args?.[0]?.slice?.(0, 8), args?.[1]?.slice?.(0, 16)];
      console.log(n, fn === OPS.rectangle ? "rect" : "path", JSON.stringify(fill), JSON.stringify(preview));
    }
  }
}
console.log("path ops", n);
