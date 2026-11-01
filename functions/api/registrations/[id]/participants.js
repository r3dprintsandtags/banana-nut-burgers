/**
 * POST /api/registrations/:id/participants — shop actions on party roster
 * { action: youth_received|add|remove|send, ... }
 */
import { json, isAuthed, str, audit, sha256 } from "../../../_shared.js";
import {
  upsertParticipant,
  removeParticipant,
  partyDashboard,
  openParticipantPacket,
} from "../../../_lib/forms/party.js";
import { sendFormLinkWhatsApp } from "../../../_lib/forms/whatsapp.js";

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE id=?").bind(Number(params.id)).first();
  if (!reg) return json({ error: "Not found" }, 404);
  try {
    const dash = await partyDashboard(env, reg, { staff: true });
    return json({ ok: true, ...dash });
  } catch (e) {
    return json({ error: e.message || "Party unavailable" }, 503);
  }
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const reg = await env.DB.prepare("SELECT * FROM registrations WHERE id=?").bind(Number(params.id)).first();
  if (!reg) return json({ error: "Not found" }, 404);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const action = String(b.action || "").toLowerCase();

  try {
    if (action === "youth_received") {
      const id = Number(b.id);
      await env.DB.prepare(
        "UPDATE participants SET youth_addendum_status='received', status=CASE WHEN status='waiting_youth_addendum' THEN 'complete' ELSE status END, updated_at=? WHERE id=? AND registration_id=?"
      ).bind(Date.now(), id, reg.id).run();
      await audit(env, "admin", "participant.youth_received", "participant", String(id));
      const dash = await partyDashboard(env, reg, { staff: true });
      return json({ ok: true, ...dash });
    }

    if (action === "remove") {
      await removeParticipant(env, reg, Number(b.id), b.reason || "removed by shop");
      await audit(env, "admin", "participant.removed", "participant", String(b.id));
      const dash = await partyDashboard(env, reg, { staff: true });
      return json({ ok: true, ...dash });
    }

    if (action === "add" || action === "upsert") {
      const row = await upsertParticipant(env, reg, b);
      await audit(env, "admin", "participant.upsert", "participant", String(row.id));
      const dash = await partyDashboard(env, reg, { staff: true });
      return json({ ok: true, participant: dash.participants.find((p) => p.id === row.id), ...dash });
    }

    if (action === "send") {
      const p = await env.DB.prepare(
        "SELECT * FROM participants WHERE id=? AND registration_id=? AND status<>'removed'"
      ).bind(Number(b.id), reg.id).first();
      if (!p) return json({ error: "Not found" }, 404);
      if (p.is_minor) return json({ error: "Minors complete with guardian" }, 422);
      const opened = await openParticipantPacket(env, reg, p, request.url);
      if (opened.formLink && p.phone) {
        try {
          await sendFormLinkWhatsApp(env, {
            phone: p.phone,
            customerName: `${p.first_name} ${p.last_name}`.trim(),
            formName: "Dive registration forms",
            formLink: opened.formLink,
          });
        } catch (_) {}
      }
      await audit(env, "admin", "participant.send_link", "participant", String(p.id));
      return json({ ok: true, formLink: opened.formLink || null, alreadyCompleted: !!opened.alreadyCompleted });
    }

    if (action === "kiosk_link") {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      await env.DB.prepare("UPDATE registrations SET draft_token_hash=?, updated_at=? WHERE id=?")
        .bind(await sha256(token), Date.now(), reg.id).run();
      const origin = (env.FORMS_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
      const kioskUrl = `${origin}/register.html?kiosk=1&ref=${encodeURIComponent(reg.ref)}&token=${encodeURIComponent(token)}`;
      await audit(env, "admin", "registration.kiosk_link", "registration", reg.ref);
      return json({ ok: true, kioskUrl, ref: reg.ref, token });
    }

    return json({ error: "Unknown action" }, 422);
  } catch (e) {
    return json({ error: e.message || "Failed" }, e.status || 500);
  }
}
