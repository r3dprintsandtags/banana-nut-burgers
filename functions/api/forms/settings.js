import { json, isAuthed, str, audit } from "../../_shared.js";

// GET/POST shop form settings (instructor default, training center, etc.)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare("SELECT key, value FROM shop_settings").all();
  const settings = Object.fromEntries((results || []).map((r) => [r.key, r.value]));
  return json({ settings });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const allowed = ["instructor_name", "training_center_name", "training_center_address", "shop_code", "timezone", "facility_name"];
  for (const k of allowed) {
    if (b[k] === undefined) continue;
    await env.DB.prepare(
      "INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(k, str(b[k], 200)).run();
  }
  await audit(env, "admin", "shop_settings.updated", "shop_settings", "forms", Object.keys(b).join(","));
  return json({ ok: true });
}
