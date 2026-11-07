/** Party / group registration helpers. Reuses ageFromDob, regnum, form_requests. */
import { ageFromDob, packetPrefill } from "./shared.js";
import { ensureRegistrationNumber } from "./regnum.js";
import { createRequestForRegistration, packetKeyForActivity } from "./submit.js";
import { getRegistrationStatus } from "./reg-status.js";
import { sha256 } from "../../_shared.js";

export function gearFromAddress(address = {}) {
  const ownGear = address.ownGear === "yes" || address.ownGear === "no" ? address.ownGear : "";
  return {
    ownGear,
    gearSize: ownGear === "no" ? String(address.gearSize || "") : "",
    gearNote: ownGear === "no" ? String(address.gearNote || "") : "",
  };
}

export function addressWithoutGear(address = {}) {
  const next = { ...(address || {}) };
  delete next.ownGear;
  delete next.gearSize;
  delete next.gearNote;
  return next;
}

/** Merge equipment into the participant address blob. Throws 422 when a rental has no size. */
export function applyGear(address = {}, payload = {}) {
  if (payload.ownGear !== "yes" && payload.ownGear !== "no") return { ...address };
  const next = { ...address, ownGear: payload.ownGear };
  if (payload.ownGear === "yes") {
    next.gearSize = "";
    next.gearNote = "";
    return next;
  }
  const size = String(payload.gearSize || "").trim().slice(0, 12);
  if (!size) {
    throw Object.assign(new Error("Choose a size when this person needs shop equipment"), { status: 422 });
  }
  next.gearSize = size;
  next.gearNote = String(payload.gearNote || "").trim().slice(0, 200);
  return next;
}

function addressJsonWithGear(prevJson, payload) {
  let address = {};
  try { address = JSON.parse(prevJson || "{}"); } catch { address = {}; }
  return JSON.stringify(applyGear(address, payload));
}

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
  const gear = gearFromAddress(out.address);
  out.ownGear = gear.ownGear;
  out.gearSize = gear.gearSize;
  out.gearNote = gear.gearNote;
  out.address = addressWithoutGear(out.address);
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
  if (existing) {
    const first = String(data.firstName || data.first_name || existing.first_name || "").trim() || existing.first_name;
    const last = String(data.lastName || data.last_name || existing.last_name || "").trim() || existing.last_name;
    const incomingDob = String(data.dob || "").trim();
    if (incomingDob && computeIsMinor(incomingDob)) {
      throw Object.assign(
        new Error("A parent or guardian needs to register first. Please ask them to open this link."),
        { status: 422, code: "GUARDIAN_REQUIRED" }
      );
    }
    const dob = incomingDob || existing.dob || "";
    const phone = String(data.phone || cust.phone || existing.phone || "").trim();
    const email = String(data.email || cust.email || existing.email || "").trim();
    if (
      first === existing.first_name && last === existing.last_name
      && dob === (existing.dob || "") && phone === (existing.phone || "") && email === (existing.email || "")
    ) return existing;
    const now = Date.now();
    await env.DB.prepare(
      "UPDATE participants SET first_name=?, last_name=?, dob=?, email=?, phone=?, updated_at=? WHERE id=?"
    ).bind(first, last, dob, email, phone, now, existing.id).run();
    return env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(existing.id).first();
  }

  const cust = customer || {};
  const first = String(data.firstName || data.first_name || cust.first_name || "").trim();
  const last = String(data.lastName || data.last_name || cust.last_name || "").trim();
  const dob = String(data.dob || "").trim();
  if (dob && computeIsMinor(dob)) {
    throw Object.assign(
      new Error("A parent or guardian needs to register first. Please ask them to open this link."),
      { status: 422, code: "GUARDIAN_REQUIRED" }
    );
  }
  const isMinor = 0;
  const now = Date.now();
  const contactId = cust.id || reg.customer_id || null;
  let regNum = "";
  if (contactId) {
    try { regNum = await ensureRegistrationNumber(env, contactId); } catch (_) {}
  }

  const r = await env.DB.prepare(
    `INSERT INTO participants (
      registration_id, contact_id, first_name, last_name, dob, is_minor, relationship, mode, role,
      email, phone, status, registration_number, youth_addendum_status, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?, 'self', 'here', 'primary', ?, ?, 'not_started', ?, ?, 0, ?, ?)`
  ).bind(
    reg.id, contactId, first || "Guest", last || "Diver", dob, isMinor,
    cust.email || data.email || "", cust.phone || data.phone || "",
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
  // One adult per registration: guests must be minors. Adults complete their own registration via invite.
  if (!isMinor) {
    const existing = id
      ? await env.DB.prepare("SELECT role FROM participants WHERE id=? AND registration_id=?").bind(id, reg.id).first()
      : null;
    if (!existing || existing.role !== "primary") {
      throw Object.assign(
        new Error("Each adult completes their own registration. Invite another adult instead of adding them here."),
        { status: 422, code: "ADULT_NEEDS_OWN_REGISTRATION" }
      );
    }
  }
  const mode = "here"; // minors always fill with the guardian on this device
  const relationship = String(payload.relationship || (isMinor ? "child" : "self")).slice(0, 40);
  const email = String(payload.email || "").trim().slice(0, 120);
  const phone = String(payload.phone || "").replace(/[^\d+]/g, "").slice(0, 32);
  const now = Date.now();

  // Guardian is always the primary registrant — no adult-to-adult guardian picker.
  let guardianParticipantId = null;
  let guardianJson = "{}";
  if (isMinor) {
    const primary = await env.DB.prepare(
      "SELECT id, first_name, last_name, email, phone FROM participants WHERE registration_id=? AND role='primary' AND status<>'removed' LIMIT 1"
    ).bind(reg.id).first();
    if (!primary) {
      throw Object.assign(new Error("Add the adult registrant before adding minors"), { status: 422 });
    }
    if (computeIsMinor(primary.dob || "")) {
      throw Object.assign(new Error("A parent or guardian needs to register first"), { status: 422, code: "GUARDIAN_REQUIRED" });
    }
    guardianParticipantId = primary.id;
    guardianJson = JSON.stringify({
      name: `${primary.first_name || ""} ${primary.last_name || ""}`.trim(),
      email: primary.email || "",
      phone: primary.phone || "",
    });
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
    const addressJson = addressJsonWithGear(row.address_json, payload);
    if (row.role === "primary") {
      if (isMinor) {
        throw Object.assign(
          new Error("A parent or guardian needs to register first. Please ask them to open this link."),
          { status: 422, code: "GUARDIAN_REQUIRED" }
        );
      }
      // primary: allow contact field updates but keep role/mode rules
      await env.DB.prepare(
        `UPDATE participants SET first_name=?, last_name=?, dob=?, is_minor=0, email=?, phone=?, contact_id=?,
         registration_number=COALESCE(NULLIF(registration_number,''),?), youth_addendum_status='n/a', address_json=?, updated_at=? WHERE id=?`
      ).bind(first, last, dob, email, phone, contactId, regNum, addressJson, now, id).run();
    } else {
      await env.DB.prepare(
        `UPDATE participants SET first_name=?, last_name=?, dob=?, is_minor=?, relationship=?, mode=?,
         guardian_participant_id=?, guardian_json=?, email=?, phone=?, contact_id=?,
         registration_number=COALESCE(NULLIF(registration_number,''),?), youth_addendum_status=?,
         same_address=?, same_emergency=?, address_json=?, updated_at=? WHERE id=?`
      ).bind(
        first, last, dob, isMinor, relationship, mode,
        guardianParticipantId, guardianJson, email, phone, contactId, regNum,
        isMinor ? (row.youth_addendum_status === "received" ? "received" : "waiting") : "n/a",
        payload.sameAddress === false ? 0 : 1, payload.sameEmergency === false ? 0 : 1,
        addressJson, now, id
      ).run();
    }
    return env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(id).first();
  }

  const maxSort = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order),0) AS m FROM participants WHERE registration_id=?"
  ).bind(reg.id).first();
  const sortOrder = (maxSort?.m || 0) + 1;

  const addressJson = addressJsonWithGear("{}", payload);
  const ins = await env.DB.prepare(
    `INSERT INTO participants (
      registration_id, contact_id, first_name, last_name, dob, is_minor, relationship, mode, role,
      guardian_participant_id, guardian_json, email, phone, status, registration_number, youth_addendum_status,
      same_address, same_emergency, address_json, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,'guest',?,?,?,?,'not_started',?,?,?,?,?,?,?,?)`
  ).bind(
    reg.id, contactId, first, last, dob, isMinor, relationship, mode,
    guardianParticipantId, guardianJson, email, phone, regNum, isMinor ? "waiting" : "n/a",
    payload.sameAddress === false ? 0 : 1, payload.sameEmergency === false ? 0 : 1,
    addressJson, sortOrder, now, now
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
  let customer = participant.contact_id
    ? await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(participant.contact_id).first()
    : null;
  if (!customer) {
    // Recover orphaned participants so Start forms is never blocked by a missing contact row.
    const contactId = await findOrCreateContact(env, {
      firstName: participant.first_name || "Guest",
      lastName: participant.last_name || "Diver",
      phone: participant.phone || "",
      email: participant.email || "",
      dob: participant.dob || "",
    });
    await env.DB.prepare("UPDATE participants SET contact_id=?, updated_at=? WHERE id=?")
      .bind(contactId, Date.now(), participant.id).run();
    customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(contactId).first();
  }
  if (!customer) throw Object.assign(new Error("Contact missing"), { status: 500 });

  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }

  let sharedAddr = {};
  let sharedEmg = {};
  try { sharedAddr = JSON.parse(reg.shared_address_json || "{}"); } catch { sharedAddr = {}; }
  try { sharedEmg = JSON.parse(reg.shared_emergency_json || "{}"); } catch { sharedEmg = {}; }
  try {
    if (!(participant.same_address && Object.keys(sharedAddr).length)) {
      let own = {};
      try { own = JSON.parse(participant.address_json || "{}"); } catch { own = {}; }
      sharedAddr = { ...sharedAddr, ...addressWithoutGear(own) };
    }
  } catch (_) {}
  try { if (participant.same_emergency && Object.keys(sharedEmg).length) { /* use shared */ } else { sharedEmg = { ...sharedEmg, ...JSON.parse(participant.emergency_json || "{}") }; } } catch (_) {}

  // defaults from primary registration data
  if (!sharedAddr.address && data.address) sharedAddr = { address: data.address, city: data.city, state: data.state, zip: data.zip };
  if (!sharedEmg.name && data.emergencyName) sharedEmg = { name: data.emergencyName, relationship: data.emergencyRelationship, phone: data.emergencyPhone };

  const regNum = participant.registration_number || (await ensureRegistrationNumber(env, customer.id));
  if (!participant.registration_number && regNum) {
    await env.DB.prepare("UPDATE participants SET registration_number=?, updated_at=? WHERE id=?")
      .bind(regNum, Date.now(), participant.id).run();
  }

  // Guardian identity for minors (name and phone only — never medical).
  let guardian = null;
  if (participant.is_minor || computeIsMinor(participant.dob) || (participant.role !== "primary" && computeIsMinor(participant.dob))) {
    let name = "";
    let phone = "";
    if (participant.guardian_participant_id) {
      const g = await env.DB.prepare("SELECT * FROM participants WHERE id=? AND status<>'removed'")
        .bind(participant.guardian_participant_id).first();
      if (g) {
        name = `${g.first_name || ""} ${g.last_name || ""}`.trim();
        phone = g.phone || "";
      }
    }
    try {
      const gj = JSON.parse(participant.guardian_json || "{}");
      if (!name) name = String(gj.name || "").trim();
      if (!phone) phone = String(gj.phone || "").trim();
    } catch (_) {}
    if (!name) name = `${data.firstName || ""} ${data.lastName || ""}`.trim();
    if (!phone) phone = data.phone || "";
    if (name || phone) guardian = { name, phone, relationship: "parent/guardian" };
  }

  const prefill = packetPrefill({
    participant,
    data,
    customer: customer || {},
    guardian,
    sharedAddr,
    sharedEmg,
    registrationNumber: regNum,
  });

  // Keep the roster in step with the registration so later screens are not asked again.
  const nextPhone = String(prefill.cell_phone || "").trim();
  const nextDob = String(prefill.dob || "").trim();
  const phoneMissing = !String(participant.phone || "").trim() && nextPhone;
  const primaryDob = participant.role === "primary" && nextDob && nextDob !== String(participant.dob || "");
  const primaryPhone = participant.role === "primary" && nextPhone && nextPhone !== String(participant.phone || "");
  if (phoneMissing || primaryDob || primaryPhone) {
    await env.DB.prepare(
      "UPDATE participants SET phone=CASE WHEN ?<>'' THEN ? ELSE phone END, dob=CASE WHEN ?<>'' AND role='primary' THEN ? ELSE dob END, updated_at=? WHERE id=?"
    ).bind(nextPhone, nextPhone, nextDob, nextDob, Date.now(), participant.id).run();
  }

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

/** Write non-medical identity from a packet back onto the diver and, for the primary, the registration. */
export async function rememberPacketIdentity(env, row, answers = {}) {
  if (!env?.DB || !row?.participant_id) return;
  const p = await env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(row.participant_id).first();
  if (!p || p.status === "removed") return;
  const first = String(answers.first_name || "").trim();
  const last = String(answers.last_name || "").trim();
  const dob = String(answers.dob || "").trim();
  const phone = String(answers.cell_phone || answers.phone || "").trim();
  const email = String(answers.email || "").trim();
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : "";
  if (first || last || validDob || phone || email) {
    await env.DB.prepare(
      `UPDATE participants SET
        first_name=COALESCE(NULLIF(?,''), first_name),
        last_name=COALESCE(NULLIF(?,''), last_name),
        dob=COALESCE(NULLIF(?,''), dob),
        phone=COALESCE(NULLIF(?,''), phone),
        email=COALESCE(NULLIF(?,''), email),
        updated_at=?
       WHERE id=?`
    ).bind(first, last, validDob, phone, email, Date.now(), p.id).run();
  }
  if (p.role !== "primary" || !row.registration_id) return;
  const reg = await env.DB.prepare("SELECT data FROM registrations WHERE id=?").bind(row.registration_id).first();
  if (!reg) return;
  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
  let changed = false;
  if (validDob && data.dob !== validDob) { data.dob = validDob; changed = true; }
  if (phone && data.phone !== phone) { data.phone = phone; changed = true; }
  if (first && data.firstName !== first) { data.firstName = first; changed = true; }
  if (last && data.lastName !== last) { data.lastName = last; changed = true; }
  if (email && !data.email) { data.email = email; changed = true; }
  if (answers.city && !data.city) { data.city = answers.city; changed = true; }
  if (!changed) return;
  await env.DB.prepare("UPDATE registrations SET data=?, updated_at=? WHERE id=?")
    .bind(JSON.stringify(data).slice(0, 8000), Date.now(), row.registration_id).run();
}

/** After a form_request completes, sync participant status (youth addendum gate, medical flag). */
export async function syncParticipantAfterSubmit(env, participantId, { needsPhysician = false } = {}) {
  if (!participantId) return;
  const p = await env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(participantId).first();
  if (!p) return;
  const now = Date.now();
  let status = "complete";
  if (needsPhysician) status = "needs_medical_review";
  // Minors who finished the packet still need the paper Youth Addendum for staff —
  // but forms themselves are done, so progress / Continue must not block.
  if (p.is_minor && p.youth_addendum_status === "waiting") status = "waiting_youth_addendum";
  // Recreational waiver validity: one year from signing
  const validUntil = now + 365 * 86400000;
  await env.DB.prepare("UPDATE participants SET status=?, valid_until=?, updated_at=? WHERE id=?")
    .bind(status, validUntil, now, participantId).run();

  // Forms-complete statuses (staff follow-ups do not block Continue):
  // complete | needs_medical_review | waiting_youth_addendum
  const blocked = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM participants WHERE registration_id=? AND status IN ('not_started','in_progress','waiting_guardian')"
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
    // Returning picker is minors-only — adults use Invite another adult.
    if (!computeIsMinor(row.dob)) return;
    const key = `${String(row.first_name || "").toLowerCase()}|${String(row.last_name || "").toLowerCase()}|${row.dob || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    let emergency = {};
    let address = {};
    try { emergency = JSON.parse(row.emergency_json || "{}"); } catch { emergency = {}; }
    try { address = JSON.parse(row.address_json || "{}"); } catch { address = {}; }
    out.push({
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      dob: row.dob || "",
      email: row.email || "",
      phone: row.phone || "",
      relationship: row.relationship || "child",
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
      `SELECT s.needs_physician, s.signed_pdf_r2_keys, s.registration_number, s.id AS submission_id, r.status AS request_status
       FROM form_requests r
       LEFT JOIN form_submissions s ON s.request_id = r.id
       WHERE r.participant_id=?
       ORDER BY r.id DESC, s.id DESC LIMIT 1`
    ).bind(row.id).first();
    // Heal stuck in_progress rows when the packet already completed (prior sync swallow).
    if (sub && sub.request_status === "completed" && (row.status === "in_progress" || row.status === "not_started")) {
      try {
        await syncParticipantAfterSubmit(env, row.id, { needsPhysician: !!sub.needs_physician });
        row.status = sub.needs_physician ? "needs_medical_review"
          : (row.is_minor && row.youth_addendum_status === "waiting" ? "waiting_youth_addendum" : "complete");
      } catch (_) {}
    }
    people.push(participantPublic(row, { includeMedical: staff, submission: sub }));
  }
  const total = people.length;
  // waiting_youth_addendum = packet signed; paper addendum is staff follow-up only
  const done = people.filter((p) =>
    p.status === "complete" || p.status === "needs_medical_review" || p.status === "waiting_youth_addendum"
  ).length;
  let sharedAddress = {};
  let sharedEmergency = {};
  try { sharedAddress = JSON.parse(reg.shared_address_json || "{}"); } catch { sharedAddress = {}; }
  try { sharedEmergency = JSON.parse(reg.shared_emergency_json || "{}"); } catch { sharedEmergency = {}; }
  const status = getRegistrationStatus(reg, people);
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
    status,
  };
}
