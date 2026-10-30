import { fillPdf, stampMapFor } from "../functions/_lib/forms/pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const key = process.argv[2] || "intro_code";
const { bytes, placed } = await fillPdf({
  answers: { first_name: "María", last_name: "Peña-Müller", full_name_print: "María Peña-Müller", training_center_name: "Banana Nut Burgers Dive Shop", training_center_street: "West End Road", training_center_zip_city: "34101 Roatán", training_center_state_country: "Bay Islands, Honduras", dob: "1984-03-09", signature_date: "2026-10-27" },
  registrationNumber: "BNB-2610-0001",
  audit: { templateKey: key },
});
const doc = await getDocument({ data: bytes, disableWorker: true, isEvalSupported: false }).promise;
console.log("placed", placed.filter((p) => ["first_name", "training_center_street", "full_name_print"].includes(p.key)).map((p) => `${p.page} ${p.key} ${p.x},${p.y} ${p.w}x${p.h}`).join("\n"));
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (/Mar|West|Banana|Peña|Road/.test(it.str || "")) console.log("p" + i, it.transform[4].toFixed(1), it.transform[5].toFixed(1), JSON.stringify(it.str));
  }
}
const map = stampMapFor(key);
console.log("map first", JSON.stringify(map.fields.filter((f) => f.key === "first_name" || f.key === "training_center_street").slice(0, 4)));
