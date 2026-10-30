/** AES-GCM encrypt/decrypt for form answers. Key: FORMS_ENC_KEY (64 hex chars = 32 bytes). */

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/\s/g, "");
  if (clean.length !== 64 || /[^0-9a-fA-F]/.test(clean)) throw new Error("FORMS_ENC_KEY must be 64 hex chars");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function importKey(env) {
  return crypto.subtle.importKey("raw", hexToBytes(env.FORMS_ENC_KEY), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64(buf) {
  let s = "";
  const u = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

function fromB64(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function encryptJson(env, obj) {
  if (!env.FORMS_ENC_KEY) throw new Error("FORMS_ENC_KEY not configured");
  const key = await importKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(obj ?? {}));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt);
  return b64(iv) + "." + b64(ct);
}

export async function decryptJson(env, blob) {
  if (!blob) return {};
  if (!env.FORMS_ENC_KEY) throw new Error("FORMS_ENC_KEY not configured");
  const [ivB, ctB] = String(blob).split(".");
  if (!ivB || !ctB) return {};
  const key = await importKey(env);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB) }, key, fromB64(ctB));
  return JSON.parse(new TextDecoder().decode(pt));
}

export function maskPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length < 4) return "****";
  return "*".repeat(Math.max(0, d.length - 4)) + d.slice(-4);
}
