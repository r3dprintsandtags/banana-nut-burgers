import { json, isAuthed, str, audit } from "../_shared.js";

// GET /api/forms (public) — active forms in order; ?activity= filters applicable forms
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const url = new URL(request.url);
  const activity = str(url.searchParams.get("activity"), 60);
  const admin = await isAuthed(request, env);
  const { results } = await env.DB.prepare(
    `SELECT * FROM forms ${admin ? "" : "WHERE active=1"} ORDER BY sort_order, id`
  ).all();
  const forms = results.filter((f) => {
    if (!activity) return true;
    try { const a = JSON.parse(f.activities || "[]"); return !a.length || a.includes(activity); } catch (e) { return true; }
  });
  return json({ forms });
}

// POST /api/forms (admin) — create a form definition
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const key = str(b.key, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key || !str(b.name_en, 120)) return json({ error: "key and name_en are required" }, 422);
  const now = Date.now();
  try {
    const r = await env.DB.prepare(
      "INSERT INTO forms (key,name_en,name_es,desc_en,desc_es,required,activities,version,active,review_required,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(key, str(b.name_en, 120), str(b.name_es, 120), str(b.desc_en, 500), str(b.desc_es, 500),
      b.required === false ? 0 : 1, JSON.stringify(Array.isArray(b.activities) ? b.activities.slice(0, 10) : []),
      str(b.version, 40) || "v1", b.active === false ? 0 : 1, b.review_required === false ? 0 : 1,
      parseInt(b.sort_order, 10) || 99, now, now).run();
    await audit(env, "admin", "form.created", "form", key);
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  } catch (e) { return json({ error: "That form key already exists" }, 409); }
}
