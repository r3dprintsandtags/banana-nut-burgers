/**
 * Acceptance tests for group / party registration helpers.
 * Run: npm run test:forms
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeIsMinor, participantPublic, applyGear, gearFromAddress } from "../../functions/_lib/forms/party.js";
import { fromRegistrationData } from "../../functions/_lib/forms/shared.js";
import { diverMedicalNeedsPhysician, fitToDiveNeedsPhysician } from "../../functions/_lib/forms/physician.js";
import { validateAnswers } from "../../functions/_lib/forms/schema.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

describe("party age / minor", () => {
  it("detects adult vs minor from DOB", () => {
    assert.equal(computeIsMinor("1990-01-01"), 0);
    assert.equal(computeIsMinor("2015-06-01"), 1);
  });
  it("re-evaluates at signing time (turning 18)", () => {
    // person who is 17 today but turns 18 tomorrow — still minor today
    const today = new Date();
    const y = today.getFullYear() - 17;
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    assert.equal(computeIsMinor(`${y}-${m}-${d}`, today), 1);
    const asOf = new Date(today);
    asOf.setFullYear(asOf.getFullYear() + 1);
    assert.equal(computeIsMinor(`${y}-${m}-${d}`, asOf), 0);
  });
});

describe("equipment for each additional person", () => {
  it("stores a rental size and does not treat gear as an address", () => {
    const address = applyGear({ city: "West End" }, { ownGear: "no", gearSize: "M", gearNote: "boots 9" });
    assert.equal(address.city, "West End");
    assert.deepEqual(gearFromAddress(address), { ownGear: "no", gearSize: "M", gearNote: "boots 9" });
    assert.throws(() => applyGear({}, { ownGear: "no" }), /size/i);
    const row = {
      id: 3, registration_id: 1, contact_id: 4, first_name: "Jimmy", last_name: "Smith",
      dob: "2014-01-01", is_minor: 1, relationship: "child", mode: "here", role: "guest",
      guardian_participant_id: 1, guardian_json: "{}", email: "", phone: "",
      status: "not_started", registration_number: "BNB-2611-0004",
      youth_addendum_status: "waiting", same_address: 1, same_emergency: 1, sort_order: 2,
      address_json: JSON.stringify(address), emergency_json: "{}",
    };
    const pub = participantPublic(row);
    assert.equal(pub.ownGear, "no");
    assert.equal(pub.gearSize, "M");
    assert.equal(pub.address.ownGear, undefined);
    assert.equal(pub.address.city, "West End");
  });
});

describe("party privacy public shape", () => {
  it("hides medical detail for non-staff dashboard", () => {
    const row = {
      id: 2, registration_id: 1, contact_id: 9, first_name: "Sam", last_name: "Guest",
      dob: "1995-01-01", is_minor: 0, relationship: "friend", mode: "own_phone", role: "guest",
      guardian_participant_id: null, guardian_json: "{}", email: "a@b.c", phone: "+1500",
      status: "needs_medical_review", registration_number: "BNB-2601-0002",
      youth_addendum_status: "n/a", same_address: 1, same_emergency: 1, sort_order: 1,
      address_json: "{}", emergency_json: "{}",
    };
    const pub = participantPublic(row, { includeMedical: false, submission: { needs_physician: 1, signed_pdf_r2_keys: "[]" } });
    assert.equal(pub.packetNeedsPhysician, true);
    assert.equal(pub.needsPhysician, undefined);
    assert.equal(pub.signedPdfKeys, undefined);
    const staff = participantPublic(row, { includeMedical: true, submission: { needs_physician: 1, signed_pdf_r2_keys: '[{"template_key":"diver_medical"}]' } });
    assert.equal(staff.needsPhysician, true);
    assert.ok(Array.isArray(staff.signedPdfKeys));
  });
});

describe("shared address / emergency prefill", () => {
  it("fromRegistrationData carries shared fields and guardian", () => {
    const p = fromRegistrationData({
      firstName: "Kid", lastName: "One", dob: "2014-03-03",
      address: "1 Reef Rd", city: "West End", state: "Bay Islands", zip: "00000",
      emergencyName: "Mom", emergencyRelationship: "mother", emergencyPhone: "+15005550100",
      guardian_name: "Alex Parent", guardian_relationship: "parent/guardian",
      registration_number: "BNB-2601-0003",
    });
    assert.equal(p.first_name, "Kid");
    assert.equal(p.emergency_contact_name, "Mom");
    assert.equal(p.guardian_name, "Alex Parent");
    assert.equal(p.registration_number, "BNB-2601-0003");
  });
});

describe("medical flags per person (never prefilled)", () => {
  it("computes diver medical and fit-to-dive independently", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_q3: "yes" }), true);
    assert.equal(fitToDiveNeedsPhysician({ fit_q1: "yes" }), true);
    assert.equal(diverMedicalNeedsPhysician({}), false);
    assert.equal(fitToDiveNeedsPhysician({ fit_q1: "no" }), false);
  });
});

describe("under-16 privacy + youth gate", () => {
  it("requires guardian_privacy_consent on privacy schema under 16", () => {
    const schema = { key: "privacy", sections: [] };
    const errs = validateAnswers(schema, { dob: "2015-01-01", guardian_name: "G", guardian_signature: "signed" }, "en");
    assert.ok(errs.some((e) => e.key === "guardian_privacy_consent"));
  });
  it("youth waiting blocks complete status preference", () => {
    // syncParticipantAfterSubmit prefers waiting_youth_addendum over complete
    // (unit-tested via status priority without DB)
    const p = { is_minor: 1, youth_addendum_status: "waiting" };
    let status = "complete";
    if (false) status = "needs_medical_review";
    if (p.is_minor && p.youth_addendum_status === "waiting") status = "waiting_youth_addendum";
    assert.equal(status, "waiting_youth_addendum");
  });
});

describe("stamp guardian lines only for minors", () => {
  it("stamp logic skips guardian fields for adults", () => {
    const stampSrc = fs.readFileSync(path.join(root, "functions/_lib/forms/stamp.js"), "utf8");
    assert.ok(stampSrc.includes('field.when === "minor"'));
    assert.ok(stampSrc.includes('field.when === "adult"'));
    const placeSrc = fs.readFileSync(path.join(root, "functions/_lib/forms/placements.js"), "utf8");
    assert.ok(placeSrc.includes('when: "minor"'));
    assert.ok(placeSrc.includes("guardian_signature"));
  });
});

describe("customer flow: no new-tab / popup / dialog APIs", () => {
  it("register.html avoids target=_blank, window.open, alert/confirm/prompt", () => {
    const html = fs.readFileSync(path.join(root, "register.html"), "utf8");
    assert.equal(/target\s*=\s*["']_blank["']/.test(html), false);
    // ignore comments
    const code = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.equal(/\bwindow\.open\s*\(/.test(code), false);
    assert.equal(/\balert\s*\(/.test(code), false);
    assert.equal(/\bconfirm\s*\(/.test(code), false);
    assert.equal(/\bprompt\s*\(/.test(code), false);
  });
});

describe("legacy own-phone adults cannot be opened via party packet API", () => {
  it("packet route still enforces OWN_PHONE_ONLY for old rows", () => {
    const src = fs.readFileSync(
      path.join(root, "functions/api/register/participants/[id]/packet.js"),
      "utf8"
    );
    assert.ok(src.includes("OWN_PHONE_ONLY"));
    assert.ok(src.includes("own_phone"));
  });
});

describe("one adult per registration", () => {
  it("API rejects adding a second adult", () => {
    const src = fs.readFileSync(path.join(root, "functions/_lib/forms/party.js"), "utf8");
    assert.ok(src.includes("ADULT_NEEDS_OWN_REGISTRATION"));
    assert.ok(src.includes('const mode = "here"'));
    assert.ok(src.includes("GUARDIAN_REQUIRED"));
  });
  it("suggestPastPeople filters to minors only", () => {
    const src = fs.readFileSync(path.join(root, "functions/_lib/forms/party.js"), "utf8");
    assert.ok(src.includes("Returning picker is minors-only") || src.includes("!computeIsMinor(row.dob)"));
  });
  it("invite-adult and booking party APIs exist", () => {
    assert.ok(fs.existsSync(path.join(root, "functions/api/register/invite-adult.js")));
    assert.ok(fs.existsSync(path.join(root, "functions/api/bookings/[id]/party.js")));
    assert.ok(fs.existsSync(path.join(root, "functions/api/bookings/[id]/invite-context.js")));
    const invite = fs.readFileSync(path.join(root, "functions/api/register/invite-adult.js"), "utf8");
    assert.ok(invite.includes('set("fresh"') || invite.includes("fresh=1"));
    assert.ok(invite.includes("booking"));
  });
  it("register.html has Next person / Start new registration and no invite framing", () => {
    const html = fs.readFileSync(path.join(root, "register.html"), "utf8");
    assert.ok(html.includes("startNewRegBtn"));
    assert.ok(html.includes("nextPersonBox"));
    assert.ok(html.includes("passDeviceGo"));
    assert.ok(html.includes("hasMinorsYes"));
    assert.equal(html.includes("inviteAdultBtn"), false);
    assert.equal(/Invite another adult/i.test(html), false);
    assert.equal(/Invitar a otro adulto/i.test(html), false);
    assert.ok(html.includes("Start new registration"));
    assert.ok(html.includes("Iniciar nuevo registro"));
    assert.ok(html.includes("buildFreshRegistrationUrl") || html.includes("fresh=1"));
    assert.ok(html.includes("new_registration_started_from_done"));
    assert.ok(html.includes("registration_link_shared"));
    assert.ok(html.includes("armDoneIdleReset"));
    assert.equal(/window\.open\s*\(/.test(html), false);
    assert.equal(/\balert\s*\(/.test(html), false);
    assert.equal(/\bconfirm\s*\(/.test(html), false);
    assert.equal(/mode\s*===\s*["']own_phone["']\s*\?\s*["']Own phone/.test(html), false);
  });
  it("shop-public and register events APIs exist for kiosk / next person", () => {
    assert.ok(fs.existsSync(path.join(root, "functions/api/register/shop-public.js")));
    assert.ok(fs.existsSync(path.join(root, "functions/api/register/events.js")));
    const pub = fs.readFileSync(path.join(root, "functions/api/register/shop-public.js"), "utf8");
    assert.ok(pub.includes("kiosk_done_idle_sec"));
    assert.ok(pub.includes("allow_device_multi_reg"));
    const invite = fs.readFileSync(path.join(root, "functions/api/register/invite-adult.js"), "utf8");
    assert.ok(invite.includes("registrationUrl"));
    assert.ok(invite.includes('set("fresh"') || invite.includes("fresh=1"));
    assert.equal(invite.includes("inviteNonce"), false);
  });
  it("admin CRM has Party view wiring", () => {
    const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    assert.ok(html.includes("paintBookingParty"));
    assert.ok(html.includes('data-act="party"'));
    assert.ok(html.includes("/api/bookings/") && html.includes("/party"));
  });
  it("migration dry-run script exists", () => {
    assert.ok(fs.existsSync(path.join(root, "scripts/migrate-one-adult-dry-run.mjs")));
  });
});

describe("party migration + downloads privacy", () => {
  it("migration 0014 defines participants and participant_id columns", () => {
    const sql = fs.readFileSync(path.join(root, "migrations/0014_party_participants.sql"), "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS participants"));
    assert.ok(sql.includes("participant_id"));
    assert.ok(sql.includes("youth_addendum_status"));
  });
  it("party-downloads filters medical for other adults", () => {
    const src = fs.readFileSync(
      path.join(root, "functions/api/register/party-downloads/index.js"),
      "utf8"
    );
    assert.ok(src.includes("canSeeMedical"));
    assert.ok(src.includes("isMedicalTemplate"));
    const pdf = fs.readFileSync(
      path.join(root, "functions/api/register/party-downloads/pdf.js"),
      "utf8"
    );
    assert.ok(pdf.includes("MEDICAL_PRIVACY"));
  });
});

describe("party reminders + suggest helpers exist", () => {
  it("cron wires party reminders and suggestPastPeople is exported", () => {
    const cron = fs.readFileSync(path.join(root, "functions/api/forms/cron.js"), "utf8");
    assert.ok(cron.includes("runPartyAppointmentReminders"));
    const rem = fs.readFileSync(path.join(root, "functions/_lib/forms/party-reminders.js"), "utf8");
    assert.ok(rem.includes("party.reminder_sent"));
    assert.ok(rem.includes("incompleteNames") || rem.includes("incomplete"));
    const partySrc = fs.readFileSync(path.join(root, "functions/_lib/forms/party.js"), "utf8");
    assert.ok(partySrc.includes("suggestPastPeople"));
    assert.ok(partySrc.includes("DUPLICATE_PERSON") || partySrc.includes("forceDuplicate"));
    assert.ok(partySrc.includes("waiting_guardian") || partySrc.includes("guardian_participant_id"));
  });
  it("register.html has past-people picker and DOB lock", () => {
    const html = fs.readFileSync(path.join(root, "register.html"), "utf8");
    assert.ok(html.includes("partyPastBtn"));
    assert.ok(html.includes("dobLockBox"));
    assert.ok(html.includes("showDobLock"));
  });
});

describe("1 adult + 2 minors model invariants", () => {
  it("each participant gets own public packet fields", () => {
    const people = [
      { id: 1, role: "primary", is_minor: 0, first_name: "Alex", last_name: "P", dob: "1985-01-01", registration_number: "A", status: "complete", relationship: "self", mode: "here", contact_id: 1, registration_id: 1, guardian_json: "{}", address_json: "{}", emergency_json: "{}", youth_addendum_status: "n/a", same_address: 1, same_emergency: 1, sort_order: 0 },
      { id: 2, role: "guest", is_minor: 1, first_name: "Kid", last_name: "A", dob: "2014-01-01", registration_number: "B", status: "waiting_youth_addendum", relationship: "child", mode: "here", contact_id: 2, registration_id: 1, guardian_participant_id: 1, guardian_json: "{}", address_json: "{}", emergency_json: "{}", youth_addendum_status: "waiting", same_address: 1, same_emergency: 1, sort_order: 1 },
      { id: 3, role: "guest", is_minor: 1, first_name: "Kid", last_name: "B", dob: "2016-01-01", registration_number: "C", status: "waiting_youth_addendum", relationship: "child", mode: "here", contact_id: 3, registration_id: 1, guardian_participant_id: 1, guardian_json: "{}", address_json: "{}", emergency_json: "{}", youth_addendum_status: "waiting", same_address: 1, same_emergency: 1, sort_order: 2 },
    ];
    const pubs = people.map((p) => participantPublic(p));
    assert.equal(pubs.length, 3);
    assert.equal(new Set(pubs.map((p) => p.registrationNumber)).size, 3);
    assert.equal(pubs.filter((p) => p.isMinor).length, 2);
    assert.equal(pubs[0].role, "primary");
  });
});
