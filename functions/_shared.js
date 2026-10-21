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

export function makeRef() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `BNB-${new Date().getFullYear()}-` + [...bytes].map((b) => chars[b % chars.length]).join("");
}
