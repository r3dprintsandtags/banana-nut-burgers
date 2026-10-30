import { ageFromDob } from "./shared.js";

function labelOf(field, lang) {
  if (!field) return "";
  if (typeof field.label === "string") return field.label;
  return (field.label && (field.label[lang] || field.label.en)) || field.key || "";
}

export function evaluateShowIf(cond, answers, lang = "en") {
  if (!cond) return true;
  if (Array.isArray(cond.all)) return cond.all.every((c) => evaluateShowIf(c, answers, lang));
  if (Array.isArray(cond.any)) return cond.any.some((c) => evaluateShowIf(c, answers, lang));
  if (cond.field === "__age" || cond.op === "age_lt" || cond.op === "age_gte") {
    const age = ageFromDob(answers.dob);
    if (age == null) return false;
    if (cond.op === "age_lt" || cond.field === "__age") return age < (cond.value ?? 18);
    if (cond.op === "age_gte") return age >= (cond.value ?? 45);
  }
  const v = answers[cond.field];
  switch (cond.op || "eq") {
    case "eq": return v === cond.value;
    case "neq": return v !== cond.value;
    case "truthy": return !!v;
    case "falsy": return !v;
    case "in": return Array.isArray(cond.value) && cond.value.includes(v);
    default: return true;
  }
}

export function visibleFields(schema, answers, lang = "en") {
  const fields = [];
  for (const section of schema.sections || []) {
    if (!evaluateShowIf(section.show_if, answers, lang)) continue;
    for (const field of section.fields || []) {
      if (!evaluateShowIf(field.show_if, answers, lang)) continue;
      fields.push({ ...field, _section: section.id || section.title });
    }
  }
  return fields;
}

export function validateAnswers(schema, answers, lang = "en") {
  const errors = [];
  const fields = visibleFields(schema, answers, lang);
  for (const f of fields) {
    if (f.type === "note") continue;
    const v = answers[f.key];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)
      || (f.type === "checkbox" && v !== true && v !== "yes" && v !== 1);
    if (f.required && empty) errors.push({ key: f.key, message: `${labelOf(f, lang)} is required` });
    if (empty) continue;
    if (f.type === "email" && !/.+@.+\..+/.test(String(v))) errors.push({ key: f.key, message: "Invalid email" });
    if (f.type === "phone" && String(v).replace(/\D/g, "").length < 8) errors.push({ key: f.key, message: "Invalid phone" });
    if ((f.type === "dob" || f.key === "dob") && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
      const today = new Date().toISOString().slice(0, 10);
      if (String(v) > today) errors.push({ key: f.key, message: lang === "es" ? "La fecha de nacimiento no puede ser futura" : "Date of birth cannot be in the future" });
    }
    if (f.validation?.regex) {
      try {
        if (!new RegExp(f.validation.regex).test(String(v))) errors.push({ key: f.key, message: "Invalid format" });
      } catch (_) { /* ignore bad regex in schema */ }
    }
    if (f.validation?.min != null && Number(v) < f.validation.min) errors.push({ key: f.key, message: "Too small" });
    if (f.validation?.max != null && Number(v) > f.validation.max) errors.push({ key: f.key, message: "Too large" });
  }
  if (schema.consent?.required && answers.__consent_accepted !== true) {
    errors.push({ key: "__consent", message: "Consent must be accepted" });
  }
  const age = ageFromDob(answers.dob);
  if (age != null && age < 18) {
    const guardianPng = answers.__signatures && String(answers.__signatures.guardian || "").startsWith("data:image/png");
    if (!answers.guardian_name) errors.push({ key: "guardian_name", message: "Guardian name required for minors" });
    if (!answers.guardian_signature && !answers.__guardian_signed && !guardianPng) {
      errors.push({ key: "guardian_signature", message: "Guardian signature required for minors" });
    }
  }
  if (age != null && age < 16 && schema.key === "privacy" && answers.guardian_privacy_consent !== true) {
    errors.push({ key: "guardian_privacy_consent", message: "Guardian privacy consent required under 16" });
  }
  return errors;
}

export function fieldMetaMap(schemas) {
  const map = {};
  for (const schema of schemas) {
    for (const section of schema.sections || []) {
      for (const field of section.fields || []) {
        map[field.key] = field;
      }
    }
  }
  return map;
}
