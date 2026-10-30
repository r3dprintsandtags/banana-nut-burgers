import fs from "fs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";

const file = process.argv[2];
const pages = (process.argv[3] || "1").split(",").map(Number);
const data = new Uint8Array(fs.readFileSync(file));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;

function greyRects(op) {
  const rects = [];
  let fill = null;
  for (let i = 0; i < op.fnArray.length; i++) {
    const fn = op.fnArray[i];
    const args = op.argsArray[i];
    if (fn === OPS.setFillRGBColor) fill = args;
    if (fn === OPS.constructPath && args?.[0]?.[0] === OPS.rectangle) {
      const [x, y, w, h] = args[1];
      const g = fill && fill[0] > 220 && fill[1] > 220 && fill[2] > 220 && fill[0] < 250;
      if (g && w > 40 && h > 8 && h < 40) rects.push({ x, y, w, h });
    }
  }
  return rects;
}

for (const n of pages) {
  const page = await doc.getPage(n);
  const op = await page.getOperatorList();
  const tc = await page.getTextContent();
  const texts = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({
    x: it.transform[4], y: it.transform[5], s: it.str.trim(),
  }));
  console.log("\n==== page", n, "grey", greyRects(op).length);
  for (const r of greyRects(op)) {
    const below = texts
      .filter((t) => t.y < r.y && t.y > r.y - 22 && t.x >= r.x - 8 && t.x < r.x + r.w)
      .sort((a, b) => b.y - a.y)[0];
    console.log(`  (${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.w.toFixed(0)}x${r.h.toFixed(0)}) below=${below ? below.s : "?"}`);
  }
}
