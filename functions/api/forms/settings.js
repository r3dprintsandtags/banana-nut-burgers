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
  const allowed = [
    "instructor_name", "training_center_name", "training_center_address", "shop_code", "timezone", "facility_name",
    "kiosk_auto_reset", "kiosk_done_idle_sec", "allow_device_multi_reg",
  ];
  for (const k of allowed) {
    if (b[k] === undefined) continue;
    let val = str(b[k], 200);
    if (k === "kiosk_done_idle_sec") {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n) || n < 10) n = 45;
      if (n > 600) n = 600;
      val = String(n);
    }
    if (k === "kiosk_auto_reset" || k === "allow_device_multi_reg") {
      val = (val === "0" || val === "false" || val === "off") ? "0" : "1";
    }
    await env.DB.prepare(
      "INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).bind(k, val).run();
  }
  await audit(env, "admin", "shop_settings.updated", "shop_settings", "forms", Object.keys(b).join(","));
  return json({ ok: true });
}
