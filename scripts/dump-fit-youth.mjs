import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const files = [
  "forms-source/fit_to_dive.pdf",
  "forms-source/SSI-Try-Scuba-Forms-2019.pdf",
  "forms-source/SSI-Medical-and-Waiver-Forms-2020.pdf",
];

for (const f of files) {
  const data = new Uint8Array(fs.readFileSync(f));
  const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  console.log("\n####", f, "pages", doc.numPages);
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((it) => it.str).join(" ");
    if (f.endsWith("fit_to_dive.pdf")) {
      for (const it of tc.items) {
        if (/YES|NO|Yes|No/.test(it.str) && it.str.length < 6) {
          console.log("fit", i, it.transform[4].toFixed(1), it.transform[5].toFixed(1), JSON.stringify(it.str));
        }
      }
    }
    if (/Youth Addendum|YOUTH ADDENDUM|youth addendum/i.test(text)) {
      console.log("YOUTH page", i, text.slice(0, 220).replace(/\s+/g, " "));
    }
  }
}
