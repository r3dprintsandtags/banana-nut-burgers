import { json, sha256, str } from "../../../_shared.js";
import { formAudit, loadPacketTemplates, submitFormRequest } from "../../../_lib/forms/submit.js";
import { fillPdf, officialBytes, officialFont, stampMapFor } from "../../../_lib/forms/pdf.js";
import { resolveShared } from "../../../_lib/forms/shared.js";
import { getShopSetting } from "../../../_lib/forms/regnum.js";
import { over45Prefill } from "../../../_lib/forms/physician.js";
import { ageFromDob } from "../../../_lib/forms/shared.js";
import { youthTemplate } from "../../../_lib/forms/youth.js";
import { sendSecureLink } from "../../../_lib/forms/mail.js";
import { LEGAL } from "../../../_lib/forms/legal-text.js";
import { hashIP } from "../../../_shared.js";

async function loadByToken(env, token) {
  const tokenHash = await sha256(token);
  return env.DB.prepare("SELECT * FROM form_requests WHERE token_hash=?").bind(tokenHash).first();
}

async function verifyTurnstile(env, token, ip) {
  // Skip when Turnstile isn't fully configured (need both keys to enforce).
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || "" });
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const out = await r.json().catch(() => ({}));
  return !!out.success;
}

// GET /api/forms/public/:token — payload for renderer
export async function onRequestGet({ env, params, request }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const row = await loadByToken(env, params.token);
  if (!row) return json({ error: "Invalid link" }, 404);
  if (row.status === "revoked") return json({ error: "Revoked" }, 410);
  if (row.status === "completed") {
    const sub = await env.DB.prepare(
      "SELECT signed_pdf_r2_keys, registration_number FROM form_submissions WHERE request_id=? ORDER BY id DESC LIMIT 1"
    ).bind(row.id).first();
    let files = [];
    try { files = JSON.parse(sub?.signed_pdf_r2_keys || "[]"); } catch { files = []; }
    const want = new URL(request.url).searchParams.get("file");
    if (want) {
      const hit = files.find((f) => f.template_key === want && f.r2_key);
      if (!hit || !env.DOCS) return json({ error: "Not found" }, 404);
      const obj = await env.DOCS.get(hit.r2_key);
      if (!obj) return json({ error: "Not found" }, 404);
      return new Response(obj.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${want}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json({
      status: "completed",
      registrationNumber: sub?.registration_number || "",
      files: files.filter((f) => f.r2_key).map((f) => ({ key: f.template_key, reference: !!f.reference })),
    });
  }
  if (row.expires_at < Date.now()) return json({ error: "Expired" }, 410);

  if (row.status === "sent") {
    await env.DB.prepare("UPDATE form_requests SET status='opened' WHERE id=?").bind(row.id).run();
    const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
    await formAudit(env, { requestId: row.id, event: "opened", actor: "customer", ipHash });
  }

  const { packet, templates } = row.packet_id
    ? await loadPacketTemplates(env, row.packet_id)
    : { packet: null, templates: [] };

  const customer = row.customer_id
    ? await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(row.customer_id).first()
    : null;
  const shop = {
    training_center_name: await getShopSetting(env, "training_center_name", env.SHOP_NAME || ""),
    training_center_address: await getShopSetting(env, "training_center_address", ""),
  };
  let prefill = {};
  try { prefill = JSON.parse(row.prefill_json || "{}"); } catch { prefill = {}; }
  let draft = {};
  try { draft = JSON.parse(row.draft_json || "{}"); } catch { draft = {}; }
  let answers = resolveShared({ answers: { ...prefill, ...draft }, customer: customer || {}, shop });
  answers = over45Prefill(answers).answers;

  const age = ageFromDob(answers.dob);
  const templatePayload = templates.map((t) => ({
    id: t.id, key: t.key, name: t.name, version: t.version,
    schema: JSON.parse(t.schema_json || "{}"),
    legal: LEGAL[t.key] || "",
  }));
  if (age != null && age < 18 && !templatePayload.some((t) => t.key === "youth_addendum")) {
    const youth = youthTemplate("en");
    templatePayload.push({ ...youth, legalEs: youthTemplate("es").legal });
  }

  return json({
    packet: packet ? { key: packet.key, name: packet.name } : null,
    templates: templatePayload,
    answers,
    expiresAt: row.expires_at,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || "",
    shopName: env.SHOP_NAME || "Banana Nut Burgers Dive Shop",
  });
}

// POST /api/forms/public/:token — { action: "save"|"submit", ... }
export async function onRequestPost({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  const row = await loadByToken(env, params.token);
  if (!row) return json({ error: "Invalid link" }, 404);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  if (b.action === "preview") {
    if (row.status === "completed" || row.status === "revoked") return json({ error: "Unavailable" }, 410);
    const key = str(b.templateKey, 64);
    const map = stampMapFor(key);
    if (!map || map.reference || map.status === "missing-pdf") return json({ error: "No official PDF for this form yet" }, 404);
    const answers = { ...(b.answers || {}) };
    delete answers.__signatures;
    const { bytes } = await fillPdf({
      templateBytes: await officialBytes(env, key),
      fontBytes: await officialFont(env),
      answers,
      registrationNumber: "",
      includeSignature: false,
      audit: { templateKey: key },
    });
    return new Response(bytes, {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
    });
  }

  if (b.action === "save") {
    if (row.status === "completed") return json({ error: "Already completed" }, 410);
    const draft = over45Prefill(b.answers || {}).answers;
    // Never log answers
    const savedAnswers = { ...draft };
    if (savedAnswers.__signatures) {
      savedAnswers.__signature_keys = Object.keys(savedAnswers.__signatures);
      delete savedAnswers.__signatures;
    }
    await env.DB.prepare("UPDATE form_requests SET draft_json=? WHERE id=?").bind(JSON.stringify(savedAnswers).slice(0, 400000), row.id).run();
    const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
    await formAudit(env, { requestId: row.id, event: "saved", actor: "customer", ipHash });
    return json({ ok: true, saved: true });
  }

  if (b.action === "email-copy") {
    const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
    let to = "";
    let name = "";
    if (row.customer_id) {
      const c = await env.DB.prepare("SELECT email, first_name, last_name FROM customers WHERE id=?").bind(row.customer_id).first();
      to = String(c?.email || "").trim();
      name = `${c?.first_name || ""} ${c?.last_name || ""}`.trim();
    }
    if (!to) {
      try { to = String(JSON.parse(row.draft_json || "{}").email || "").trim(); } catch { to = ""; }
    }
    if (!/.+@.+\..+/.test(to)) {
      return json({ error: b.language === "es" ? "Agrega un correo en tus datos" : "Add an email on the About you step" }, 422);
    }
    const origin = (env.FORMS_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const link = `${origin}/f/${params.token}`;
    let sent = { ok: false, via: "copy" };
    try { sent = await sendSecureLink(env, { to, name, link }); }
    catch (e) { sent = { ok: false, via: "copy", error: String(e?.message || e).slice(0, 120) }; }
    await formAudit(env, { requestId: row.id, event: "email_copy_requested", actor: "customer", ipHash, details: sent.ok ? "sent" : "link-only" });
    const es = b.language === "es";
    return json({
      ok: true,
      link,
      sent: !!sent.ok,
      note: sent.ok
        ? (es ? "Enviamos el enlace seguro a tu correo. No incluye datos médicos." : "We emailed the secure link. It does not include medical answers.")
        : (es ? "Copia este enlace seguro. El correo de la tienda aún no está activado." : "Copy this secure link. Shop email is not turned on yet."),
    });
  }

  if (b.action === "submit") {
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const turnstileOk = await verifyTurnstile(env, b.turnstileToken, ip);
    // Rate limit: 10 submits / IP / 10 min via audit count
    const ipHash = await hashIP(env.SESSION_SECRET || "bnb", ip);
    if (ipHash) {
      const { results } = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM form_audit_log WHERE ip_hash=? AND event='submitted' AND created_at>?"
      ).bind(ipHash, Date.now() - 600000).all();
      if ((results?.[0]?.n || 0) >= 10) return json({ error: "Too many attempts" }, 429);
    }
    const out = await submitFormRequest(env, request, row, b.answers || {}, {
      signerName: str(b.signerName, 120),
      signatureDataUrl: b.signatureDataUrl,
      language: str(b.language || "en", 5),
      consentText: str(b.consentText, 2000),
      turnstileOk,
    });
    if (out.error) return json(out, out.status || 400);
    return json(out);
  }

  return json({ error: "Unknown action" }, 400);
}
