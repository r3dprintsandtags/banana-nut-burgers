/**
 * Split combined SSI packet PDFs into per-template files using page text heuristics.
 */
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createRequire } from "module";

// Use pdfjs from pdfjs-dist if available; otherwise heuristic page ranges from SSI layouts.
let getDocument = null;
try {
  const require = createRequire(import.meta.url);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
  if (pdfjs?.getDocument) getDocument = pdfjs.getDocument;
} catch { /* optional */ }

const outDir = path.resolve("forms-source");

async function pageText(bytes, pageIndex) {
  if (!getDocument) return "";
  try {
    const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const page = await doc.getPage(pageIndex + 1);
    const tc = await page.getTextContent();
    return tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

async function classifyTryScuba(bytes, pageCount) {
  // Default SSI Try Scuba packet order (2019 pack often):
  // 0 Registration, 1 Intro Code, 2 Fit to Dive, 3-5 Privacy (3 pages)
  const ranges = {
    try_scuba_reg: [0, 0],
    intro_code: [1, 1],
    fit_to_dive: [2, 2],
    privacy: [3, Math.min(5, pageCount - 1)],
  };
  if (getDocument) {
    for (let i = 0; i < pageCount; i++) {
      const t = (await pageText(bytes, i)).toLowerCase();
      console.log(`  try p${i + 1}: ${t.slice(0, 120)}`);
      if (t.includes("fit to dive") || t.includes("fit-to-dive")) ranges.fit_to_dive = [i, i];
      if (t.includes("introductory scuba") || t.includes("intro code") || t.includes("code of")) ranges.intro_code = [i, i];
      if (t.includes("registration") && !t.includes("privacy")) ranges.try_scuba_reg = [i, i];
      if (t.includes("privacy")) {
        if (!ranges.privacy) ranges.privacy = [i, i];
        else ranges.privacy[1] = i;
      }
    }
  }
  return ranges;
}

async function classifyMedical(bytes, pageCount) {
  // Common 2020 pack: waiver, diver medical (3), privacy?, guidance (12)
  const ranges = {
    rec_waiver: [0, 0],
    diver_medical: [1, Math.min(3, pageCount - 1)],
    diving_medical_guidance: [Math.max(4, pageCount - 12), pageCount - 1],
  };
  if (getDocument) {
    const found = {};
    for (let i = 0; i < pageCount; i++) {
      const t = (await pageText(bytes, i)).toLowerCase();
      console.log(`  med p${i + 1}: ${t.slice(0, 120)}`);
      if (t.includes("release of liability") || t.includes("assumption of risk") || (t.includes("waiver") && t.includes("recreational"))) {
        if (found.rec_waiver == null) found.rec_waiver = [i, i];
        else found.rec_waiver[1] = i;
      }
      if (t.includes("diver medical") || t.includes("participant questionnaire") || t.includes("physician") && t.includes("evaluation")) {
        if (found.diver_medical == null) found.diver_medical = [i, i];
        else found.diver_medical[1] = i;
      }
      if (t.includes("medical guidance") || t.includes("diving medical guidance") || t.includes("uhms")) {
        if (found.diving_medical_guidance == null) found.diving_medical_guidance = [i, i];
        else found.diving_medical_guidance[1] = i;
      }
      if (t.includes("privacy policy") || t.includes("privacy notice")) {
        if (found.privacy_rec == null) found.privacy_rec = [i, i];
        else found.privacy_rec[1] = i;
      }
    }
    Object.assign(ranges, found);
  }
  return ranges;
}

async function extract(srcPath, ranges) {
  const bytes = fs.readFileSync(srcPath);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const written = [];
  for (const [key, [start, end]] of Object.entries(ranges)) {
    if (start == null || end == null || start > end || start >= src.getPageCount()) continue;
    const out = await PDFDocument.create();
    const idxs = [];
    for (let i = start; i <= end && i < src.getPageCount(); i++) idxs.push(i);
    const pages = await out.copyPages(src, idxs);
    pages.forEach((p) => out.addPage(p));
    const file = path.join(outDir, `${key}.pdf`);
    fs.writeFileSync(file, await out.save());
    written.push({ key, file, pages: idxs.length, range: `${start + 1}-${end + 1}` });
    console.log(`wrote ${key}.pdf pages ${start + 1}-${end + 1}`);
  }
  return written;
}

const tryPath = path.join(outDir, "SSI-Try-Scuba-Forms-2019.pdf");
const medPath = path.join(outDir, "SSI-Medical-and-Waiver-Forms-2020.pdf");

const tryBytes = new Uint8Array(fs.readFileSync(tryPath));
const medBytes = new Uint8Array(fs.readFileSync(medPath));
const tryDoc = await PDFDocument.load(tryBytes, { ignoreEncryption: true });
const medDoc = await PDFDocument.load(medBytes, { ignoreEncryption: true });

console.log("Try Scuba pages:", tryDoc.getPageCount());
console.log("Medical/Waiver pages:", medDoc.getPageCount());

// Prefer pdfjs text if installed
let pdfjsOk = false;
try {
  await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsOk = true;
} catch {
  console.log("pdfjs-dist not installed — using default page ranges (install for better split)");
}

const tryRanges = await classifyTryScuba(tryBytes, tryDoc.getPageCount());
const medRanges = await classifyMedical(medBytes, medDoc.getPageCount());

console.log("Try ranges", tryRanges);
console.log("Med ranges", medRanges);

const w1 = await extract(tryPath, tryRanges);
const w2 = await extract(medPath, medRanges);
fs.writeFileSync(path.join(outDir, "_inspect/split-report.json"), JSON.stringify({ tryRanges, medRanges, written: [...w1, ...w2] }, null, 2));
console.log("Done. Review forms-source/*.pdf then run inspect:pdfs");
