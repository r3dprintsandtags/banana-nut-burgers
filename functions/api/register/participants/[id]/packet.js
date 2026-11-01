/** POST /api/register/participants/:id/packet — open/reuse SSI packet for one participant */
import { json, str } from "../../../../_shared.js";
import { loadRegByRefToken, openParticipantPacket } from "../../../../_lib/forms/party.js";

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "Not configured" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const ref = str(b.ref, 20);
  const token = str(b.token, 80);
  if (!ref || !token) return json({ error: "ref and token required" }, 422);
  const loaded = await loadRegByRefToken(env, ref, token);
  if (loaded.error) return json({ error: loaded.error }, loaded.status);

  const pid = Number(params.id);
  const participant = await env.DB.prepare(
    "SELECT * FROM participants WHERE id=? AND registration_id=? AND status<>'removed'"
  ).bind(pid, loaded.reg.id).first();
  if (!participant) return json({ error: "Participant not found" }, 404);

  // Adults on their own phone must sign via their secure form token — primary cannot open their packet here.
  if (participant.mode === "own_phone" && participant.role !== "primary" && !participant.is_minor) {
    return json({
      error: "This person fills out on their own phone. Use Send link — the primary registrant cannot open or sign their forms.",
      code: "OWN_PHONE_ONLY",
    }, 403);
  }

  try {
    const out = await openParticipantPacket(env, loaded.reg, participant, request.url);
    return json(out);
  } catch (e) {
    return json({ error: e.message || "Could not start packet" }, e.status || 500);
  }
}
