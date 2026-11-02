/**
 * Stamp the official SSI PDF. Does not add pages or redraw the form.
 * Audit data stays in the database. The PDF the customer downloads is the original plus values.
 * TODO: confirm with SSI that dates may be written MM/DD/YYYY while captions still say DD/MM/YY.
 */
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import stampMap from "../../../forms-source/ssi-stamp-map.json";
import { stampPdf } from "./stamp.js";

const TEMPLATE_FILE = {
  try_scuba_reg: "TR-REGISTRATION-BD.pdf",
  intro_code: "TR-INTRO-CODE.pdf",
  fit_to_dive: "TR-INTRO-FIT.pdf",
  privacy: "TR-PRIVACY.pdf",
  rec_waiver: "TR-WAIVER.pdf",
  diver_medical: "Diver-Medical.pdf",
  diving_medical_guidance: "Diving-Medical-Guidance.pdf",
};

export function stampMapFor(key) {
  return stampMap[key] || null;
}

export function templateFileName(key) {
  return TEMPLATE_FILE[key] || "";
}

export async function bytesFromStore(env, objectKey) {
  if (!env?.DOCS || !objectKey) return null;
  const obj = await env.DOCS.get(objectKey);
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
}

export async function officialBytes(env, key) {
  return officialTemplate(key) || bytesFromStore(env, "shops/bnb/templates/" + templateFileName(key));
}

export async function officialFont(env) {
  return stampFontBytes() || bytesFromStore(env, "shops/bnb/templates/NotoSans-Regular.ttf");
}
export function officialTemplate(key) {
  const file = TEMPLATE_FILE[key];
  const base = import.meta.url;
  if (!file || typeof base !== "string" || !/^(file:|https?:)/.test(base)) return null;
  try {
    return readFileSync(new URL("./templates/" + file, base));
  } catch {
    return null;
  }
}

let fontCache = null;
export function stampFontBytes() {
  const base = import.meta.url;
  if (fontCache) return fontCache;
  if (typeof base !== "string" || !/^(file:|https?:)/.test(base)) return null;
  try {
    fontCache = readFileSync(new URL("./fonts/NotoSans-Regular.ttf", base));
    return fontCache;
  } catch {
    return null;
  }
}

export async function fillPdf({
  templateBytes = null,
  answers = {},
  signaturePngBytes = null,
  guardianPng = null,
  registrationNumber = "",
  audit = {},
  includeSignature = true,
  fontBytes = null,
} = {}) {
  const key = audit.templateKey || "";
  const map = stampMap[key];
  if (!map || map.reference || map.status === "missing-pdf") {
    throw new Error(`No stamp map for ${key || "form"}`);
  }
  const bytes = templateBytes || officialTemplate(key);
  const font = fontBytes || stampFontBytes();
  if (!bytes) throw new Error(`Missing official PDF for ${key}`);
  if (!font) throw new Error("Stamp font missing");
  return stampPdf({
    templateBytes: bytes,
    map,
    answers,
    fontBytes: font,
    registrationNumber,
    signaturePng: signaturePngBytes,
    guardianPng: guardianPng || answers.__guardianPng || null,
    includeSignature,
  });
}

/** Append stamped forms, then the guidance PDF unchanged when a physician is needed. */
export async function combinePacket(parts) {
  const out = await PDFDocument.create();
  for (const part of parts) {
    if (!part) continue;
    const src = await PDFDocument.load(part, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

export async function listAcroFormFields(templateBytes) {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const fields = form.getFields().map((f) => ({
    name: f.getName(),
    type: f.constructor?.name || "unknown",
  }));
  return { pageCount: pdf.getPageCount(), fields };
}
