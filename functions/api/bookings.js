import { json, isAuthed, hashIP, str } from "../_shared.js";

// POST /api/bookings  (public) — save a booking request
export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (str(b.hp, 50)) return json({ ok: true }, 201);

  const name = str(b.name, 120) || [str(b.firstName, 60), str(b.lastName, 60)].join(" ").trim();
  const contact = str(b.contact, 120);
  if (!name || !contact) return json({ error: "Name and contact are required" }, 422);

  const email = str(b.email, 120);
  if (email && !/.+@.+\..+/.test(email)) return json({ error: "Invalid email" }, 422);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.date, 10)) ? str(b.date, 10)
    : /^\d{4}-\d{2}-\d{2}$/.test(str(b.arrival, 10)) ? str(b.arrival, 10) : "";
  if (!date) return json({ error: "A booking date is required" }, 422);

  // Light rate limit: max 5 requests per IP hash per 10 minutes
  const ipHash = await hashIP(env.SESSION_SECRET || "bnb", request.headers.get("CF-Connecting-IP") || "");
  if (ipHash) {
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM bookings WHERE ip_hash=? AND created_at>?"
    ).bind(ipHash, Date.now() - 10 * 60 * 1000).all();
    if (results?.[0]?.n >= 5) return json({ error: "Too many requests, please WhatsApp us instead" }, 429);
  }

  const divers = Array.isArray(b.divers) ? b.divers.slice(0, 2) : [];
  const cruise = b.cruise && typeof b.cruise === "object" ? b.cruise : null;

  const res = await env.DB.prepare(
    `INSERT INTO bookings (created_at,name,first_name,last_name,contact,email,guests,date,time,service,divers,cruise,note,ip_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    Date.now(), name, str(b.firstName, 60), str(b.lastName, 60), contact, email,
    Math.min(12, Math.max(1, parseInt(b.guests, 10) || 1)), date, str(b.time, 20),
    str(b.service, 80), JSON.stringify(divers).slice(0, 4000),
    cruise ? JSON.stringify(cruise).slice(0, 1000) : null, str(b.note, 500), ipHash
  ).run();

  // Optional owner notification: set BOOKING_WEBHOOK_URL secret (Zapier/Make/n8n/etc.)
  if (env.BOOKING_WEBHOOK_URL) {
    waitUntil(fetch(env.BOOKING_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: res.meta.last_row_id, name, contact, email, date, time: str(b.time, 20), service: str(b.service, 80) }),
    }).catch(() => {}));
  }
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}

// GET /api/bookings?status=&q=  (admin only) — list + stats
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  const status = ["new", "confirmed", "done"].includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "";
  const q = str(url.searchParams.get("q"), 80).toLowerCase();

  let sql = "SELECT * FROM bookings", where = [], bind = [];
  if (status) { where.push("status=?"); bind.push(status); }
  if (q) { where.push("(lower(name) LIKE ? OR lower(contact) LIKE ? OR lower(email) LIKE ? OR lower(service) LIKE ?)"); bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await env.DB.prepare(sql).bind(...bind).all();
  const statsRow = await env.DB.prepare(
    "SELECT COUNT(*) total, SUM(status='new') fresh, SUM(status='confirmed') confirmed, SUM(status='done') done FROM bookings"
  ).first();
  return json({ bookings: results, stats: statsRow || { total: 0, fresh: 0, confirmed: 0, done: 0 } });
}
