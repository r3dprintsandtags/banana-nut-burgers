import { json, isAuthed, str, audit } from "../../_shared.js";

// PATCH /api/forms/:id (admin) — edits snapshot the previous version into form_versions.
// Previously signed documents are never altered: they keep their stored version + hash.
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const form = await env.DB.prepare("SELECT * FROM forms WHERE id=?").bind(Number(params.id)).first();
  if (!form) return json({ error: "Not found" }, 404);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  await env.DB.prepare("INSERT INTO form_versions (form_id,created_at,actor,version,snapshot) VALUES (?,?, 'admin',?,?)")
    .bind(form.id, Date.now(), form.version, JSON.stringify(form)).run();

  const next = {
    name_en: str(b.name_en, 120) || form.name_en, name_es: str(b.name_es, 120) || form.name_es,
    desc_en: str(b.desc_en, 500), desc_es: str(b.desc_es, 500),
    required: b.required === undefined ? form.required : (b.required ? 1 : 0),
    active: b.active === undefined ? form.active : (b.active ? 1 : 0),
    review_required: b.review_required === undefined ? form.review_required : (b.review_required ? 1 : 0),
    version: str(b.version, 40) || form.version,
    sort_order: b.sort_order === undefined ? form.sort_order : (parseInt(b.sort_order, 10) || 0),
    activities: Array.isArray(b.activities) ? JSON.stringify(b.activities.slice(0, 10)) : form.activities,
  };
  await env.DB.prepare(
    "UPDATE forms SET name_en=?,name_es=?,desc_en=?,desc_es=?,required=?,active=?,review_required=?,version=?,sort_order=?,activities=?,updated_at=? WHERE id=?"
  ).bind(next.name_en, next.name_es, next.desc_en, next.desc_es, next.required, next.active, next.review_required, next.version, next.sort_order, next.activities, Date.now(), form.id).run();
  await audit(env, "admin", "form.updated", "form", form.key, `version:${form.version}->${next.version}`);
  return json({ ok: true });
}

// DELETE /api/forms/:id (admin) — deactivate is preferred; delete only removes the definition
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const form = await env.DB.prepare("SELECT * FROM forms WHERE id=?").bind(Number(params.id)).first();
  if (!form) return json({ error: "Not found" }, 404);
  await env.DB.prepare("DELETE FROM forms WHERE id=?").bind(form.id).run();
  await audit(env, "admin", "form.deleted", "form", form.key);
  return json({ ok: true });
}
