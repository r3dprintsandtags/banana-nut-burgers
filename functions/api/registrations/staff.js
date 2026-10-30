import { json, isAuthed, str, normalizePhone, sha256, audit, makeRef, makeToken, ensureSchema } from "../../_shared.js";

// Staff registers a diver in person or by phone, then sends a link to finish the forms.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const firstName = str(b.firstName, 60), lastName = str(b.lastName, 60);
  const phone = normalizePhone(b.phone), email = str(b.email, 120).toLowerCase();
  if (!firstName || !lastName || phone.length < 8)
    return json({ error: "First name, last name and a valid phone are required" }, 422);
  const now = Date.now();
  const data = { firstName, lastName, phone, email, staffCreated: true };
  let customer = await env.DB.prepare("SELECT * FROM customers WHERE phone=? OR (email<>'' AND email=?) ORDER BY id LIMIT 1").bind(phone, email).first();
  if (!customer) {
    const r = await env.DB.prepare("INSERT INTO customers (created_at,updated_at,first_name,last_name,preferred_name,phone,email) VALUES (?,?,?,?,?,?,?)")
      .bind(now, now, firstName, lastName, "", phone, email).run();
    customer = { id: r.meta.last_row_id };
  }
  const token = makeToken();
  let ref = makeRef();
  for (let i = 0; i < 3; i++) {
    if (!(await env.DB.prepare("SELECT id FROM registrations WHERE ref=?").bind(ref).first())) break;
    ref = makeRef();
  }
  await env.DB.prepare(
    "INSERT INTO registrations (ref,customer_id,created_at,updated_at,status,form_version,data,draft_token_hash,activity,planned_date,participants,booking_ref) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?)"
  ).bind(ref, customer.id, now, now, "registration-v1", JSON.stringify(data), await sha256(token), "", "", 1, "").run();
  await audit(env, "admin", "registration.staff_created", "registration", ref);
  const origin = new URL(request.url).origin;
  const url = `${origin}/register.html?ref=${encodeURIComponent(ref)}&token=${encodeURIComponent(token)}`;
  return json({ ok: true, ref, url }, 201);
}
