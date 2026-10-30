import { json, isAuthed, str } from "../../_shared.js";
import { createRequestForRegistration, packetKeyForActivity, fromRegistrationData } from "../../_lib/forms/submit.js";
import { resolveShared } from "../../_lib/forms/shared.js";
import { getShopSetting } from "../../_lib/forms/regnum.js";

// POST /api/forms/requests — admin: create request for customer (+ optional booking)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  const customerId = parseInt(b.customer_id || b.customerId, 10);
  if (!customerId) return json({ error: "customer_id required" }, 422);
  const customer = await env.DB.prepare("SELECT * FROM customers WHERE id=?").bind(customerId).first();
  if (!customer) return json({ error: "Customer not found" }, 404);

  const packetKey = str(b.packet_key || b.packetKey || packetKeyForActivity(b.activity), 40);
  const shop = {
    training_center_name: await getShopSetting(env, "training_center_name", env.SHOP_NAME || ""),
    training_center_address: await getShopSetting(env, "training_center_address", ""),
  };
  const prefill = resolveShared({
    answers: b.prefill || fromRegistrationData(b.data || {}),
    customer,
    shop,
  });

  try {
    const { requestId, token, packet } = await createRequestForRegistration(env, {
      customerId,
      registrationId: b.registration_id || b.registrationId || null,
      packetKey,
      prefill,
      expiresDays: b.expires_days || 7,
    });
    if (b.booking_id) {
      await env.DB.prepare("UPDATE form_requests SET booking_id=? WHERE id=?").bind(parseInt(b.booking_id, 10), requestId).run();
    }
    const base = (env.FORMS_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const link = `${base}/f/${token}`;
    return json({ ok: true, id: requestId, packet: packet.key, link, token }, 201);
  } catch (e) {
    return json({ error: e.message || "Failed" }, 500);
  }
}
