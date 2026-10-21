import { json, isAuthed, audit } from "../../../_shared.js";

// GET /api/registrations/:id/document (admin) — download signed document from private R2
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const doc = await env.DB.prepare(
    "SELECT d.*, r.ref FROM documents d JOIN registrations r ON r.id=d.registration_id WHERE d.registration_id=? ORDER BY d.id DESC LIMIT 1"
  ).bind(Number(params.id)).first();
  if (!doc) return json({ error: "No document" }, 404);
  const obj = await env.DOCS.get(doc.r2_key);
  if (!obj) return json({ error: "Document file missing" }, 404);
  await audit(env, "admin", "document.downloaded", "registration", doc.ref, doc.r2_key);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="registration-${doc.ref}.html"`,
      "Cache-Control": "no-store",
    },
  });
}
