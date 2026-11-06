// Shared helpers for Pages Functions. Files starting with "_" are not routes.

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });

const enc = new TextEncoder();

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashIP(secret, ip) {
  if (!ip) return "";
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(secret + ":" + ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Session cookie: bnb_admin=<exp>.<hmac(exp)>  (7 days)
export async function makeSession(env) {
  const exp = String(Date.now() + 7 * 24 * 3600 * 1000);
  const sig = await hmac(env.SESSION_SECRET || "", exp);
  return { value: `${exp}.${sig}`, maxAge: 7 * 24 * 3600 };
}

export async function isAuthed(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return false;
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)bnb_admin=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, exp);
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const str = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export const normalizePhone = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 8) d = "504" + d; // Honduras local number
  return d.slice(0, 15);
};

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function audit(env, actor, action, entity, entityId, details = "") {
  try {
    await env.DB.prepare("INSERT INTO audit_log (created_at,actor,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)")
      .bind(Date.now(), actor, action, entity, String(entityId ?? ""), String(details).slice(0, 500)).run();
  } catch (e) { /* audit must never break the main flow */ }
}

export function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// True when staff recorded that forms and data were collected on paper at the shop.
export function isManualShopRegistration(reg, data = null) {
  if (!reg) return false;
  if (Number(reg.manual_shop) === 1 || reg.manual_shop === true) return true;
  let parsed = data;
  if (!parsed) {
    try { parsed = JSON.parse(reg.data || "{}"); } catch (e) { parsed = {}; }
  }
  return parsed?.manualShop === true || parsed?.collectedInPerson === true;
}

// Checklist computed from a registration row (+ signature/consent presence).
// Never counts an unsigned or unsubmitted digital item as complete.
// In-person shop registrations are the exception: paper forms were already collected.
export function checklist(reg, { hasSignature = false, hasDeclaration = false } = {}) {
  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch (e) {}
  const manual = isManualShopRegistration(reg, data);
  const done = (ok) => (ok ? "complete" : "action_required");
  return {
    activity: done(!!(reg.activity || data.activity)),
    diverInfo: done(!!(data.firstName || reg.first_name) && !!(data.phone || reg.phone)),
    forms: done(manual || (reg.status !== "draft" && hasDeclaration)),
    waivers: done(manual || (hasSignature && hasDeclaration)),
    safety: "pending_approved_form", // no business-approved medical form exists yet — never auto-complete
    review: reg.status === "draft" && !manual ? "not_started" : "complete",
  };
}

let schemaReady = false;
export async function ensureSchema(env) {
  if (!env.DB || schemaReady) return;
  const info = await env.DB.prepare("PRAGMA table_info(registrations)").all();
  const names = new Set((info.results || []).map((c) => c.name));
  if (!names.has("archived")) {
    await env.DB.prepare("ALTER TABLE registrations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!names.has("shared_address_json")) {
    await env.DB.prepare("ALTER TABLE registrations ADD COLUMN shared_address_json TEXT NOT NULL DEFAULT '{}'").run();
  }
  if (!names.has("shared_emergency_json")) {
    await env.DB.prepare("ALTER TABLE registrations ADD COLUMN shared_emergency_json TEXT NOT NULL DEFAULT '{}'").run();
  }
  if (!names.has("party_complete")) {
    await env.DB.prepare("ALTER TABLE registrations ADD COLUMN party_complete INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!names.has("manual_shop")) {
    await env.DB.prepare("ALTER TABLE registrations ADD COLUMN manual_shop INTEGER NOT NULL DEFAULT 0").run();
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS schedule_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      reservation_number TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      full_name TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'cancel',
      preferred_date TEXT NOT NULL DEFAULT '',
      registration_id INTEGER
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL,
      contact_id INTEGER,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      dob TEXT NOT NULL DEFAULT '',
      is_minor INTEGER NOT NULL DEFAULT 0,
      relationship TEXT NOT NULL DEFAULT 'self',
      mode TEXT NOT NULL DEFAULT 'here',
      role TEXT NOT NULL DEFAULT 'guest',
      guardian_participant_id INTEGER,
      guardian_json TEXT NOT NULL DEFAULT '{}',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_started',
      registration_number TEXT NOT NULL DEFAULT '',
      youth_addendum_status TEXT NOT NULL DEFAULT 'n/a',
      valid_until INTEGER,
      same_address INTEGER NOT NULL DEFAULT 1,
      same_emergency INTEGER NOT NULL DEFAULT 1,
      address_json TEXT NOT NULL DEFAULT '{}',
      emergency_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      remove_reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  try {
    const fr = await env.DB.prepare("PRAGMA table_info(form_requests)").all();
    const frNames = new Set((fr.results || []).map((c) => c.name));
    if (!frNames.has("participant_id")) {
      await env.DB.prepare("ALTER TABLE form_requests ADD COLUMN participant_id INTEGER").run();
    }
  } catch (_) {}
  try {
    const fs = await env.DB.prepare("PRAGMA table_info(form_submissions)").all();
    const fsNames = new Set((fs.results || []).map((c) => c.name));
    if (!fsNames.has("participant_id")) {
      await env.DB.prepare("ALTER TABLE form_submissions ADD COLUMN participant_id INTEGER").run();
    }
  } catch (_) {}
  schemaReady = true;
}

export function makeRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `BNB-${new Date().getFullYear()}-` + [...bytes].map((b) => chars[b % chars.length]).join("");
}
