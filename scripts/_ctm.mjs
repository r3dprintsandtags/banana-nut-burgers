import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const pageNo = Number(process.argv[3] || 1);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(pageNo);
const op = await page.getOperatorList();
let ctm = [1, 0, 0, 1, 0, 0];
const stack = [];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const mul = (m, t) => {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = t;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
};
const lines = [];
for (let i = 0; i < op.fnArray.length; i++) {
  const fn = op.fnArray[i];
  const args = op.argsArray[i];
  if (fn === OPS.save) stack.push(ctm.slice());
  else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
  else if (fn === OPS.transform) ctm = mul(ctm, args);
  else if (fn === OPS.constructPath) {
    const ops = args[0];
    const nums = args[1];
    let p = 0;
    let cx = 0, cy = 0;
    for (const code of ops) {
      if (code === OPS.rectangle) {
        const [x, y, w, h] = nums.slice(p, p + 4); p += 4;
        const [x1, y1] = apply(ctm, x, y);
        const [x2, y2] = apply(ctm, x + w, y + h);
        lines.push({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), kind: "r" });
      } else if (code === OPS.moveTo) { cx = nums[p]; cy = nums[p + 1]; p += 2; }
      else if (code === OPS.lineTo) {
        const x = nums[p], y = nums[p + 1]; p += 2;
        const [x1, y1] = apply(ctm, cx, cy);
        const [x2, y2] = apply(ctm, x, y);
        if (Math.abs(y2 - y1) < 1.2 && Math.abs(x2 - x1) > 40) lines.push({ x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1), h: 1, kind: "l" });
        cx = x; cy = y;
      } else if (code === OPS.curveTo) p += 6;
      else if (code === OPS.curveTo2 || code === OPS.curveTo3) p += 4;
    }
  }
}
const interesting = lines.filter((l) => l.kind === "l" || (l.h < 4 && l.w > 40) || (l.w < 16 && l.h < 16 && l.w > 6));
const boxes = lines.filter((l) => l.w >= 6 && l.w <= 16 && l.h >= 6 && l.h <= 16);
console.log("boxes", boxes.length);
for (const r of boxes) console.log(r.x.toFixed(1), r.y.toFixed(1), r.w.toFixed(1), r.h.toFixed(1));
