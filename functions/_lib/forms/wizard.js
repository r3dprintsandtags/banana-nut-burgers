/** One stepper for the customer packet. Documents are a list inside one step. */

export const THEMES = {
  light: {
    bg: "#fff8e6",
    surface: "#ffffff",
    text: "#0a2533",
    muted: "#3d5160",
    border: "#8a7348",
    primary: "#075a78",
    primaryText: "#ffffff",
    danger: "#9b1c1c",
    paper: "#ffffff",
    paperText: "#0a2533",
    filled: "#08315c",
    onPhoto: "#f4fbff",
    photo: "#06161f",
    disabled: "#d5dee4",
    disabledText: "#0a2533",
  },
  dark: {
    bg: "#06161f",
    surface: "#123041",
    text: "#f5fbff",
    muted: "#d5e4ee",
    border: "#8eb4c8",
    primary: "#8fd4f0",
    primaryText: "#06202b",
    danger: "#ffb4b4",
    paper: "#ffffff",
    paperText: "#0a2533",
    filled: "#08315c",
    onPhoto: "#f4fbff",
    photo: "#06161f",
    disabled: "#2c4a5c",
    disabledText: "#f5fbff",
  },
};

export function ageYears(dob, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ""))) return null;
  const [y, m, d] = String(dob).split("-").map(Number);
  let age = now.getFullYear() - y;
  if ((now.getMonth() + 1) * 100 + now.getDate() < m * 100 + d) age--;
  return age;
}

export function fieldVisible(cond, answers, now = new Date()) {
  if (!cond) return true;
  if (Array.isArray(cond.all)) return cond.all.every((c) => fieldVisible(c, answers, now));
  if (Array.isArray(cond.any)) return cond.any.some((c) => fieldVisible(c, answers, now));
  if (cond.op === "age_lt" || cond.op === "age_gte" || cond.field === "__age") {
    const age = ageYears(answers?.dob, now);
    if (age == null) return false;
    if (cond.op === "age_gte") return age >= (cond.value ?? 45);
    return age < (cond.value ?? 18);
  }
  const v = answers?.[cond.field];
  const op = cond.op || "eq";
  if (op === "eq") return v === cond.value;
  if (op === "neq") return v !== cond.value;
  if (op === "truthy") return !!v;
  if (op === "falsy") return !v;
  if (op === "in") return Array.isArray(cond.value) && cond.value.includes(v);
  return true;
}

export function isAckSection(sec) {
  const fields = sec?.fields || [];
  return fields.length > 0 && fields.every((f) => f.type === "checkbox" || f.type === "note");
}

export function stepLabel(id, lang = "en") {
  const labels = {
    about: { en: "About you", es: "Sobre ti" },
    emergency: { en: "Emergency contact", es: "Contacto de emergencia" },
    guardian: { en: "Guardian", es: "Tutor" },
    medical: { en: "Medical", es: "Médico" },
    documents: { en: "Documents", es: "Documentos" },
    review: { en: "Review", es: "Revisar" },
    finish: { en: "Finish", es: "Listo" },
  };
  const row = labels[id];
  return (row && (row[lang] || row.en)) || id;
}

/** Legal copy may arrive as a string or as { en, es }. */
export function legalBundle(raw) {
  if (!raw) return { en: "", es: "" };
  if (typeof raw === "string") return { en: raw, es: "" };
  if (typeof raw === "object") return { en: String(raw.en || ""), es: String(raw.es || "") };
  return { en: String(raw), es: "" };
}

export function buildFlow(templates, answers, now = new Date()) {
  const ABOUT_KEYS = new Set(["first_name", "last_name", "dob", "email", "cell_phone", "phone", "address", "city", "state", "zip", "full_name_print", "postal_code"]);
  const EMERGENCY_KEYS = new Set(["emergency_contact_name", "emergency_contact_relationship", "emergency_contact_email", "emergency_contact_phone"]);
  const minor = (ageYears(answers?.dob, now) ?? 99) < 18 && ageYears(answers?.dob, now) != null;
  const steps = [
    { id: "about", kind: "about" },
    { id: "emergency", kind: "emergency" },
  ];
  if (minor) steps.push({ id: "guardian", kind: "guardian" });
  const medical = [];
  const docs = [];
  const pdfDocKeys = new Set(["try_scuba_reg", "intro_code", "fit_to_dive", "privacy", "rec_waiver", "diver_medical"]);
  for (const t of templates || []) {
    if (!t || t.key === "diving_medical_guidance") continue;
    for (const sec of t.schema?.sections || []) {
      if (isAckSection(sec)) continue;
      const fields = (sec.fields || []).filter((f) => {
        if (!f) return false;
        if (f.type === "note") return true;
        if (ABOUT_KEYS.has(f.key) || EMERGENCY_KEYS.has(f.key)) return false;
        if (f.type === "yes_no") return true;
        if (f.type === "checkbox" && f.sensitive) return true;
        return false;
      });
      if (!fields.some((f) => f.type !== "note")) continue;
      medical.push({
        templateKey: t.key,
        templateName: t.name,
        section: { id: sec.id || t.key, title: sec.title, show_if: sec.show_if, fields },
      });
    }
    const bundled = legalBundle(t.legal);
    const legal = bundled.en;
    const legalEs = legalBundle(t.legalEs).en || legalBundle(t.legalEs).es || bundled.es;
    const pdf = pdfDocKeys.has(t.key);
    docs.push({
      key: t.key,
      name: t.name || t.key,
      legal,
      legalEs,
      pdf,
      // Official PDFs are the document. A short or object-shaped legal blob must not trap the signer.
      missing: !pdf && t.key !== "youth_addendum" && legal.trim().length < 40,
    });
  }
  if (medical.length) steps.push({ id: "medical", kind: "medical" });
  steps.push({ id: "documents", kind: "documents" });
  steps.push({ id: "review", kind: "review" });
  steps.push({ id: "finish", kind: "finish" });
  return { steps, minor, medical, docs };
}

export function stepProblems(stepId, flow, answers, now = new Date()) {
  const a = answers || {};
  if (stepId === "about") {
    const out = [];
    if (!String(a.first_name || "").trim()) out.push({ id: "first_name", label: "First name" });
    if (!String(a.last_name || "").trim()) out.push({ id: "last_name", label: "Last name" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.dob || ""))) out.push({ id: "dob", label: "Date of birth" });
    else if (String(a.dob) > now.toISOString().slice(0, 10)) out.push({ id: "dob", label: "Date of birth" });
    if (!String(a.city || "").trim()) out.push({ id: "city", label: "City" });
    if (!String(a.state || "").trim()) out.push({ id: "state", label: "State" });
    if (!String(a.zip || a.postal_code || "").trim()) out.push({ id: "zip", label: "ZIP" });
    return out;
  }
  if (stepId === "emergency") {
    const out = [];
    if (String(a.emergency_contact_name || "").trim().length < 2) out.push({ id: "emergency_contact_name", label: "Emergency contact name" });
    if (String(a.emergency_contact_phone || "").replace(/\D/g, "").length < 8) out.push({ id: "emergency_contact_phone", label: "Emergency contact phone" });
    return out;
  }
  if (stepId === "guardian") {
    if (!flow?.minor) return [];
    if (String(a.guardian_name || "").trim().length < 2) return [{ id: "guardian_name", label: "Guardian name" }];
    return [];
  }
  if (stepId === "medical") {
    const out = [];
    for (const block of flow?.medical || []) {
      if (!fieldVisible(block.section.show_if, a, now)) continue;
      for (const f of block.section.fields || []) {
        if (f.type !== "yes_no") continue;
        if (!fieldVisible(f.show_if, a, now)) continue;
        if (a[f.key] !== "yes" && a[f.key] !== "no") {
          const label = typeof f.label === "string" ? f.label : (f.label?.en || f.key);
          out.push({ id: f.key, label });
        }
      }
    }
    return out;
  }
  if (stepId === "documents") {
    const out = [];
    const agreements = a.__agreements || {};
    const sigs = a.__signatures || {};
    for (const doc of flow?.docs || []) {
      if (doc.missing && !doc.pdf) out.push({ id: "doc_" + doc.key, label: doc.name + " text" });
      if (!agreements[doc.key] || agreements[doc.key].accepted !== true) out.push({ id: "agree_" + doc.key, label: doc.name + " agreement" });
      if (!String(sigs[doc.key] || "").startsWith("data:image/png;base64,")) out.push({ id: "sign_" + doc.key, label: doc.name + " signature" });
    }
    if (flow?.minor && !String(sigs.guardian || "").startsWith("data:image/png;base64,")) {
      out.push({ id: "sign_guardian", label: "Guardian signature" });
    }
    return out;
  }
  return [];
}

export function earlierBlock(targetId, flow, answers, now = new Date()) {
  const ids = (flow?.steps || []).map((s) => s.id).filter((id) => id !== "finish");
  const idx = ids.indexOf(targetId);
  if (idx <= 0) return null;
  for (let i = 0; i < idx; i++) {
    const problems = stepProblems(ids[i], flow, answers, now);
    if (problems.length) return { stepId: ids[i], problems };
  }
  const med = ids.indexOf("medical");
  if (med >= 0 && idx > med && answers?.__ui?.medicalSeen !== true) {
    return { stepId: "medical", problems: stepProblems("medical", flow, answers, now) };
  }
  return null;
}

export function missingItems(flow, answers, lang = "en", now = new Date()) {
  const items = [];
  for (const step of flow?.steps || []) {
    if (step.id === "finish") continue;
    for (const p of stepProblems(step.id, flow, answers, now)) {
      items.push({ ...p, stepId: step.id, stepLabel: stepLabel(step.id, lang) });
    }
  }
  return items;
}

export function resumeTarget(flow, answers, now = new Date()) {
  const ui = answers?.__ui || {};
  const ids = (flow?.steps || []).map((s) => s.id).filter((id) => id !== "finish");
  let stepId = ids.includes(ui.step) ? ui.step : "";
  if (!stepId) {
    stepId = ids[0] || "about";
    for (const id of ids) {
      if (stepProblems(id, flow, answers, now).length) { stepId = id; break; }
      stepId = id;
    }
  }
  if (stepId === "finish") stepId = "review";
  const block = earlierBlock(stepId, flow, answers, now);
  if (block) return { stepId: block.stepId, docIndex: 0 };
  const docs = flow.docs || [];
  let docIndex = Number(ui.docIndex) || 0;
  if (!Number.isFinite(docIndex) || docIndex < 0 || docIndex >= Math.max(docs.length, 1)) docIndex = 0;
  return { stepId, docIndex };
}

/** First document that still needs text, agreement, or a signature. */
export function firstOpenDocument(flow, answers, now = new Date()) {
  const problems = stepProblems("documents", flow, answers, now);
  const docs = flow?.docs || [];
  for (let i = 0; i < docs.length; i++) {
    const key = docs[i].key;
    if (problems.some((p) => p.id === "doc_" + key || p.id === "agree_" + key || p.id === "sign_" + key)) return i;
  }
  return 0;
}

export function hashFor(stepId, docIndex = 0) {
  if (stepId === "documents") return "#documents:" + (Number(docIndex) || 0);
  return "#" + stepId;
}

export function parseHash(hash, flow) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return null;
  const [id, doc] = raw.split(":");
  if (!(flow?.steps || []).some((s) => s.id === id)) return null;
  return { stepId: id, docIndex: Number(doc) || 0 };
}

export function documentCanAgree({ overflow, sentinelVisible }) {
  if (!overflow) return true;
  return !!sentinelVisible;
}

export function recordSignature(map, key, dataUrl) {
  const next = { ...(map || {}) };
  const url = String(dataUrl || "");
  if (!url.startsWith("data:image/png;base64,") || url.length < 80) {
    return { ok: false, map: next, error: "Signature was not saved" };
  }
  next[key] = url;
  return { ok: true, map: next };
}

/** Ack-only checkboxes are accepted with the document. Guardian pad counts as the guardian signature. Does not touch medical answers. */
export function satisfyHiddenGates(templates, answers) {
  const next = { ...(answers || {}) };
  next.__consent_accepted = true;
  const sig = next.__signatures || {};
  if (String(sig.guardian || "").startsWith("data:image/png;base64,")) {
    next.__guardian_signed = true;
    if (!next.guardian_signature) next.guardian_signature = "signed";
  }
  const agreements = next.__agreements || {};
  for (const t of templates || []) {
    if (!agreements[t.key] || agreements[t.key].accepted !== true) continue;
    const schema = t.schema || {};
    if (t.key === "privacy") next.guardian_privacy_consent = true;
    for (const sec of schema.sections || []) {
      if (!isAckSection(sec)) continue;
      for (const f of sec.fields || []) {
        if (f.type === "checkbox") next[f.key] = true;
      }
    }
  }
  return next;
}

export function submitFailureView(body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  return {
    retry: true,
    message: body?.error || body?.detail || "Could not save",
    items: errors.map((e) => ({ id: e.key || "", label: e.message || e.key || "Item" })),
  };
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function channel(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(fg, bg) {
  const [r1, g1, b1] = hexToRgb(fg);
  const [r2, g2, b2] = hexToRgb(bg);
  const L1 = 0.2126 * channel(r1) + 0.7152 * channel(g1) + 0.0722 * channel(b1);
  const L2 = 0.2126 * channel(r2) + 0.7152 * channel(g2) + 0.0722 * channel(b2);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

export function themeContrastIssues(theme) {
  const pairs = [
    ["text", "surface", 4.5],
    ["muted", "surface", 4.5],
    ["primaryText", "primary", 4.5],
    ["danger", "surface", 4.5],
    ["paperText", "paper", 4.5],
    ["filled", "paper", 4.5],
    ["onPhoto", "photo", 4.5],
    ["disabledText", "disabled", 4.5],
    ["text", "bg", 4.5],
  ];
  const issues = [];
  for (const [fg, bg, min] of pairs) {
    const ratio = contrastRatio(theme[fg], theme[bg]);
    if (!(ratio >= min)) issues.push({ fg, bg, ratio, min, fgHex: theme[fg], bgHex: theme[bg] });
    if (String(theme[fg]).toLowerCase() === String(theme[bg]).toLowerCase()) issues.push({ fg, bg, ratio: 1, min, same: true });
  }
  return issues;
}
