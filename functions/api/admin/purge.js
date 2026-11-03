import { json, isAuthed } from "../../_shared.js";
import { purgeAllCustomerData } from "../../_lib/purge.js";

/**
 * POST /api/admin/purge
 * Body: { confirm: "DELETE ALL" }
 * Wipes bookings, registrations, customers, form packets/submissions.
 * Keeps SSI templates, promotions, and shop settings.
 */
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (String(b.confirm || "") !== "DELETE ALL") {
    return json({ error: 'Type confirm: "DELETE ALL" to proceed' }, 422);
  }
  const out = await purgeAllCustomerData(env);
  return json(out);
}
