import { json, makeSession } from "../_shared.js";

// Owner password for the Bookings CRM. Also accepts ADMIN_PASSWORD when that secret differs.
export const OWNER_PASSWORD = "bnb123";

export function passwordMatches(given, configured) {
  const typed = String(given ?? "");
  if (!typed) return false;
  if (typed === OWNER_PASSWORD) return true;
  return !!configured && typed === configured;
}

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET)
    return json({ error: "Admin is not configured yet (set SESSION_SECRET)." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (!passwordMatches(body?.password, env.ADMIN_PASSWORD))
    return json({ error: "Wrong password" }, 401);
  const s = await makeSession(env);
  return json({ ok: true }, 200, {
    "Set-Cookie": `bnb_admin=${encodeURIComponent(s.value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${s.maxAge}`,
  });
}

export async function onRequestDelete() {
  return json({ ok: true }, 200, {
    "Set-Cookie": "bnb_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
  });
}
