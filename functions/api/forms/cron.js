import { json } from "../../_shared.js";
import { formAudit } from "../../_lib/forms/submit.js";
import { runPartyAppointmentReminders } from "../../_lib/forms/party-reminders.js";

/**
 * GET/POST /api/forms/cron — retention deletion + valid_until reminders + party 24h reminders.
 * Secure with CRON_SECRET header or Cloudflare Cron Trigger.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const secret = env.CRON_SECRET;
  if (secret && request.headers.get("X-Cron-Secret") !== secret) {
    // Allow Cloudflare cron (no custom header) when scheduled — still require secret if set via query for manual
    const url = new URL(request.url);
    if (url.searchParams.get("secret") !== secret && !request.headers.get("CF-Worker")) {
      // Pages cron invokes the Worker directly; accept if Authorization Bearer matches
      const auth = request.headers.get("Authorization") || "";
      if (auth !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
    }
  }
  if (!env.DB) return json({ error: "Not configured" }, 503);

  const now = Date.now();
  let deleted = 0;
  // Retention: submissions older than template retention_days
  const { results: subs } = await env.DB.prepare(
    `SELECT s.*, fr.packet_id FROM form_submissions s
     LEFT JOIN form_requests fr ON fr.id = s.request_id
     WHERE s.created_at < ? LIMIT 50`
  ).bind(now - 365 * 86400000 * 8).all(); // coarse sweep; refine per-template below

  for (const s of subs || []) {
    // Default 7 years if unknown
    const ageDays = (now - s.created_at) / 86400000;
    if (ageDays < 2555) continue;
    let keys = [];
    try { keys = JSON.parse(s.signed_pdf_r2_keys || "[]"); } catch { keys = []; }
    for (const k of keys) {
      try { await env.DOCS.delete(k.r2_key); } catch (_) {}
    }
    if (s.signature_r2_key) try { await env.DOCS.delete(s.signature_r2_key); } catch (_) {}
    await env.DB.prepare("DELETE FROM form_submissions WHERE id=?").bind(s.id).run();
    await env.DB.prepare(
      "INSERT INTO form_deletion_log (submission_id,registration_number,deleted_at,reason) VALUES (?,?,?,?)"
    ).bind(s.id, s.registration_number || "", now, "retention").run();
    await formAudit(env, { requestId: s.request_id, submissionId: s.id, event: "deleted", actor: "system", details: "retention" });
    deleted++;
  }

  // Expire open requests past expires_at
  await env.DB.prepare("UPDATE form_requests SET status='expired' WHERE status IN ('sent','opened') AND expires_at<?").bind(now).run();

  // Waiver reminders: valid_until within 14 days
  const { results: soon } = await env.DB.prepare(
    "SELECT id, customer_id, registration_number, valid_until FROM form_submissions WHERE valid_until IS NOT NULL AND valid_until>? AND valid_until<? LIMIT 20"
  ).bind(now, now + 14 * 86400000).all();
  const reminders = (soon || []).map((r) => ({
    submissionId: r.id,
    registrationNumber: r.registration_number,
    validUntil: new Date(r.valid_until).toISOString(),
    note: "TODO: queue WhatsApp/SMS via messaging helpers — link to renew waiver only, never medical data",
  }));

  // Appointment reminders: incomplete party forms 24h before planned dive (names only, never medical)
  let partyReminders = { sent: [], skipped: [], day: "" };
  try {
    partyReminders = await runPartyAppointmentReminders(env, request.url);
  } catch (e) {
    partyReminders = { sent: [], skipped: [], error: e.message || String(e) };
  }

  // Legacy booking-row open form_requests (non-party)
  const dayMs = 86400000;
  const { results: books } = await env.DB.prepare(
    "SELECT id, date, name, contact FROM bookings WHERE date <> '' LIMIT 100"
  ).all();
  const apptReminders = [];
  for (const b of books || []) {
    const t = Date.parse(b.date + "T12:00:00");
    if (!t || t - now > dayMs || t - now < 0) continue;
    const open = await env.DB.prepare(
      "SELECT id FROM form_requests WHERE booking_id=? AND status IN ('sent','opened') LIMIT 1"
    ).bind(b.id).first();
    if (open) apptReminders.push({ bookingId: b.id, requestId: open.id, note: "open form_request on booking" });
  }

  return json({ ok: true, deleted, reminders, apptReminders, partyReminders });
}
