import { json, str, normalizePhone, sha256, hashIP, audit, makeRef } from "../_shared.js";
import { FORM_VERSION, DECLARATION_TEXT, PRIVACY_TEXT, MARKETING_TEXT, buildDocument } from "../_form.js";
import { ensureRegistrationNumber } from "../_lib/forms/regnum.js";

/** Ensure a CRM booking row exists for this registration so it shows under Bookings. */
async function ensureBookingForReg(env, {
  regId, ref, bookingRef, firstName, lastName, phone, email,
  guests, date, time, service, registrationNumber, ipHash, createdAt,
}) {
  if (!date) return null;
  const name = `${firstName || ""} ${lastName || ""}`.trim() || "Diver";
  const note = `From registration ${ref}${registrationNumber ? " · " + registrationNumber : ""}`;
  const existingBookingId = /^\d+$/.test(String(bookingRef || "")) ? Number(bookingRef) : 0;

  if (existingBookingId) {
    const existing = await env.DB.prepare("SELECT id FROM bookings WHERE id=?").bind(existingBookingId).first();
    if (existing) {
      await env.DB.prepare(
        "UPDATE bookings SET name=?, first_name=?, last_name=?, contact=?, email=?, guests=?, date=?, time=?, service=?, note=? WHERE id=?"
      ).bind(name, firstName || "", lastName || "", phone || "", email || "",
        guests || 1, date, time || "", service || "", note, existing.id).run();
      return existing.id;
    }
  }

  // Prefer linking by note/ref if a prior insert somehow left booking_ref empty
  const byNote = await env.DB.prepare(
    "SELECT id FROM bookings WHERE note LIKE ? ORDER BY id DESC LIMIT 1"
  ).bind(`%${ref}%`).first();
  if (byNote) {
    await env.DB.prepare(
      "UPDATE bookings SET name=?, first_name=?, last_name=?, contact=?, email=?, guests=?, date=?, time=?, service=?, note=? WHERE id=?"
    ).bind(name, firstName || "", lastName || "", phone || "", email || "",
      guests || 1, date, time || "", service || "", note, byNote.id).run();
    await env.DB.prepare("UPDATE registrations SET booking_ref=? WHERE id=?").bind(String(byNote.id), regId).run();
    return byNote.id;
  }

  const book = await env.DB.prepare(
    `INSERT INTO bookings (created_at,name,first_name,last_name,contact,email,guests,date,time,service,divers,cruise,note,ip_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    createdAt || Date.now(), name, firstName || "", lastName || "", phone || "", email || "",
    guests || 1, date, time || "", service || "",
    "[]", null, note, ipHash || ""
  ).run();
  const bookingId = book.meta.last_row_id;
  if (bookingId) {
    await env.DB.prepare("UPDATE registrations SET booking_ref=? WHERE id=?").bind(String(bookingId), regId).run();
  }
  return bookingId || null;
}

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

  const dob = str(b.dob, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({ error: "Date of birth is required" }, 422);
  let todayIso = new Date().toISOString().slice(0, 10);
  try {
    todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: env.SHOP_TZ || "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) { /* keep UTC fallback */ }
  if (dob > todayIso) return json({ error: "Date of birth cannot be in the future" }, 422);
  if (b.medPregnantAck !== true || b.medTruthAck !== true) return json({ error: "Medical acknowledgements are required" }, 422);

  // Medical answers live only in the SSI packet — shop registration just carries the staff-review flag.
  const medicalFromPacket = b.medicalFromPacket === true || b.packetCompleted === true;
  if (!medicalFromPacket) {
    return json({ error: "Complete the SSI medical / forms packet before submitting registration" }, 422);
  }
  const needsStaffReview = b.packetNeedsPhysician === true || b.staffReviewStatus === "PENDING_STAFF_REVIEW" || b.medNeedsReview === 1 || b.medNeedsReview === true;
  const staffReviewStatus = needsStaffReview ? "PENDING_STAFF_REVIEW" : "CLEARED";

  const data = {
    cert: str(b.cert, 40), loggedDives: str(b.loggedDives, 10), lastDive: str(b.lastDive, 10),
    emergencyName: str(b.emergencyName, 80), emergencyPhone: normalizePhone(b.emergencyPhone),
    notes: str(b.notes, 500),
    dob,
    medPregnantAck: true, medTruthAck: true,
    medicalFromPacket: 1,
    packetCompleted: 1,
    packetNeedsPhysician: needsStaffReview ? 1 : 0,
    medNeedsReview: needsStaffReview ? 1 : 0,
    staffReviewStatus,
  };
  const customerIn = { firstName, lastName, preferredName: str(b.preferredName, 60), phone, email };

  // Idempotency: a retried/double submission with the same key returns the original (and backfills booking if missing).
  const idemKey = str(b.idempotencyKey, 80);
  if (idemKey) {
    const dup = await env.DB.prepare(
      "SELECT id, ref, created_at, booking_ref, activity, planned_date, participants, data, customer_id FROM registrations WHERE idempotency_key=? AND status<>'draft'"
    ).bind(idemKey).first();
    if (dup) {
      let bookingId = null;
      try {
        let data = {};
        try { data = JSON.parse(dup.data || "{}"); } catch { data = {}; }
        const cust = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(dup.customer_id).first();
        let registrationNumber = "";
        try { registrationNumber = await ensureRegistrationNumber(env, dup.customer_id); } catch (_) {}
        bookingId = await ensureBookingForReg(env, {
          regId: dup.id, ref: dup.ref, bookingRef: dup.booking_ref || data.bookingRef,
          firstName: data.firstName || cust?.first_name, lastName: data.lastName || cust?.last_name,
          phone: data.phone || cust?.phone, email: data.email || cust?.email,
          guests: dup.participants || data.participants || 1,
          date: dup.planned_date || data.plannedDate,
          time: data.plannedTime || "",
          service: dup.activity || data.activity || "",
          registrationNumber, ipHash: "", createdAt: dup.created_at,
        });
      } catch (_) { /* still return success for the original submit */ }
      return json({
        ok: true, ref: dup.ref, submittedAt: new Date(dup.created_at).toISOString(),
        status: "submitted", duplicate: true, bookingId,
      });
    }
  }
  // Resuming a saved draft? It will be converted (same ref kept) on submit.
  let draftReg = null;
  if (b.draftRef && b.draftToken) {
    const cand = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=? AND status='draft'").bind(str(b.draftRef, 20).toUpperCase()).first();
    if (cand && cand.draft_token_hash && (await sha256(String(b.draftToken))) === cand.draft_token_hash) draftReg = cand;
  }

  // Require packet completion before converting draft → submitted (avoids orphan submitted regs with no booking).
  if (draftReg) {
    try {
      const latest = await env.DB.prepare(
        "SELECT id, status FROM form_requests WHERE registration_id=? ORDER BY id DESC LIMIT 1"
      ).bind(draftReg.id).first();
      const hasPackets = await env.DB.prepare("SELECT id FROM form_packets WHERE status='active' LIMIT 1").first();
      if (hasPackets && latest?.status !== "completed") {
        return json({ error: "Complete the required form packet before submitting" }, 422);
      }
    } catch (_) { /* forms tables may not be migrated yet */ }
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
  const plannedTime = str(b.plannedTime, 20);
  const trip = { activity: str(b.activity, 60), plannedDate: str(b.plannedDate, 10), plannedTime,
    participants: Math.min(20, Math.max(1, parseInt(b.participants, 10) || 1)), bookingRef: str(b.bookingRef, 40) };
  if (!trip.plannedDate || !plannedTime) return json({ error: "A preferred date and time are required to book" }, 422);
  const ownGear = str(b.ownGear, 8).toLowerCase();
  if (ownGear !== "yes" && ownGear !== "no") return json({ error: "Please say if you bring your own gear" }, 422);
  const gearSize = ownGear === "no" ? str(b.gearSize, 40) : "";
  const gearNote = ownGear === "no" ? str(b.gearNote, 200) : "";
  if (ownGear === "no" && !gearSize) return json({ error: "Gear size is required when renting" }, 422);
  const city = str(b.city, 80), state = str(b.state, 80), zip = str(b.zip, 20);
  const address = str(b.address, 200) || [city, state, zip].filter(Boolean).join(", ");
  const fullData = { ...customerIn, ...data, ...trip, preferredLanguage: str(b.preferredLanguage, 10), emergencyRelationship: str(b.emergencyRelationship, 40),
    ownGear, gearSize, gearNote, address, city, state, zip };

  // Keep draft until signature + document are stored, then flip to submitted (avoids "No document" orphans).
  let regId;
  if (draftReg) {
    await env.DB.prepare(
      "UPDATE registrations SET customer_id=?, updated_at=?, form_version=?, data=?, is_duplicate=?, ip_hash=?, idempotency_key=?, activity=?, planned_date=?, participants=?, booking_ref=? WHERE id=?"
    ).bind(customer.id, now, FORM_VERSION, JSON.stringify(fullData), isDuplicate, ipHash, idemKey || null, trip.activity, trip.plannedDate, trip.participants, trip.bookingRef, draftReg.id).run();
    regId = draftReg.id;
  } else {
    const reg = await env.DB.prepare(
      "INSERT INTO registrations (ref,customer_id,created_at,updated_at,status,form_version,data,is_duplicate,ip_hash,idempotency_key,activity,planned_date,participants,booking_ref) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?)"
    ).bind(ref, customer.id, now, now, FORM_VERSION, JSON.stringify(fullData), isDuplicate, ipHash, idemKey || null, trip.activity, trip.plannedDate, trip.participants, trip.bookingRef).run();
    regId = reg.meta.last_row_id;
  }

  for (const c of consents)
    await env.DB.prepare("INSERT INTO consents (registration_id,created_at,purpose,granted,text_version) VALUES (?,?,?,?,?)")
      .bind(regId, now, c.purpose, c.granted ? 1 : 0, c.textVersion).run();

  // --- store signature PNG + signed document in private R2 ---
  const sigKey = `registrations/${ref}/signature.png`;
  const docKey = `registrations/${ref}/registration.html`;
  let sigBytes;
  try {
    sigBytes = Uint8Array.from(atob(sig.split(",")[1]), (c) => c.charCodeAt(0));
  } catch (e) {
    return json({ error: "Invalid signature image" }, 422);
  }
  try {
    await env.DOCS.put(sigKey, sigBytes, { httpMetadata: { contentType: "image/png" } });
    await env.DB.prepare("INSERT INTO signatures (registration_id,created_at,signer_name,r2_key,document_sha256,ip_hash,user_agent) VALUES (?,?,?,?,?,?,?)")
      .bind(regId, now, signerName, sigKey, docHash, ipHash, str(request.headers.get("User-Agent"), 200)).run();

    const html = buildDocument({ ref, customer: customerIn, data: fullData, consents, signerName, signedAtISO: new Date(now).toISOString(), docHash, signatureDataUrl: sig });
    await env.DOCS.put(docKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
    await env.DB.prepare("INSERT INTO documents (registration_id,created_at,kind,version,r2_key,sha256) VALUES (?,?, 'registration',?,?,?)")
      .bind(regId, now, FORM_VERSION, docKey, docHash).run();
  } catch (e) {
    return json({ error: "Could not store signed document", detail: String(e?.message || e) }, 503);
  }

  // Only mark submitted after files are safely stored; staff-review flags stay visible in CRM.
  const submitStatus = needsStaffReview ? "flagged" : "submitted";
  await env.DB.prepare(
    "UPDATE registrations SET status=?, draft_token_hash='', review_note=CASE WHEN ? THEN COALESCE(NULLIF(review_note,''), ?) ELSE review_note END, updated_at=? WHERE id=?"
  ).bind(
    submitStatus,
    needsStaffReview ? 1 : 0,
    needsStaffReview ? "PENDING_STAFF_REVIEW — medical answers flagged for Banana Nut Burger staff" : "",
    now,
    regId
  ).run();

  // Stable CRM registration number (stamped on SSI PDFs / searchable in admin)
  let registrationNumber = "";
  try { registrationNumber = await ensureRegistrationNumber(env, customer.id); } catch (_) {}

  let formLink = null, formToken = null, packetDone = false;
  try {
    const latest = await env.DB.prepare(
      "SELECT id, status FROM form_requests WHERE registration_id=? ORDER BY id DESC LIMIT 1"
    ).bind(regId).first();
    packetDone = latest?.status === "completed";
  } catch (_) { /* forms tables may not be migrated yet */ }

  // Always create/update the CRM booking so the appointment appears under Bookings.
  let bookingId = null;
  try {
    bookingId = await ensureBookingForReg(env, {
      regId, ref, bookingRef: trip.bookingRef,
      firstName, lastName, phone, email,
      guests: trip.participants, date: trip.plannedDate, time: plannedTime,
      service: trip.activity, registrationNumber, ipHash: ipHash || "", createdAt: now,
    });
    if (bookingId) {
      fullData.bookingRef = String(bookingId);
      fullData.plannedTime = plannedTime;
      await env.DB.prepare("UPDATE registrations SET data=? WHERE id=?")
        .bind(JSON.stringify(fullData), regId).run();
    } else {
      await audit(env, "system", "booking.missing", "registration", ref, "ensureBooking returned null");
    }
  } catch (e) {
    await audit(env, "system", "booking.failed", "registration", ref, String(e?.message || e)).catch(() => {});
  }

  await audit(env, "customer", "registration.submitted", "registration", ref, isDuplicate ? "duplicate customer match" : "new customer");
  return json({
    ok: true, ref, submittedAt: new Date(now).toISOString(), status: "submitted",
    registrationNumber, formLink, formToken, packetCompleted: packetDone, bookingId,
    next: null,
  }, 201);
}
