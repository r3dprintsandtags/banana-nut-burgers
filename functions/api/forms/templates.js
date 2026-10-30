import { json, isAuthed, str, audit } from "../../_shared.js";
import { autoMapFields, defaultOverlayPlacements } from "../../_lib/forms/automap.js";
import { listAcroFormFields } from "../../_lib/forms/pdf.js";

// GET /api/forms/templates — list templates (admin)
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare(
    "SELECT id, key, name, version, status, pdf_r2_key, pdf_mode, languages, retention_days, valid_days, updated_at FROM form_templates ORDER BY id"
  ).all();
  return json({ templates: results || [] });
}

// POST /api/forms/templates — create/update mapping or upload metadata
// Body JSON: { key, name?, mapping?, schema?, status?, pdf_mode?, consent_en?, consent_es? }
// For binary PDF upload use /api/forms/templates/upload (multipart).
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const key = str(b.key, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key) return json({ error: "key required" }, 422);
  const row = await env.DB.prepare("SELECT * FROM form_templates WHERE key=?").bind(key).first();
  const now = Date.now();

  if (b.action === "automap" && row?.pdf_r2_key && env.DOCS) {
    const obj = await env.DOCS.get(row.pdf_r2_key);
    if (!obj) return json({ error: "PDF missing in R2" }, 404);
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const { fields, pageCount } = await listAcroFormFields(bytes);
    const names = fields.map((f) => f.name);
    let mapping = autoMapFields(names);
    if (mapping.mode === "overlay" || !names.length) {
      mapping = { ...mapping, mode: "overlay", placements: defaultOverlayPlacements() };
    }
    await env.DB.prepare("UPDATE form_templates SET pdf_mode=?, pdf_mapping_json=?, updated_at=? WHERE id=?")
      .bind(mapping.mode, JSON.stringify(mapping), now, row.id).run();
    await audit(env, "admin", "form.automap", "form_template", key, `${names.length} fields, ${pageCount} pages`);
    return json({ ok: true, pageCount, mapping, fields });
  }

  if (b.mapping) {
    if (!row) return json({ error: "Template not found" }, 404);
    const mode = str(b.pdf_mode || b.mapping.mode || row.pdf_mode, 20) || "overlay";
    await env.DB.prepare("UPDATE form_templates SET pdf_mapping_json=?, pdf_mode=?, updated_at=? WHERE id=?")
      .bind(JSON.stringify(b.mapping), mode, now, row.id).run();
    await audit(env, "admin", "form.mapping_saved", "form_template", key);
    return json({ ok: true });
  }

  if (b.consent_en || b.consent_es) {
    if (!row) return json({ error: "Template not found" }, 404);
    let schema = {};
    try { schema = JSON.parse(row.schema_json || "{}"); } catch { schema = {}; }
    schema.consent = schema.consent || { required: true, version: row.version };
    schema.consent.text = {
      en: b.consent_en != null ? String(b.consent_en).slice(0, 20000) : (schema.consent.text?.en || ""),
      es: b.consent_es != null ? String(b.consent_es).slice(0, 20000) : (schema.consent.text?.es || ""),
    };
    await env.DB.prepare("UPDATE form_templates SET schema_json=?, updated_at=? WHERE id=?")
      .bind(JSON.stringify(schema), now, row.id).run();
    await audit(env, "admin", "form.consent_updated", "form_template", key);
    return json({ ok: true });
  }

  return json({ error: "Nothing to update" }, 400);
}
