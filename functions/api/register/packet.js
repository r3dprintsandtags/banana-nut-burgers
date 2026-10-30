import { json, str, sha256 } from "../../_shared.js";
import { createRequestForRegistration, packetKeyForActivity, fromRegistrationData } from "../../_lib/forms/submit.js";
import { ensureRegistrationNumber } from "../../_lib/forms/regnum.js";

async function loadDraftReg(env, ref, token) {
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE upper(ref)=?").bind(ref).first();
  if (!reg) return { error: "Not found", status: 404 };
  if (reg.status === "draft") {
    if (!reg.draft_token_hash || (await sha256(token)) !== reg.draft_token_hash) return { error: "Unauthorized", status: 401 };
  }
  return { reg };
}

async function latestRequest(env, registrationId) {
  return env.DB.prepare(
    "SELECT id, status, completed_at, expires_at, packet_id, prefill_json FROM form_requests WHERE registration_id=? ORDER BY id DESC LIMIT 1"
  ).bind(registrationId).first();
}

function makeToken() {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  return [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** GET /api/register/packet?ref=&token= — packet completion status for the registration flow */
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const u = new URL(request.url);
  const ref = str(u.searchParams.get("ref"), 20).toUpperCase();
  const token = str(u.searchParams.get("token"), 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);
  const loaded = await loadDraftReg(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);

  const reqRow = await latestRequest(env, loaded.reg.id);
  let needsPhysician = false;
  if (reqRow?.status === "completed") {
    const sub = await env.DB.prepare(
      "SELECT needs_physician FROM form_submissions WHERE request_id=? ORDER BY id DESC LIMIT 1"
    ).bind(reqRow.id).first();
    needsPhysician = !!(sub && sub.needs_physician);
  }
  return json({
    ok: true,
    requestId: reqRow?.id || null,
    status: reqRow?.status || "none",
    completed: reqRow?.status === "completed",
    expired: !!(reqRow && reqRow.expires_at && reqRow.expires_at < Date.now() && reqRow.status !== "completed"),
    needsPhysician,
    needsStaffReview: needsPhysician,
    staffReviewStatus: needsPhysician ? "PENDING_STAFF_REVIEW" : (reqRow?.status === "completed" ? "CLEARED" : null),
    medicalFromPacket: reqRow?.status === "completed",
  });
}

/** POST /api/register/packet — open/reuse SSI packet; refresh prefill from latest draft data */
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ref = str(b.ref, 20).toUpperCase();
  const token = str(b.token, 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);

  const loaded = await loadDraftReg(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);
  const reg = loaded.reg;

  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
  const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(reg.customer_id).first();
  if (!customer) return json({ error: "Customer missing" }, 500);

  const firstName = String(data.firstName || data.first_name || customer.first_name || "").trim();
  const lastName = String(data.lastName || data.last_name || customer.last_name || "").trim();
  const dob = String(data.dob || "").trim();
  if (!firstName || !lastName) return json({ error: "Diver name is required before forms" }, 422);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({ error: "Date of birth is required before forms" }, 422);
  let todayIso = new Date().toISOString().slice(0, 10);
  try {
    todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: env.SHOP_TZ || "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) { /* keep UTC fallback */ }
  if (dob > todayIso) return json({ error: "Date of birth cannot be in the future" }, 422);

  let registrationNumber = customer.registration_number || "";
  try { registrationNumber = await ensureRegistrationNumber(env, customer.id); } catch (_) {}

  const prefill = fromRegistrationData({
    ...data,
    firstName,
    lastName,
    dob,
    phone: customer.phone,
    email: customer.email,
    registration_number: registrationNumber,
  });

  const existing = await latestRequest(env, reg.id);
  const packetKey = packetKeyForActivity(reg.activity || data.activity || b.activity);
  const base = (env.FORMS_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");

  if (existing && existing.status === "completed") {
    return json({
      ok: true,
      alreadyCompleted: true,
      packetKey,
      registrationNumber,
      formLink: null,
      requestId: existing.id,
      status: "completed",
      prefill,
    });
  }

  const wanted = await env.DB.prepare(
    "SELECT id FROM form_packets WHERE key=? AND status='active'"
  ).bind(packetKey).first();
  const samePacket = !!(existing && wanted && Number(existing.packet_id) === Number(wanted.id));
  if (existing && existing.status !== "completed" && existing.status !== "revoked" && !samePacket) {
    await env.DB.prepare("UPDATE form_requests SET status='revoked' WHERE id=?").bind(existing.id).run();
  }

  try {
    if (existing && samePacket && existing.status !== "completed" && existing.status !== "revoked") {
      const newTok = makeToken();
      const now = Date.now();
      await env.DB.prepare(
        "UPDATE form_requests SET token_hash=?, prefill_json=?, expires_at=?, status='sent', sent_at=? WHERE id=?"
      ).bind(await sha256(newTok), JSON.stringify(prefill), now + 7 * 86400000, now, existing.id).run();
      return json({
        ok: true,
        packetKey,
        registrationNumber,
        formLink: `${base}/f/${newTok}`,
        requestId: existing.id,
        status: "sent",
        reused: true,
        prefill,
      });
    }

    const created = await createRequestForRegistration(env, {
      customerId: customer.id,
      registrationId: reg.id,
      packetKey,
      prefill,
    });
    return json({
      ok: true,
      packetKey,
      registrationNumber,
      formLink: `${base}/f/${created.token}`,
      requestId: created.requestId,
      status: "sent",
      prefill,
    });
  } catch (e) {
    return json({ error: e.message || "Forms not ready — run migrations 0004/0005", detail: String(e.message || e) }, 503);
  }
}
