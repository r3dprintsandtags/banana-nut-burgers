import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diverMedicalNeedsPhysician, fitToDiveNeedsPhysician, over45Prefill } from "../../functions/_lib/forms/physician.js";

describe("diver medical physician rules", () => {
  it("flags Q3/Q5/Q10 yes", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_q3: "yes" }), true);
    assert.equal(diverMedicalNeedsPhysician({ dm_q5: "yes" }), true);
    assert.equal(diverMedicalNeedsPhysician({ dm_q10: "yes" }), true);
  });
  it("flags any box A-G yes", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_box_C: "yes" }), true);
  });
  it("flags streamlined box item checkboxes", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_box_A_1: true }), true);
    assert.equal(diverMedicalNeedsPhysician({ dm_box_G_4: "yes" }), true);
  });
  it("does not flag Q1 or over_45 alone", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_q1: "yes" }), false);
    assert.equal(diverMedicalNeedsPhysician({ over_45: "yes", dm_q2: "yes" }), false);
  });
  it("flags dental healing yes", () => {
    assert.equal(diverMedicalNeedsPhysician({ dm_dental: "yes" }), true);
  });
});

describe("fit to dive", () => {
  it("any yes", () => {
    assert.equal(fitToDiveNeedsPhysician({ fit_q2: "yes" }), true);
    assert.equal(fitToDiveNeedsPhysician({ fit_q1: "no", fit_q2: "no" }), false);
  });
});

describe("over 45", () => {
  it("does not auto-answer over_45; syncs dm_q2 after the customer chooses", () => {
    const blank = over45Prefill({ dob: "1970-01-01" });
    assert.equal(blank.answers.over_45, undefined);
    assert.equal(blank.requiresOver45Confirm, false);
    const synced = over45Prefill({ dob: "1970-01-01", over_45: "yes" });
    assert.equal(synced.answers.dm_q2, "yes");
  });
});
