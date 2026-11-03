/**
 * GET /api/bookings/:id/party — shop Party view: every registration under this booking,
 * with adults and nested minors, status chips, and form summary (no medical answers).
 */
import { json, isAuthed } from "../../../_shared.js";
import { listParticipants, participantPublic } from "../../../_lib/forms/party.js";

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const bookingId = Number(params.id);
  if (!bookingId) return json({ error: "Bad id" }, 400);

  const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(bookingId).first();
  if (!booking) return json({ error: "Not found" }, 404);

  const { results: regs } = await env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.phone, c.email, c.registration_number AS customer_reg_num
     FROM registrations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.booking_ref=? OR r.booking_ref=?
     ORDER BY r.id ASC`
  ).bind(String(bookingId), String(booking.id)).all();

  // Also match by booking note containing reg ref
  let list = regs || [];
  if (booking.note) {
    const m = String(booking.note).match(/BNB-\d{4}-[A-Z0-9]+/gi) || [];
    for (const ref of m) {
      const row = await env.DB.prepare(
        `SELECT r.*, c.first_name, c.last_name, c.phone, c.email, c.registration_number AS customer_reg_num
         FROM registrations r JOIN customers c ON c.id = r.customer_id WHERE upper(r.ref)=?`
      ).bind(ref.toUpperCase()).first();
      if (row) list.push(row);
    }
  }

  // Deduplicate
  const seen = new Set();
  list = list.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const party = [];
  for (const reg of list) {
    let people = [];
    try { people = await listParticipants(env, reg.id); } catch { people = []; }
    const mapped = [];
    for (const p of people) {
      const sub = await env.DB.prepare(
        `SELECT needs_physician, registration_number FROM form_submissions
         WHERE participant_id=? ORDER BY id DESC LIMIT 1`
      ).bind(p.id).first().catch(() => null);
      mapped.push(participantPublic(p, { includeMedical: false, submission: sub }));
    }
    const adult = mapped.find((p) => p.role === "primary") || mapped.find((p) => !p.isMinor) || null;
    const minors = mapped.filter((p) => p.isMinor);
    let data = {};
    try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
    party.push({
      registrationId: reg.id,
      ref: reg.ref,
      status: reg.status,
      activity: reg.activity || data.activity || booking.service || "",
      plannedDate: reg.planned_date || data.plannedDate || booking.date || "",
      adult,
      minors,
      people: mapped,
      packetCompleted: !!data.packetCompleted || mapped.every((p) => p.status === "complete" || p.status === "needs_medical_review"),
      partyComplete: !!reg.party_complete,
    });
  }

  const registeredPeople = party.reduce((n, r) => n + (r.people?.length || 0), 0);
  return json({
    ok: true,
    booking: {
      id: booking.id,
      name: booking.name,
      date: booking.date,
      time: booking.time,
      service: booking.service,
      guests: booking.guests,
      status: booking.status,
    },
    headcount: booking.guests || registeredPeople,
    registeredCount: registeredPeople,
    registrations: party,
  });
}
