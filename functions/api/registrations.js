import { json, isAuthed, str, checklist, ensureSchema } from "../_shared.js";

// GET /api/registrations?q=&status= (admin) — search by name, phone, or ref
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  const url = new URL(request.url);
  const q = str(url.searchParams.get("q"), 80);
  const status = str(url.searchParams.get("status"), 30);
  const queue = url.searchParams.get("queue") === "1";
  const qDigits = q.replace(/\D/g, "");
  const cols = new Set(((await env.DB.prepare("PRAGMA table_info(registrations)").all()).results || []).map((c) => c.name));
  const regNum = cols.has("registration_number") ? " OR lower(ifnull(r.registration_number,'')) LIKE ?" : "";

  let sql = `SELECT r.*, c.first_name, c.last_name, c.preferred_name, c.phone, c.email,
             EXISTS(SELECT 1 FROM signatures s WHERE s.registration_id=r.id) AS has_signature,
             EXISTS(SELECT 1 FROM consents k WHERE k.registration_id=r.id AND k.purpose='accuracy_declaration' AND k.granted=1) AS has_declaration
             FROM registrations r JOIN customers c ON c.id = r.customer_id`;
  const where = [], bind = [];
  if (queue) where.push("r.status IN ('submitted','under_review') AND ifnull(r.archived,0)=0");
  else if (!q) where.push("ifnull(r.archived,0)=0");
  if (url.searchParams.get("manual") === "1") {
    where.push("(ifnull(r.manual_shop,0)=1 OR lower(ifnull(r.data,'')) LIKE '%\"manualshop\":true%')");
  } else if (["draft", "submitted", "under_review", "approved", "rejected", "flagged", "corrections_requested", "complete"].includes(status)) {
    where.push("r.status=?"); bind.push(status);
  }
  if (q) {
    where.push(`(lower(c.first_name||' '||c.last_name) LIKE ? OR c.phone LIKE ? OR lower(r.ref) LIKE ? OR lower(c.email) LIKE ? OR lower(ifnull(r.data,'')) LIKE ?${regNum})`);
    bind.push(`%${q.toLowerCase()}%`, `%${qDigits || q}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    if (regNum) bind.push(`%${q.toLowerCase()}%`);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY r.created_at DESC LIMIT 200";
  const { results } = await env.DB.prepare(sql).bind(...bind).all();
  for (const r of results) r.checklist = checklist(r, { hasSignature: !!r.has_signature, hasDeclaration: !!r.has_declaration });
  const stats = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(status='draft') drafts, SUM(status='submitted') submitted, SUM(status='under_review') under_review, SUM(status='approved') approved, SUM(status='flagged') flagged, SUM(status='corrections_requested') corrections, SUM(ifnull(manual_shop,0)=1) manual FROM registrations"
  ).first();
  return json({ registrations: results, stats: stats || {} });
}
