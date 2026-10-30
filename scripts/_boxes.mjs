import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { fillPdf, officialTemplate } from "../functions/_lib/forms/pdf.js";
import { pngStroke } from "./png-stroke.mjs";

const answers = {
  full_name_print: "Adrian Rojas", dob: "2007-03-08", __dateFormat: "mm/dd/yyyy",
  dm_q1: "yes", over_45: "no", dm_q3: "no", dm_q4: "yes", dm_q5: "no", dm_q6: "no", dm_q7: "no", dm_q8: "no", dm_q9: "no", dm_q10: "no",
  dm_box_A_1: true, dm_box_A_2: false, dm_box_A_covid: true,
  dm_box_C_1: false, dm_box_C_2: true,
};
const { bytes, placed } = await fillPdf({
  templateBytes: officialTemplate("diver_medical"),
  answers,
  signaturePngBytes: pngStroke(),
  registrationNumber: "BNB-2610-0002",
  audit: { templateKey: "diver_medical" },
});
const doc = await getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false }).promise;
const page = await doc.getPage(2);
const tc = await page.getTextContent();
const xs = tc.items.filter((it) => it.str === "X");
console.log("X count", xs.length);
for (const it of xs) console.log("X", it.transform[4].toFixed(1), it.transform[5].toFixed(1));
console.log("placed boxes", placed.filter((p) => String(p.key).startsWith("dm_box")).map((p) => p.key + " " + p.x + "," + p.y).join(" | "));
fs.writeFileSync("forms-output-samples/diver_medical.boxes.pdf", bytes);
