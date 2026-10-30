/**
 * Sync consent legal text from forms-source/*.en.txt / *.es.txt into a SQL patch
 * or print JSON for admin POST /api/forms/templates { key, consent_en, consent_es }.
 *
 * Naming: forms-source/<template_key>.en.txt  (and optional .es.txt)
 * Example: try_scuba_reg.en.txt, intro_code.en.txt, privacy.en.txt
 *
 * Paste SSI wording from the official PDF into those text files — do not rewrite.
 */
import fs from "fs";
import path from "path";

const dir = path.resolve("forms-source");
if (!fs.existsSync(dir)) {
  console.log("No forms-source/");
  process.exit(0);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".en.txt"));
if (!files.length) {
  console.log("No *.en.txt companions yet. Create e.g. forms-source/intro_code.en.txt with SSI legal text from the PDF.");
  process.exit(0);
}

const out = [];
for (const f of files) {
  const key = f.replace(/\.en\.txt$/i, "");
  const en = fs.readFileSync(path.join(dir, f), "utf8").trim();
  const esPath = path.join(dir, `${key}.es.txt`);
  const es = fs.existsSync(esPath) ? fs.readFileSync(esPath, "utf8").trim() : "";
  out.push({ key, consent_en: en, consent_es: es });
  console.log(`✓ ${key}: ${en.length} chars EN` + (es ? `, ${es.length} ES` : ""));
}

fs.mkdirSync(path.join(dir, "_inspect"), { recursive: true });
fs.writeFileSync(path.join(dir, "_inspect/consent-sync.json"), JSON.stringify(out, null, 2));
console.log("Wrote forms-source/_inspect/consent-sync.json — POST each entry to /api/forms/templates");
