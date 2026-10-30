import { json, isAuthed, str } from "../../../../_shared.js";
import { formAudit } from "../../../../_lib/forms/submit.js";
import { sendFormLinkWhatsApp } from "../../../../_lib/forms/whatsapp.js";

/**
 * POST /api/forms/requests/:id/send
 * Body: { link, via?: "whatsapp"|"sms"|"email" }
 * WhatsApp uses Telnyx Utility template form_link when configured; else wa.me deeplink.
 * Never sends form answers or medical details — link only.
 */
export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  let b;
  try { b = await request.json(); } catch { b = {}; }
  const via = str(b.via || "whatsapp", 20);

  const row = await env.DB.prepare(
    `SELECT fr.*, c.first_name, c.last_name, c.phone, c.email, p.name AS packet_name
     FROM form_requests fr
     LEFT JOIN customers c ON c.id = fr.customer_id
     LEFT JOIN form_packets p ON p.id = fr.packet_id
     WHERE fr.id=?`
  ).bind(id).first();
  if (!row) return json({ error: "Not found" }, 404);
  if (row.status === "completed" || row.status === "revoked") return json({ error: "Request closed" }, 409);

  const link = str(b.link, 500);
  if (!link) return json({ error: "Pass the one-time link from create (token is stored hashed)" }, 422);

  const shopName = env.SHOP_NAME || "Banana Nut Burgers Dive Shop";
  const customerName = `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Diver";
  const formName = row.packet_name || "registration forms";

  let result = { via, status: "queued" };

  if (via === "whatsapp") {
    result = await sendFormLinkWhatsApp(env, {
      phone: row.phone,
      customerName,
      formName,
      formLink: link,
    });
  } else if (via === "sms") {
    if (String(env.SMS_ENABLED || "true") === "false") {
      return json({ error: "SMS disabled", fallback: "whatsapp" }, 422);
    }
    // Prefer WhatsApp template; SMS is link-only stub until Telnyx SMS wired
    result = {
      via: "sms",
      status: "not_configured",
      note: "Use via=whatsapp (Utility form_link). SMS helper can be added with TELNYX SMS from.",
      preview: `Complete your ${formName} for ${shopName}: ${link}`,
    };
  } else if (via === "email") {
    result = {
      via: "email",
      status: "not_configured",
      note: "Wire transactional email — subject + link only, no medical data",
      preview: link,
    };
  }

  await env.DB.prepare("UPDATE form_requests SET sent_via=?, sent_at=? WHERE id=?").bind(via, Date.now(), id).run();
  await formAudit(env, {
    requestId: id,
    event: "sent",
    actor: "admin",
    details: `${via}:${result.status || result.error || "ok"}`,
  });
  return json({ ok: !!result.ok || result.status === "deeplink" || result.status === "sent", ...result });
}
