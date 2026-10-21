import { json, isAuthed, str } from "../_shared.js";

// GET /api/registrations?q=&status= (admin) — search by name, phone, or ref
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const q = str(url.searchParams.get("q"), 80);
  const status = str(url.searchParams.get("status"), 30);
  const qDigits = q.replace(/\D/g, "");

  let sql = `SELECT r.*, c.first_name, c.last_name, c.preferred_name, c.phone, c.email
             FROM registrations r JOIN customers c ON c.id = r.customer_id`;
  const where = [], bind = [];
  if (["submitted", "under_review", "approved", "rejected", "flagged", "corrections_requested"].includes(status)) { where.push("r.status=?"); bind.push(status); }
  if (q) {
    where.push("(lower(c.first_name||' '||c.last_name) LIKE ? OR c.phone LIKE ? OR lower(r.ref) LIKE ? OR lower(c.email) LIKE ?)");
    bind.push(`%${q.toLowerCase()}%`, `%${qDigits || q}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY r.created_at DESC LIMIT 200";
  const { results } = await env.DB.prepare(sql).bind(...bind).all();
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(status='submitted') submitted, SUM(status='under_review') under_review, SUM(status='approved') approved, SUM(status='flagged') flagged, SUM(status='corrections_requested') corrections FROM registrations"
  ).first();
  return json({ registrations: results, stats: stats || {} });
}
