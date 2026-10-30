/**
 * Inspect SSI PDFs in forms-source/ with pdf-lib + auto-draft mapping.
 * Writes forms-source/_inspect/<name>.json
 */
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { autoMapFields, defaultOverlayPlacements } from "../functions/_lib/forms/automap.js";

const dir = path.resolve("forms-source");
const outDir = path.join(dir, "_inspect");
fs.mkdirSync(outDir, { recursive: true });

const KEY_HINTS = {
  "TR-REGISTRATION": "try_scuba_reg",
  "TR-INTRO-CODE": "intro_code",
  "TR-INTRO-FIT": "fit_to_dive",
  "TR-PRIVACY": "privacy",
  "TR-WAIVER": "rec_waiver",
  "Diver-Medical": "diver_medical",
  "Diver Medical": "diver_medical",
  "Diving-Medical-Guidance": "diving_medical_guidance",
  "Diving Medical Guidance": "diving_medical_guidance",
  "Youth": "youth_addendum",
};

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
if (!files.length) {
  console.log("No PDFs in forms-source/ yet. Drop SSI files and re-run.");
  process.exit(0);
}

for (const file of files) {
  const bytes = fs.readFileSync(path.join(dir, file));
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  let fields = [];
  try {
    fields = pdf.getForm().getFields().map((f) => ({ name: f.getName(), type: f.constructor?.name || "unknown" }));
  } catch { fields = []; }
  const names = fields.map((f) => f.name);
  let mapping = autoMapFields(names);
  if (!names.length) {
    mapping.mode = "overlay";
    mapping.placements = defaultOverlayPlacements();
  }
  let templateKey = null;
  for (const [hint, key] of Object.entries(KEY_HINTS)) {
    if (file.toUpperCase().includes(hint.toUpperCase())) { templateKey = key; break; }
  }
  const report = {
    file,
    templateKey,
    pageCount: pdf.getPageCount(),
    mode: mapping.mode,
    fields,
    mapping,
    next: templateKey
      ? `Upload via admin-forms.html (key=${templateKey}) or: wrangler r2 object put banana-nut-burgers-docs/shops/bnb/templates/${templateKey}.pdf --file=forms-source/${file}`
      : "Rename to match SSI names in forms-source/README.md",
  };
  const out = path.join(outDir, file.replace(/\.pdf$/i, "") + ".json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`${file}: ${mapping.mode}, ${report.pageCount}p, ${fields.length} fields → ${templateKey || "?"} → ${out}`);
}
