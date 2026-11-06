import { json } from "../../../_shared.js";

// GET /api/landing/file/:name — public. Homepage <img> tags load uploaded slides from here.
export async function onRequestGet({ env, params }) {
  if (!env.DOCS) return json({ error: "Not configured" }, 503);
  const name = String(params.name || "");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || name.includes("..")) return json({ error: "Not found" }, 404);
  const obj = await env.DOCS.get(`shops/bnb/landing/${name}`);
  if (!obj) return json({ error: "Not found" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}
