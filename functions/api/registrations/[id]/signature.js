import { json, isAuthed, audit } from "../../../_shared.js";

// GET /api/registrations/:id/signature (admin) — view signature image from private R2
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const sig = await env.DB.prepare(
    "SELECT s.*, r.ref FROM signatures s JOIN registrations r ON r.id=s.registration_id WHERE s.registration_id=? ORDER BY s.id DESC LIMIT 1"
  ).bind(Number(params.id)).first();
  if (!sig) return json({ error: "No signature" }, 404);
  const obj = await env.DOCS.get(sig.r2_key);
  if (!obj) return json({ error: "Signature file missing" }, 404);
  await audit(env, "admin", "signature.viewed", "registration", sig.ref);
  return new Response(obj.body, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
