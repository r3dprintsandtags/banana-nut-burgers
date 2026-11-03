/**
 * GET /api/bookings/:id/invite-context — public, non-personal booking context for invite links.
 * Returns activity/date/time only — never names, medical, or contact info.
 */
import { json } from "../../../_shared.js";

export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  const bookingId = Number(params.id);
  if (!bookingId) return json({ error: "Bad id" }, 400);
  const booking = await env.DB.prepare(
    "SELECT id, date, time, service, guests, status FROM bookings WHERE id=?"
  ).bind(bookingId).first();
  if (!booking) return json({ error: "Not found" }, 404);

  // Status-only list of other adults on this booking (no medical / answers).
  const { results: regs } = await env.DB.prepare(
    `SELECT r.id, r.ref, r.status, r.party_complete, c.first_name
     FROM registrations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.booking_ref=? AND r.status<>'draft'
     ORDER BY r.id ASC`
  ).bind(String(bookingId)).all();

  const adults = [];
  for (const r of regs || []) {
    let status = "in_progress";
    if (r.party_complete) status = "complete";
    else if (r.status === "submitted" || r.status === "approved" || r.status === "complete") status = "complete";
    else if (r.status === "draft") status = "not_started";
    adults.push({
      firstName: String(r.first_name || "").slice(0, 1) ? String(r.first_name || "").charAt(0) + "." : "Adult",
      status, // not_started | in_progress | complete — never answers
    });
  }

  return json({
    ok: true,
    booking: {
      id: booking.id,
      date: booking.date || "",
      time: booking.time || "",
      activity: booking.service || "",
      guests: booking.guests || 1,
    },
    message: "Each adult completes their own registration.",
    otherAdults: adults,
  });
}
