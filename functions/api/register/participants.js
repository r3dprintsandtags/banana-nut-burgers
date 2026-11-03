/**
 * GET/POST /api/register/participants
 * Party roster for a registration (draft token auth).
 */
import { json, str, ensureSchema } from "../../_shared.js";
import {
  loadRegByRefToken,
  ensurePrimaryParticipant,
  upsertParticipant,
  removeParticipant,
  partyDashboard,
  listParticipants,
  suggestPastPeople,
} from "../../_lib/forms/party.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  await ensureSchema(env);
  const u = new URL(request.url);
  const ref = str(u.searchParams.get("ref"), 20);
  const token = str(u.searchParams.get("token"), 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);
  const loaded = await loadRegByRefToken(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);

  const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(loaded.reg.customer_id).first();
  let data = {};
  try { data = JSON.parse(loaded.reg.data || "{}"); } catch { data = {}; }
  try {
    await ensurePrimaryParticipant(env, loaded.reg, customer || {}, data);
  } catch (e) {
    return json({ error: e.message || "Could not create the primary registrant", code: e.code || undefined }, e.status || 500);
  }

  try {
    const dash = await partyDashboard(env, loaded.reg, { staff: false });
    return json({ ok: true, ...dash });
  } catch (e) {
    return json({ error: e.message || "Party not available — run migration 0014" }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  await ensureSchema(env);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ref = str(b.ref, 20);
  const token = str(b.token, 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);
  const loaded = await loadRegByRefToken(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);
  const reg = loaded.reg;

  const action = String(b.action || "upsert").toLowerCase();

  try {
    if (action === "remove") {
      await removeParticipant(env, reg, Number(b.id), b.reason || "");
      const dash = await partyDashboard(env, reg, { staff: false });
      return json({ ok: true, ...dash });
    }

    if (action === "shared") {
      const now = Date.now();
      const addr = b.sharedAddress && typeof b.sharedAddress === "object" ? b.sharedAddress : {};
      const emg = b.sharedEmergency && typeof b.sharedEmergency === "object" ? b.sharedEmergency : {};
      await env.DB.prepare(
        "UPDATE registrations SET shared_address_json=?, shared_emergency_json=?, updated_at=? WHERE id=?"
      ).bind(JSON.stringify(addr), JSON.stringify(emg), now, reg.id).run();
      const fresh = await env.DB.prepare("SELECT * FROM registrations WHERE id=?").bind(reg.id).first();
      const dash = await partyDashboard(env, fresh, { staff: false });
      return json({ ok: true, ...dash });
    }

    if (action === "youth_received") {
      // staff-only normally; allow primary draft token for kiosk "mark received" when shop hands paper
      const id = Number(b.id);
      await env.DB.prepare(
        "UPDATE participants SET youth_addendum_status='received', status=CASE WHEN status='waiting_youth_addendum' THEN 'complete' ELSE status END, updated_at=? WHERE id=? AND registration_id=?"
      ).bind(Date.now(), id, reg.id).run();
      const dash = await partyDashboard(env, reg, { staff: false });
      return json({ ok: true, ...dash });
    }

    if (action === "suggest") {
      const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(reg.customer_id).first();
      let data = {};
      try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
      const suggestions = await suggestPastPeople(env, reg, {
        phone: b.phone || customer?.phone || data.phone || "",
        email: b.email || customer?.email || data.email || "",
      });
      return json({ ok: true, suggestions });
    }

    // default upsert
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(reg.customer_id).first();
    let data = {};
    try { data = JSON.parse(reg.data || "{}"); } catch { data = {}; }
    await ensurePrimaryParticipant(env, reg, customer, data);
    const row = await upsertParticipant(env, reg, b, { primaryCustomer: customer });
    const dash = await partyDashboard(env, reg, { staff: false });
    return json({ ok: true, participant: dash.participants.find((p) => p.id === row.id), ...dash });
  } catch (e) {
    return json({ error: e.message || "Failed", code: e.code || undefined, existingId: e.existingId }, e.status || 500);
  }
}
