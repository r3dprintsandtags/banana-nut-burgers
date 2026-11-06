import { json, isAuthed, ensureSchema } from "../../_shared.js";

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// POST /api/landing/upload  multipart field "file"  — admin only.
// Returns {src} shaped for js/landing.js safePath: api/landing/file/<name>
export async function onRequestPost({ request, env }) {
  if (!env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "multipart required" }, 400);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Bad request" }, 400); }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") return json({ error: "file required" }, 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 8_000_000) return json({ error: "Image size invalid" }, 422);
  const ext = TYPES[file.type] || sniff(bytes);
  if (!ext) return json({ error: "Use a JPEG, PNG, WebP, or GIF" }, 422);
  const name = `landing-${Date.now().toString(36)}-${rand()}.${ext}`;
  const type = Object.keys(TYPES).find((k) => TYPES[k] === ext) || file.type;
  await env.DOCS.put(`shops/bnb/landing/${name}`, bytes, { httpMetadata: { contentType: type } });
  return json({ src: `api/landing/file/${name}` });
}

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  return "";
}

function rand() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
