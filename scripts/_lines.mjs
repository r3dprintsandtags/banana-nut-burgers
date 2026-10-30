import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(pageNo);
const op = await page.getOperatorList();
const rects = [];
let fill = null;
for (let i = 0; i < op.fnArray.length; i++) {
  const fn = op.fnArray[i];
  const args = op.argsArray[i];
  if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) fill = { fn, args: [...(args || [])].slice(0, 4) };
  if (fn === OPS.constructPath && args?.[0]?.includes?.(OPS.rectangle)) {
    const nums = args[1];
    for (let k = 0; k < args[0].length; k++) {
      if (args[0][k] === OPS.rectangle) {
        const [x, y, w, h] = nums.slice(k * 4, k * 4 + 4);
        if (Math.abs(w) > 8 && Math.abs(h) > 6 && Math.abs(h) < 30) rects.push({ x, y, w, h, fill });
      }
    }
  }
}
console.log("rects", rects.length);
for (const r of rects.slice(0, 40)) console.log(r.x.toFixed(1), r.y.toFixed(1), r.w.toFixed(1), r.h.toFixed(1), JSON.stringify(r.fill?.args));
const tc = await page.getTextContent();
const want = /print name|training center|\[NO\]|\[YES\]|Yes|No|SSI Training|Street|ZIP|State|Participant Name|Birth|Instructor|Facility|Box /i;
for (const it of tc.items) {
  if (!it.str || !want.test(it.str)) continue;
  console.log("T", it.transform[4].toFixed(1), it.transform[5].toFixed(1), it.str);
}
