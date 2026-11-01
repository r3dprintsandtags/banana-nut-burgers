/**
 * GET /api/register/party-downloads/pdf?ref=&token=&submission=&key=
 * Authenticated download for the primary registrant with medical privacy filter.
 */
import { json, str, sha256, hashIP } from "../../../_shared.js";
import { formAudit } from "../../../_lib/forms/submit.js";

const MEDICAL_KEYS = new Set(["fit_to_dive", "diver_medical", "diving_medical_guidance"]);

function isMedicalTemplate(key) {
  const k = String(key || "").toLowerCase();
  return MEDICAL_KEYS.has(k) || k.includes("medical") || k.includes("fit_to_dive");
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  const u = new URL(request.url);
  const ref = str(u.searchParams.get("ref"), 20);
  const token = str(u.searchParams.get("token"), 80);
  const submissionId = parseInt(u.searchParams.get("submission") || "", 10);
  const want = u.searchParams.get("key") || "";
  if (!ref || !token || !submissionId) return json({ error: "ref, token, submission required" }, 422);

  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=?").bind(ref.toUpperCase()).first();
  if (!reg) return json({ error: "Not found" }, 404);
  if (!reg.draft_token_hash || (await sha256(token)) !== reg.draft_token_hash) {
    return json({ error: "Unauthorized" }, 401);
  }

  const sub = await env.DB.prepare("SELECT * FROM form_submissions WHERE id=?").bind(submissionId).first();
  if (!sub) return json({ error: "Not found" }, 404);
  if (sub.registration_id && Number(sub.registration_id) !== Number(reg.id)) {
    // also accept via form_request.registration_id
    const req = await env.DB.prepare("SELECT registration_id, participant_id FROM form_requests WHERE id=?")
      .bind(sub.request_id).first();
    if (!req || Number(req.registration_id) !== Number(reg.id)) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  let keys = [];
  try { keys = JSON.parse(sub.signed_pdf_r2_keys || "[]"); } catch { keys = []; }
  const entry = want ? keys.find((k) => k.template_key === want) : keys[0];
  if (!entry?.r2_key) return json({ error: "PDF not found" }, 404);

  // Privacy: other adults' medical PDFs blocked for primary registrant
  if (isMedicalTemplate(entry.template_key)) {
    const participantId = sub.participant_id || (await env.DB.prepare(
      "SELECT participant_id FROM form_requests WHERE id=?"
    ).bind(sub.request_id).first())?.participant_id;
    if (participantId) {
      const p = await env.DB.prepare("SELECT * FROM participants WHERE id=?").bind(participantId).first();
      const primary = await env.DB.prepare(
        "SELECT id FROM participants WHERE registration_id=? AND role='primary' AND status<>'removed' LIMIT 1"
      ).bind(reg.id).first();
      const isSelf = primary && Number(p?.id) === Number(primary.id);
      const isMinorWard = p && !!p.is_minor && Number(p.guardian_participant_id) === Number(primary?.id);
      if (!isSelf && !isMinorWard) {
        return json({ error: "Medical forms for other adults are private", code: "MEDICAL_PRIVACY" }, 403);
      }
    }
  }

  const obj = await env.DOCS.get(entry.r2_key);
  if (!obj) return json({ error: "Missing object" }, 404);

  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  await formAudit(env, {
    requestId: sub.request_id, submissionId, event: "downloaded", actor: "customer",
    ipHash, details: `party;${entry.template_key}`,
  });

  const filename = `${sub.registration_number || "form"}-${entry.template_key}.pdf`;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
