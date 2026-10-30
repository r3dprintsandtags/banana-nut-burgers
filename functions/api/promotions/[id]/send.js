import { json, isAuthed } from "../../../_shared.js";
import {
  absoluteDealUrl,
  marketingAudience,
  promoMessage,
  sendPromoEmail,
  sendPromoWhatsApp,
} from "../../../_lib/forms/promo-send.js";

/** POST /api/promotions/:id/send — blast to marketing-opted customers */
export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = Number(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "Bad id" }, 400);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  const wantEmail = !!b.email;
  const wantWa = !!b.whatsapp;
  if (!wantEmail && !wantWa) {
    return json({ error: "Choose email and/or WhatsApp" }, 422);
  }

  const promo = await env.DB.prepare("SELECT * FROM promotions WHERE id=?").bind(id).first();
  if (!promo) return json({ error: "Promotion not found" }, 404);

  const dealUrl = absoluteDealUrl(env, request, promo.cta_url);
  const audience = await marketingAudience(env);
  const previewOnly = b.preview === true;

  if (previewOnly) {
    const sample = audience[0];
    const lang = sample?.lang || "en";
    const name = [sample?.firstName, sample?.lastName].filter(Boolean).join(" ");
    return json({
      ok: true,
      preview: true,
      audience: audience.length,
      withPhone: audience.filter((a) => a.phone).length,
      withEmail: audience.filter((a) => a.email).length,
      dealUrl,
      sampleMessage: promoMessage(promo, { lang, dealUrl, name: name.split(" ")[0] || "" }),
    });
  }

  if (!audience.length) {
    return json({ error: "No customers have opted in to marketing yet", audience: 0 }, 422);
  }

  const emailResults = [];
  const waResults = [];
  let emailed = 0;
  let whatsapp = 0;

  for (const person of audience) {
    const name = person.firstName || person.lastName || "";
    const text = promoMessage(promo, { lang: person.lang, dealUrl, name });
    const subject = person.lang === "es"
      ? `Oferta · ${promo.title_es || promo.title}`
      : `Special · ${promo.title}`;

    if (wantEmail && person.email) {
      const sent = await sendPromoEmail(env, { to: person.email, name, subject, text });
      if (sent.ok) emailed++;
      emailResults.push({
        id: person.id,
        email: person.email,
        ok: !!sent.ok,
        via: sent.via,
        mailto: sent.mailto || "",
      });
    }

    if (wantWa && person.phone) {
      const sent = await sendPromoWhatsApp(env, {
        phone: person.phone,
        customerName: name,
        bodyText: text,
      });
      if (sent.ok || sent.waLink) whatsapp++;
      waResults.push({
        id: person.id,
        phone: person.phone,
        name,
        ok: !!sent.ok,
        via: sent.via || "",
        waLink: sent.waLink || "",
        error: sent.error || "",
      });
    }
  }

  const now = Date.now();
  const channels = [wantEmail ? "email" : "", wantWa ? "whatsapp" : ""].filter(Boolean).join(",");
  const details = {
    dealUrl,
    emailed,
    whatsapp,
    emailFailures: emailResults.filter((r) => !r.ok).length,
    waDeeplinks: waResults.filter((r) => r.via === "whatsapp_deeplink").length,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO promo_sends (promotion_id, sent_at, channels, recipient_count, emailed, whatsapp, details_json, actor)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, now, channels, audience.length, emailed, whatsapp, JSON.stringify(details), "admin").run();
  } catch (_) {
    // Table may not exist yet on older deploys — blast still returns results.
  }

  return json({
    ok: true,
    audience: audience.length,
    emailed,
    whatsapp,
    dealUrl,
    emailResults: emailResults.slice(0, 200),
    waResults: waResults.slice(0, 200),
    note: wantWa && !env.WHATSAPP_PROMO_TEMPLATE
      ? "WhatsApp links are ready to open — automatic WhatsApp needs an approved promo template (WHATSAPP_PROMO_TEMPLATE)."
      : "",
  });
}

/** GET /api/promotions/:id/send — audience preview for this promo */
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = Number(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "Bad id" }, 400);
  const promo = await env.DB.prepare("SELECT * FROM promotions WHERE id=?").bind(id).first();
  if (!promo) return json({ error: "Promotion not found" }, 404);
  const audience = await marketingAudience(env);
  const dealUrl = absoluteDealUrl(env, request, promo.cta_url);
  return json({
    ok: true,
    audience: audience.length,
    withPhone: audience.filter((a) => a.phone).length,
    withEmail: audience.filter((a) => a.email).length,
    dealUrl,
    sampleMessage: promoMessage(promo, { lang: "en", dealUrl, name: "Alex" }),
  });
}
