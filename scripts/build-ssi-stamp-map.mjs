/**
 * Split the official SSI packets and write ssi-stamp-map.json plus sample PDFs.
 * node scripts/build-ssi-stamp-map.mjs
 * The source packets are copied page-for-page. They are not edited.
 */
import fs from "fs";
import path from "path";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.js";
import { stampPdf } from "../functions/_lib/forms/stamp.js";
import { pngStroke } from "./png-stroke.mjs";
const schema = JSON.parse(readFileSync(new URL("../forms-source/diver_medical.schema.json", import.meta.url), "utf8"));

const TRY = "C:/Users/adria/Downloads/SSI-Try-Scuba-Forms-2019.pdf";
const MED = "C:/Users/adria/Downloads/SSI-Medical-and-Waiver-Forms-2020.pdf";
const OUT = path.resolve("forms-source");
const SAMPLES = path.resolve("forms-output-samples");
const FONT = path.resolve("functions/_lib/forms/fonts/NotoSans-Regular.ttf");

const FORMS = [
  { key: "try_scuba_reg", file: "TR-REGISTRATION-BD.pdf", src: TRY, pages: [0] },
  { key: "intro_code", file: "TR-INTRO-CODE.pdf", src: TRY, pages: [1] },
  { key: "fit_to_dive", file: "TR-INTRO-FIT.pdf", src: TRY, pages: [2] },
  { key: "privacy", file: "TR-PRIVACY.pdf", src: TRY, pages: [3, 4, 5] },
  { key: "rec_waiver", file: "TR-WAIVER.pdf", src: MED, pages: [0] },
  { key: "diver_medical", file: "Diver-Medical.pdf", src: MED, pages: [1, 2, 3] },
  { key: "diving_medical_guidance", file: "Diving-Medical-Guidance.pdf", src: MED, pages: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], reference: true },
];

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function mul(m, t) {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = t;
  return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

async function pageFacts(bytes, pageIndex) {
  const doc = await getDocument({ data: bytes, disableWorker: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const texts = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({
    x: it.transform[4], y: it.transform[5], s: it.str.trim(), w: it.width || 0,
  }));
  const op = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let fill = null;
  const greys = [];
  const lines = [];
  for (let i = 0; i < op.fnArray.length; i++) {
    const fn = op.fnArray[i];
    const args = op.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.setFillRGBColor) fill = args;
    else if (fn === OPS.constructPath) {
      const ops = args[0];
      const nums = args[1];
      let p = 0;
      let cx = 0;
      let cy = 0;
      for (const code of ops) {
        if (code === OPS.rectangle) {
          const [x, y, w, h] = nums.slice(p, p + 4);
          p += 4;
          // Grey blanks on these SSI forms are already in page space. Applying the
          // text CTM shifts them off the captions (verified against _captions.mjs).
          const rect = { x, y, w: Math.abs(w), h: Math.abs(h) };
          const grey = fill && fill[0] > 220 && fill[1] > 220 && fill[2] > 220 && fill[0] < 250;
          if (grey && rect.w > 40 && rect.h > 8 && rect.h < 40) greys.push(rect);
        } else if (code === OPS.moveTo) { cx = nums[p]; cy = nums[p + 1]; p += 2; }
        else if (code === OPS.lineTo) {
          const x = nums[p];
          const y = nums[p + 1];
          p += 2;
          const [x1, y1] = apply(ctm, cx, cy);
          const [x2, y2] = apply(ctm, x, y);
          if (Math.abs(y2 - y1) < 1.2 && Math.abs(x2 - x1) > 24) lines.push({ x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1) });
          cx = x; cy = y;
        } else if (code === OPS.curveTo) p += 6;
        else if (code === OPS.curveTo2 || code === OPS.curveTo3) p += 4;
      }
    }
  }
  return { width: vp.width, height: vp.height, texts, greys, lines };
}

function captionBelow(rect, texts) {
  return texts
    .filter((t) => t.y < rect.y && t.y > rect.y - 22 && t.x >= rect.x - 8 && t.x < rect.x + rect.w)
    .sort((a, b) => b.y - a.y)[0];
}
function textField(page, key, rect, extra = {}) {
  return {
    key, page, type: "text",
    x: Math.round(rect.x * 10) / 10,
    y: Math.round(rect.y * 10) / 10,
    w: Math.round(rect.w * 10) / 10,
    h: Math.round(rect.h * 10) / 10,
    maxSize: 11, minSize: 7, align: "left",
    ...extra,
  };
}
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function schemaBoxes() {
  const rows = [];
  for (const sec of schema.sections || []) {
    for (const f of sec.fields || []) {
      if (!String(f.key).startsWith("dm_box_") || f.type === "note") continue;
      rows.push({ key: f.key, label: norm(f.label?.en || "") });
    }
  }
  return rows;
}
const Q_KEYS = ["dm_q1", "over_45", "dm_q3", "dm_q4", "dm_q5", "dm_q6", "dm_q7", "dm_q8", "dm_q9", "dm_q10"];

function fieldsFor(key, facts) {
  const fields = [];
  const seen = {};
  const bump = (name) => (seen[name] = (seen[name] || 0) + 1);
  const greyForms = ["try_scuba_reg", "intro_code", "fit_to_dive", "privacy", "rec_waiver"];
  if (greyForms.includes(key)) {
    facts.forEach((pageFacts, page) => {
      const greys = [...pageFacts.greys].sort((a, b) => b.y - a.y || a.x - b.x);
      for (const rect of greys) {
        const label = captionBelow(rect, pageFacts.texts)?.s || "";
        if (/physician|clinic|hospital/i.test(label)) continue;
        if (key === "fit_to_dive" && rect.y < 180) continue;
        if (key === "fit_to_dive" && /^(Address|Phone|Email)$/i.test(label)) continue;
        let fieldKey = "";
        let type = "text";
        let when;
        if (/^First Name/.test(label)) fieldKey = "first_name";
        else if (/^Last Name/.test(label)) fieldKey = "last_name";
        else if (/Date of Birth/i.test(label)) fieldKey = "dob";
        else if (/Mailing Address/.test(label)) fieldKey = "mailing_address";
        else if (/^Email Address/.test(label)) fieldKey = bump("email") === 1 ? "email" : "emergency_contact_email";
        else if (/^Cell Phone/.test(label)) fieldKey = bump("cell") === 1 ? "cell_phone" : "emergency_contact_cell";
        else if (/^Name$/.test(label)) fieldKey = "emergency_contact_name";
        else if (/^Relationship/.test(label)) fieldKey = "emergency_contact_relationship";
        else if (/Participant.s Name \(Print\)/.test(label)) fieldKey = "full_name_print";
        else if (/Participant.s Signature/.test(label)) { fieldKey = "signature_png"; type = "signature"; }
        else if (/Parent\/Guardian \(Print\)|Print Name of Parent\/Guardian/.test(label)) { fieldKey = "guardian_name"; when = "minor"; }
        else if (/Parent\/Guardian Signature|Signature of Parent\/Guardian/.test(label)) { fieldKey = "guardian_signature"; type = "signature"; when = "minor"; }
        else if (/^Date \(DD\/MM\/YY\)$/.test(label)) { fieldKey = "signature_date"; when = bump("date") === 1 ? undefined : "minor"; }
        else { console.log("skip", key, JSON.stringify(label)); continue; }
        const inset = { x: rect.x + 2, y: rect.y + 1, w: rect.w - 4, h: rect.h - 2 };
        fields.push({ ...textField(page, fieldKey, inset), type, when });
      }
    });
  }
  if (key === "intro_code" || key === "rec_waiver") {
    const page = facts[0];
    const nameLine = page.texts.find((t) => /, I,$/.test(t.s));
    const under = page.lines.filter((l) => nameLine && Math.abs(l.y - nameLine.y) < 8 && l.x > 200).sort((a, b) => a.y - b.y)[0];
    if (under) fields.push(textField(0, "full_name_print", { x: under.x, y: under.y + 1, w: under.w, h: 12 }));
    const centerCap = page.texts.find((t) => /print name of training center/i.test(t.s));
    const centerLine = page.lines
      .filter((l) => centerCap && l.x < centerCap.x && l.x + l.w <= centerCap.x + 6 && Math.abs(l.y - centerCap.y) < 8)
      .sort((a, b) => b.w - a.w)[0];
    if (centerLine) fields.push(textField(0, "training_center_name", { x: centerLine.x, y: centerLine.y + 1, w: centerLine.w, h: 12 }));
  }
  if (key === "privacy") {
    const page = facts[0];
    const pairs = [
      [/SSI Training Center Name/, "training_center_name"],
      [/Street, PO Box/, "training_center_street"],
      [/ZIP Code, City/, "training_center_zip_city"],
      [/State, Country/, "training_center_state_country"],
    ];
    for (const [re, fieldKey] of pairs) {
      const label = page.texts.find((t) => re.test(t.s) && t.x < 160);
      const line = page.texts.find((t) => label && /_{6,}/.test(t.s) && Math.abs(t.y - label.y) < 2);
      if (label && line) fields.push(textField(0, fieldKey, { x: line.x, y: line.y + 1, w: Math.max(line.w, 280), h: 12 }));
    }
  }
  if (key === "fit_to_dive") {
    const marks = facts[0].texts.filter((t) => t.s === "[NO]" || t.s === "[YES]");
    const ys = [...new Set(marks.map((t) => Math.round(t.y * 10) / 10))].sort((a, b) => b - a);
    ys.forEach((y, i) => {
      const no = marks.find((t) => t.s === "[NO]" && Math.abs(t.y - y) < 0.6);
      const yes = marks.find((t) => t.s === "[YES]" && Math.abs(t.y - y) < 0.6);
      if (!no || !yes) return;
      fields.push({
        key: `fit_q${i + 1}`, page: 0, type: "yes_no",
        yes: { x: yes.x - 1, y: yes.y - 1, w: 28, h: 12 },
        no: { x: no.x - 1, y: no.y - 1, w: 26, h: 12 },
      });
    });
  }
  if (key === "diver_medical") {
    const qPage = facts[0];
    const markBox = (word, lines) => {
      const line = lines
        .filter((l) => l.y < word.y + 2)
        .sort((a, b) => b.y - a.y)[0];
      const round = (n) => Math.round(n * 10) / 10;
      if (!line) return { x: round(word.x - 2), y: round(word.y - 1), w: 22, h: 11 };
      return { x: round(line.x + 1), y: round(line.y + 2), w: round(line.w - 2), h: 12 };
    };
    const yesLines = qPage.lines.filter((l) => l.x > 470 && l.x < 520 && l.w < 60);
    const noLines = qPage.lines.filter((l) => l.x >= 520 && l.w < 60);
    const yeses = qPage.texts.filter((t) => t.s === "Yes" && t.x > 470).sort((a, b) => b.y - a.y);
    const nos = qPage.texts.filter((t) => t.s === "No" && t.x > 500);
    yeses.slice(0, 10).forEach((yes, i) => {
      const no = nos.find((t) => Math.abs(t.y - yes.y) < 10) || nos[i];
      fields.push({
        key: Q_KEYS[i], page: 0, type: "yes_no",
        yes: markBox(yes, yesLines),
        no: markBox(no || yes, noLines),
      });
    });
    const sigRows = [...new Set(qPage.lines.filter((l) => l.y > 130 && l.y < 230 && l.w > 80).map((l) => Math.round(l.y * 10) / 10))]
      .sort((a, b) => b - a);
    const pair = (y, leftKey, rightKey, leftType = "text") => {
      const row = qPage.lines.filter((l) => Math.abs(l.y - y) < 1.2 && l.w > 80);
      const left = row.find((l) => l.x < 200);
      const right = row.find((l) => l.x > 300);
      const box = (line, fieldKey, type) => {
        if (!line) return;
        fields.push({ ...textField(0, fieldKey, { x: line.x + 2, y: line.y + 2, w: line.w - 4, h: 14 }), type });
      };
      box(left, leftKey, leftType);
      box(right, rightKey, "text");
    };
    if (sigRows[0]) pair(sigRows[0], "signature_png", "signature_date", "signature");
    if (sigRows[1]) pair(sigRows[1], "full_name_print", "dob");
    if (sigRows[2]) pair(sigRows[2], "instructor_name", "facility_name");
    for (const pi of [1, 2]) {
      const p = facts[pi];
      const name = p.texts.find((t) => t.s === "Participant Name");
      const birth = p.texts.find((t) => t.s === "Birthdate");
      const rule = p.lines.find((l) => l.y > 790 && l.w > 400);
      const printCap = p.texts.find((t) => t.s === "(Print)" && t.y > 760);
      const dateCap = p.texts.find((t) => /Date \(dd\/mm\/yyyy\)/.test(t.s) && t.y > 760);
      if (name && birth && rule) {
        const nameX = name.x + (name.w || 100) + 8;
        const nameEnd = Math.min(birth.x - 8, printCap ? printCap.x + 40 : birth.x - 8);
        fields.push(textField(pi, "full_name_print", { x: nameX, y: rule.y + 3, w: Math.max(40, nameEnd - nameX), h: 11 }));
        const dobX = birth.x + (birth.w || 52) + 8;
        const dobEnd = dateCap ? dateCap.x + 96 : rule.x + rule.w - 4;
        fields.push(textField(pi, "dob", { x: dobX, y: rule.y + 3, w: Math.max(40, dobEnd - dobX), h: 11 }));
      }
    }
    const boxes = schemaBoxes();
    const used = new Set();
    const page = facts[1];
    const yesCol = page.lines.filter((l) => l.x > 490 && l.x < 530 && l.w < 40);
    const noCol = page.lines.filter((l) => l.x >= 530 && l.w < 40);
    const headerCut = Math.max(...page.texts.filter((t) => /BOX A/i.test(t.s)).map((t) => t.y), 0);
    for (const yes of page.texts.filter((t) => t.s === "Yes" && t.x > 480 && t.y < (headerCut || 800))) {
      const parts = page.texts
        .filter((t) => t.x < 470 && t.s !== "Yes" && t.s !== "No" && Math.abs(t.y - yes.y) <= 14)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      if (!parts.length) continue;
      const label = parts.map((t) => t.s).join(" ");
      const n = norm(label);
      const words = new Set(n.split(" ").filter((w) => w.length > 3));
      let best = null;
      let bestScore = 0;
      for (const b of boxes) {
        if (used.has(b.key)) continue;
        const bw = new Set(b.label.split(" ").filter((w) => w.length > 3));
        let hit = 0;
        for (const w of words) if (bw.has(w)) hit++;
        const score = hit / Math.max(Math.min(words.size, bw.size), 1);
        if (score > bestScore) { bestScore = score; best = b; }
      }
      const no = page.texts.find((t) => t.s === "No" && Math.abs(t.y - yes.y) < 3 && t.x > yes.x);
      let fieldKey = best && bestScore >= 0.45 ? best.key : "";
      if (!fieldKey && /covid/.test(n)) fieldKey = "dm_box_A_covid";
      if (!fieldKey) { console.log("unmapped box:", label); continue; }
      if (best && fieldKey === best.key) used.add(best.key);
      const markEnd = (word, lines) => {
        const box = markBox(word, lines);
        return {
          x: Math.round((box.x + box.w - 13) * 10) / 10,
          y: Math.round((box.y + 1) * 10) / 10,
          w: 11,
          h: 10,
        };
      };
      fields.push({
        key: fieldKey, page: 1, type: "yes_no",
        yes: markEnd(yes, yesCol),
        no: markEnd(no || yes, noCol),
      });
    }
  }
  return fields;
}

const adult = {
  first_name: "María", last_name: "Peña-Müller", full_name_print: "María Peña-Müller",
  dob: "1984-03-09",
  mailing_address: "1234 Avenida de los Cocoteros, Apartment 12, West End, Roatán, Islas de la Bahía",
  address: "1234 Avenida de los Cocoteros, Apartment 12, West End, Roatán, Islas de la Bahía",
  email: "maria.pena@example.com", cell_phone: "+504 9876-3374",
  emergency_contact_name: "José Peña", emergency_contact_relationship: "Spouse",
  emergency_contact_email: "jose.pena@example.com", emergency_contact_cell: "+504 9999-0000",
  training_center_name: "Banana Nut Burgers Dive Shop", training_center_street: "West End Road",
  training_center_zip_city: "34101 Roatán", training_center_state_country: "Bay Islands, Honduras",
  instructor_name: "Adrian Cruz", facility_name: "Banana Nut Burgers Dive Shop",
  signature_date: "2026-10-27", __dateFormat: "mm/dd/yyyy",
  fit_q1: "no", fit_q2: "no", fit_q3: "yes", fit_q4: "no", fit_q5: "no", fit_q6: "no", fit_q7: "no",
  dm_q1: "no", over_45: "no", dm_q3: "yes", dm_q4: "no", dm_q5: "no", dm_q6: "no", dm_q7: "no", dm_q8: "no", dm_q9: "no", dm_q10: "no",
  dm_box_A_1: "yes",
};
const minorAnswers = { ...adult, first_name: "Luis", last_name: "Peña", full_name_print: "Luis Peña", dob: "2014-06-02", guardian_name: "María Peña-Müller" };

fs.mkdirSync(SAMPLES, { recursive: true });
const map = {};
const acro = {};
const fontBytes = fs.readFileSync(FONT);
const sigPng = pngStroke();

for (const form of FORMS) {
  const src = await PDFDocument.load(fs.readFileSync(form.src));
  let fieldCount = 0;
  try { fieldCount = src.getForm().getFields().length; } catch { fieldCount = 0; }
  acro[form.key] = fieldCount;
  const out = await PDFDocument.create();
  (await out.copyPages(src, form.pages)).forEach((p) => out.addPage(p));
  const bytes = Buffer.from(await out.save());
  fs.writeFileSync(path.join(OUT, form.file), bytes);
fs.mkdirSync(path.resolve("functions/_lib/forms/templates"), { recursive: true });
fs.copyFileSync(path.join(OUT, form.file), path.resolve("functions/_lib/forms/templates", form.file));
  if (form.reference) {
    map[form.key] = { file: form.file, reference: true, pages: form.pages.length, fields: [] };
    continue;
  }
  const fresh = new Uint8Array(bytes);
  const facts = [];
  for (let i = 0; i < form.pages.length; i++) facts.push(await pageFacts(fresh, i));
  const fields = fieldsFor(form.key, facts);
  map[form.key] = {
    file: form.file,
    pages: facts.length,
    pageSize: facts.map((f) => [Math.round(f.width * 10) / 10, Math.round(f.height * 10) / 10]),
    fields,
  };
  const debug = await stampPdf({ templateBytes: fresh, map: map[form.key], fontBytes, debug: true });
  fs.writeFileSync(path.join(SAMPLES, `${form.key}.debug.pdf`), debug.bytes);
  const filled = await stampPdf({
    templateBytes: fresh, map: map[form.key], answers: adult, fontBytes,
    registrationNumber: "BNB-2610-0001", signaturePng: sigPng,
  });
  fs.writeFileSync(path.join(SAMPLES, `${form.key}.adult.pdf`), filled.bytes);
  const kid = await stampPdf({
    templateBytes: fresh, map: map[form.key], answers: minorAnswers, fontBytes,
    registrationNumber: "BNB-2610-0002", signaturePng: sigPng, guardianPng: sigPng,
  });
  fs.writeFileSync(path.join(SAMPLES, `${form.key}.minor.pdf`), kid.bytes);
  console.log(form.key, "fields", fields.length, "acro", fieldCount);
}

map.youth_addendum = { file: null, status: "missing-pdf", fields: [], note: "Official SSI Youth Addendum PDF is not in the packet. Minors still stamp guardian lines on the forms above. Shop consent stands in until the PDF is added." };
const stampJson = JSON.stringify(map, null, 2);
fs.writeFileSync(path.join(OUT, "ssi-stamp-map.json"), stampJson);
fs.writeFileSync(path.join(OUT, "ssi-stamp-map.js"), `export default ${stampJson};\n`);
console.log("acro", JSON.stringify(acro));
