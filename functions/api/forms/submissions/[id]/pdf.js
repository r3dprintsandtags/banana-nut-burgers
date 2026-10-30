import { json, isAuthed, hashIP } from "../../../../_shared.js";
import { formAudit } from "../../../../_lib/forms/submit.js";

// GET /api/forms/submissions/:id/pdf?key=template_key — stream signed PDF (auth only, never public R2 URL)
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  const sub = await env.DB.prepare("SELECT * FROM form_submissions WHERE id=?").bind(id).first();
  if (!sub) return json({ error: "Not found" }, 404);

  let keys = [];
  try { keys = JSON.parse(sub.signed_pdf_r2_keys || "[]"); } catch { keys = []; }
  const url = new URL(request.url);
  const want = url.searchParams.get("key");
  const entry = want ? keys.find((k) => k.template_key === want) : keys[0];
  if (!entry?.r2_key) return json({ error: "PDF not found" }, 404);

  const obj = await env.DOCS.get(entry.r2_key);
  if (!obj) return json({ error: "Missing object" }, 404);

  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  await formAudit(env, { requestId: sub.request_id, submissionId: id, event: "downloaded", actor: "admin", ipHash, details: entry.template_key });

  const filename = `${sub.registration_number || "form"}-${entry.template_key}.pdf`;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
