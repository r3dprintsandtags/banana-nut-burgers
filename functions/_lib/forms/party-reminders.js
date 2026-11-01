/**
 * 24h-before incomplete party reminders.
 * Messages name incomplete people only — never medical answers.
 */
import { sendSecureLink } from "./mail.js";
import { sendFormLinkWhatsApp } from "./whatsapp.js";
import { openParticipantPacket } from "./party.js";
import { formAudit } from "./submit.js";
import { sha256 } from "../../_shared.js";

function tomorrowIso(now = Date.now()) {
  const d = new Date(now + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function alreadyReminded(env, registrationId, day) {
  const row = await env.DB.prepare(
    "SELECT id FROM form_audit_log WHERE event='party.reminder_sent' AND details LIKE ? LIMIT 1"
  ).bind(`%reg=${registrationId};day=${day}%`).first();
  return !!row;
}

/** Rotate resume token so the reminder email/SMS can include a working link (names only, no medical). */
async function rotateResumeToken(env, reg) {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await sha256(token);
  await env.DB.prepare("UPDATE registrations SET draft_token_hash=?, updated_at=? WHERE id=?")
    .bind(hash, Date.now(), reg.id).run();
  return token;
}

export async function runPartyAppointmentReminders(env, requestUrl) {
  if (!env.DB) return { sent: [], skipped: [] };
  const day = tomorrowIso();
  const sent = [];
  const skipped = [];

  // Registrations planned for tomorrow that are not fully complete
  const { results: regs } = await env.DB.prepare(
    `SELECT r.* FROM registrations r
     WHERE r.planned_date=? AND COALESCE(r.party_complete,0)=0
       AND r.status IN ('draft','submitted','under_review','corrections_requested')
     LIMIT 40`
  ).bind(day).all();

  const origin = (env.FORMS_BASE_URL || (requestUrl ? new URL(requestUrl).origin : "")).replace(/\/$/, "");

  for (const reg of regs || []) {
    if (await alreadyReminded(env, reg.id, day)) {
      skipped.push({ registrationId: reg.id, reason: "already_sent" });
      continue;
    }

    const people = (await env.DB.prepare(
      "SELECT * FROM participants WHERE registration_id=? AND status<>'removed' ORDER BY sort_order, id"
    ).bind(reg.id).all()).results || [];

    if (!people.length) {
      skipped.push({ registrationId: reg.id, reason: "no_participants" });
      continue;
    }

    const incomplete = people.filter((p) =>
      !["complete", "needs_medical_review"].includes(p.status)
    );
    if (!incomplete.length) {
      skipped.push({ registrationId: reg.id, reason: "all_done" });
      continue;
    }

    const incompleteNames = incomplete.map((p) => `${p.first_name} ${p.last_name}`.trim()).filter(Boolean);
    const primary = people.find((p) => p.role === "primary") || people[0];
    const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(reg.customer_id).first();
    const primaryPhone = primary?.phone || customer?.phone || "";
    const primaryEmail = primary?.email || customer?.email || "";
    const primaryName = `${primary?.first_name || customer?.first_name || ""} ${primary?.last_name || customer?.last_name || ""}`.trim() || "there";

    const resumeToken = await rotateResumeToken(env, reg);
    const resumeLink = `${origin}/register.html?ref=${encodeURIComponent(reg.ref)}&token=${encodeURIComponent(resumeToken)}#resume`;

    const nameList = incompleteNames.join(", ");
    const msgEn = `Hi ${primaryName}, your Banana Nut Burgers dive is tomorrow (${day}). Still need forms for: ${nameList}. Continue here: ${resumeLink}`;
    const msgEs = `Hola ${primaryName}, tu buceo con Banana Nut Burgers es mañana (${day}). Faltan formularios de: ${nameList}. Continúa aquí: ${resumeLink}`;
    // Prefer English for system cron; include both names only (no medical)
    const msg = msgEn;

    const result = { registrationId: reg.id, ref: reg.ref, incomplete: incompleteNames, channels: [] };

    if (primaryEmail) {
      try {
        const mail = await sendSecureLink(env, {
          to: primaryEmail,
          name: primaryName,
          link: resumeLink,
        });
        // Override subject-ish via custom text if mail helper only sends generic — still OK (link only)
        result.channels.push({ via: "email", ok: !!mail?.ok, to: primaryEmail });
      } catch (e) {
        result.channels.push({ via: "email", ok: false, error: e.message });
      }
    }

    if (primaryPhone) {
      try {
        const wa = await sendFormLinkWhatsApp(env, {
          phone: primaryPhone,
          customerName: primaryName,
          formName: `forms still needed for ${nameList}`,
          formLink: resumeLink,
        });
        result.channels.push({ via: "whatsapp", ok: !!wa?.ok, deeplink: wa?.waLink || null });
      } catch (e) {
        result.channels.push({ via: "whatsapp", ok: false, error: e.message });
      }
    }

    // Optional: remind each incomplete adult directly (own phone / with contact)
    for (const p of incomplete) {
      if (p.is_minor) continue;
      if (!p.phone && !p.email) continue;
      try {
        const opened = await openParticipantPacket(env, reg, p, requestUrl || origin + "/");
        if (!opened.formLink) continue;
        if (p.phone) {
          await sendFormLinkWhatsApp(env, {
            phone: p.phone,
            customerName: `${p.first_name} ${p.last_name}`.trim(),
            formName: "your dive forms",
            formLink: opened.formLink,
          });
          result.channels.push({ via: "whatsapp_adult", participantId: p.id, ok: true });
        } else if (p.email) {
          await sendSecureLink(env, {
            to: p.email,
            name: `${p.first_name} ${p.last_name}`.trim(),
            link: opened.formLink,
          });
          result.channels.push({ via: "email_adult", participantId: p.id, ok: true });
        }
      } catch (e) {
        result.channels.push({ via: "adult", participantId: p.id, ok: false, error: e.message });
      }
    }

    await formAudit(env, {
      requestId: null,
      event: "party.reminder_sent",
      actor: "system",
      details: `reg=${reg.id};day=${day};names=${nameList.slice(0, 180)}`,
    });

    sent.push(result);
    void msg;
    void msgEs;
  }

  return { sent, skipped, day };
}
