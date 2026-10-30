import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(pageNo);
const op = await page.getOperatorList();
const segs = [];
for (let i = 0; i < op.fnArray.length; i++) {
  const args = op.argsArray[i];
  if (op.fnArray[i] !== OPS.constructPath) continue;
  const ops = args[0];
  const nums = args[1];
  let p = 0;
  for (const code of ops) {
    if (code === OPS.rectangle) {
      const [x, y, w, h] = nums.slice(p, p + 4);
      p += 4;
      segs.push({ x, y, w, h, kind: "r" });
    } else if (code === OPS.moveTo || code === OPS.lineTo) {
      const [x, y] = nums.slice(p, p + 2);
      p += 2;
      segs.push({ x, y, kind: code === OPS.moveTo ? "m" : "l" });
    } else if (code === OPS.curveTo) p += 6;
    else if (code === OPS.curveTo2 || code === OPS.curveTo3) p += 4;
    else if (code === OPS.closePath) {}
  }
}
const lines = segs.filter((s) => s.kind === "r" && s.w > 30 && s.h < 3 && s.h > 0);
console.log("thin rects", lines.length);
for (const r of lines) console.log(r.x.toFixed(1), r.y.toFixed(1), r.w.toFixed(1), r.h.toFixed(1));
const boxes = segs.filter((s) => s.kind === "r" && s.w > 6 && s.w < 18 && s.h > 6 && s.h < 18);
console.log("boxes", boxes.length);
for (const r of boxes.slice(0, 50)) console.log("B", r.x.toFixed(1), r.y.toFixed(1), r.w.toFixed(1), r.h.toFixed(1));
