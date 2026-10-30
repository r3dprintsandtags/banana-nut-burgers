import { ageFromDob } from "./shared.js";

/**
 * Diver Medical (SSI participant questionnaire) — staff review flags.
 * needsStaffReview / needs_physician =
 *   YES on Q3, Q5, or Q10,
 *   OR any Box A–G item checked,
 *   OR dental YES.
 * Question 2 is over_45 ("I am over 45"); synced to dm_q2 for PDF mapping.
 * Boxes A–G use the SSI item text. Any checked item flags review.
 * Diver is NEVER blocked from submitting — CRM gets PENDING_STAFF_REVIEW.
 */
export function diverMedicalNeedsPhysician(answers = {}) {
  const yes = (k) => String(answers[k] || "").toLowerCase() === "yes";
  const checked = (k) => {
    const v = answers[k];
    return v === true || v === "yes" || v === 1 || v === "1";
  };
  if (yes("dm_q3") || yes("dm_q5") || yes("dm_q10")) return true;
  if (yes("dm_dental") || checked("dm_dental")) return true;
  // Legacy whole-box yes/no
  for (const box of ["A", "B", "C", "D", "E", "F", "G"]) {
    if (yes(`dm_box_${box}`)) return true;
  }
  // Streamlined per-item checkboxes dm_box_A_1 …
  for (const [k, v] of Object.entries(answers)) {
    if (!/^dm_box_/.test(k)) continue;
    if (v === true || v === "yes" || v === 1 || v === "1") return true;
  }
  return false;
}

/** Fit to Dive: needs staff review if any YES on fit_* yes_no fields. */
export function fitToDiveNeedsPhysician(answers = {}) {
  return Object.keys(answers).some((k) => k.startsWith("fit_") && String(answers[k]).toLowerCase() === "yes");
}

export function computeNeedsPhysician(packetKey, answers) {
  if (packetKey === "try_scuba" || answers.__templates?.includes("fit_to_dive")) {
    if (fitToDiveNeedsPhysician(answers)) return true;
  }
  if (packetKey === "recreational" || answers.__templates?.includes("diver_medical")) {
    if (diverMedicalNeedsPhysician(answers)) return true;
  }
  if (diverMedicalNeedsPhysician(answers) || fitToDiveNeedsPhysician(answers)) return true;
  return false;
}

export function over45Prefill(answers) {
  const next = { ...answers };
  // Never auto-answer medical Yes/No. The customer must choose each option.
  // Keep legacy dm_q2 in sync only after they answer over_45.
  if (next.over_45 === "yes" || next.over_45 === "no") next.dm_q2 = next.over_45;
  return { answers: next, requiresOver45Confirm: false };
}

export function physicianNotice(lang = "en") {
  return lang === "es"
    ? "Según tus respuestas, Banana Nut Burger Dive Shop revisará tu formulario médico antes de bucear (Pendiente de revisión del personal). Ya puedes enviar — no estás bloqueado. Adjuntamos la Guía Médica de Buceo como referencia."
    : "Based on your answers, Banana Nut Burger Dive Shop staff will review your medical form before you dive (Pending Staff Review). You can still submit — you are not blocked. Diving Medical Guidance is attached as a reference.";
}

export function staffReviewStatus(needsReview) {
  return needsReview ? "PENDING_STAFF_REVIEW" : "CLEARED";
}
