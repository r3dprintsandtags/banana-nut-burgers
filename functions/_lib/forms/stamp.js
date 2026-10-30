/**
 * Stamp customer answers onto an untouched SSI PDF.
 * Does not add pages, rewrite preprinted text, or rebuild the form.
 * TODO: confirm with SSI that dates may be written MM/DD/YYYY while captions still say DD/MM/YY.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const INK = rgb(0.031, 0.192, 0.361);

export function formatStampDate(iso, fmt = "mm/dd/yyyy") {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return String(iso);
  if (fmt === "dd/mm/yy") return `${d}/${m}/${y.slice(-2)}`;
  if (fmt === "dd/mm/yyyy") return `${d}/${m}/${y}`;
  if (fmt === "mm/dd/yyyy") return `${m}/${d}/${y}`;
  return `${y}-${m}-${d}`;
}

function isMinor(answers) {
  const dob = String(answers?.dob || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const [y, m, d] = dob.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if ((now.getMonth() + 1) * 100 + now.getDate() < m * 100 + d) age--;
  return age < 18;
}

function fieldText(field, answers) {
  const fmt = answers.__dateFormat || "mm/dd/yyyy";
  if (field.format === "date" || field.key === "dob" || field.key === "signature_date") {
    return formatStampDate(answers[field.key] || (field.key === "signature_date" ? answers.signature_date : ""), fmt);
  }
  if (field.key === "mailing_address") {
    return String(answers.mailing_address || answers.address || [answers.city, answers.state, answers.zip].filter(Boolean).join(", "));
  }
  if (field.key === "cell_phone") return String(answers.cell_phone || answers.phone || "");
  if (field.key === "emergency_contact_cell") return String(answers.emergency_contact_cell || answers.emergency_contact_phone || "");
  if (field.key === "full_name_print") {
    return String(answers.full_name_print || `${answers.first_name || ""} ${answers.last_name || ""}`).trim();
  }
  const v = answers[field.key];
  if (v == null || v === false) return "";
  return String(v);
}

function wrapToWidth(font, text, width, size) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

function fitLines(font, text, width, height, maxSize, minSize) {
  let size = maxSize;
  let lines = [String(text)];
  const fits = (sz, rows) => {
    const widest = Math.max(...rows.map((line) => font.widthOfTextAtSize(line, sz)), 0);
    const needed = rows.length * sz + Math.max(0, rows.length - 1) + 0.8;
    return widest <= width && needed <= height;
  };
  while (size >= minSize) {
    lines = wrapToWidth(font, text, width, size);
    if (fits(size, lines)) return { size, lines };
    size -= 0.5;
  }
  const clipped = wrapToWidth(font, text, width, minSize).map((line) => {
    let s = line;
    while (s.length > 1 && font.widthOfTextAtSize(s, minSize) > width) s = s.slice(0, -1);
    return s;
  });
  return { size: minSize, lines: clipped.slice(0, Math.max(1, Math.floor((height - 1) / (minSize + 1)) || 1)) };
}

function boxGate(key) {
  if (key.startsWith("dm_box_A")) return "dm_q1";
  if (key.startsWith("dm_box_B")) return "over_45";
  if (key.startsWith("dm_box_C")) return "dm_q4";
  if (key.startsWith("dm_box_D")) return "dm_q6";
  if (key.startsWith("dm_box_E")) return "dm_q7";
  if (key.startsWith("dm_box_F")) return "dm_q8";
  if (key.startsWith("dm_box_G")) return "dm_q9";
  return "";
}

function isYes(raw) {
  return raw === true || String(raw).toLowerCase() === "yes" || raw === 1 || raw === "1";
}

function applies(field, answers, includeSignature) {
  const minor = isMinor(answers);
  if (field.when === "minor" && !minor) return false;
  if (field.when === "adult" && minor) return false;
  if (!includeSignature && (field.type === "signature" || field.key === "signature_date" || field.key === "guardian_signature")) return false;
  return true;
}

export async function stampPdf({
  templateBytes,
  map,
  answers = {},
  fontBytes,
  registrationNumber = "",
  signaturePng = null,
  guardianPng = null,
  includeSignature = true,
  debug = false,
} = {}) {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const pages = pdf.getPages();
  const placed = [];

  for (const field of map.fields || []) {
    if (!applies(field, answers, includeSignature)) continue;
    const page = pages[field.page || 0];
    if (!page) continue;
    if (debug) {
      const rects = field.type === "yes_no" ? [field.yes, field.no] : [field];
      rects.forEach((r, i) => {
        if (!r || !Number.isFinite(r.x)) return;
        page.drawRectangle({
          x: r.x, y: r.y, width: r.w, height: r.h,
          borderColor: rgb(0.8, 0.1, 0.1), borderWidth: 0.6,
        });
        if (i === 0) {
          page.drawText(String(field.key).slice(0, 28), {
            x: r.x + 1, y: r.y + 1, size: 6, font, color: rgb(0.7, 0.1, 0.1),
          });
        }
      });
      continue;
    }
    if (field.type === "yes_no") {
      let raw = answers[field.key];
      const gate = boxGate(field.key);
      if (gate && !isYes(answers[gate])) continue;
      const yes = isYes(raw);
      const no = raw === false || String(raw).toLowerCase() === "no" || raw === 0 || raw === "0";
      const box = yes ? field.yes : no ? field.no : null;
      if (!box) continue;
      const size = Math.min(11, Math.max(8, box.h - 1));
      const x = box.x + Math.max(0, (box.w - font.widthOfTextAtSize("X", size)) / 2);
      const y = box.y + Math.max(0, (box.h - size) / 2);
      page.drawText("X", { x, y, size, font, color: INK });
      placed.push({ key: field.key, page: field.page, ...box, value: "X" });
      continue;
    }
    if (field.type === "signature") {
      const bytes = field.key === "guardian_signature" ? guardianPng : signaturePng;
      if (!bytes) continue;
      const img = await pdf.embedPng(bytes);
      const scale = Math.min(field.w / img.width, field.h / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = field.x + (field.w - w) / 2;
      const y = field.y + (field.h - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
      placed.push({ key: field.key, page: field.page, x, y, w, h });
      continue;
    }
    const text = fieldText(field, answers).trim();
    if (!text) continue;
    const maxSize = field.maxSize || 11;
    const minSize = field.minSize || 7;
    const { size, lines } = fitLines(font, text, field.w - 2, field.h, maxSize, minSize);
    lines.forEach((line, i) => {
      const y = field.y + field.h - size - 0.4 - i * (size + 0.6);
      if (y < field.y - 0.2) return;
      page.drawText(line, { x: field.x + 1, y, size, font, color: INK });
    });
    placed.push({ key: field.key, page: field.page, x: field.x, y: field.y, w: field.w, h: field.h, value: text });
  }

  if (registrationNumber && !debug) {
    for (const page of pages) {
      const { width, height } = page.getSize();
      const size = 7;
      const text = String(registrationNumber);
      const w = font.widthOfTextAtSize(text, size);
      const x = Math.max(8, width - w - 10);
      const y = height - 11;
      page.drawText(text, { x, y, size, font, color: INK });
      placed.push({ key: "__registration_number", page: pages.indexOf(page), x, y, w, h: size, value: text });
    }
  }

  try {
    const form = pdf.getForm();
    if (form.getFields().length) form.flatten();
  } catch (_) { /* flat SSI originals have no fields */ }

  const bytes = await pdf.save();
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { bytes, sha256, placed };
}

export function downloadName({ last, first, formName, iso }) {
  const clean = (s) => String(s || "Form").replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_").slice(0, 40);
  const day = String(iso || new Date().toISOString()).slice(0, 10);
  return `${clean(last)}_${clean(first)}_${clean(formName)}_${day}.pdf`;
}
