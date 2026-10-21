import { json, makeSession } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET)
    return json({ error: "Admin is not configured yet (set ADMIN_PASSWORD and SESSION_SECRET secrets)." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (String(body?.password ?? "") !== env.ADMIN_PASSWORD)
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
