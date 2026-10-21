import { json, isAuthed } from "../_shared.js";

// GET /api/audit (admin) — recent audit trail
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const { results } = await env.DB.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
  return json({ audit: results });
}
