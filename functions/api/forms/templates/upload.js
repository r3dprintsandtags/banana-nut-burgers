import { json, isAuthed, str, audit } from "../../../_shared.js";
import { autoMapFields, defaultOverlayPlacements } from "../../../_lib/forms/automap.js";
import { listAcroFormFields } from "../../../_lib/forms/pdf.js";

/**
 * POST /api/forms/templates/upload  (multipart)
 * fields: key (required), file (PDF), consent_en?, consent_es?
 * Uploads PDF to R2, auto-maps AcroForm fields, updates form_templates.
 */
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);

  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "multipart required" }, 400);

  const form = await request.formData();
  const key = str(form.get("key"), 40).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!key) return json({ error: "key required" }, 422);
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "PDF file required" }, 422);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 100 || bytes.length > 15_000_000) return json({ error: "PDF size invalid" }, 422);
  // PDF magic
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (!head.startsWith("%PDF")) return json({ error: "Not a PDF" }, 422);

  const r2Key = `shops/bnb/templates/${key}.pdf`;
  await env.DOCS.put(r2Key, bytes, { httpMetadata: { contentType: "application/pdf" } });

  let mapping = { mode: "overlay", fields: {}, placements: defaultOverlayPlacements(), signatures: [], unmatched: [] };
  let pageCount = 0;
  try {
    const listed = await listAcroFormFields(bytes);
    pageCount = listed.pageCount;
    const names = listed.fields.map((f) => f.name);
    mapping = autoMapFields(names);
    if (!names.length) {
      mapping.mode = "overlay";
      mapping.placements = defaultOverlayPlacements();
    }
  } catch (e) {
    mapping.mode = "overlay";
    mapping.placements = defaultOverlayPlacements();
  }

  const consentEn = str(form.get("consent_en"), 20000);
  const consentEs = str(form.get("consent_es"), 20000);
  const row = await env.DB.prepare("SELECT * FROM form_templates WHERE key=?").bind(key).first();
  const now = Date.now();

  if (row) {
    let schema = {};
    try { schema = JSON.parse(row.schema_json || "{}"); } catch { schema = {}; }
    if (consentEn || consentEs) {
      schema.consent = schema.consent || { required: true, version: row.version };
      schema.consent.text = {
        en: consentEn || schema.consent.text?.en || "",
        es: consentEs || schema.consent.text?.es || "",
      };
    }
    await env.DB.prepare(
      "UPDATE form_templates SET pdf_r2_key=?, pdf_mode=?, pdf_mapping_json=?, schema_json=?, status='active', updated_at=? WHERE id=?"
    ).bind(r2Key, mapping.mode, JSON.stringify(mapping), JSON.stringify(schema), now, row.id).run();
  } else {
    const schema = {
      key,
      consent: {
        required: true,
        version: "1",
        text: { en: consentEn || "I agree to the terms of this form.", es: consentEs || "Acepto los términos de este formulario." },
      },
      sections: [],
    };
    await env.DB.prepare(
      `INSERT INTO form_templates (key,name,version,status,schema_json,pdf_r2_key,pdf_mode,pdf_mapping_json,languages,retention_days,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(key, key, "1", "active", JSON.stringify(schema), r2Key, mapping.mode, JSON.stringify(mapping),
      '["en","es"]', 2555, now, now).run();
  }

  // Store inspect report next to PDF
  await env.DOCS.put(`shops/bnb/templates/${key}.inspect.json`, JSON.stringify({ key, pageCount, mapping, at: now }, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  await audit(env, "admin", "form.pdf_uploaded", "form_template", key, `${mapping.mode} ${pageCount}p`);
  return json({ ok: true, key, r2Key, pageCount, mapping }, 201);
}
