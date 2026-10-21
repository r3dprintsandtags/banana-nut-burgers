import { json, isAuthed, str, normalizePhone, audit } from "../_shared.js";

// POST /api/corrections (public) — request a correction.
// Always returns the same generic response so existence of a record is never leaked.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (str(b.hp, 50)) return json({ ok: true });
  const ref = str(b.ref, 20).toUpperCase(), phone = normalizePhone(b.phone);
  const name = str(b.name, 120), message = str(b.message, 1000);
  if (ref && phone && message) {
    const reg = await env.DB.prepare(
      "SELECT r.id FROM registrations r JOIN customers c ON c.id=r.customer_id WHERE upper(r.ref)=? AND c.phone=?"
    ).bind(ref, phone).first();
    if (reg) {
      await env.DB.prepare("INSERT INTO correction_requests (registration_id,created_at,name,phone,message) VALUES (?,?,?,?,?)")
        .bind(reg.id, Date.now(), name, phone, message).run();
      await audit(env, "customer", "correction.requested", "registration", ref);
    }
  }
  return json({ ok: true, message: "If your details match a registration, your correction request has been received." }, 201);
}

// GET /api/corrections (admin) — open correction requests
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    `SELECT cr.*, r.ref FROM correction_requests cr LEFT JOIN registrations r ON r.id=cr.registration_id
     ORDER BY cr.status='resolved', cr.created_at DESC LIMIT 200`
  ).all();
  return json({ corrections: results });
}

// PATCH /api/corrections {id, status} (admin)
export async function onRequestPatch({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const status = str(b.status, 20);
  if (!["open", "resolved"].includes(status)) return json({ error: "Invalid status" }, 422);
  await env.DB.prepare("UPDATE correction_requests SET status=? WHERE id=?").bind(status, Number(b.id)).run();
  await audit(env, "admin", "correction." + status, "correction_request", b.id);
  return json({ ok: true });
}
