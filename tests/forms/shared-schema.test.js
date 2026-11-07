import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveShared, NEVER_PREFILL, mergeFilled, pickContact } from "../../functions/_lib/forms/shared.js";
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
  it("keeps prefilled date of birth and email when a saved draft left them blank", () => {
    const out = mergeFilled(
      { dob: "1992-04-02", email: "ada@example.com", cell_phone: "9515456589", city: "West End" },
      { dob: "", email: "", cell_phone: "9515456589", fit_q1: "no" },
    );
    assert.equal(out.dob, "1992-04-02");
    assert.equal(out.email, "ada@example.com");
    assert.equal(out.cell_phone, "9515456589");
    assert.equal(out.fit_q1, "no");
  });
  it("copies the guardian phone and email onto a minor when theirs are blank", () => {
    const minor = pickContact({
      isMinor: true,
      participant: { dob: "2016-05-01", email: "", phone: "" },
      registration: { dob: "1985-01-01", email: "parent@example.com", phone: "9515456589" },
      guardian: { email: "parent@example.com", phone: "9515456589" },
    });
    assert.equal(minor.dob, "2016-05-01");
    assert.equal(minor.email, "parent@example.com");
    assert.equal(minor.phone, "9515456589");
    const blankChild = pickContact({
      isMinor: true,
      participant: { dob: "", email: "", phone: "" },
      registration: { dob: "1985-01-01", email: "parent@example.com", phone: "9515456589" },
      guardian: { email: "", phone: "" },
    });
    assert.equal(blankChild.dob, "");
    assert.equal(blankChild.email, "parent@example.com");
    assert.equal(blankChild.phone, "9515456589");
    const adult = pickContact({
      isMinor: false,
      participant: { dob: "", email: "", phone: "9515456589" },
      registration: { dob: "1992-04-02", email: "diver@example.com", phone: "9515456589" },
    });
    assert.equal(adult.dob, "1992-04-02");
    assert.equal(adult.email, "diver@example.com");
    assert.equal(adult.phone, "9515456589");
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
