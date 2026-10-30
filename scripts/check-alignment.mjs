import fs from "fs";
import { fillPdf, officialTemplate } from "../functions/_lib/forms/pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const answers = {
  first_name: "MARIAFIRST",
  last_name: "LOPEZLAST",
  full_name_print: "MARIALOPEZ",
  dob: "1990-04-02",
  address: "ADDRLINE",
  email: "mail@example.com",
  cell_phone: "50499990000",
  emergency_contact_name: "EMNAME",
  emergency_contact_relationship: "EMREL",
  emergency_contact_email: "em@example.com",
  emergency_contact_phone: "50488880000",
  training_center_name: "BNBSHOP",
  training_center_street: "STREETLINE",
  training_center_zip_city: "WESTEND",
  training_center_state_country: "HONDURAS",
  facility_name: "BNBSHOP",
  instructor_name: "INSTNAME",
  signature_date: "2026-10-26",
  __dateFormat: "mm/dd/yyyy",
  dm_q1: "no", over_45: "no", dm_q3: "yes", dm_q4: "no", dm_q5: "no",
  dm_q6: "no", dm_q7: "no", dm_q8: "no", dm_q9: "no", dm_q10: "no",
  fit_q1: "no", fit_q2: "yes", fit_q3: "no", fit_q4: "no", fit_q5: "no", fit_q6: "no", fit_q7: "yes",
};
const keys = ["try_scuba_reg", "intro_code", "fit_to_dive", "privacy", "rec_waiver", "diver_medical"];
const mark = /MARIAFIRST|LOPEZLAST|MARIALOPEZ|04\/02\/1990|10\/26\/2026|ADDRLINE|BNBSHOP|EMNAME|mail@example|50499990000|INSTNAME|STREETLINE|WESTEND|HONDURAS/;

for (const key of keys) {
  const templateBytes = officialTemplate(key);
  const { bytes } = await fillPdf({
    templateBytes,
    answers,
    registrationNumber: "BNB-2610-0007",
    audit: { templateKey: key, templateName: key },
  });
  const doc = await getDocument({ data: bytes, disableWorker: true, isEvalSupported: false }).promise;
  console.log("\n==", key, "pages", doc.numPages);
  const found = new Set();
  for (let i = 1; i <= Math.min(doc.numPages, 4); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!mark.test(it.str) && it.str !== "X") continue;
      if (it.str === "X") continue;
      found.add(it.str.split(" ")[0]);
      console.log(` p${i} ${it.transform[4].toFixed(0)},${it.transform[5].toFixed(0)} ${it.str.slice(0, 40)}`);
    }
  }
  for (const needle of ["MARIAFIRST", "LOPEZLAST", "MARIALOPEZ", "04/02/1990", "10/26/2026", "BNBSHOP"]) {
    if (![...found].some((s) => s.includes(needle.split("/")[0]) || needle.includes(s))) {
      if (!found.has(needle) && ![...found].join("|").includes(needle)) console.log(" MISSING", needle);
    }
  }
}
