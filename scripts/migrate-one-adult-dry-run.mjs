/**
 * Dry-run: find registrations with multiple adult participants and report
 * what a one-adult split migration would do. Does NOT apply changes.
 *
 * Usage:
 *   node scripts/migrate-one-adult-dry-run.mjs
 *   node scripts/migrate-one-adult-dry-run.mjs --local   # use --local D1
 *
 * Apply only after explicit approval (separate --apply flag not implemented yet).
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const local = process.argv.includes("--local");
const flag = local ? "--local" : "--remote";
const DB = "banana-nut-burgers-db";

function runSql(sql) {
  const flat = String(sql).replace(/\s+/g, " ").trim();
  const out = execSync(
    `npx wrangler d1 execute ${DB} ${flag} --json --command=${JSON.stringify(flat)}`,
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );
  const parsed = JSON.parse(out);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  if (block?.error) throw new Error(block.error?.message || JSON.stringify(block.error));
  return block?.results || [];
}

function ageFromDob(dob, asOf = new Date()) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  let age = asOf.getFullYear() - y;
  const md = (asOf.getMonth() + 1) * 100 + asOf.getDate();
  if (md < m * 100 + d) age--;
  return age;
}

function isAdult(dob) {
  const a = ageFromDob(dob);
  return a != null && a >= 18;
}

console.log(`One-adult migration DRY RUN (${local ? "local" : "remote"} D1)\n`);

const counts = {
  registrations: 0,
  participants: 0,
  multiAdultRegs: 0,
  adultsToSplit: 0,
  minorsOk: 0,
  ambiguousGuardians: 0,
  orphanPackets: 0,
  formSubmissionsTouched: 0,
  signaturesTouched: 0,
};

try {
  counts.registrations = Number(runSql("SELECT COUNT(*) AS n FROM registrations")[0]?.n || 0);
  counts.participants = Number(runSql("SELECT COUNT(*) AS n FROM participants WHERE status<>'removed'")[0]?.n || 0);
} catch (e) {
  console.error("Could not query D1 — is Wrangler authenticated?", e.message || e);
  process.exit(1);
}

const adults = runSql(`
  SELECT p.id AS participant_id, p.registration_id, p.role, p.first_name, p.last_name, p.dob,
         p.registration_number, p.guardian_participant_id, p.mode, p.status,
         r.ref AS reg_ref, r.booking_ref, r.status AS reg_status
  FROM participants p
  JOIN registrations r ON r.id = p.registration_id
  WHERE p.status <> 'removed' AND p.is_minor = 0
  ORDER BY p.registration_id, p.sort_order, p.id
`);

const byReg = new Map();
for (const row of adults) {
  // Re-check DOB in case is_minor flag is stale
  if (!isAdult(row.dob) && row.role !== "primary") continue;
  if (!byReg.has(row.registration_id)) byReg.set(row.registration_id, []);
  byReg.get(row.registration_id).push(row);
}

const plan = [];
for (const [regId, people] of byReg) {
  if (people.length <= 1) continue;
  counts.multiAdultRegs++;
  const primary = people.find((p) => p.role === "primary") || people[0];
  const extras = people.filter((p) => p.participant_id !== primary.participant_id);
  counts.adultsToSplit += extras.length;

  for (const adult of extras) {
    const minors = runSql(`
      SELECT id, first_name, last_name, dob, guardian_participant_id, registration_number
      FROM participants
      WHERE registration_id=${Number(regId)} AND status<>'removed' AND is_minor=1
        AND (guardian_participant_id=${Number(adult.participant_id)} OR guardian_participant_id IS NULL)
    `);
    const ambiguous = minors.filter((m) => !m.guardian_participant_id);
    counts.ambiguousGuardians += ambiguous.length;
    counts.minorsOk += minors.length - ambiguous.length;

    const subs = runSql(`
      SELECT id, registration_number, needs_physician,
             CASE WHEN signed_pdf_r2_keys IS NULL OR signed_pdf_r2_keys='' OR signed_pdf_r2_keys='[]' THEN 0 ELSE 1 END AS has_pdf
      FROM form_submissions WHERE participant_id=${Number(adult.participant_id)}
    `);
    counts.formSubmissionsTouched += subs.length;
    const orphans = subs.filter((s) => !s.has_pdf && s.needs_physician);
    counts.orphanPackets += orphans.length;

    let sigs = 0;
    try {
      sigs = Number(runSql(`SELECT COUNT(*) AS n FROM signatures WHERE registration_id=${Number(regId)}`)[0]?.n || 0);
    } catch { sigs = 0; }
    counts.signaturesTouched += sigs > 0 ? 1 : 0;

    plan.push({
      action: "SPLIT_ADULT_TO_OWN_REGISTRATION",
      fromRegistrationId: regId,
      fromRef: primary.reg_ref,
      bookingRef: primary.booking_ref || null,
      keepPrimary: {
        participantId: primary.participant_id,
        name: `${primary.first_name} ${primary.last_name}`.trim(),
        registrationNumber: primary.registration_number,
      },
      moveAdult: {
        participantId: adult.participant_id,
        name: `${adult.first_name} ${adult.last_name}`.trim(),
        registrationNumber: adult.registration_number,
        mode: adult.mode,
        formSubmissions: subs.length,
        hasSignedPdf: subs.some((s) => s.has_pdf),
      },
      minorsMovingWithAdult: minors
        .filter((m) => m.guardian_participant_id === adult.participant_id)
        .map((m) => ({ id: m.id, name: `${m.first_name} ${m.last_name}`.trim() })),
      ambiguousMinorsNeedingReview: ambiguous.map((m) => ({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`.trim(),
      })),
      note: "Would create a new registration under the same booking_ref; move participant row, form_submissions, and registration_number. Signed PDFs in R2 stay keyed as-is. Audit rows untouched.",
    });
  }
}

const report = {
  dryRun: true,
  applied: false,
  generatedAt: new Date().toISOString(),
  database: local ? "local" : "remote",
  counts,
  plan,
  risks: [
    "Do not delete signed PDFs or audit entries.",
    "Minors with null guardian_participant_id need shop review before apply.",
    "Registration numbers must move with the adult (never reassign).",
    "Booking headcount is informational; do not auto-change guests.",
  ],
};

const outPath = path.join(root, "scripts", "_one-adult-migration-report.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("Counts:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
console.log(`\nSplit actions planned: ${plan.length}`);
if (plan.length) {
  console.log("\nFirst few:");
  for (const row of plan.slice(0, 5)) {
    console.log(`  - reg ${row.fromRef} (#${row.fromRegistrationId}): move ${row.moveAdult.name} → own registration`);
  }
} else {
  console.log("\nNothing to migrate (empty or already one-adult).");
}
console.log(`\nFull report: ${outPath}`);
console.log("DRY RUN ONLY — no changes applied. Approve before any --apply.");
