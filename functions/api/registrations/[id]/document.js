import { json, isAuthed, audit, sha256 } from "../../../_shared.js";
import { FORM_VERSION, buildDocument } from "../../../_form.js";

async function rebuildRegistrationHtml(env, reg) {
  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
  const consents = (await env.DB.prepare(
    "SELECT purpose, granted, text_version FROM consents WHERE registration_id=? ORDER BY id"
  ).bind(reg.id).all()).results || [];
  const mappedConsents = consents.map((c) => ({
    purpose: c.purpose,
    granted: !!c.granted,
    textVersion: c.text_version,
  }));
  if (!mappedConsents.length) {
    mappedConsents.push(
      { purpose: "accuracy_declaration", granted: true, textVersion: FORM_VERSION },
      { purpose: "privacy_ack", granted: true, textVersion: FORM_VERSION },
    );
  }
  const sig = await env.DB.prepare(
    "SELECT * FROM signatures WHERE registration_id=? ORDER BY id DESC LIMIT 1"
  ).bind(reg.id).first();

  let signatureDataUrl = "";
  if (sig?.r2_key && env.DOCS) {
    const obj = await env.DOCS.get(sig.r2_key);
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      signatureDataUrl = `data:image/png;base64,${btoa(bin)}`;
    }
  }

  const customer = {
    firstName: data.firstName || reg.first_name || "",
    lastName: data.lastName || reg.last_name || "",
    preferredName: data.preferredName || reg.preferred_name || "",
    phone: data.phone || reg.phone || "",
    email: data.email || reg.email || "",
  };
  const canonical = JSON.stringify({
    v: FORM_VERSION, customer, data,
    consents: mappedConsents.map((c) => [c.purpose, c.granted, c.textVersion]),
    signerName: sig?.signer_name || `${customer.firstName} ${customer.lastName}`.trim(),
  });
  const docHash = await sha256(canonical);
  const html = buildDocument({
    ref: reg.ref,
    customer,
    data,
    consents: mappedConsents,
    signerName: sig?.signer_name || `${customer.firstName} ${customer.lastName}`.trim(),
    signedAtISO: new Date(sig?.created_at || reg.updated_at || reg.created_at).toISOString(),
    docHash,
    signatureDataUrl,
  });
  return { html, docHash };
}

// GET /api/registrations/:id/document (admin) — download signed document from private R2
// Falls back to regenerating HTML, or the first SSI packet PDF if shop HTML was never saved.
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const regId = Number(params.id);

  const reg = await env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.preferred_name, c.phone, c.email
     FROM registrations r JOIN customers c ON c.id = r.customer_id WHERE r.id=?`
  ).bind(regId).first();
  if (!reg) return json({ error: "Registration not found" }, 404);

  // Prefer stored registration HTML
  let doc = await env.DB.prepare(
    "SELECT d.*, r.ref FROM documents d JOIN registrations r ON r.id=d.registration_id WHERE d.registration_id=? ORDER BY d.id DESC LIMIT 1"
  ).bind(regId).first();

  if (doc?.r2_key) {
    const obj = await env.DOCS.get(doc.r2_key);
    if (obj) {
      await audit(env, "admin", "document.downloaded", "registration", doc.ref, doc.r2_key);
      return new Response(obj.body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="registration-${doc.ref}.html"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  // Rebuild + persist shop registration HTML when missing (older / partial submits)
  try {
    const { html, docHash } = await rebuildRegistrationHtml(env, reg);
    const docKey = `registrations/${reg.ref}/registration.html`;
    await env.DOCS.put(docKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    if (!doc) {
      await env.DB.prepare(
        "INSERT INTO documents (registration_id,created_at,kind,version,r2_key,sha256) VALUES (?,?, 'registration',?,?,?)"
      ).bind(regId, Date.now(), FORM_VERSION, docKey, docHash).run();
    } else {
      await env.DB.prepare("UPDATE documents SET r2_key=?, sha256=? WHERE id=?").bind(docKey, docHash, doc.id).run();
    }
    await audit(env, "admin", "document.regenerated", "registration", reg.ref, docKey);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="registration-${reg.ref}.html"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Fall through to SSI PDFs
  }

  // Last resort: stream first filled SSI packet PDF for this registration
  const sub = await env.DB.prepare(
    "SELECT id, signed_pdf_r2_keys, registration_number FROM form_submissions WHERE registration_id=? OR customer_id=? ORDER BY id DESC LIMIT 1"
  ).bind(regId, reg.customer_id).first();
  if (sub) {
    let keys = [];
    try { keys = JSON.parse(sub.signed_pdf_r2_keys || "[]"); } catch { keys = []; }
    const entry = keys.find((k) => k.r2_key && !k.reference) || keys[0];
    if (entry?.r2_key) {
      const obj = await env.DOCS.get(entry.r2_key);
      if (obj) {
        await audit(env, "admin", "document.downloaded", "registration", reg.ref, `fallback-pdf:${entry.template_key}`);
        const filename = `${sub.registration_number || reg.ref}-${entry.template_key || "form"}.pdf`;
        return new Response(obj.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
          },
        });
      }
    }
  }

  return json({
    error: "No document",
    detail: "No signed registration HTML or SSI packet PDF is stored for this check-in yet.",
  }, 404);
}
