/** Party / group registration helpers. Reuses ageFromDob, regnum, form_requests. */
import { ageFromDob } from "./shared.js";
import { ensureRegistrationNumber } from "./regnum.js";
import { createRequestForRegistration, packetKeyForActivity, fromRegistrationData } from "./submit.js";
import { sha256 } from "../../_shared.js";

export function computeIsMinor(dob, asOf = new Date()) {
  const age = ageFromDob(dob, asOf);
  if (age == null) return 0;
  return age < 18 ? 1 : 0;
}

export function participantPublic(row, { includeMedical = false, submission = null } = {}) {
  if (!row) return null;
  const age = ageFromDob(row.dob);
  const out = {
    id: row.id,
    registrationId: row.registration_id,
    contactId: row.contact_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dob: row.dob,
    age,
    isMinor: !!row.is_minor,
    relationship: row.relationship,
    mode: row.mode,
    role: row.role,
    guardianParticipantId: row.guardian_participant_id || null,
    email: row.email || "",
    phone: row.phone || "",
    status: row.status,
    registrationNumber: row.registration_number || "",
    youthAddendumStatus: row.youth_addendum_status,
    sameAddress: !!row.same_address,
    sameEmergency: !!row.same_emergency,
    sortOrder: row.sort_order,
    packetNeedsPhysician: false,
    packetCompleted: row.status === "complete",
  };
  try { out.guardian = JSON.parse(row.guardian_json || "{}"); } catch { out.guardian = {}; }
  try { out.address = JSON.parse(row.address_json || "{}"); } catch { out.address = {}; }
  try { out.emergency = JSON.parse(row.emergency_json || "{}"); } catch { out.emergency = {}; }
  if (submission) {
    out.packetNeedsPhysician = !!submission.needs_physician;
    if (includeMedical) {
      out.needsPhysician = !!submission.needs_physician;
      out.signedPdfKeys = (() => { try { return JSON.parse(submission.signed_pdf_r2_keys || "[]"); } catch { return []; } })();
      out.registrationNumber = submission.registration_number || out.registrationNumber;
    } else if (submission.needs_physician) {
      out.statusLabel = "needs_medical_review";
    }
  }
  return out;
}

/** Draft auth helper shared by register APIs */
export async function loadRegByRefToken(env, ref, token) {
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=?").bind(String(ref || "").toUpperCase()).first();
  if (!reg) return { error: "Not found", status: 404 };
  if (reg.status === "draft") {
    if (!reg.draft_token_hash || (await sha256(token)) !== reg.draft_token_hash) {
      return { error: "Unauthorized", status: 401 };
    }
  } else if (token) {
    // submitted regs: allow resume token OR accept if token matches stored draft hash when present
    if (reg.draft_token_hash && (await sha256(token)) !== reg.draft_token_hash) {
      return { error: "Unauthorized", status: 401 };
    }
  }
  return { reg };
}

export async function listParticipants(env, registrationId) {
  return (await env.DB.prepare(
    "SELECT * FROM participants WHERE registration_id=? AND status<>'removed' ORDER BY sort_order, id"
  ).bind(registrationId).all()).results || [];
}

export async function ensurePrimaryParticipant(env, reg, customer, data = {}) {
  const existing = await env.DB.prepare(
    "SELECT * FROM participants WHERE registration_id=? AND role='primary' AND status<>'removed' LIMIT 1"
  ).bind(reg.id).first();
  if (existing) return existing;

  const first = String(data.firstName || data.first_name || customer.first_name || "").trim();
  const last = String(data.lastName || data.last_name || customer.last_name || "").trim();
  const dob = String(data.dob || "").trim();
  const isMinor = computeIsMinor(dob);
  const now = Date.now();
  let regNum = "";
  try { regNum = await ensureRegistrationNumber(env, customer.id); } catch (_) {}

  const r = await env.DB.prepare(
    `INSERT INTO participants (
      registration_id, contact_id, first_name, last_name, dob, is_minor, relationship, mode, role,
      email, phone, status, registration_number, youth_addendum_status, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?, 'self', 'here', 'primary', ?, ?, 'not_started', ?, ?, 0, ?, ?)`
  ).bind(
    reg.id, customer.id, first, last, dob, isMinor,
    customer.email || data.email || "", customer.phone || data.phone || "",
    regNum, isMinor ? "waiting" : "n/a", now, now
  ).run();

  return env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(r.meta.last_row_id).first();
}

async function findOrCreateContact(env, { firstName, lastName, phone, email, dob }) {
  const now = Date.now();
  if (phone) {
    const byPhone = await env.DB.prepare("SELECT * FROM customers WHERE phone=? ORDER BY id DESC LIMIT 1").bind(phone).first();
    if (byPhone) {
      await env.DB.prepare(
        "UPDATE customers SET first_name=COALESCE(NULLIF(?,''),first_name), last_name=COALESCE(NULLIF(?,''),last_name), email=COALESCE(NULLIF(?,''),email), updated_at=? WHERE id=?"
      ).bind(firstName, lastName, email || "", now, byPhone.id).run();
      return byPhone.id;
    }
  }
  if (email) {
    const byEmail = await env.DB.prepare("SELECT * FROM customers WHERE lower(email)=lower(?) ORDER BY id DESC LIMIT 1").bind(email).first();
    if (byEmail) {
      await env.DB.prepare(
        "UPDATE customers SET first_name=COALESCE(NULLIF(?,''),first_name), last_name=COALESCE(NULLIF(?,''),last_name), phone=COALESCE(NULLIF(?,''),phone), updated_at=? WHERE id=?"
      ).bind(firstName, lastName, phone || "", now, byEmail.id).run();
      return byEmail.id;
    }
  }
  const ins = await env.DB.prepare(
    "INSERT INTO customers (first_name, last_name, phone, email, created_at, updated_at) VALUES (?,?,?,?,?,?)"
  ).bind(firstName, lastName, phone || "", email || "", now, now).run();
  return ins.meta.last_row_id;
}

export async function upsertParticipant(env, reg, payload, { primaryCustomer } = {}) {
  const id = payload.id ? Number(payload.id) : null;
  const first = String(payload.firstName || "").trim();
  const last = String(payload.lastName || "").trim();
  const dob = String(payload.dob || "").trim();
  if (!first || !last || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    throw Object.assign(new Error("firstName, lastName, and dob (YYYY-MM-DD) are required"), { status: 422 });
  }
  const isMinor = computeIsMinor(dob);
  const mode = isMinor ? "here" : (payload.mode === "own_phone" ? "own_phone" : "here");
  const relationship = String(payload.relationship || "guest").slice(0, 40);
  const email = String(payload.email || "").trim().slice(0, 120);
  const phone = String(payload.phone || "").replace(/[^\d+]/g, "").slice(0, 32);
  const now = Date.now();

  let guardianParticipantId = payload.guardianParticipantId ? Number(payload.guardianParticipantId) : null;
  let guardianJson = "{}";
  if (isMinor) {
    if (!guardianParticipantId) {
      const primary = await env.DB.prepare(
        "SELECT id FROM participants WHERE registration_id=? AND role='primary' AND status<>'removed' LIMIT 1"
      ).bind(reg.id).first();
      guardianParticipantId = primary?.id || null;
    }
    if (payload.guardian && typeof payload.guardian === "object") {
      guardianJson = JSON.stringify({
        name: String(payload.guardian.name || "").slice(0, 120),
        email: String(payload.guardian.email || "").slice(0, 120),
        phone: String(payload.guardian.phone || "").slice(0, 32),
      });
    }
  }

  // Soft duplicate warning (same name + DOB already on this party) — still allow if forceDuplicate
  if (!payload.forceDuplicate) {
    const dup = await env.DB.prepare(
      `SELECT id, first_name, last_name, dob FROM participants
       WHERE registration_id=? AND status<>'removed'
         AND lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND dob=?
         ${id ? "AND id<>?" : ""}
       LIMIT 1`
    ).bind(...(id ? [reg.id, first, last, dob, id] : [reg.id, first, last, dob])).first();
    if (dup) {
      throw Object.assign(
        new Error(`Someone named ${first} ${last} with that date of birth is already on this registration`),
        { status: 409, code: "DUPLICATE_PERSON", existingId: dup.id }
      );
    }
  }

  const contactId = await findOrCreateContact(env, { firstName: first, lastName: last, phone, email, dob });
  let regNum = "";
  try { regNum = await ensureRegistrationNumber(env, contactId); } catch (_) {}

  if (id) {
    const row = await env.DB.prepare("SELECT * FROM participants WHERE id=? AND registration_id=?").bind(id, reg.id).first();
    if (!row || row.status === "removed") throw Object.assign(new Error("Participant not found"), { status: 404 });
    if (row.role === "primary") {
      // primary: allow contact field updates but keep role/mode rules
      await env.DB.prepare(
        `UPDATE participants SET first_name=?, last_name=?, dob=?, is_minor=?, email=?, phone=?, contact_id=?,
         registration_number=COALESCE(NULLIF(registration_number,''),?), youth_addendum_status=?, updated_at=? WHERE id=?`
      ).bind(first, last, dob, isMinor, email, phone, contactId, regNum, isMinor ? (row.youth_addendum_status === "received" ? "received" : "waiting") : "n/a", now, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE participants SET first_name=?, last_name=?, dob=?, is_minor=?, relationship=?, mode=?,
         guardian_participant_id=?, guardian_json=?, email=?, phone=?, contact_id=?,
         registration_number=COALESCE(NULLIF(registration_number,''),?), youth_addendum_status=?,
         same_address=?, same_emergency=?, updated_at=? WHERE id=?`
      ).bind(
        first, last, dob, isMinor, relationship, mode,
        guardianParticipantId, guardianJson, email, phone, contactId, regNum,
        isMinor ? (row.youth_addendum_status === "received" ? "received" : "waiting") : "n/a",
        payload.sameAddress === false ? 0 : 1, payload.sameEmergency === false ? 0 : 1,
        now, id
      ).run();
    }
    return env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(id).first();
  }

  const maxSort = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order),0) AS m FROM participants WHERE registration_id=?"
  ).bind(reg.id).first();
  const sortOrder = (maxSort?.m || 0) + 1;

  const ins = await env.DB.prepare(
    `INSERT INTO participants (
      registration_id, contact_id, first_name, last_name, dob, is_minor, relationship, mode, role,
      guardian_participant_id, guardian_json, email, phone, status, registration_number, youth_addendum_status,
      same_address, same_emergency, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,'guest',?,?,?,?,'not_started',?,?,?,?,?,?,?)`
  ).bind(
    reg.id, contactId, first, last, dob, isMinor, relationship, mode,
    guardianParticipantId, guardianJson, email, phone, regNum, isMinor ? "waiting" : "n/a",
    payload.sameAddress === false ? 0 : 1, payload.sameEmergency === false ? 0 : 1,
    sortOrder, now, now
  ).run();

  // bump registration.participants count
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM participants WHERE registration_id=? AND status<>'removed'"
  ).bind(reg.id).first();
  await env.DB.prepare("UPDATE registrations SET participants=?, updated_at=? WHERE id=?")
    .bind(count?.c || 1, now, reg.id).run();

  return env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(ins.meta.last_row_id).first();
}

export async function removeParticipant(env, reg, participantId, reason = "") {
  const row = await env.DB.prepare("SELECT * FROM participants WHERE id=? AND registration_id=?")
    .bind(participantId, reg.id).first();
  if (!row) throw Object.assign(new Error("Not found"), { status: 404 });
  if (row.role === "primary") throw Object.assign(new Error("Cannot remove the primary registrant"), { status: 422 });
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE participants SET status='removed', remove_reason=?, updated_at=? WHERE id=?"
  ).bind(String(reason || "").slice(0, 200), now, participantId).run();
  // If this person was a guardian for minors, reassign to primary (or waiting_guardian)
  const primary = await env.DB.prepare(
    "SELECT id FROM participants WHERE registration_id=? AND role='primary' AND status<>'removed' LIMIT 1"
  ).bind(reg.id).first();
  const wards = (await env.DB.prepare(
    "SELECT id, status FROM participants WHERE registration_id=? AND guardian_participant_id=? AND status<>'removed'"
  ).bind(reg.id, participantId).all()).results || [];
  for (const w of wards) {
    if (primary?.id) {
      await env.DB.prepare(
        "UPDATE participants SET guardian_participant_id=?, updated_at=? WHERE id=?"
      ).bind(primary.id, now, w.id).run();
    } else {
      await env.DB.prepare(
        "UPDATE participants SET guardian_participant_id=NULL, status=CASE WHEN status IN ('complete','needs_medical_review') THEN status ELSE 'waiting_guardian' END, updated_at=? WHERE id=?"
      ).bind(now, w.id).run();
    }
  }
  // revoke open form requests
  await env.DB.prepare(
    "UPDATE form_requests SET status='revoked' WHERE participant_id=? AND status IN ('sent','opened')"
  ).bind(participantId).run();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM participants WHERE registration_id=? AND status<>'removed'"
  ).bind(reg.id).first();
  await env.DB.prepare("UPDATE registrations SET participants=?, updated_at=? WHERE id=?")
    .bind(count?.c || 1, now, reg.id).run();
  return true;
}

export async function openParticipantPacket(env, reg, participant, requestUrl) {
  const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(participant.contact_id).first();
  if (!customer) throw Object.assign(new Error("Contact missing"), { status: 500 });

  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }

  let sharedAddr = {};
  let sharedEmg = {};
  try { sharedAddr = JSON.parse(reg.shared_address_json || "{}"); } catch { sharedAddr = {}; }
  try { sharedEmg = JSON.parse(reg.shared_emergency_json || "{}"); } catch { sharedEmg = {}; }
  try { if (participant.same_address && Object.keys(sharedAddr).length) { /* use shared */ } else { sharedAddr = { ...sharedAddr, ...JSON.parse(participant.address_json || "{}") }; } } catch (_) {}
  try { if (participant.same_emergency && Object.keys(sharedEmg).length) { /* use shared */ } else { sharedEmg = { ...sharedEmg, ...JSON.parse(participant.emergency_json || "{}") }; } } catch (_) {}

  // defaults from primary registration data
  if (!sharedAddr.address && data.address) sharedAddr = { address: data.address, city: data.city, state: data.state, zip: data.zip };
  if (!sharedEmg.name && data.emergencyName) sharedEmg = { name: data.emergencyName, relationship: data.emergencyRelationship, phone: data.emergencyPhone };

  const regNum = participant.registration_number || (await ensureRegistrationNumber(env, customer.id));
  if (!participant.registration_number && regNum) {
    await env.DB.prepare("UPDATE participants SET registration_number=?, updated_at=? WHERE id=?")
      .bind(regNum, Date.now(), participant.id).run();
  }

  // Guardian prefill for minors (name only — never medical). Re-evaluate minor at open time.
  let guardianName = "";
  let guardianRel = "";
  if (participant.is_minor || computeIsMinor(participant.dob)) {
    if (participant.guardian_participant_id) {
      const g = await env.DB.prepare("SELECT * FROM participants WHERE id=? AND status<>'removed'")
        .bind(participant.guardian_participant_id).first();
      if (g) {
        guardianName = `${g.first_name || ""} ${g.last_name || ""}`.trim();
        guardianRel = "parent/guardian";
      }
    }
    if (!guardianName) {
      try {
        const gj = JSON.parse(participant.guardian_json || "{}");
        guardianName = String(gj.name || "").trim();
      } catch (_) {}
    }
    if (!guardianName) {
      guardianName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
    }
  }

  const prefill = fromRegistrationData({
    firstName: participant.first_name,
    lastName: participant.last_name,
    dob: participant.dob,
    phone: participant.phone || customer.phone,
    email: participant.email || customer.email,
    address: sharedAddr.address || data.address,
    city: sharedAddr.city || data.city,
    state: sharedAddr.state || data.state,
    zip: sharedAddr.zip || data.zip,
    emergencyName: sharedEmg.name || data.emergencyName,
    emergencyRelationship: sharedEmg.relationship || data.emergencyRelationship,
    emergencyPhone: sharedEmg.phone || data.emergencyPhone,
    registration_number: regNum,
    guardian_name: guardianName,
    guardian_relationship: guardianRel,
  });

  const packetKey = packetKeyForActivity(reg.activity || data.activity);
  const existing = await env.DB.prepare(
    "SELECT * FROM form_requests WHERE participant_id=? ORDER BY id DESC LIMIT 1"
  ).bind(participant.id).first();

  const base = (env.FORMS_BASE_URL || new URL(requestUrl).origin).replace(/\/$/, "");

  if (existing && existing.status === "completed") {
    return {
      ok: true, alreadyCompleted: true, packetKey, registrationNumber: regNum,
      formLink: null, requestId: existing.id, status: "completed", prefill,
    };
  }

  if (existing && existing.status !== "completed" && existing.status !== "revoked") {
    // refresh token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256(token);
    await env.DB.prepare(
      "UPDATE form_requests SET token_hash=?, prefill_json=?, status='sent', expires_at=? WHERE id=?"
    ).bind(tokenHash, JSON.stringify(prefill), Date.now() + 7 * 86400000, existing.id).run();
    await env.DB.prepare("UPDATE participants SET status='in_progress', updated_at=? WHERE id=?")
      .bind(Date.now(), participant.id).run();
    return {
      ok: true, packetKey, registrationNumber: regNum,
      formLink: `${base}/f/${token}`, requestId: existing.id, status: "sent", token, prefill,
    };
  }

  const created = await createRequestForRegistration(env, {
    customerId: customer.id,
    registrationId: reg.id,
    participantId: participant.id,
    packetKey,
    prefill,
  });
  await env.DB.prepare("UPDATE participants SET status='in_progress', updated_at=? WHERE id=?")
    .bind(Date.now(), participant.id).run();

  return {
    ok: true, packetKey, registrationNumber: regNum,
    formLink: `${base}/f/${created.token}`, requestId: created.requestId, status: "sent",
    token: created.token, prefill,
  };
}

/** After a form_request completes, sync participant status (youth addendum gate, medical flag). */
export async function syncParticipantAfterSubmit(env, participantId, { needsPhysician = false } = {}) {
  if (!participantId) return;
  const p = await env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(participantId).first();
  if (!p) return;
  const now = Date.now();
  let status = "complete";
  if (needsPhysician) status = "needs_medical_review";
  if (p.is_minor && p.youth_addendum_status === "waiting") status = "waiting_youth_addendum";
  // Recreational waiver validity: one year from signing
  const validUntil = now + 365 * 86400000;
  await env.DB.prepare("UPDATE participants SET status=?, valid_until=?, updated_at=? WHERE id=?")
    .bind(status, validUntil, now, participantId).run();

  // party complete?
  const open = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM participants WHERE registration_id=? AND status<>'removed' AND status<>'complete' AND status<>'needs_medical_review'"
  ).bind(p.registration_id).first();
  // needs_medical_review still counts as forms done for party progress; youth waiting blocks
  const blocked = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM participants WHERE registration_id=? AND status IN ('not_started','in_progress','waiting_youth_addendum','waiting_guardian')"
  ).bind(p.registration_id).first();
  await env.DB.prepare("UPDATE registrations SET party_complete=?, updated_at=? WHERE id=?")
    .bind(blocked?.c ? 0 : 1, now, p.registration_id).run();
}

/**
 * Past party members / CRM contacts for "Add someone you've registered before".
 * Returns names, DOB, contact, emergency only — never medical answers.
 */
export async function suggestPastPeople(env, reg, { phone = "", email = "" } = {}) {
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  const emailNorm = String(email || "").trim().toLowerCase();
  const seen = new Set();
  const out = [];

  const pushRow = (row) => {
    const key = `${String(row.first_name || "").toLowerCase()}|${String(row.last_name || "").toLowerCase()}|${row.dob || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    let emergency = {};
    let address = {};
    try { emergency = JSON.parse(row.emergency_json || "{}"); } catch { emergency = {}; }
    try { address = JSON.parse(row.address_json || "{}"); } catch { address = {}; }
    // Also try registration data emergency if participant emergency empty
    out.push({
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      dob: row.dob || "",
      email: row.email || "",
      phone: row.phone || "",
      relationship: row.relationship || "other",
      emergency: {
        name: emergency.name || emergency.emergencyName || "",
        relationship: emergency.relationship || emergency.emergencyRelationship || "",
        phone: emergency.phone || emergency.emergencyPhone || "",
      },
      address: {
        address: address.address || "",
        city: address.city || "",
        state: address.state || "",
        zip: address.zip || "",
      },
    });
  };

  // From prior participants on registrations owned by matching primary customer
  if (phoneDigits || emailNorm) {
    const { results } = await env.DB.prepare(
      `SELECT p.first_name, p.last_name, p.dob, p.email, p.phone, p.relationship, p.emergency_json, p.address_json
       FROM participants p
       JOIN registrations r ON r.id = p.registration_id
       JOIN customers c ON c.id = r.customer_id
       WHERE p.status<>'removed' AND p.dob <> ''
         AND (
           (? <> '' AND replace(replace(replace(c.phone,'+',''),'-',''),' ','') LIKE '%' || ?)
           OR (? <> '' AND lower(c.email)=?)
         )
       ORDER BY p.id DESC LIMIT 40`
    ).bind(phoneDigits, phoneDigits.slice(-8), emailNorm, emailNorm).all();
    for (const row of results || []) pushRow(row);
  }

  // Also people who were participants with matching contact phone/email
  if (phoneDigits || emailNorm) {
    const { results } = await env.DB.prepare(
      `SELECT p.first_name, p.last_name, p.dob, p.email, p.phone, p.relationship, p.emergency_json, p.address_json
       FROM participants p
       LEFT JOIN customers c ON c.id = p.contact_id
       WHERE p.status<>'removed' AND p.dob <> ''
         AND (
           (? <> '' AND (p.phone LIKE '%' || ? OR c.phone LIKE '%' || ?))
           OR (? <> '' AND (lower(p.email)=? OR lower(c.email)=?))
         )
       ORDER BY p.id DESC LIMIT 40`
    ).bind(phoneDigits, phoneDigits.slice(-8), phoneDigits.slice(-8), emailNorm, emailNorm, emailNorm).all();
    for (const row of results || []) pushRow(row);
  }

  // Exclude people already on this registration
  const onParty = await listParticipants(env, reg.id);
  const onKeys = new Set(onParty.map((p) => `${p.first_name.toLowerCase()}|${p.last_name.toLowerCase()}|${p.dob}`));
  return out.filter((p) => !onKeys.has(`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}|${p.dob}`)).slice(0, 12);
}

export async function partyDashboard(env, reg, { staff = false } = {}) {
  const rows = await listParticipants(env, reg.id);
  const people = [];
  for (const row of rows) {
    const sub = await env.DB.prepare(
      `SELECT s.needs_physician, s.signed_pdf_r2_keys, s.registration_number, s.id AS submission_id
       FROM form_requests r
       LEFT JOIN form_submissions s ON s.request_id = r.id
       WHERE r.participant_id=?
       ORDER BY r.id DESC, s.id DESC LIMIT 1`
    ).bind(row.id).first();
    people.push(participantPublic(row, { includeMedical: staff, submission: sub }));
  }
  const total = people.length;
  const done = people.filter((p) => p.status === "complete" || p.status === "needs_medical_review").length;
  let sharedAddress = {};
  let sharedEmergency = {};
  try { sharedAddress = JSON.parse(reg.shared_address_json || "{}"); } catch { sharedAddress = {}; }
  try { sharedEmergency = JSON.parse(reg.shared_emergency_json || "{}"); } catch { sharedEmergency = {}; }
  return {
    registrationId: reg.id,
    ref: reg.ref,
    activity: reg.activity,
    plannedDate: reg.planned_date,
    headcount: reg.participants,
    partyComplete: !!reg.party_complete,
    sharedAddress,
    sharedEmergency,
    progress: { done, total, label: `${done} of ${total} complete` },
    participants: people,
  };
}
