import { json, isAuthed } from "../../../../_shared.js";
import { fillPdf, officialBytes, officialFont, stampMapFor } from "../../../../_lib/forms/pdf.js";

/**
 * GET /api/forms/templates/:id/preview
 * Renders a sample filled PDF for alignment checks (admin).
 */
export async function onRequestGet({ request, env, params }) {
  if (!env.DB || !env.DOCS) return json({ error: "Not configured" }, 503);
  if (!(await isAuthed(request, env))) return json({ error: "Unauthorized" }, 401);
  const id = parseInt(params.id, 10);
  const t = await env.DB.prepare("SELECT * FROM form_templates WHERE id=?").bind(id).first();
  if (!t) return json({ error: "Not found" }, 404);

  const map = stampMapFor(t.key);
  if (!map || map.reference || map.status === "missing-pdf") return json({ error: "This form is not stamped. Guidance is attached as-is, and the youth addendum PDF is not on file yet." }, 404);

  const sample = {
    first_name: "Ada", last_name: "Lovelace", full_name_print: "Ada Lovelace",
    dob: "1990-06-15", email: "ada@example.com", cell_phone: "50498763374",
    address: "West End, Roatán", emergency_contact_name: "Charles Babbage",
    emergency_contact_relationship: "Friend", emergency_contact_phone: "50499990000",
    training_center_name: "Banana Nut Burgers Dive Shop",
    training_center_address: "Tita's Pink Seahorse Bar, West End, Roatán",
    registration_number: "BNB-2610-0001", signature_date: new Date().toISOString().slice(0, 10),
  };

  // 1×40 transparent-ish PNG stub (tiny) — real sig comes from submissions
  const tinyPng = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC"
  ), (c) => c.charCodeAt(0));

  const { bytes } = await fillPdf({
    templateBytes: await officialBytes(env, t.key),
    fontBytes: await officialFont(env),
      answers: sample,
      signaturePngBytes: tinyPng,
      registrationNumber: sample.registration_number,
      audit: { templateKey: t.key, templateName: t.name, templateVersion: t.version },
    });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview-${t.key}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
