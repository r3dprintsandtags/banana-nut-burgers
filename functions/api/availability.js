import { json, str } from "../_shared.js";

/** Soft caps — no admin config needed. Staff can still overbook via walk-ins. */
const SLOT_CAP = 8;

function slotKey(date, time) {
  return `${date}|${String(time || "").trim()}`;
}

/**
 * GET /api/availability?month=YYYY-MM
 * Returns booking counts per date and per date+time from real Bookings rows.
 */
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const u = new URL(request.url);
  const month = str(u.searchParams.get("month"), 7); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: "month=YYYY-MM required" }, 422);
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const to = `${month}-${String(last).padStart(2, "0")}`;

  let rows = [];
  try {
    const q = await env.DB.prepare(
      `SELECT date, time, guests, status FROM bookings
       WHERE date >= ? AND date <= ?
         AND status IN ('new','confirmed')`
    ).bind(from, to).all();
    rows = q.results || [];
  } catch (e) {
    return json({ ok: true, month, slotCap: SLOT_CAP, days: {}, slots: {} });
  }

  const days = {};
  const slots = {};
  for (const r of rows) {
    const d = String(r.date || "").slice(0, 10);
    if (!d) continue;
    const g = Math.max(1, Number(r.guests) || 1);
    days[d] = (days[d] || 0) + g;
    const sk = slotKey(d, r.time);
    slots[sk] = (slots[sk] || 0) + g;
  }

  return json({
    ok: true,
    month,
    slotCap: SLOT_CAP,
    dayCap: SLOT_CAP * 5,
    days,
    slots,
  });
}
