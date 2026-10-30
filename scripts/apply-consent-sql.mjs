import fs from "fs";
import path from "path";

const dir = path.resolve("forms-source");
const sync = JSON.parse(fs.readFileSync(path.join(dir, "_inspect/consent-sync.json"), "utf8"));

function esc(s) {
  return String(s).replace(/\0/g, "").replace(/'/g, "''");
}

const lines = ["-- Apply extracted SSI legal text into schema consent blocks"];
for (const row of sync) {
  // json_set if available in D1 SQLite
  const en = esc(row.consent_en);
  lines.push(`UPDATE form_templates
SET schema_json = json_set(
  COALESCE(NULLIF(schema_json,''), '{}'),
  '$.consent.text.en', '${en}',
  '$.consent.required', json('true'),
  '$.consent.version', COALESCE(json_extract(schema_json,'$.consent.version'), 'ssi-extracted-v1')
),
updated_at = ${Date.now()}
WHERE key = '${row.key}';`);
}
const out = path.join(dir, "_inspect/apply-consent.sql");
fs.writeFileSync(out, lines.join("\n\n") + "\n");
console.log("Wrote", out, "statements:", sync.length);
