/** Cascade deletes for bookings, registrations, form packets, and customers. */

async function delR2Keys(env, keys) {
  if (!env.DOCS) return;
  for (const key of keys) {
    if (!key) continue;
    try { await env.DOCS.delete(key); } catch (_) {}
  }
}

export async function deleteFormSubmission(env, submissionId) {
  const id = Number(submissionId);
  if (!id) return { ok: false, error: "Bad id", status: 400 };
  const sub = await env.DB.prepare("SELECT * FROM form_submissions WHERE id=?").bind(id).first();
  if (!sub) return { ok: false, error: "Not found", status: 404 };

  const keys = [];
  if (sub.signature_r2_key) keys.push(sub.signature_r2_key);
  try {
    const pdfs = JSON.parse(sub.signed_pdf_r2_keys || "[]");
    for (const p of pdfs || []) if (p?.r2_key) keys.push(p.r2_key);
  } catch (_) {}
  await delR2Keys(env, keys);

  try {
    await env.DB.prepare("DELETE FROM form_audit_log WHERE submission_id=?").bind(id).run();
  } catch (_) {}
  await env.DB.prepare("DELETE FROM form_submissions WHERE id=?").bind(id).run();
  try {
    await env.DB.prepare(
      "INSERT INTO form_deletion_log (submission_id,registration_number,deleted_at,reason) VALUES (?,?,?,?)"
    ).bind(id, sub.registration_number || "", Date.now(), "admin").run();
  } catch (_) {}
  return { ok: true, id };
}

export async function deleteRegistration(env, registrationId) {
  const id = Number(registrationId);
  if (!id) return { ok: false, error: "Bad id", status: 400 };
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE id=?").bind(id).first();
  if (!reg) return { ok: false, error: "Not found", status: 404 };

  // Form submissions + requests for this registration
  let subs = [];
  try {
    subs = (await env.DB.prepare(
      `SELECT s.* FROM form_submissions s
       LEFT JOIN form_requests r ON r.id = s.request_id
       WHERE s.registration_id=? OR r.registration_id=?`
    ).bind(id, id).all()).results || [];
  } catch (_) { subs = []; }
  for (const s of subs) await deleteFormSubmission(env, s.id);

  try {
    const reqs = (await env.DB.prepare("SELECT id FROM form_requests WHERE registration_id=?").bind(id).all()).results || [];
    for (const r of reqs) {
      try { await env.DB.prepare("DELETE FROM form_audit_log WHERE request_id=?").bind(r.id).run(); } catch (_) {}
      await env.DB.prepare("DELETE FROM form_requests WHERE id=?").bind(r.id).run();
    }
  } catch (_) {}

  // Registration attachments
  try {
    const docs = (await env.DB.prepare("SELECT r2_key FROM documents WHERE registration_id=?").bind(id).all()).results || [];
    await delR2Keys(env, docs.map((d) => d.r2_key));
  } catch (_) {}
  try {
    const sigs = (await env.DB.prepare("SELECT r2_key FROM signatures WHERE registration_id=?").bind(id).all()).results || [];
    await delR2Keys(env, sigs.map((s) => s.r2_key));
  } catch (_) {}

  for (const sql of [
    "DELETE FROM documents WHERE registration_id=?",
    "DELETE FROM signatures WHERE registration_id=?",
    "DELETE FROM consents WHERE registration_id=?",
    "DELETE FROM participants WHERE registration_id=?",
    "DELETE FROM correction_requests WHERE registration_id=?",
  ]) {
    try { await env.DB.prepare(sql).bind(id).run(); } catch (_) {}
  }

  await env.DB.prepare("DELETE FROM registrations WHERE id=?").bind(id).run();

  // Drop orphan customer if they have no other registrations
  if (reg.customer_id) {
    const other = await env.DB.prepare(
      "SELECT id FROM registrations WHERE customer_id=? LIMIT 1"
    ).bind(reg.customer_id).first();
    if (!other) {
      try { await env.DB.prepare("DELETE FROM customers WHERE id=?").bind(reg.customer_id).run(); } catch (_) {}
    }
  }

  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (created_at,actor,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)"
    ).bind(Date.now(), "admin", "registration.deleted", "registration", reg.ref || String(id), "").run();
  } catch (_) {}

  return { ok: true, id, ref: reg.ref };
}

export async function deleteBooking(env, bookingId) {
  const id = Number(bookingId);
  if (!id) return { ok: false, error: "Bad id", status: 400 };
  const row = await env.DB.prepare("SELECT id FROM bookings WHERE id=?").bind(id).first();
  if (!row) return { ok: false, error: "Not found", status: 404 };
  // Detach form requests that pointed at this booking
  try {
    await env.DB.prepare("UPDATE form_requests SET booking_id=NULL WHERE booking_id=?").bind(id).run();
  } catch (_) {}
  await env.DB.prepare("DELETE FROM bookings WHERE id=?").bind(id).run();
  return { ok: true, id };
}

/** Wipe all customer-facing data. Keeps form templates, packets, promotions, shop settings. */
export async function purgeAllCustomerData(env) {
  const counts = {};
  const run = async (label, sql) => {
    try {
      const res = await env.DB.prepare(sql).run();
      counts[label] = res.meta?.changes ?? 0;
    } catch (_) {
      counts[label] = 0;
    }
  };

  // Collect R2 keys before wiping rows
  const r2 = [];
  try {
    const subs = (await env.DB.prepare("SELECT signature_r2_key, signed_pdf_r2_keys FROM form_submissions").all()).results || [];
    for (const s of subs) {
      if (s.signature_r2_key) r2.push(s.signature_r2_key);
      try {
        for (const p of JSON.parse(s.signed_pdf_r2_keys || "[]") || []) if (p?.r2_key) r2.push(p.r2_key);
      } catch (_) {}
    }
  } catch (_) {}
  try {
    const docs = (await env.DB.prepare("SELECT r2_key FROM documents").all()).results || [];
    for (const d of docs) if (d.r2_key) r2.push(d.r2_key);
  } catch (_) {}
  try {
    const sigs = (await env.DB.prepare("SELECT r2_key FROM signatures").all()).results || [];
    for (const s of sigs) if (s.r2_key) r2.push(s.r2_key);
  } catch (_) {}
  await delR2Keys(env, r2);

  await run("form_audit_log", "DELETE FROM form_audit_log");
  await run("form_submissions", "DELETE FROM form_submissions");
  await run("form_requests", "DELETE FROM form_requests");
  await run("documents", "DELETE FROM documents");
  await run("signatures", "DELETE FROM signatures");
  await run("consents", "DELETE FROM consents");
  await run("participants", "DELETE FROM participants");
  await run("correction_requests", "DELETE FROM correction_requests");
  await run("schedule_requests", "DELETE FROM schedule_requests");
  await run("registrations", "DELETE FROM registrations");
  await run("bookings", "DELETE FROM bookings");
  await run("customers", "DELETE FROM customers");
  await run("audit_log", "DELETE FROM audit_log");
  // Reset registration number sequence so new regs start clean
  try { await env.DB.prepare("DELETE FROM reg_number_seq").run(); counts.reg_number_seq = 1; } catch (_) {}

  try {
    await env.DB.prepare(
      "INSERT INTO audit_log (created_at,actor,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)"
    ).bind(Date.now(), "admin", "purge.all", "system", "", JSON.stringify(counts)).run();
  } catch (_) {}

  return { ok: true, counts };
}
