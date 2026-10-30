import { json, isAuthed, str } from "../_shared.js";

function mapRow(r) {
  return {
    id: r.id,
    title: r.title || "",
    titleEs: r.title_es || "",
    blurb: r.blurb || "",
    blurbEs: r.blurb_es || "",
    badge: r.badge || "THIS WEEK'S SPECIAL",
    badgeEs: r.badge_es || "",
    ctaLabel: r.cta_label || "BOOK THIS DEAL",
    ctaLabelEs: r.cta_label_es || "",
    ctaUrl: r.cta_url || "register.html?start=1",
    endsLabel: r.ends_label || "",
    endsLabelEs: r.ends_label_es || "",
    endsAt: r.ends_at || "",
    active: !!r.active,
    sortOrder: Number(r.sort_order) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function stillValid(row, nowIso) {
  if (!row.active) return false;
  if (row.ends_at && String(row.ends_at) < nowIso) return false;
  return true;
}

/** GET /api/promotions — public active deals; ?all=1 admin list */
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  const url = new URL(request.url);
  const wantAll = url.searchParams.get("all") === "1";
  if (wantAll) {
    if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
    const { results } = await env.DB.prepare(
      "SELECT * FROM promotions ORDER BY sort_order ASC, id DESC"
    ).all();
    return json({ promotions: (results || []).map(mapRow) });
  }
  const today = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT * FROM promotions WHERE active=1 ORDER BY sort_order ASC, id DESC"
  ).all();
  const promotions = (results || []).filter((r) => stillValid(r, today)).map(mapRow);
  return json({ promotions }, 200, { "Cache-Control": "public, max-age=60" });
}

/** POST /api/promotions — admin create */
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const title = str(b.title, 120);
  if (!title) return json({ error: "Title is required" }, 422);
  const now = Date.now();
  const endsAt = /^\d{4}-\d{2}-\d{2}$/.test(str(b.endsAt, 10)) ? str(b.endsAt, 10) : null;
  const res = await env.DB.prepare(
    `INSERT INTO promotions (
      title, title_es, blurb, blurb_es, badge, badge_es, cta_label, cta_label_es, cta_url,
      ends_label, ends_label_es, ends_at, active, sort_order, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    title,
    str(b.titleEs, 120) || null,
    str(b.blurb, 280) || null,
    str(b.blurbEs, 280) || null,
    str(b.badge, 40) || "THIS WEEK'S SPECIAL",
    str(b.badgeEs, 40) || null,
    str(b.ctaLabel, 40) || "BOOK THIS DEAL",
    str(b.ctaLabelEs, 40) || null,
    str(b.ctaUrl, 240) || "register.html?start=1",
    str(b.endsLabel, 40) || null,
    str(b.endsLabelEs, 40) || null,
    endsAt,
    b.active === false || b.active === 0 ? 0 : 1,
    Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0,
    now,
    now
  ).run();
  return json({ ok: true, id: res.meta.last_row_id }, 201);
}
