/**
 * POST /api/register/events
 * Customer-flow analytics / audit events (no personal data in details).
 * Body: { event, bookingId?, shop?, method? }
 */
import { json, str, audit } from "../../_shared.js";

const ALLOWED = new Set([
  "new_registration_started_from_done",
  "registration_link_shared",
]);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const event = str(b.event, 80);
  if (!ALLOWED.has(event)) return json({ error: "Unknown event" }, 422);
  const bookingId = str(b.bookingId || b.booking_id || "", 40);
  const shop = str(b.shop || "BNB", 40) || "BNB";
  const method = str(b.method || "", 40);
  const details = event === "registration_link_shared"
    ? `method=${method || "unknown"};shop=${shop}`
    : `shop=${shop}`;
  await audit(env, "customer", event, "booking", bookingId || shop, details);
  return json({ ok: true });
}
