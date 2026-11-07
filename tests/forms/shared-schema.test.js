import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveShared, NEVER_PREFILL, mergeDraftOverPrefill, packetPrefill } from "../../functions/_lib/forms/shared.js";
import { evaluateShowIf, validateAnswers } from "../../functions/_lib/forms/schema.js";
import { formatRegNumber } from "../../functions/_lib/forms/regnum.js";

describe("shared field resolution", () => {
  it("prefers answers then CRM then shop", () => {
    const out = resolveShared({
      answers: { first_name: "Ada" },
      customer: { first_name: "Other", last_name: "Lovelace", phone: "50499999999" },
      shop: { training_center_name: "BNB" },
    });
    assert.equal(out.first_name, "Ada");
    assert.equal(out.last_name, "Lovelace");
    assert.equal(out.cell_phone, "50499999999");
    assert.equal(out.training_center_name, "BNB");
    assert.equal(out.full_name_print, "Ada Lovelace");
  });
  it("never prefills sensitive medical from CRM", () => {
    const out = resolveShared({
      answers: {},
      customer: { first_name: "A" },
      fieldMeta: { fit_q1: { sensitive: true } },
    });
    assert.equal(out.fit_q1, undefined);
    assert.ok(NEVER_PREFILL.has("guardian_name"));
  });
});

describe("packet identity is asked once", () => {
  it("keeps a blank draft from erasing date of birth and phone", () => {
    const merged = mergeDraftOverPrefill(
      { first_name: "Maria", dob: "1990-04-02", cell_phone: "+504 9876-3374", city: "West End" },
      { dob: "", cell_phone: "", city: "Coxen Hole", dm_q1: "no" },
    );
    assert.equal(merged.dob, "1990-04-02");
    assert.equal(merged.cell_phone, "+504 9876-3374");
    assert.equal(merged.city, "Coxen Hole");
    assert.equal(merged.dm_q1, "no");
  });

  it("fills the primary diver from the registration, even if the roster row is still empty", () => {
    const out = packetPrefill({
      participant: { role: "primary", first_name: "Maria", last_name: "Lopez", dob: "", phone: "" },
      data: { firstName: "Maria", lastName: "Lopez", dob: "1990-04-02", phone: "50498763374", city: "West End", emergencyName: "Ana", emergencyPhone: "50411112222" },
      customer: {},
    });
    assert.equal(out.dob, "1990-04-02");
    assert.equal(out.cell_phone, "50498763374");
    assert.equal(out.city, "West End");
    assert.equal(out.emergency_contact_phone, "50411112222");
  });

  it("keeps a minor's own date of birth and uses the guardian phone", () => {
    const out = packetPrefill({
      participant: { role: "guest", is_minor: 1, first_name: "Luis", last_name: "Lopez", dob: "2016-08-09", phone: "" },
      data: { firstName: "Maria", lastName: "Lopez", dob: "1990-04-02", phone: "50498763374", city: "West End", emergencyName: "Ana", emergencyPhone: "50411112222" },
      guardian: { name: "Maria Lopez", phone: "50498763374", relationship: "parent/guardian" },
    });
    assert.equal(out.first_name, "Luis");
    assert.equal(out.dob, "2016-08-09");
    assert.equal(out.cell_phone, "50498763374");
    assert.equal(out.guardian_name, "Maria Lopez");
    assert.equal(out.city, "West End");
    assert.notEqual(out.dob, "1990-04-02");
  });
});

describe("show_if / validate", () => {
  it("shows detail when yes", () => {
    assert.equal(evaluateShowIf({ field: "fit_q1", op: "eq", value: "yes" }, { fit_q1: "yes" }), true);
    assert.equal(evaluateShowIf({ field: "fit_q1", op: "eq", value: "yes" }, { fit_q1: "no" }), false);
  });
  it("requires guardian under 18", () => {
    const schema = { sections: [{ fields: [{ key: "dob", type: "dob", required: true }] }], consent: { required: true } };
    const errs = validateAnswers(schema, { dob: "2015-01-01", __consent_accepted: true }, "en");
    assert.ok(errs.some((e) => e.key === "guardian_name"));
  });
});

describe("registration number format", () => {
  it("formats CODE-YYMM-SEQ4", () => {
    const n = formatRegNumber({ code: "BNB", date: new Date("2026-10-22"), seq: 7 });
    assert.equal(n, "BNB-2610-0007");
  });
});
