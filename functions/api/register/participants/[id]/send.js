/** POST /api/register/participants/:id/send — email / SMS / WhatsApp secure link (no medical content) */
import { json, str } from "../../../../_shared.js";
import { loadRegByRefToken, openParticipantPacket } from "../../../../_lib/forms/party.js";
import { sendFormLinkWhatsApp } from "../../../../_lib/forms/whatsapp.js";
import { sendSecureLink } from "../../../../_lib/forms/mail.js";

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ref = str(b.ref, 20);
  const token = str(b.token, 80);
  const via = String(b.via || "whatsapp").toLowerCase(); // whatsapp | sms | email | copy
  if (!ref || !token) return json({ error: "ref and token required" }, 422);

  const loaded = await loadRegByRefToken(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);

  const pid = Number(params.id);
  const participant = await env.DB.prepare(
    "SELECT * FROM participants WHERE id=? AND registration_id=? AND status<>'removed'"
  ).bind(pid, loaded.reg.id).first();
  if (!participant) return json({ error: "Participant not found" }, 404);
  if (participant.is_minor) return json({ error: "Minors complete forms with their guardian on this registration" }, 422);

  let opened;
  try {
    opened = await openParticipantPacket(env, loaded.reg, participant, request.url);
  } catch (e) {
    return json({ error: e.message || "Could not create link" }, e.status || 500);
  }
  if (!opened.formLink) {
    return json({ ok: true, alreadyCompleted: true, status: opened.status });
  }

  const name = `${participant.first_name} ${participant.last_name}`.trim();
  const shop = env.SHOP_NAME || "Banana Nut Burgers Dive Shop";
  // Message must NOT include medical info — only invite + link
  const msgEn = `Hi ${name}, please complete your dive forms for ${shop}: ${opened.formLink}`;
  const msgEs = `Hola ${name}, completa tus formularios de buceo para ${shop}: ${opened.formLink}`;
  const msg = (b.lang === "es" ? msgEs : msgEn);

  const result = { ok: true, formLink: opened.formLink, via, sent: false };

  if (via === "whatsapp" || via === "sms") {
    const phone = participant.phone || "";
    if (!phone) return json({ error: "Participant needs a phone number" }, 422);
    try {
      const wa = await sendFormLinkWhatsApp(env, {
        phone,
        customerName: name,
        formName: "Dive registration forms",
        formLink: opened.formLink,
      });
      result.sent = !!wa?.ok;
      result.whatsapp = wa;
      result.deeplink = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
    } catch (e) {
      result.deeplink = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
      result.warning = e.message || "WhatsApp helper unavailable — use deeplink";
    }
  } else if (via === "email") {
    const email = participant.email || "";
    if (!email) return json({ error: "Participant needs an email" }, 422);
    try {
      await sendSecureLink(env, { to: email, link: opened.formLink, name, shopName: shop });
      result.sent = true;
    } catch (e) {
      result.mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(shop + " forms")}&body=${encodeURIComponent(msg)}`;
      result.warning = e.message || "Email helper unavailable — use mailto";
    }
  } else {
    result.copyText = msg;
  }

  await env.DB.prepare("UPDATE participants SET mode='own_phone', updated_at=? WHERE id=?")
    .bind(Date.now(), participant.id).run();

  return json(result);
}
