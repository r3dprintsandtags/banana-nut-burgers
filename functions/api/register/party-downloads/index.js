/**
 * GET /api/register/party-downloads?ref=&token=
 * Primary registrant can list/download signed PDFs for the party with privacy:
 * - own docs: all
 * - minors they guardian: all (incl. medical)
 * - other adults: non-medical only (never medical answers / medical PDFs)
 */
import { json, str, sha256 } from "../../../_shared.js";
import { listParticipants } from "../../../_lib/forms/party.js";

const MEDICAL_KEYS = new Set(["fit_to_dive", "diver_medical", "diving_medical_guidance"]);

function isMedicalTemplate(key) {
  const k = String(key || "").toLowerCase();
  return MEDICAL_KEYS.has(k) || k.includes("medical") || k.includes("fit_to_dive");
}

async function loadReg(env, ref, token) {
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=?").bind(String(ref || "").toUpperCase()).first();
  if (!reg) return { error: "Not found", status: 404 };
  if (!reg.draft_token_hash || (await sha256(token)) !== reg.draft_token_hash) {
    return { error: "Unauthorized", status: 401 };
  }
  return { reg };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const u = new URL(request.url);
  const ref = str(u.searchParams.get("ref"), 20);
  const token = str(u.searchParams.get("token"), 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);
  const loaded = await loadReg(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);

  const people = await listParticipants(env, loaded.reg.id);
  const primary = people.find((p) => p.role === "primary");
  const out = [];

  for (const p of people) {
    const sub = await env.DB.prepare(
      `SELECT s.id, s.participant_id, s.registration_number, s.needs_physician, s.signed_pdf_r2_keys, s.signed_at, s.signer_name
       FROM form_submissions s
       JOIN form_requests r ON r.id = s.request_id
       WHERE r.participant_id=?
       ORDER BY s.id DESC LIMIT 1`
    ).bind(p.id).first();

    let pdfs = [];
    try { pdfs = JSON.parse(sub?.signed_pdf_r2_keys || "[]"); } catch { pdfs = []; }

    const isSelf = primary && p.id === primary.id;
    const isMinorWard = !!p.is_minor && (
      Number(p.guardian_participant_id) === Number(primary?.id) || p.role === "primary"
    );
    const canSeeMedical = isSelf || isMinorWard;

    const files = (sub ? pdfs : [])
      .filter((f) => canSeeMedical || !isMedicalTemplate(f.template_key))
      .map((f) => ({
        templateKey: f.template_key,
        medical: isMedicalTemplate(f.template_key),
        download: `/api/register/party-downloads/pdf?ref=${encodeURIComponent(ref)}&token=${encodeURIComponent(token)}&submission=${sub.id}&key=${encodeURIComponent(f.template_key || "")}`,
      }));

    out.push({
      participantId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      role: p.role,
      isMinor: !!p.is_minor,
      status: p.status,
      registrationNumber: p.registration_number || sub?.registration_number || "",
      needsMedicalReview: !!(sub?.needs_physician),
      medicalDetailHidden: !canSeeMedical && !!(sub?.needs_physician),
      files,
      canSeeMedical,
    });
  }

  return json({ ok: true, participants: out });
}
