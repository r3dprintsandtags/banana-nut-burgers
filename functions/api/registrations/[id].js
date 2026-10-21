import { json, isAuthed, str, audit } from "../../_shared.js";

async function loadReg(env, id) {
  return env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.preferred_name, c.phone, c.email
     FROM registrations r JOIN customers c ON c.id = r.customer_id WHERE r.id=?`
  ).bind(Number(id)).first();
}

// GET /api/registrations/:id (admin) — full detail incl. history, consents, signature
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const reg = await loadReg(env, params.id);
  if (!reg) return json({ error: "Not found" }, 404);
  const consents = (await env.DB.prepare("SELECT * FROM consents WHERE registration_id=? ORDER BY id").bind(reg.id).all()).results;
  const signature = await env.DB.prepare("SELECT * FROM signatures WHERE registration_id=? ORDER BY id DESC LIMIT 1").bind(reg.id).first();
  const documents = (await env.DB.prepare("SELECT * FROM documents WHERE registration_id=? ORDER BY id").bind(reg.id).all()).results;
  const history = (await env.DB.prepare(
    `SELECT r.id, r.ref, r.status, r.created_at FROM registrations r WHERE r.customer_id=? ORDER BY r.created_at DESC`
  ).bind(reg.customer_id).all()).results;
  await audit(env, "admin", "registration.viewed", "registration", reg.ref);
  return json({ registration: reg, consents, signature, documents, history });
}

// PATCH /api/registrations/:id {status?, reviewNote?} (admin) — audited review actions
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const reg = await loadReg(env, params.id);
  if (!reg) return json({ error: "Not found" }, 404);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const status = str(b.status, 30), note = str(b.reviewNote, 1000);
  if (status && !["submitted", "under_review", "approved", "rejected", "flagged", "corrections_requested"].includes(status))
    return json({ error: "Invalid status" }, 422);
  await env.DB.prepare("UPDATE registrations SET status=?, review_note=?, updated_at=? WHERE id=?")
    .bind(status || reg.status, note || reg.review_note, Date.now(), reg.id).run();
  await audit(env, "admin", "registration.review", "registration", reg.ref,
    `status:${reg.status}->${status || reg.status}${note ? " note:" + note : ""}`);
  return json({ ok: true });
}
