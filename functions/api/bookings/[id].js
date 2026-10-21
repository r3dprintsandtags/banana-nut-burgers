import { json, isAuthed, str } from "../../_shared.js";

// PATCH /api/bookings/:id  {status}  (admin only)
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const status = str(b.status, 20);
  if (!["new", "confirmed", "done"].includes(status)) return json({ error: "Invalid status" }, 422);
  const res = await env.DB.prepare("UPDATE bookings SET status=? WHERE id=?").bind(status, Number(params.id)).run();
  return json({ ok: true, changed: res.meta.changes });
}

// DELETE /api/bookings/:id  (admin only)
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const res = await env.DB.prepare("DELETE FROM bookings WHERE id=?").bind(Number(params.id)).run();
  return json({ ok: true, changed: res.meta.changes });
}
