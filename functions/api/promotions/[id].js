import { json, isAuthed, str } from "../../_shared.js";

/** PATCH /api/promotions/:id — admin update */
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = Number(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "Bad id" }, 400);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }

  const cur = await env.DB.prepare("SELECT * FROM promotions WHERE id=?").bind(id).first();
  if (!cur) return json({ error: "Not found" }, 404);

  const title = b.title !== undefined ? str(b.title, 120) : cur.title;
  if (!title) return json({ error: "Title is required" }, 422);
  const endsAtRaw = b.endsAt !== undefined ? str(b.endsAt, 10) : (cur.ends_at || "");
  const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(endsAtRaw) ? endsAtRaw : null;
  const active = b.active !== undefined
    ? (b.active === false || b.active === 0 ? 0 : 1)
    : cur.active;

  await env.DB.prepare(
    `UPDATE promotions SET
      title=?, title_es=?, blurb=?, blurb_es=?, badge=?, badge_es=?,
      cta_label=?, cta_label_es=?, cta_url=?, ends_label=?, ends_label_es=?,
      ends_at=?, active=?, sort_order=?, updated_at=?
     WHERE id=?`
  ).bind(
    title,
    b.titleEs !== undefined ? (str(b.titleEs, 120) || null) : cur.title_es,
    b.blurb !== undefined ? (str(b.blurb, 280) || null) : cur.blurb,
    b.blurbEs !== undefined ? (str(b.blurbEs, 280) || null) : cur.blurb_es,
    b.badge !== undefined ? (str(b.badge, 40) || "THIS WEEK'S SPECIAL") : cur.badge,
    b.badgeEs !== undefined ? (str(b.badgeEs, 40) || null) : cur.badge_es,
    b.ctaLabel !== undefined ? (str(b.ctaLabel, 40) || "BOOK THIS DEAL") : cur.cta_label,
    b.ctaLabelEs !== undefined ? (str(b.ctaLabelEs, 40) || null) : cur.cta_label_es,
    b.ctaUrl !== undefined ? (str(b.ctaUrl, 240) || "register.html?start=1") : cur.cta_url,
    b.endsLabel !== undefined ? (str(b.endsLabel, 40) || null) : cur.ends_label,
    b.endsLabelEs !== undefined ? (str(b.endsLabelEs, 40) || null) : cur.ends_label_es,
    endsAt,
    active,
    b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : cur.sort_order,
    Date.now(),
    id
  ).run();
  return json({ ok: true });
}

/** DELETE /api/promotions/:id — admin delete */
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = Number(params.id);
  if (!Number.isFinite(id) || id < 1) return json({ error: "Bad id" }, 400);
  const res = await env.DB.prepare("DELETE FROM promotions WHERE id=?").bind(id).run();
  return json({ ok: true, changed: res.meta.changes });
}
