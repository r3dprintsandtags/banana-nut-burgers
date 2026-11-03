/**
 * POST /api/register/invite-adult
 * Create/reuse a booking context and return a fresh registration link for another adult.
 * Body: { ref, token } — auth as the inviting registrant.
 * Returns: { ok, bookingId, bookingRef, inviteUrl, message }
 */
import { json, str, sha256 } from "../../_shared.js";
import { loadRegByRefToken } from "../../_lib/forms/party.js";

function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ref = str(b.ref, 20).toUpperCase();
  const token = str(b.token, 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);

  const loaded = await loadRegByRefToken(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);
  const reg = loaded.reg;

  let data = {};
  try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }

  // Ensure a booking exists so multiple adult registrations share one party.
  let bookingId = null;
  const existingRef = String(reg.booking_ref || "").trim();
  if (/^\d+$/.test(existingRef)) {
    const row = await env.DB.prepare("SELECT id FROM bookings WHERE id=?").bind(Number(existingRef)).first();
    if (row) bookingId = row.id;
  }
  if (!bookingId && existingRef) {
    const byNote = await env.DB.prepare(
      "SELECT id FROM bookings WHERE note LIKE ? ORDER BY id DESC LIMIT 1"
    ).bind(`%${reg.ref}%`).first();
    if (byNote) bookingId = byNote.id;
  }
  if (!bookingId) {
    const name = [data.firstName || "", data.lastName || ""].join(" ").trim() || "Party";
    const now = Date.now();
    const ins = await env.DB.prepare(
      `INSERT INTO bookings (created_at,status,name,first_name,last_name,contact,email,guests,date,time,service,divers,note,ip_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      now, "new", name, data.firstName || "", data.lastName || "",
      data.phone || "", data.email || "",
      Math.min(20, Math.max(1, parseInt(data.participants || reg.participants, 10) || 1)),
      data.plannedDate || reg.planned_date || "", str(data.plannedTime, 20),
      data.activity || reg.activity || "", "[]",
      `Party for ${reg.ref}`, ""
    ).run();
    bookingId = ins.meta.last_row_id;
    await env.DB.prepare("UPDATE registrations SET booking_ref=?, updated_at=? WHERE id=?")
      .bind(String(bookingId), now, reg.id).run();
  } else if (String(reg.booking_ref || "") !== String(bookingId)) {
    await env.DB.prepare("UPDATE registrations SET booking_ref=?, updated_at=? WHERE id=?")
      .bind(String(bookingId), Date.now(), reg.id).run();
  }

  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/register.html?booking=${bookingId}&fresh=1`;
  const shortPath = `/register.html?booking=${bookingId}&fresh=1`;

  return json({
    ok: true,
    bookingId,
    bookingRef: String(bookingId),
    inviteUrl,
    shortPath,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inviteUrl)}`,
    message: "Each adult completes their own registration.",
    // Opaque nonce reserved for future single-use invites (not required to open the link today).
    inviteNonce: makeToken(),
  });
}
