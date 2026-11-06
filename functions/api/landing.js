import { json, isAuthed, ensureSchema } from "../_shared.js";
import { defaultLanding, sanitizeLanding } from "../../js/landing.js";

const KEY = "landing";

// GET /api/landing — public. The homepage and the admin editor both read this.
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  await ensureSchema(env);
  const landing = await readLanding(env);
  return json({ landing }, 200, { "Cache-Control": "public, max-age=60" });
}

// POST /api/landing  {landing}  — admin only.
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const landing = sanitizeLanding(body?.landing);
  await env.DB.prepare(
    "INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).bind(KEY, JSON.stringify(landing)).run();
  return json({ landing });
}

async function readLanding(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM shop_settings WHERE key=?").bind(KEY).first();
    if (!row?.value) return sanitizeLanding(defaultLanding());
    return sanitizeLanding(JSON.parse(row.value));
  } catch (_) {
    return sanitizeLanding(defaultLanding());
  }
}
