/**
 * Build a SQL file that updates form_templates with consent text + overlay mappings
 * from forms-source/*.en.txt and default placements. Then print wrangler commands.
 */
import fs from "fs";
import path from "path";
import { defaultOverlayPlacements } from "../functions/_lib/forms/automap.js";

const dir = path.resolve("forms-source");
const keys = [
  "try_scuba_reg", "intro_code", "fit_to_dive", "privacy",
  "rec_waiver", "diver_medical", "diving_medical_guidance",
];

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const stmts = ["-- Auto-generated consent + mapping update"];
const mapping = {
  mode: "overlay",
  fields: {},
  signatures: [],
  unmatched: [],
  placements: defaultOverlayPlacements(),
};
const mapJson = JSON.stringify(mapping);

for (const key of keys) {
  const txtPath = path.join(dir, `${key}.en.txt`);
  if (!fs.existsSync(txtPath)) continue;
  const text = fs.readFileSync(txtPath, "utf8").trim().slice(0, 18000);
  // Update consent text inside schema_json via a replace-friendly approach:
  // store consent in a side column-less way by rewriting schema_json consent.text.en
  stmts.push(`UPDATE form_templates SET
  pdf_r2_key='shops/bnb/templates/${key}.pdf',
  pdf_mode='overlay',
  pdf_mapping_json='${esc(mapJson)}',
  status='active',
  updated_at=${Date.now()}
WHERE key='${key}';`);

  // Write a small JSON patch file for API/application of consent (SQL JSON rewrite is fragile)
  fs.mkdirSync(path.join(dir, "_inspect"), { recursive: true });
}

fs.writeFileSync(path.join(dir, "_inspect/update-pdf-keys.sql"), stmts.join("\n\n") + "\n");
console.log("Wrote forms-source/_inspect/update-pdf-keys.sql");

// Consent apply payload
const consent = keys.map((key) => {
  const p = path.join(dir, `${key}.en.txt`);
  if (!fs.existsSync(p)) return null;
  return { key, consent_en: fs.readFileSync(p, "utf8").trim().slice(0, 18000), consent_es: "" };
}).filter(Boolean);
fs.writeFileSync(path.join(dir, "_inspect/consent-sync.json"), JSON.stringify(consent, null, 2));
console.log("Consent entries:", consent.length);
