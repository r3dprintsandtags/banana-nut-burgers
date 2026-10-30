import { json, isAuthed } from "../../../../_shared.js";

// GET /api/forms/templates/:id/mapping
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  const t = await env.DB.prepare("SELECT id, key, name, pdf_mode, pdf_r2_key, pdf_mapping_json, schema_json FROM form_templates WHERE id=?").bind(id).first();
  if (!t) return json({ error: "Not found" }, 404);
  let mapping = {};
  try { mapping = JSON.parse(t.pdf_mapping_json || "{}"); } catch { mapping = {}; }
  let schema = {};
  try { schema = JSON.parse(t.schema_json || "{}"); } catch { schema = {}; }
  return json({
    id: t.id, key: t.key, name: t.name, pdf_mode: t.pdf_mode, pdf_r2_key: t.pdf_r2_key,
    mapping, consent: schema.consent?.text || {},
  });
}
