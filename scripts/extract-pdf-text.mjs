import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

const dir = path.resolve("forms-source");
const keys = [
  "try_scuba_reg", "intro_code", "fit_to_dive", "privacy",
  "rec_waiver", "diver_medical", "diving_medical_guidance",
];

for (const key of keys) {
  const file = path.join(dir, `${key}.pdf`);
  if (!fs.existsSync(file)) { console.log("skip", key); continue; }
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((x) => x.str).join(" "));
  }
  const text = parts.join("\n\n").replace(/[ \t]+/g, " ").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  fs.writeFileSync(path.join(dir, `${key}.en.txt`), text);
  console.log(`${key}: ${doc.numPages}p, ${text.length} chars — ${text.slice(0, 80).replace(/\n/g, " ")}`);
}
