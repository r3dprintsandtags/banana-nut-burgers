import { json, isAuthed, hashIP } from "../../../../_shared.js";
import { decryptJson } from "../../../../_lib/forms/crypto.js";
import { formAudit } from "../../../../_lib/forms/submit.js";
import { deleteFormSubmission } from "../../../../_lib/purge.js";

/**
 * GET /api/forms/submissions/:id — admin view of a completed packet submission
 * Returns decrypted answers (non-binary) + PDF keys for download.
 */
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  if (!id) return json({ error: "Bad id" }, 400);

  const sub = await env.DB.prepare("SELECT * FROM form_submissions WHERE id=?").bind(id).first();
  if (!sub) return json({ error: "Not found" }, 404);

  let answers = {};
  try {
    answers = await decryptJson(env, sub.answers_encrypted);
  } catch (e) {
    return json({ error: "Could not decrypt answers", detail: String(e.message || e) }, 500);
  }

  const view = {};
  for (const [k, v] of Object.entries(answers || {})) {
    if (k === "signature_image" || k.startsWith("__sig")) continue;
    if (typeof v === "string" && v.startsWith("data:image")) continue;
    view[k] = v;
  }

  let pdfs = [];
  try { pdfs = JSON.parse(sub.signed_pdf_r2_keys || "[]"); } catch { pdfs = []; }

  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  await formAudit(env, { requestId: sub.request_id, submissionId: id, event: "viewed", actor: "admin", ipHash });

  return json({
    ok: true,
    submission: {
      id: sub.id,
      registration_number: sub.registration_number,
      signer_name: sub.signer_name,
      signed_at: sub.signed_at,
      language: sub.language,
      needs_physician: !!sub.needs_physician,
      valid_until: sub.valid_until,
      pdf_sha256: sub.pdf_sha256,
    },
    answers: view,
    pdfs: pdfs.map((p) => ({
      template_key: p.template_key,
      reference: !!p.reference,
      download: `/api/forms/submissions/${id}/pdf?key=${encodeURIComponent(p.template_key || "")}`,
    })),
  });
}

/** DELETE /api/forms/submissions/:id — remove a signed packet submission (+ PDFs) */
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const out = await deleteFormSubmission(env, params.id);
  if (!out.ok) return json({ error: out.error }, out.status || 400);
  return json(out);
}
