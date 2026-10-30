import { json, isAuthed } from "../../../../_shared.js";

/** GET raw blank template PDF for the mapper canvas (not a filled preview). */
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  const t = await env.DB.prepare("SELECT key, pdf_r2_key FROM form_templates WHERE id=?").bind(id).first();
  if (!t?.pdf_r2_key) return json({ error: "No PDF uploaded" }, 404);
  const obj = await env.DOCS.get(t.pdf_r2_key);
  if (!obj) return json({ error: "Missing in R2" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${t.key}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
