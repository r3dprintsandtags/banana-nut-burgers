import { json, isAuthed, str, normalizePhone, sha256, audit, makeRef, makeToken, ensureSchema } from "../../_shared.js";
import { ensureRegistrationNumber } from "../../_lib/forms/regnum.js";

const IN_PERSON_NOTE = "Registered manually at the shop. All forms and data were collected in person.";

// Staff registers a diver in person or by phone.
// manualShop: forms and data were already collected at the shop (no remote form link).
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
  const manualShop = b.manualShop === true || b.manualShop === 1 || b.manualShop === "1" || b.manualShop === "true";
  const now = Date.now();
  const data = {
    firstName, lastName, phone, email,
    staffCreated: true,
    manualShop,
    collectedInPerson: manualShop,
    formsSource: manualShop ? "in_person" : "link",
  };
  let customer = await env.DB.prepare("SELECT * FROM customers WHERE phone=? OR (email<>'' AND email=?) ORDER BY id LIMIT 1").bind(phone, email).first();
  if (!customer) {
    const r = await env.DB.prepare("INSERT INTO customers (created_at,updated_at,first_name,last_name,preferred_name,phone,email) VALUES (?,?,?,?,?,?,?)")
      .bind(now, now, firstName, lastName, "", phone, email).run();
    customer = { id: r.meta.last_row_id };
  }
  const token = manualShop ? "" : makeToken();
  let ref = makeRef();
  for (let i = 0; i < 3; i++) {
    if (!(await env.DB.prepare("SELECT id FROM registrations WHERE ref=?").bind(ref).first())) break;
    ref = makeRef();
  }
  const inserted = await env.DB.prepare(
    `INSERT INTO registrations (
      ref,customer_id,created_at,updated_at,status,form_version,data,draft_token_hash,
      activity,planned_date,participants,booking_ref,manual_shop,review_note
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    ref, customer.id, now, now,
    manualShop ? "complete" : "draft",
    "registration-v1",
    JSON.stringify(data),
    token ? await sha256(token) : "",
    "", "", 1, "",
    manualShop ? 1 : 0,
    manualShop ? IN_PERSON_NOTE : "",
  ).run();
  const regId = inserted.meta?.last_row_id;
  if (manualShop && regId) {
    await env.DB.prepare(
      "INSERT INTO consents (registration_id,created_at,purpose,granted,text_version) VALUES (?,?,?,?,?)"
    ).bind(regId, now, "in_person_collection", 1, "paper-at-shop-v1").run();
  }
  let registrationNumber = "";
  if (manualShop) {
    try { registrationNumber = await ensureRegistrationNumber(env, customer.id); } catch (_) {}
  }
  await audit(
    env, "admin",
    manualShop ? "registration.manual_shop" : "registration.staff_created",
    "registration", ref,
    manualShop ? "forms and data collected in person" : "",
  );
  const origin = new URL(request.url).origin;
  const url = token ? `${origin}/register.html?ref=${encodeURIComponent(ref)}&token=${encodeURIComponent(token)}` : "";
  return json({ ok: true, ref, url, manualShop, registrationNumber }, 201);
}
