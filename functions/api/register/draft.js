import { json, str, normalizePhone, sha256, audit, makeRef, makeToken } from "../../_shared.js";

// Resumable registration drafts.
// POST /api/register/draft            -> create draft (needs first/last name + phone)
// POST /api/register/draft {ref,token,data} -> update draft
// GET  /api/register/draft?ref=&token=      -> load draft (token is a secret, stored hashed)
// A phone number or name alone can NEVER load a draft.

async function findDraft(env, ref, token) {
  if (!ref || !token) return null;
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=? AND status='draft'")
    .bind(String(ref).toUpperCase()).first();
  if (!reg || !reg.draft_token_hash) return null;
  return (await sha256(token)) === reg.draft_token_hash ? reg : null;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (str(b.hp, 50)) return json({ ok: true });
  const now = Date.now();
  const data = (b.data && typeof b.data === "object") ? b.data : {};

  // update existing draft
  if (b.ref && b.token) {
    const reg = await findDraft(env, b.ref, b.token);
    if (!reg) return json({ error: "Draft not found" }, 404);
    await env.DB.prepare("UPDATE registrations SET data=?, activity=?, planned_date=?, participants=?, booking_ref=?, updated_at=? WHERE id=?")
      .bind(JSON.stringify(data).slice(0, 8000), str(data.activity, 60), str(data.plannedDate, 10),
        Math.min(20, Math.max(1, parseInt(data.participants, 10) || 1)), str(data.bookingRef, 40), now, reg.id).run();
    return json({ ok: true, ref: reg.ref, updatedAt: new Date(now).toISOString() });
  }

  // create draft — same minimum identity as the wizard's step 2
  const firstName = str(data.firstName, 60), lastName = str(data.lastName, 60);
  const phone = normalizePhone(data.phone), email = str(data.email, 120).toLowerCase();
  if (!firstName || !lastName || phone.length < 8)
    return json({ error: "First name, last name and a valid phone are required to save a draft" }, 422);

  let customer = await env.DB.prepare("SELECT * FROM customers WHERE phone=? OR (email<>'' AND email=?) ORDER BY id LIMIT 1").bind(phone, email).first();
  if (!customer) {
    const r = await env.DB.prepare("INSERT INTO customers (created_at,updated_at,first_name,last_name,preferred_name,phone,email) VALUES (?,?,?,?,?,?,?)")
      .bind(now, now, firstName, lastName, str(data.preferredName, 60), phone, email).run();
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
  ).bind(ref, customer.id, now, now, "registration-v1", JSON.stringify(data).slice(0, 8000), await sha256(token),
    str(data.activity, 60), str(data.plannedDate, 10), Math.min(20, Math.max(1, parseInt(data.participants, 10) || 1)), str(data.bookingRef, 40)).run();
  await audit(env, "customer", "registration.draft_created", "registration", ref);
  return json({ ok: true, ref, token, updatedAt: new Date(now).toISOString() }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const url = new URL(request.url);
  const reg = await findDraft(env, url.searchParams.get("ref"), url.searchParams.get("token"));
  if (!reg) return json({ error: "Draft not found" }, 404);
  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch (e) {}
  const customer = await env.DB.prepare("SELECT first_name,last_name,preferred_name,phone,email FROM customers WHERE id=?").bind(reg.customer_id).first();
  return json({ ok: true, ref: reg.ref, data: { ...data, firstName: customer?.first_name || data.firstName || "", lastName: customer?.last_name || data.lastName || "", preferredName: customer?.preferred_name || "", phone: customer?.phone || "", email: customer?.email || "" }, updatedAt: new Date(reg.updated_at).toISOString() });
}
