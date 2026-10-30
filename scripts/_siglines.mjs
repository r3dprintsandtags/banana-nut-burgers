import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function mul(m, t) {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = t;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const op = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
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
      let p = 0, cx = 0, cy = 0;
      for (const code of ops) {
        if (code === OPS.rectangle) p += 4;
        else if (code === OPS.moveTo) { cx = nums[p]; cy = nums[p + 1]; p += 2; }
        else if (code === OPS.lineTo) {
          const x = nums[p], y = nums[p + 1]; p += 2;
          const [x1, y1] = apply(ctm, cx, cy);
          const [x2, y2] = apply(ctm, x, y);
          if (Math.abs(y2 - y1) < 1.2 && Math.abs(x2 - x1) > 30) lines.push({ x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1) });
          cx = x; cy = y;
        } else if (code === OPS.curveTo) p += 6;
        else if (code === OPS.curveTo2 || code === OPS.curveTo3) p += 4;
      }
    }
  }
  console.log("\nPAGE", n);
  for (const l of lines) console.log(" L", l.x.toFixed(1), l.y.toFixed(1), l.w.toFixed(0));
}
