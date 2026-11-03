import { json, isAuthed, str, audit, ensureSchema } from "../../_shared.js";
import { deleteRegistration } from "../../_lib/purge.js";

async function loadReg(env, id) {
  return env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.preferred_name, c.phone, c.email
     FROM registrations r JOIN customers c ON c.id = r.customer_id WHERE r.id=?`
  ).bind(Number(id)).first();
}

// GET /api/registrations/:id (admin) — full detail incl. history, consents, signature
export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const reg = await loadReg(env, params.id);
  if (!reg) return json({ error: "Not found" }, 404);
  const consents = (await env.DB.prepare("SELECT * FROM consents WHERE registration_id=? ORDER BY id").bind(reg.id).all()).results;
  const signature = await env.DB.prepare("SELECT * FROM signatures WHERE registration_id=? ORDER BY id DESC LIMIT 1").bind(reg.id).first();
  const documents = (await env.DB.prepare("SELECT * FROM documents WHERE registration_id=? ORDER BY id").bind(reg.id).all()).results;
  const history = (await env.DB.prepare(
    `SELECT r.id, r.ref, r.status, r.created_at FROM registrations r WHERE r.customer_id=? ORDER BY r.created_at DESC`
  ).bind(reg.customer_id).all()).results;
  let participants = [];
  let formSubmissions = [];
  try {
    participants = (await env.DB.prepare(
      "SELECT * FROM participants WHERE registration_id=? AND status<>'removed' ORDER BY sort_order, id"
    ).bind(reg.id).all()).results || [];
  } catch (_) { participants = []; }
  try {
    formSubmissions = (await env.DB.prepare(
      `SELECT s.id, s.request_id, s.participant_id, s.registration_number, s.needs_physician, s.signed_at, s.signer_name, s.signed_pdf_r2_keys, s.valid_until
       FROM form_submissions s
       LEFT JOIN form_requests r ON r.id = s.request_id
       WHERE s.registration_id=? OR r.registration_id=?
       ORDER BY s.id DESC`
    ).bind(reg.id, reg.id).all()).results || [];
  } catch (_) { formSubmissions = []; }

  // staff-facing party summary (medical flags OK for shop)
  const party = participants.map((p) => {
    const age = (() => {
      if (!p.dob || !/^\d{4}-\d{2}-\d{2}$/.test(p.dob)) return null;
      const [y, m, d] = p.dob.split("-").map(Number);
      const now = new Date();
      let a = now.getFullYear() - y;
      if ((now.getMonth() + 1) * 100 + now.getDate() < m * 100 + d) a--;
      return a;
    })();
    const sub = formSubmissions.find((s) => Number(s.participant_id) === Number(p.id));
    let address = {};
    try { address = JSON.parse(p.address_json || "{}"); } catch { address = {}; }
    const ownGear = address.ownGear === "yes" || address.ownGear === "no" ? address.ownGear : "";
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      dob: p.dob,
      age,
      isMinor: !!p.is_minor,
      relationship: p.relationship,
      mode: p.mode,
      role: p.role,
      status: p.status,
      registrationNumber: p.registration_number || sub?.registration_number || "",
      youthAddendumStatus: p.youth_addendum_status,
      needsPhysician: !!(sub && sub.needs_physician),
      email: p.email,
      phone: p.phone,
      ownGear,
      gearSize: ownGear === "no" ? String(address.gearSize || "") : "",
      gearNote: ownGear === "no" ? String(address.gearNote || "") : "",
    };
  });

  await audit(env, "admin", "registration.viewed", "registration", reg.ref);
  return json({ registration: reg, consents, signature, documents, history, participants: party, formSubmissions });
}

// PATCH /api/registrations/:id {status?, reviewNote?} (admin) — audited review actions
export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  const reg = await loadReg(env, params.id);
  if (!reg) return json({ error: "Not found" }, 404);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const status = str(b.status, 30), note = str(b.reviewNote, 1000);
  const allowed = ["submitted", "under_review", "approved", "rejected", "flagged", "corrections_requested", "complete", "draft"];
  if (status && !allowed.includes(status)) return json({ error: "Invalid status" }, 422);
  const next = status || reg.status;
  const archived = next === "approved" ? 1 : 0;
  await env.DB.prepare("UPDATE registrations SET status=?, review_note=?, updated_at=?, archived=? WHERE id=?")
    .bind(next, note || reg.review_note, Date.now(), archived, reg.id).run();
  if (next === "approved") {
    let data = {};
    try { data = JSON.parse(reg.data || "{}"); } catch (e) {}
    const marker = `Registration ${reg.ref}`;
    const existing = await env.DB.prepare("SELECT id FROM bookings WHERE note LIKE ?").bind(`%${reg.ref}%`).first();
    if (!existing) {
      const name = [data.firstName || reg.first_name || "", data.lastName || reg.last_name || ""].join(" ").trim();
      await env.DB.prepare(
        `INSERT INTO bookings (created_at,status,name,first_name,last_name,contact,email,guests,date,time,service,divers,note,ip_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        Date.now(), "new", name, data.firstName || reg.first_name || "", data.lastName || reg.last_name || "",
        data.phone || reg.phone || "", data.email || reg.email || "",
        Math.min(20, Math.max(1, parseInt(data.participants || reg.participants, 10) || 1)),
        data.plannedDate || reg.planned_date || "", str(data.plannedTime, 20),
        data.activity || reg.activity || "", "[]", marker, ""
      ).run();
    }
  }
  await audit(env, "admin", "registration.review", "registration", reg.ref,
    `status:${reg.status}->${next}${note ? " note:" + note : ""}`);
  return json({ ok: true, status: next, archived: !!archived });
}

// DELETE /api/registrations/:id — remove registration + forms + orphan customer
export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Database not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  await ensureSchema(env);
  const out = await deleteRegistration(env, params.id);
  if (!out.ok) return json({ error: out.error }, out.status || 400);
  return json(out);
}
