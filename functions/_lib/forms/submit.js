import { encryptJson } from "./crypto.js";
import { resolveShared, fromRegistrationData, contactUpdatesFromAnswers, ageFromDob } from "./shared.js";
import { validateAnswers, fieldMetaMap } from "./schema.js";
import { computeNeedsPhysician, over45Prefill, physicianNotice } from "./physician.js";
import { ensureRegistrationNumber, getShopSetting } from "./regnum.js";
import { fillPdf, officialBytes, officialFont, combinePacket } from "./pdf.js";
import { youthTemplate } from "./youth.js";
import { satisfyHiddenGates } from "./wizard.js";
import { hashIP, sha256, str } from "../../_shared.js";

async function shopProfile(env) {
  return {
    training_center_name: await getShopSetting(env, "training_center_name", env.SHOP_NAME || "Banana Nut Burgers Dive Shop"),
    training_center_address: await getShopSetting(env, "training_center_address", env.TRAINING_CENTER_ADDRESS || ""),
    instructor_name: await getShopSetting(env, "instructor_name", ""),
    facility_name: await getShopSetting(env, "facility_name", env.SHOP_NAME || "Banana Nut Burgers Dive Shop"),
  };
}

export async function loadPacketTemplates(env, packetId) {
  const packet = await env.DB.prepare("SELECT * FROM form_packets WHERE id=?").bind(packetId).first();
  if (!packet) return { packet: null, templates: [] };
  const ids = JSON.parse(packet.template_ids || "[]");
  const templates = [];
  for (const id of ids) {
    const t = await env.DB.prepare("SELECT * FROM form_templates WHERE id=? AND status='active'").bind(id).first();
    if (t) templates.push(t);
  }
  return { packet, templates };
}

export async function formAudit(env, { requestId, submissionId, event, actor, ipHash, details }) {
  await env.DB.prepare(
    "INSERT INTO form_audit_log (request_id,submission_id,event,actor,ip_hash,details,created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(requestId || null, submissionId || null, event, actor || "system", ipHash || "", String(details || "").slice(0, 500), Date.now()).run();
}

export async function submitFormRequest(env, request, reqRow, answersIn, { signerName, signatureDataUrl, language, consentText, turnstileOk }) {
  if (!turnstileOk) return { error: "Turnstile failed", status: 403 };
  if (reqRow.status === "completed") return { error: "This link was already used", status: 410 };
  if (reqRow.expires_at < Date.now()) return { error: "This link has expired", status: 410 };

  let answers = { ...answersIn };
  const { packet, templates } = reqRow.packet_id
    ? await loadPacketTemplates(env, reqRow.packet_id)
    : { packet: null, templates: reqRow.template_id
      ? [await env.DB.prepare("SELECT * FROM form_templates WHERE id=?").bind(reqRow.template_id).first()].filter(Boolean)
      : [] };

  if (!templates.length) return { error: "No active templates", status: 500 };

  const schemas = templates.map((t) => { try { return { ...JSON.parse(t.schema_json), key: t.key, version: t.version, name: t.name }; } catch { return { key: t.key, sections: [] }; } });
  const meta = fieldMetaMap(schemas);
  const customer = reqRow.customer_id
    ? await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(reqRow.customer_id).first()
    : null;
  const shop = await shopProfile(env);
  answers = resolveShared({ answers, customer: customer || {}, shop, fieldMeta: meta });
  answers = over45Prefill(answers).answers;

  const first = String(answers.first_name || "").trim();
  const last = String(answers.last_name || "").trim();
  const dob = String(answers.dob || "").trim();
  if (!first || !last) {
    return {
      error: language === "es" ? "Nombre del buzo requerido" : "Diver name is required",
      status: 422,
      errors: [{ key: first ? "last_name" : "first_name", message: language === "es" ? "Nombre y apellido requeridos" : "First and last name are required" }],
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return {
      error: language === "es" ? "Fecha de nacimiento requerida" : "Date of birth is required",
      status: 422,
      errors: [{ key: "dob", message: language === "es" ? "Fecha de nacimiento requerida" : "Date of birth is required" }],
    };
  }
  if (!String(answers.city || "").trim() || !String(answers.state || "").trim() || !String(answers.zip || answers.postal_code || "").trim()) {
    return {
      error: language === "es" ? "Ciudad, estado y ZIP requeridos" : "City, state, and ZIP are required",
      status: 422,
      errors: [{ key: !String(answers.city || "").trim() ? "city" : (!String(answers.state || "").trim() ? "state" : "zip"),
        message: language === "es" ? "Ciudad, estado y ZIP requeridos" : "City, state, and ZIP are required" }],
    };
  }
  let todayIso = new Date().toISOString().slice(0, 10);
  try {
    todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: env.SHOP_TZ || "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) { /* keep UTC fallback */ }
  if (dob > todayIso) {
    return {
      error: language === "es" ? "La fecha de nacimiento no puede ser futura" : "Date of birth cannot be in the future",
      status: 422,
      errors: [{ key: "dob", message: language === "es" ? "La fecha de nacimiento no puede ser futura" : "Date of birth cannot be in the future" }],
    };
  }
  answers.first_name = first;
  answers.last_name = last;
  answers.dob = dob;
  answers.full_name_print = answers.full_name_print || `${first} ${last}`.trim();
  answers.city = String(answers.city || "").trim();
  answers.state = String(answers.state || "").trim();
  answers.zip = String(answers.zip || answers.postal_code || "").trim();
  if (!answers.address) {
    answers.address = [answers.city, answers.state, answers.zip].filter(Boolean).join(", ");
  }
  if (!answers.mailing_address) answers.mailing_address = answers.address || "";
  if (!answers.email) answers.email = String(answers.email || "").trim();

  answers = satisfyHiddenGates(templates.map((t, i) => ({ ...t, schema: schemas[i], key: t.key })), answers);
  for (const schema of schemas) {
    const errs = validateAnswers(schema, answers, language || "en");
    if (errs.length) return { error: errs[0].message, status: 422, errors: errs };
  }

  const needsPhysician = computeNeedsPhysician(packet?.key || "", { ...answers, __templates: templates.map((t) => t.key) });
  const regNumber = customer
    ? await ensureRegistrationNumber(env, customer.id)
    : "";
  answers.registration_number = regNumber;
  answers.full_name_print = answers.full_name_print || `${answers.first_name || ""} ${answers.last_name || ""}`.trim();
  // Signing date is set here (shop timezone), never typed by the customer.
  answers.signature_date = todayIso;
  answers.__dateFormat = await getShopSetting(env, "date_format", "mm/dd/yyyy");
  const tcAddr = shop.training_center_address || "";
  if (!answers.training_center_street) answers.training_center_street = tcAddr;
  const tcBits = tcAddr.split(",").map((s) => s.trim()).filter(Boolean);
  if (!answers.training_center_zip_city && tcBits[1]) answers.training_center_zip_city = tcBits[1];
  if (!answers.training_center_state_country && tcBits.length > 2) answers.training_center_state_country = tcBits.slice(2).join(", ");

  const ageGate = ageFromDob(answers.dob);
  if (ageGate != null && ageGate < 18 && !templates.some((t) => t.key === "youth_addendum")) {
    const youth = youthTemplate(language || "en");
    templates.push({
      key: youth.key,
      name: youth.name,
      version: youth.version,
      pdf_mode: "overlay",
      pdf_r2_key: "",
      pdf_mapping_json: "{}",
      schema_json: "{}",
    });
    answers.youth_guardian_consent = youth.legal;
  }
  if (ageGate != null && ageGate < 18 && !String(answers.guardian_name || "").trim()) {
    return {
      error: language === "es" ? "Nombre del tutor requerido" : "Guardian name is required",
      status: 422,
      errors: [{ key: "guardian_name", message: language === "es" ? "Nombre del tutor requerido" : "Guardian name is required" }],
    };
  }

  const agreements = answers.__agreements && typeof answers.__agreements === "object" ? answers.__agreements : {};
  const sigMap = answers.__signatures && typeof answers.__signatures === "object" ? answers.__signatures : {};
  for (const t of templates) {
    if (t.key === "diving_medical_guidance") continue;
    const ag = agreements[t.key];
    if (!ag || ag.accepted !== true) {
      return {
        error: language === "es" ? `Lee y acepta: ${t.name}` : `Read and agree to ${t.name}`,
        status: 422,
        errors: [{ key: "agree_" + t.key, message: t.name }],
      };
    }
    if (!String(sigMap[t.key] || "").startsWith("data:image/png;base64,")) {
      return {
        error: language === "es" ? `Firma: ${t.name}` : `Sign ${t.name}`,
        status: 422,
        errors: [{ key: "sign_" + t.key, message: t.name }],
      };
    }
  }

  const sig = String(sigMap[templates[0]?.key] || signatureDataUrl || "");
  if (!signerName || !sig.startsWith("data:image/png;base64,")) return { error: "Signature required", status: 422 };
  const pngFrom = (url) => {
    const s = String(url || "");
    if (!s.startsWith("data:image/png;base64,")) return null;
    return Uint8Array.from(atob(s.split(",")[1]), (c) => c.charCodeAt(0));
  };
  const guardianPng = pngFrom(sigMap.guardian);

  // Save non-sensitive edits back to CRM
  if (customer) {
    const upd = contactUpdatesFromAnswers(answers);
    await env.DB.prepare(
      `UPDATE customers SET updated_at=?, first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
       email=COALESCE(?,email), phone=COALESCE(?,phone) WHERE id=?`
    ).bind(Date.now(), upd.first_name || null, upd.last_name || null, upd.email || null, upd.phone || null, customer.id).run();
  }

  const now = Date.now();
  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  const ua = str(request.headers.get("User-Agent"), 200);
  delete answers.__guardianPng;
  const sigCopy = answers.__signatures;
  if (sigCopy) {
    answers.__signature_keys = Object.keys(sigCopy);
    delete answers.__signatures;
  }
  let encAnswers;
  try {
    encAnswers = await encryptJson(env, answers);
  } catch (e) {
    return { error: "Forms encryption is not configured (FORMS_ENC_KEY). Ask the shop to finish setup.", status: 503, detail: String(e.message || e) };
  }
  const age = ageFromDob(answers.dob);
  const guardian = age != null && age < 18
    ? { name: answers.guardian_name, signed: !!answers.__guardian_signed }
    : null;
  let encGuardian = "";
  if (guardian) {
    try { encGuardian = await encryptJson(env, guardian); }
    catch (e) { return { error: "Forms encryption is not configured (FORMS_ENC_KEY).", status: 503 }; }
  }

  const sigBytes = Uint8Array.from(atob(sig.split(",")[1]), (c) => c.charCodeAt(0));
  const subIdPlaceholder = `tmp-${now}`;
  const sigKey = `shops/bnb/forms/${subIdPlaceholder}/signature.png`;
  await env.DOCS.put(sigKey, sigBytes, { httpMetadata: { contentType: "image/png" } });

  const tz = await getShopSetting(env, "timezone", env.SHOP_TZ || "America/Tegucigalpa");
  let signedAtLocal = new Date(now).toISOString();
  try {
    signedAtLocal = new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "medium" }).format(new Date(now));
  } catch (_) {}

  const pdfKeys = [];
  const stampedParts = [];
  let lastSha = "";
  let validUntil = null;
  const docAudits = [];

  for (const t of templates) {
    if (t.key === "youth_addendum" || t.key === "diving_medical_guidance") continue;
    const ag = agreements[t.key] || {};
    const signedMs = Number(ag.at) || now;
    let docDay = todayIso;
    try {
      docDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(signedMs));
    } catch (_) {}
    const docAnswers = { ...answers, signature_date: docDay, __guardianPng: guardianPng };
    const docPng = pngFrom(sigMap[t.key]) || sigBytes;
    const templateBytes = await officialBytes(env, t.key);
    const { bytes, sha256: pdfSha } = await fillPdf({
      templateBytes,
      fontBytes: await officialFont(env),
      answers: docAnswers,
      signaturePngBytes: docPng,
      registrationNumber: regNumber,
      includeSignature: true,
      audit: {
        templateKey: t.key,
        templateName: t.name,
        templateVersion: t.version,
        consentText: ag.text || consentText || "",
      },
    });
    lastSha = pdfSha;
    stampedParts.push(bytes);
    const key = `shops/bnb/forms/${subIdPlaceholder}/${t.key}-v${t.version}-${regNumber || "noreg"}.pdf`;
    await env.DOCS.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    pdfKeys.push({ template_key: t.key, r2_key: key, sha256: pdfSha, signed_at: signedMs, agree: String(ag.text || "") });
    docAudits.push({ key: t.key, version: t.version, at: signedMs, sha: pdfSha, agree: String(ag.text || consentText || "") });
    if (t.valid_days) {
      const vu = now + t.valid_days * 86400000;
      if (!validUntil || vu < validUntil) validUntil = vu;
    }
  }

  const ins = await env.DB.prepare(
    `INSERT INTO form_submissions (request_id,customer_id,registration_id,answers_encrypted,signature_r2_key,signed_pdf_r2_keys,
      signer_name,signed_at,ip_hash,user_agent,consent_text,language,guardian_json_encrypted,pdf_sha256,registration_number,valid_until,needs_physician,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    reqRow.id, reqRow.customer_id, reqRow.registration_id, encAnswers, sigKey, JSON.stringify(pdfKeys),
    signerName, now, ipHash, ua, String(consentText || "").slice(0, 2000), language || "en", encGuardian, lastSha,
    regNumber, validUntil, needsPhysician ? 1 : 0, now
  ).run();
  const submissionId = ins.meta.last_row_id;

  // Rewrite R2 keys with real submission id (copy is expensive; store final path prefix in keys already used — update JSON only if needed)
  // For simplicity keys keep tmp path; include submission id in audit.
  await env.DB.prepare("UPDATE form_requests SET status='completed', completed_at=? WHERE id=?").bind(now, reqRow.id).run();
  await formAudit(env, { requestId: reqRow.id, submissionId, event: "submitted", actor: "customer", ipHash, details: `reg=${regNumber}; physician=${needsPhysician}; tz=${tz}; utc=${new Date(now).toISOString()}` });
  for (const doc of docAudits) {
    await formAudit(env, {
      requestId: reqRow.id, submissionId, event: "pdf_stamped", actor: "customer", ipHash,
      details: `form=${doc.key}; version=${doc.version}; at=${doc.at}; utc=${new Date(doc.at).toISOString()}; sha=${doc.sha}; agree=${doc.agree.slice(0, 180)}`,
    });
  }

  let guidanceKey = null;
  if (needsPhysician && env.DOCS) {
    const guidanceBytes = await officialBytes(env, "diving_medical_guidance");
    if (guidanceBytes) {
      guidanceKey = `shops/bnb/forms/${subIdPlaceholder}/Diving-Medical-Guidance-ref.pdf`;
      await env.DOCS.put(guidanceKey, guidanceBytes, { httpMetadata: { contentType: "application/pdf" } });
      pdfKeys.push({ template_key: "diving_medical_guidance", r2_key: guidanceKey, sha256: "ref", reference: true });
      stampedParts.push(guidanceBytes);
      await formAudit(env, { requestId: reqRow.id, submissionId, event: "guidance_attached", actor: "system", details: "needs_physician" });
    }
  }
  if (env.DOCS && stampedParts.length) {
    const packetBytes = await combinePacket(stampedParts);
    const packetHashBuf = await crypto.subtle.digest("SHA-256", packetBytes);
    const packetSha = [...new Uint8Array(packetHashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const packetKey = `shops/bnb/forms/${subIdPlaceholder}/packet.pdf`;
    await env.DOCS.put(packetKey, packetBytes, { httpMetadata: { contentType: "application/pdf" } });
    pdfKeys.push({ template_key: "packet", r2_key: packetKey, sha256: packetSha });
  }
  await env.DB.prepare("UPDATE form_submissions SET signed_pdf_r2_keys=? WHERE id=?")
    .bind(JSON.stringify(pdfKeys), submissionId).run();

  // Auto-include youth addendum stub marker when under 18 (PDF upload later activates full form)
  const ageNow = ageFromDob(answers.dob);
  if (ageNow != null && ageNow < 18) {
    await formAudit(env, { requestId: reqRow.id, submissionId, event: "youth_addendum_required", actor: "system", details: `age=${ageNow}` });
  }

  // Persist staff-review flag onto the linked registration for CRM (never blocks diver).
  if (reqRow.registration_id) {
    try {
      const reg = await env.DB.prepare("SELECT id, data FROM registrations WHERE id=?").bind(reqRow.registration_id).first();
      if (reg) {
        let data = {};
        try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
        data.packetCompleted = true;
        data.medicalFromPacket = true;
        data.packetNeedsPhysician = !!needsPhysician;
        data.medNeedsReview = needsPhysician ? 1 : 0;
        data.staffReviewStatus = needsPhysician ? "PENDING_STAFF_REVIEW" : "CLEARED";
        await env.DB.prepare("UPDATE registrations SET data=?, updated_at=? WHERE id=?")
          .bind(JSON.stringify(data), Date.now(), reg.id).run();
        if (needsPhysician) {
          await env.DB.prepare(
            "UPDATE registrations SET status=CASE WHEN status IN ('draft','submitted') THEN 'flagged' ELSE status END, review_note=COALESCE(NULLIF(review_note,''), ?), updated_at=? WHERE id=?"
          ).bind("PENDING_STAFF_REVIEW — medical answers flagged for Banana Nut Burger staff", Date.now(), reg.id).run();
        }
      }
    } catch (_) { /* non-fatal */ }
  }

  return {
    ok: true,
    submissionId,
    registrationNumber: regNumber,
    needsPhysician,
    needsStaffReview: !!needsPhysician,
    staffReviewStatus: needsPhysician ? "PENDING_STAFF_REVIEW" : "CLEARED",
    physicianNotice: needsPhysician ? physicianNotice(language || "en") : null,
    staffReviewNotice: needsPhysician ? physicianNotice(language || "en") : null,
    files: pdfKeys.filter((k) => k.r2_key).map((k) => ({ key: k.template_key, reference: !!k.reference })),
    guidanceAttached: !!guidanceKey,
    validUntil: validUntil ? new Date(validUntil).toISOString() : null,
  };
}

export async function createRequestForRegistration(env, { customerId, registrationId, packetKey, prefill, expiresDays = 7 }) {
  const packet = await env.DB.prepare("SELECT * FROM form_packets WHERE key=? AND status='active'").bind(packetKey).first();
  if (!packet) throw new Error("packet not found: " + packetKey);
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  const now = Date.now();
  const versions = {};
  for (const id of JSON.parse(packet.template_ids || "[]")) {
    const t = await env.DB.prepare("SELECT id, version FROM form_templates WHERE id=?").bind(id).first();
    if (t) versions[t.id] = t.version;
  }
  const r = await env.DB.prepare(
    `INSERT INTO form_requests (customer_id,registration_id,packet_id,template_versions,token_hash,status,prefill_json,expires_at,sent_via,sent_at,created_at)
     VALUES (?,?,?,?,?,'sent',?,?, 'registration',?,?)`
  ).bind(customerId, registrationId || null, packet.id, JSON.stringify(versions), tokenHash,
    JSON.stringify(prefill || {}), now + expiresDays * 86400000, now, now).run();
  await formAudit(env, { requestId: r.meta.last_row_id, event: "created", actor: "system", details: packetKey });
  return { requestId: r.meta.last_row_id, token, packet };
}

export function packetKeyForActivity(activity) {
  const a = String(activity || "").toLowerCase();
  if (a.includes("scuba") || a.includes("try") || a.includes("snorkel") || a.includes("intro")) return "try_scuba";
  return "recreational";
}

export { fromRegistrationData };
