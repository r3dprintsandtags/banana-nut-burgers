/** Shared field keys — asked once, fill everywhere. Never prefills sensitive medical answers. */

export const SHARED_KEYS = [
  "first_name", "last_name", "full_name_print", "dob", "address", "city", "state", "zip", "email", "cell_phone",
  "emergency_contact_name", "emergency_contact_relationship", "emergency_contact_email", "emergency_contact_phone",
  "training_center_name", "training_center_address", "registration_number", "signature_date", "signature_image",
];

export function composeAddress(answers = {}) {
  if (answers.address && String(answers.address).trim()) return String(answers.address).trim();
  return [answers.city, answers.state, answers.zip || answers.postal_code].filter((x) => x && String(x).trim()).join(", ");
}

export const NEVER_PREFILL = new Set([
  // medical yes/no and physician — sensitive:true also blocks
  "physician_name", "physician_phone", "instructor_name", "guardian_name", "guardian_signature",
]);

export function ageFromDob(dobIso, asOf = new Date()) {
  if (!dobIso || !/^\d{4}-\d{2}-\d{2}$/.test(dobIso)) return null;
  const [y, m, d] = dobIso.split("-").map(Number);
  let age = asOf.getFullYear() - y;
  const md = (asOf.getMonth() + 1) * 100 + asOf.getDate();
  if (md < m * 100 + d) age--;
  return age;
}

export function computeFullName(answers) {
  const f = (answers.first_name || "").trim();
  const l = (answers.last_name || "").trim();
  return [f, l].filter(Boolean).join(" ");
}

/**
 * Resolution: request answers → CRM customer → shop profile → computed.
 * Sensitive fields and NEVER_PREFILL are never taken from CRM/prior.
 */
export function resolveShared({ answers = {}, customer = {}, shop = {}, fieldMeta = {} } = {}) {
  const out = { ...answers };
  const fromCustomer = {
    first_name: customer.first_name || customer.firstName,
    last_name: customer.last_name || customer.lastName,
    email: customer.email,
    cell_phone: customer.phone || customer.cell_phone,
    registration_number: customer.registration_number,
    emergency_contact_name: customer.emergency_contact_name,
    emergency_contact_phone: customer.emergency_contact_phone,
    emergency_contact_relationship: customer.emergency_contact_relationship,
    dob: customer.dob,
    address: customer.address,
  };
  // instructor_name is shop-chosen per booking — never from CRM prior medical answers;
  // only prefill from shop profile when staff set it (still never auto from customer).
  if (!out.instructor_name && shop.instructor_name) out.instructor_name = shop.instructor_name;
  if (!out.facility_name && (shop.facility_name || shop.training_center_name)) {
    out.facility_name = shop.facility_name || shop.training_center_name;
  }
  for (const key of SHARED_KEYS) {
    const meta = fieldMeta[key] || {};
    if (meta.sensitive || NEVER_PREFILL.has(key)) continue;
    if (out[key] !== undefined && out[key] !== null && out[key] !== "") continue;
    if (fromCustomer[key]) out[key] = fromCustomer[key];
    else if (shop[key]) out[key] = shop[key];
  }
  if (!out.full_name_print) out.full_name_print = computeFullName(out);
  if (!out.address) out.address = composeAddress(out);
  if (!out.training_center_name && shop.training_center_name) out.training_center_name = shop.training_center_name;
  if (!out.training_center_address && shop.training_center_address) out.training_center_address = shop.training_center_address;
  if (!out.registration_number && customer.registration_number) out.registration_number = customer.registration_number;
  return out;
}

/** Map Banana Nut registration collect() fields → shared keys for prefill. */
export function fromRegistrationData(data = {}) {
  const first = data.firstName || data.first_name || "";
  const last = data.lastName || data.last_name || "";
  const city = data.city || "";
  const state = data.state || "";
  const zip = data.zip || data.postal_code || "";
  const address = data.address || [city, state, zip].filter(Boolean).join(", ");
  return {
    first_name: first,
    last_name: last,
    full_name_print: [first, last].filter(Boolean).join(" "),
    email: data.email || "",
    cell_phone: data.phone || data.cell_phone || "",
    dob: data.dob || "",
    address,
    city,
    state,
    zip,
    emergency_contact_name: data.emergencyName || data.emergency_contact_name || "",
    emergency_contact_relationship: data.emergencyRelationship || data.emergency_contact_relationship || "",
    emergency_contact_phone: data.emergencyPhone || data.emergency_contact_phone || "",
    registration_number: data.registration_number || data.registrationNumber || "",
  };
}

export function contactUpdatesFromAnswers(answers = {}) {
  // Save non-sensitive edits back to CRM contact — never medical answers.
  return {
    first_name: answers.first_name,
    last_name: answers.last_name,
    email: answers.email,
    phone: answers.cell_phone,
    dob: answers.dob,
    address: answers.address,
    emergency_contact_name: answers.emergency_contact_name,
    emergency_contact_relationship: answers.emergency_contact_relationship,
    emergency_contact_phone: answers.emergency_contact_phone,
  };
}
