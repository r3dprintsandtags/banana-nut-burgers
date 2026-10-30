/**
 * Telnyx WhatsApp Utility template "form_link" for Banana Nut (single shop).
 * Never include medical answers — link + names only.
 * Falls back to wa.me deeplink when Telnyx is not configured.
 */
import { maskPhone } from "./crypto.js";

const WHATSAPP_SEND_URL = "https://api.telnyx.com/v2/messages/whatsapp";

function digits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 8) d = "504" + d;
  return d.slice(0, 15);
}

function e164(phone) {
  const d = digits(phone);
  return d ? `+${d}` : "";
}

async function isOptedOut(env, phone) {
  const d = digits(phone);
  if (!d || !env.DB) return false;
  try {
    const row = await env.DB.prepare(
      "SELECT 1 AS x FROM form_audit_log WHERE event='whatsapp.opt_out' AND details LIKE ? ORDER BY id DESC LIMIT 1"
    ).bind(`%${d.slice(-8)}%`).first();
    // Prefer dedicated table if present
    const t = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_opt_out'"
    ).first();
    if (t) {
      const o = await env.DB.prepare("SELECT 1 AS x FROM whatsapp_opt_out WHERE phone=?").bind(d).first();
      return !!o;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Send approved Utility template form_link with named vars:
 * customer_name, form_name, shop_name, form_link
 */
export async function sendFormLinkWhatsApp(env, { phone, customerName, formName, formLink }) {
  const to = e164(phone);
  const shopName = env.SHOP_NAME || "Banana Nut Burgers Dive Shop";
  const from = env.TELNYX_WHATSAPP_FROM || "";
  const apiKey = env.TELNYX_API_KEY || "";

  if (!to) return { ok: false, error: "invalid_phone", maskedPhone: "***" };
  if (await isOptedOut(env, to)) return { ok: false, error: "opted_out", maskedPhone: maskPhone(to) };

  // No Telnyx → staff deeplink fallback (still never includes answers)
  if (!apiKey || !from) {
    const text = `Hi ${customerName || "there"}, please complete your ${formName || "forms"} for ${shopName}: ${formLink}`;
    return {
      ok: true,
      via: "whatsapp_deeplink",
      status: "deeplink",
      waLink: `https://wa.me/${digits(to)}?text=${encodeURIComponent(text)}`,
      maskedPhone: maskPhone(to),
      note: "Set TELNYX_API_KEY + TELNYX_WHATSAPP_FROM to send Utility template form_link automatically",
    };
  }

  const templateName = env.WHATSAPP_FORM_TEMPLATE || "form_link";
  const lang = env.WHATSAPP_FORM_TEMPLATE_LANG || "en_US";
  // Body params order must match Meta/Telnyx approved template variables
  const body = {
    from,
    to,
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
              { type: "text", text: String(formName || "registration forms").slice(0, 200) },
              { type: "text", text: String(shopName).slice(0, 200) },
              { type: "text", text: String(formLink).slice(0, 1000) },
            ],
          },
        ],
      },
    },
  };

  const res = await fetch(WHATSAPP_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const detail = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: "telnyx_failed",
      status: res.status,
      detail: detail?.errors?.[0]?.detail || detail?.error || "send failed",
      maskedPhone: maskPhone(to),
    };
  }
  return {
    ok: true,
    via: "whatsapp_template",
    status: "sent",
    template: templateName,
    telnyxId: detail?.data?.id || "",
    maskedPhone: maskPhone(to),
  };
}
