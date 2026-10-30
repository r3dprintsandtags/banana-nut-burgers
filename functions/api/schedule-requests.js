import { json, isAuthed, str, normalizePhone, ensureSchema, audit } from "../_shared.js";

// Public cancel / reschedule requests from the website, reviewed in the CRM.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  await ensureSchema(env);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const reservationNumber = str(b.reservationNumber, 40);
  const phone = normalizePhone(b.phone);
  const fullName = str(b.fullName, 120);
  const kind = str(b.kind, 20) === "reschedule" ? "reschedule" : (str(b.kind, 20) === "cancel" ? "cancel" : "");
  const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(str(b.preferredDate, 10)) ? str(b.preferredDate, 10) : "";
  if (!reservationNumber || phone.length < 8 || !fullName || !kind) return json({ error: "Reservation number, phone, full name, and a choice are required" }, 422);
  if (kind === "reschedule" && !preferredDate) return json({ error: "A preferred new date is required" }, 422);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO schedule_requests (created_at,status,reservation_number,phone,full_name,kind,preferred_date) VALUES (?,?,?,?,?,?,?)"
  ).bind(now, "open", reservationNumber, phone, fullName, kind, preferredDate).run();
  await audit(env, "customer", "schedule.request", "schedule_request", reservationNumber, kind);
  return json({ ok: true }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM schedule_requests ORDER BY status='resolved', created_at DESC LIMIT 200").all();
  return json({ requests: results || [] });
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const status = str(b.status, 20) === "resolved" ? "resolved" : "open";
  await env.DB.prepare("UPDATE schedule_requests SET status=? WHERE id=?").bind(status, Number(b.id)).run();
  return json({ ok: true });
}
