/** Auto-draft pdf_mapping_json from AcroForm field names → shared keys. */

const RULES = [
  { re: /first.?name|nombre|participant.?first|student.?first/i, source: "first_name" },
  { re: /last.?name|apellido|surname|participant.?last|student.?last/i, source: "last_name" },
  { re: /full.?name|print.?name|nombre.?completo|participant.?name|student.?name|print.?participant/i, source: "full_name_print" },
  { re: /birth|dob|fecha.?nac|date.?of.?birth/i, source: "dob", dateFormat: "dd/mm/yyyy" },
  { re: /email|correo|e-?mail/i, source: "email" },
  { re: /cell|mobile|phone|tel[eé]fono|whatsapp/i, source: "cell_phone" },
  { re: /address|direcci[oó]n/i, source: "address" },
  { re: /emergency.?name|contacto.?emergencia.?nombre|emg.?name/i, source: "emergency_contact_name" },
  { re: /emergency.?rel|relationship|parentesco/i, source: "emergency_contact_relationship" },
  { re: /emergency.?email/i, source: "emergency_contact_email" },
  { re: /emergency.?phone|emergency.?tel|emg.?phone/i, source: "emergency_contact_phone" },
  { re: /training.?center.?name|facility.?name|centro/i, source: "training_center_name" },
  { re: /training.?center.?address|facility.?address/i, source: "training_center_address" },
  { re: /registration.?number|reg.?no|n[uú]mero.?registro/i, source: "registration_number" },
  { re: /signature.?date|date.?signed|fecha.?firma|^date$/i, source: "signature_date", dateFormat: "dd/mm/yy" },
  { re: /signature|firma|sign.?here/i, source: "signature_image", kind: "signature" },
];

export function autoMapFields(fieldNames = []) {
  const fields = {};
  const signatures = [];
  const unmatched = [];
  for (const name of fieldNames) {
    let hit = null;
    for (const rule of RULES) {
      if (rule.re.test(name)) { hit = rule; break; }
    }
    if (!hit) { unmatched.push(name); continue; }
    if (hit.kind === "signature") {
      signatures.push({ field: name, page: 0, x: 72, y: 72, w: 140, h: 40, note: "adjust with mapper" });
    } else {
      fields[name] = { source: hit.source, ...(hit.dateFormat ? { dateFormat: hit.dateFormat } : {}) };
    }
  }
  return {
    mode: fieldNames.length ? "acroform" : "overlay",
    fields,
    signatures,
    unmatched,
    placements: [], // filled by click-to-place mapper for flat PDFs
  };
}

/** Heuristic default overlay placements (letter page 612×792) when PDF is flat. */
export function defaultOverlayPlacements() {
  return [
    { page: 0, x: 80, y: 720, source: "first_name", size: 10 },
    { page: 0, x: 280, y: 720, source: "last_name", size: 10 },
    { page: 0, x: 80, y: 700, source: "dob", size: 10, dateFormat: "dd/mm/yyyy" },
    { page: 0, x: 80, y: 680, source: "email", size: 9 },
    { page: 0, x: 80, y: 660, source: "cell_phone", size: 9 },
    { page: 0, x: 80, y: 100, source: "full_name_print", size: 10 },
    { page: 0, x: 80, y: 70, type: "signature", source: "signature_image", w: 140, h: 40 },
    { page: 0, x: 280, y: 70, source: "signature_date", size: 9, dateFormat: "dd/mm/yy" },
  ];
}
