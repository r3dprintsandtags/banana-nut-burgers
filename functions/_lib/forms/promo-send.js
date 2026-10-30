/** Promotion blasts — marketing-opted customers only. Never include medical answers. */

function digits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 8) d = "504" + d;
  return d.slice(0, 15);
}

export function absoluteDealUrl(env, request, ctaUrl) {
  const raw = String(ctaUrl || "register.html?start=1").trim() || "register.html?start=1";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(env.FORMS_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  return `${base}/${raw.replace(/^\//, "")}`;
}

export function promoMessage(promo, { lang = "en", dealUrl, name = "" } = {}) {
  const es = lang === "es";
  const title = es ? (promo.title_es || promo.title) : promo.title;
  const blurb = es ? (promo.blurb_es || promo.blurb || "") : (promo.blurb || "");
  const ends = es
    ? (promo.ends_label_es || promo.ends_label || (promo.ends_at ? `TERMINA ${promo.ends_at}` : ""))
    : (promo.ends_label || (promo.ends_at ? `ENDS ${promo.ends_at}` : ""));
  const cta = es ? (promo.cta_label_es || promo.cta_label || "RESERVAR OFERTA") : (promo.cta_label || "BOOK THIS DEAL");
  const shop = "Banana Nut Burgers Dive Shop";
  const hi = es
    ? `Hola${name ? ` ${name}` : ""},`
    : `Hi${name ? ` ${name}` : ""},`;
  const lines = [
    hi,
    "",
    es ? `Oferta de ${shop}:` : `${shop} special:`,
    title,
  ];
  if (blurb) lines.push(blurb);
  if (ends) lines.push(ends);
  lines.push("", `${cta}: ${dealUrl}`, "");
  lines.push(es ? "Responde STOP para no recibir más ofertas." : "Reply STOP to opt out of offers.");
  return lines.join("\n");
}

/** Latest marketing consent must be granted=1. */
export async function marketingAudience(env) {
  if (!env?.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
      (
        SELECT r.data FROM registrations r
        WHERE r.customer_id = c.id
        ORDER BY r.id DESC LIMIT 1
      ) AS data
     FROM customers c
     WHERE (TRIM(COALESCE(c.phone,'')) != '' OR TRIM(COALESCE(c.email,'')) != '')
       AND (
         SELECT g.granted FROM consents g
         JOIN registrations r ON r.id = g.registration_id
         WHERE r.customer_id = c.id AND g.purpose = 'marketing'
         ORDER BY g.id DESC LIMIT 1
       ) = 1
     ORDER BY c.id DESC`
  ).all();
  const out = [];
  const seenPhone = new Set();
  const seenEmail = new Set();
  for (const row of results || []) {
    const phone = digits(row.phone);
    const email = String(row.email || "").trim().toLowerCase();
    if (phone && seenPhone.has(phone)) continue;
    if (!phone && email && seenEmail.has(email)) continue;
    if (phone) seenPhone.add(phone);
    if (email) seenEmail.add(email);
    let lang = "en";
    try {
      const data = JSON.parse(row.data || "{}");
      if (String(data.preferredLanguage || "").toLowerCase().startsWith("es")) lang = "es";
    } catch { /* ignore */ }
    out.push({
      id: row.id,
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      phone,
      email,
      lang,
    });
  }
  return out;
}

export async function sendPromoEmail(env, { to, name, subject, text }) {
  const from = env.FORMS_FROM_EMAIL || "banananutburgers@gmail.com";
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    await env.EMAIL.send({ to, from, subject, text });
    return { ok: true, via: "email" };
  }
  return { ok: false, via: "mailto", mailto: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` };
}

export function whatsappDeeplink(phone, text) {
  const d = digits(phone);
  if (!d) return "";
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** Optional Telnyx marketing template when WHATSAPP_PROMO_TEMPLATE is set. */
export async function sendPromoWhatsApp(env, { phone, customerName, bodyText }) {
  const to = digits(phone);
  if (!to) return { ok: false, error: "invalid_phone" };
  const apiKey = env.TELNYX_API_KEY || "";
  const from = env.TELNYX_WHATSAPP_FROM || "";
  const templateName = env.WHATSAPP_PROMO_TEMPLATE || "";
  if (!apiKey || !from || !templateName) {
    return {
      ok: true,
      via: "whatsapp_deeplink",
      waLink: whatsappDeeplink(to, bodyText),
      note: "Set WHATSAPP_PROMO_TEMPLATE + Telnyx keys for automatic WhatsApp sends",
    };
  }
  const lang = env.WHATSAPP_PROMO_TEMPLATE_LANG || "en_US";
  const res = await fetch("https://api.telnyx.com/v2/messages/whatsapp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from,
      to: `+${to}`,
      whatsapp_message: {
        type: "template",
        template: {
          name: templateName,
          language: { policy: "deterministic", code: lang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: String(customerName || "Guest").slice(0, 200) },
                { type: "text", text: String(bodyText).slice(0, 1000) },
              ],
            },
          ],
        },
      },
    }),
  });
  const detail = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: "telnyx_failed",
      detail: detail?.errors?.[0]?.detail || "send failed",
      waLink: whatsappDeeplink(to, bodyText),
    };
  }
  return { ok: true, via: "whatsapp_template", telnyxId: detail?.data?.id || "" };
}
