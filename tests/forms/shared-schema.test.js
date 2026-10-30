import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveShared, NEVER_PREFILL } from "../../functions/_lib/forms/shared.js";
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
