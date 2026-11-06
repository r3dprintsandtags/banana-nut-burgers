import { json, isAuthed, hashIP, str, ensureSchema } from "../_shared.js";

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
  await ensureSchema(env);
  const url = new URL(request.url);
  const status = str(url.searchParams.get("status"), 20);
  const q = str(url.searchParams.get("q"), 80).toLowerCase();
  const today = await shopToday(env);

  let sql = "SELECT * FROM bookings", where = [], bind = [];
  // Live CRM tabs. Archived rows stay on the Archive tab. Counts below are global.
  if (status === "archive") where.push("ifnull(archived,0)=1");
  else if (status === "complete") { where.push("ifnull(dive_done,0)=1"); where.push("ifnull(archived,0)=0"); }
  else if (status === "today") { where.push("date=?"); where.push("ifnull(archived,0)=0"); bind.push(today); }
  else if (status === "newtoday") { where.push("date=?"); where.push("status='new'"); where.push("ifnull(archived,0)=0"); bind.push(today); }
  else if (status === "done") { where.push("status='done'"); where.push("ifnull(dive_done,0)=0"); where.push("ifnull(archived,0)=0"); }
  else if (status === "new" || status === "confirmed") { where.push("status=?"); where.push("ifnull(archived,0)=0"); bind.push(status); }
  else where.push("ifnull(archived,0)=0");
  if (q) { where.push("(lower(name) LIKE ? OR lower(contact) LIKE ? OR lower(email) LIKE ? OR lower(service) LIKE ?)"); bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 200";

  const { results } = await env.DB.prepare(sql).bind(...bind).all();

  // Attach linked check-in so Bookings tab shows dive-shop essentials without hunting Registrations.
  for (const b of results || []) {
    let reg = await env.DB.prepare(
      `SELECT r.id, r.ref, r.status, r.data, r.activity, r.planned_date, r.participants, r.booking_ref, r.manual_shop,
              c.registration_number, c.first_name, c.last_name, c.phone, c.email
       FROM registrations r JOIN customers c ON c.id = r.customer_id
       WHERE r.booking_ref=? AND r.status<>'draft'
       ORDER BY r.id DESC LIMIT 1`
    ).bind(String(b.id)).first();
    if (!reg && b.note) {
      const m = String(b.note).match(/BNB-\d{4}-[A-Z0-9]+/i);
      if (m) {
        reg = await env.DB.prepare(
          `SELECT r.id, r.ref, r.status, r.data, r.activity, r.planned_date, r.participants, r.booking_ref, r.manual_shop,
                  c.registration_number, c.first_name, c.last_name, c.phone, c.email
           FROM registrations r JOIN customers c ON c.id = r.customer_id
           WHERE upper(r.ref)=? LIMIT 1`
        ).bind(m[0].toUpperCase()).first();
      }
    }
    if (!reg) { b.checkin = null; continue; }
    let data = {};
    try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
    const medFlag = data.medNeedsReview === 1 || data.medNeedsReview === true
      || data.medHeart === "yes" || data.medLung === "yes" || data.medOther === "yes"
      || data.packetNeedsPhysician === true || data.packetNeedsPhysician === 1;
    b.checkin = {
      registrationId: reg.id,
      ref: reg.ref,
      status: reg.status,
      registrationNumber: reg.registration_number || "",
      firstName: data.firstName || reg.first_name || "",
      lastName: data.lastName || reg.last_name || "",
      preferredName: data.preferredName || "",
      dob: data.dob || "",
      phone: data.phone || reg.phone || "",
      email: data.email || reg.email || "",
      address: data.address || "",
      city: data.city || "",
      state: data.state || "",
      zip: data.zip || "",
      preferredLanguage: data.preferredLanguage || "",
      cert: data.cert || "",
      loggedDives: data.loggedDives || "",
      lastDive: data.lastDive || "",
      ownGear: data.ownGear || "",
      gearSize: data.gearSize || "",
      gearNote: data.gearNote || "",
      emergencyName: data.emergencyName || "",
      emergencyRelationship: data.emergencyRelationship || "",
      emergencyPhone: data.emergencyPhone || "",
      notes: data.notes || "",
      medHeart: data.medHeart || "",
      medLung: data.medLung || "",
      medOther: data.medOther || "",
      medOtherDetail: data.medOtherDetail || "",
      medicalFromPacket: !!(data.medicalFromPacket),
      packetCompleted: !!(data.packetCompleted),
      packetNeedsPhysician: !!(data.packetNeedsPhysician),
      medFlag: !!medFlag,
      manualShop: !!(data.manualShop || data.collectedInPerson || Number(reg.manual_shop) === 1),
      plannedDate: data.plannedDate || reg.planned_date || b.date || "",
      plannedTime: data.plannedTime || b.time || "",
      activity: data.activity || reg.activity || b.service || "",
      participants: data.participants || reg.participants || b.guests || 1,
    };
    // Surface time on the booking row itself for list formatting
    if (!b.time && b.checkin.plannedTime) b.time = b.checkin.plannedTime;
  }

  const statsRow = await env.DB.prepare(
    `SELECT COUNT(*) total,
            SUM(status='new') fresh,
            SUM(status='confirmed') confirmed,
            SUM(status='done') done,
            SUM(date=? AND ifnull(archived,0)=0) daily,
            SUM(date=? AND status='new' AND ifnull(archived,0)=0) newToday,
            SUM(status='done' AND ifnull(dive_done,0)=0 AND ifnull(archived,0)=0) inBoat,
            SUM(ifnull(dive_done,0)=1 AND ifnull(archived,0)=0) complete,
            SUM(ifnull(archived,0)=1) archive
     FROM bookings`
  ).bind(today, today).first();
  const stats = statsRow || {};
  return json({
    bookings: results,
    stats: {
      total: stats.total || 0,
      fresh: stats.fresh || 0,
      confirmed: stats.confirmed || 0,
      done: stats.done || 0,
      daily: stats.daily || 0,
      newToday: stats.newToday || 0,
      inBoat: stats.inBoat || 0,
      complete: stats.complete || 0,
      archive: stats.archive || 0,
    },
  });
}

async function shopToday(env) {
  let tz = "America/Tegucigalpa";
  try {
    const row = await env.DB.prepare("SELECT value FROM shop_settings WHERE key='timezone'").first();
    if (row?.value) tz = String(row.value);
  } catch (_) {}
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch (_) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}
