import { json, isAuthed, str, ensureSchema } from "../../_shared.js";
import { deleteBooking } from "../../_lib/purge.js";

// PATCH /api/bookings/:id  {status} | {archived} | {diveDone}  (admin only)
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const sets = [];
  const bind = [];
  if (b.status !== undefined && b.status !== null && b.status !== "") {
    const status = str(b.status, 20);
    if (!["new", "confirmed", "done"].includes(status)) return json({ error: "Invalid status" }, 422);
    sets.push("status=?");
    bind.push(status);
  }
  if (b.archived !== undefined) {
    sets.push("archived=?");
    bind.push(b.archived === true || b.archived === 1 || b.archived === "1" ? 1 : 0);
  }
  if (b.diveDone !== undefined) {
    sets.push("dive_done=?");
    bind.push(b.diveDone === true || b.diveDone === 1 || b.diveDone === "1" ? 1 : 0);
  }
  if (!sets.length) return json({ error: "Nothing to update" }, 422);
  bind.push(Number(params.id));
  const res = await env.DB.prepare(`UPDATE bookings SET ${sets.join(", ")} WHERE id=?`).bind(...bind).run();
  return json({ ok: true, changed: res.meta.changes });
}

// DELETE /api/bookings/:id  (admin only)
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const out = await deleteBooking(env, params.id);
  if (!out.ok) return json({ error: out.error }, out.status || 400);
  return json(out);
}
