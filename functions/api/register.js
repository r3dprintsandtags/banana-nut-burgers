import { json, str, normalizePhone, sha256, hashIP, audit, makeRef } from "../_shared.js";
import { FORM_VERSION, DECLARATION_TEXT, PRIVACY_TEXT, MARKETING_TEXT, buildDocument } from "../_form.js";

// POST /api/register (public) — customer registration + e-signature
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.DOCS) return json({ error: "Registration is not configured yet" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (str(b.hp, 50)) return json({ ok: true }); // honeypot

  // --- validate customer info (server-side, mirrors frontend) ---
  const firstName = str(b.firstName, 60), lastName = str(b.lastName, 60);
  const phone = normalizePhone(b.phone), email = str(b.email, 120).toLowerCase();
  if (!firstName || !lastName) return json({ error: "First and last name are required" }, 422);
  if (phone.length < 8) return json({ error: "A valid phone number is required" }, 422);
  if (email && !/.+@.+\..+/.test(email)) return json({ error: "Invalid email" }, 422);

  // --- declarations & consents: separate, never preselected (enforced client + here) ---
  if (b.accuracyDeclaration !== true) return json({ error: "The Customer Information Accuracy Declaration must be accepted" }, 422);
  if (b.privacyAck !== true) return json({ error: "The privacy acknowledgement must be accepted" }, 422);
  const marketing = b.marketingConsent === true;

  // --- signature: typed legal name + drawn signature image are both required ---
  const signerName = str(b.signerName, 120);
  if (!signerName) return json({ error: "Type your full name to sign" }, 422);
  const sig = String(b.signatureDataUrl ?? "");
  if (!sig.startsWith("data:image/png;base64,") || sig.length > 300_000)
    return json({ error: "A drawn signature is required" }, 422);

  const data = {
    cert: str(b.cert, 40), loggedDives: str(b.loggedDives, 10), lastDive: str(b.lastDive, 10),
    emergencyName: str(b.emergencyName, 80), emergencyPhone: normalizePhone(b.emergencyPhone),
    notes: str(b.notes, 500),
  };
  const customerIn = { firstName, lastName, preferredName: str(b.preferredName, 60), phone, email };

  // Idempotency: a retried/double submission with the same key returns the original.
  const idemKey = str(b.idempotencyKey, 80);
  if (idemKey) {
    const dup = await env.DB.prepare("SELECT ref, created_at FROM registrations WHERE idempotency_key=? AND status<>'draft'").bind(idemKey).first();
    if (dup) return json({ ok: true, ref: dup.ref, submittedAt: new Date(dup.created_at).toISOString(), status: "submitted", duplicate: true });
  }
  // Resuming a saved draft? It will be converted (same ref kept) on submit.
  let draftReg = null;
  if (b.draftRef && b.draftToken) {
    const cand = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=? AND status='draft'").bind(str(b.draftRef, 20).toUpperCase()).first();
    if (cand && cand.draft_token_hash && (await sha256(String(b.draftToken))) === cand.draft_token_hash) draftReg = cand;
  }

  // rate limit: 5 registrations / IP / 10 min
  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  if (ipHash) {
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM registrations WHERE ip_hash=? AND created_at>?")
      .bind(ipHash, Date.now() - 10 * 60 * 1000).all();
    if (results?.[0]?.n >= 5) return json({ error: "Too many submissions, please contact us on WhatsApp" }, 429);
  }

  // --- duplicate detection: same normalized phone (or email) = same customer ---
  let customer = await env.DB.prepare("SELECT * FROM customers WHERE phone=? OR (email<>'' AND email=?) ORDER BY id LIMIT 1")
    .bind(phone, email).first();
  const isDuplicate = customer && !(draftReg && draftReg.customer_id === customer.id) ? 1 : 0;
  const now = Date.now();
  if (!customer) {
    const r = await env.DB.prepare("INSERT INTO customers (created_at,updated_at,first_name,last_name,preferred_name,phone,email) VALUES (?,?,?,?,?,?,?)")
      .bind(now, now, firstName, lastName, customerIn.preferredName, phone, email).run();
    customer = { id: r.meta.last_row_id, ...customerIn };
  } else {
    await env.DB.prepare("UPDATE customers SET updated_at=?, first_name=?, last_name=?, preferred_name=?, email=? WHERE id=?")
      .bind(now, firstName, lastName, customerIn.preferredName, email, customer.id).run();
    customer = { ...customer, ...customerIn };
  }

  // --- document hash over the exact signed content ---
  const consents = [
    { purpose: "accuracy_declaration", granted: true, textVersion: FORM_VERSION, text: DECLARATION_TEXT },
    { purpose: "privacy_ack", granted: true, textVersion: FORM_VERSION, text: PRIVACY_TEXT },
    { purpose: "marketing", granted: marketing, textVersion: FORM_VERSION, text: MARKETING_TEXT },
  ];
  const canonical = JSON.stringify({ v: FORM_VERSION, customer: customerIn, data, consents: consents.map(c => [c.purpose, c.granted, c.text]), signerName });
  const docHash = await sha256(canonical);

  // --- unique public reference (draft conversion keeps its ref) ---
  let ref = draftReg?.ref || makeRef();
  if (!draftReg) for (let i = 0; i < 3; i++) {
    const exists = await env.DB.prepare("SELECT id FROM registrations WHERE ref=?").bind(ref).first();
    if (!exists) break;
    ref = makeRef();
  }
  const trip = { activity: str(b.activity, 60), plannedDate: str(b.plannedDate, 10),
    participants: Math.min(20, Math.max(1, parseInt(b.participants, 10) || 1)), bookingRef: str(b.bookingRef, 40) };
  const fullData = { ...customerIn, ...data, ...trip, preferredLanguage: str(b.preferredLanguage, 10), emergencyRelationship: str(b.emergencyRelationship, 40) };

  let regId;
  if (draftReg) {
    await env.DB.prepare(
      "UPDATE registrations SET customer_id=?, updated_at=?, status='submitted', form_version=?, data=?, is_duplicate=?, ip_hash=?, draft_token_hash='', idempotency_key=?, activity=?, planned_date=?, participants=?, booking_ref=? WHERE id=?"
    ).bind(customer.id, now, FORM_VERSION, JSON.stringify(fullData), isDuplicate, ipHash, idemKey || null, trip.activity, trip.plannedDate, trip.participants, trip.bookingRef, draftReg.id).run();
    regId = draftReg.id;
  } else {
    const reg = await env.DB.prepare(
      "INSERT INTO registrations (ref,customer_id,created_at,updated_at,status,form_version,data,is_duplicate,ip_hash,idempotency_key,activity,planned_date,participants,booking_ref) VALUES (?,?,?,?, 'submitted',?,?,?,?,?,?,?,?,?)"
    ).bind(ref, customer.id, now, now, FORM_VERSION, JSON.stringify(fullData), isDuplicate, ipHash, idemKey || null, trip.activity, trip.plannedDate, trip.participants, trip.bookingRef).run();
    regId = reg.meta.last_row_id;
  }

  for (const c of consents)
    await env.DB.prepare("INSERT INTO consents (registration_id,created_at,purpose,granted,text_version) VALUES (?,?,?,?,?)")
      .bind(regId, now, c.purpose, c.granted ? 1 : 0, c.textVersion).run();

  // --- store signature PNG + signed document in private R2 ---
  const sigKey = `registrations/${ref}/signature.png`;
  const docKey = `registrations/${ref}/registration.html`;
  const sigBytes = Uint8Array.from(atob(sig.split(",")[1]), (c) => c.charCodeAt(0));
  await env.DOCS.put(sigKey, sigBytes, { httpMetadata: { contentType: "image/png" } });
  await env.DB.prepare("INSERT INTO signatures (registration_id,created_at,signer_name,r2_key,document_sha256,ip_hash,user_agent) VALUES (?,?,?,?,?,?,?)")
    .bind(regId, now, signerName, sigKey, docHash, ipHash, str(request.headers.get("User-Agent"), 200)).run();

  const html = buildDocument({ ref, customer: customerIn, data, consents, signerName, signedAtISO: new Date(now).toISOString(), docHash, signatureDataUrl: sig });
  await env.DOCS.put(docKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  await env.DB.prepare("INSERT INTO documents (registration_id,created_at,kind,version,r2_key,sha256) VALUES (?,?, 'registration',?,?,?)")
    .bind(regId, now, FORM_VERSION, docKey, docHash).run();

  await audit(env, "customer", "registration.submitted", "registration", ref, isDuplicate ? "duplicate customer match" : "new customer");
  return json({ ok: true, ref, submittedAt: new Date(now).toISOString(), status: "submitted" }, 201);
}
