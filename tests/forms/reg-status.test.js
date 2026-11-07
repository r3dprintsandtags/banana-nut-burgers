import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getRegistrationStatus } from "../../functions/_lib/forms/reg-status.js";

const primaryAction = new Function(`${fs.readFileSync(new URL("../../js/status-client.js", import.meta.url), "utf8")}\nreturn primaryAction;`)();

const about = {
  activity: "Scuba",
  plannedDate: "2026-11-10",
  plannedTime: "09:00",
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "50498763374",
  dob: "1990-01-01",
  city: "West End",
  ownGear: "yes",
  emergencyName: "Grace",
  emergencyPhone: "50498760000",
  accuracyDeclaration: true,
  privacyAck: true,
};

test("No (no kids) unlocks health for the primary registrant", () => {
  const reg = { status: "draft", data: JSON.stringify({ ...about, hasMinors: false }) };
  const people = [{ id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started", registrationNumber: "" }];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "health");
  assert.equal(status.nextRequiredTask.personId, 7);
  assert.equal(status.steps.minors.status, "done");
  assert.equal(status.steps.health.locked, false);
  assert.equal(status.people[0].self, true);
});

test("unanswered kids question stays on minors", () => {
  const reg = { status: "draft", data: JSON.stringify(about) };
  const people = [{ id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started" }];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "minors");
  assert.equal(status.nextRequiredTask.personId, undefined);
});

test("review in progress is not counted as one more health question", () => {
  const status = {
    customerFinished: false,
    nextRequiredTask: { step: "health", personId: 3, taskId: "health" },
    people: [{ id: 3, firstName: "alex", self: false, tasks: [{ id: "health", left: 1 }] }],
  };
  const reviewing = primaryAction(status, { step: "health", personId: 3, lang: "en", packetStep: "review", healthLeft: 0 });
  assert.equal(reviewing.label, "Review (alex)");
  const asking = primaryAction(status, { step: "health", personId: 3, lang: "en", packetStep: "medical", healthLeft: 1 });
  assert.equal(asking.label, "Answer 1 more question (alex)");
});

test("Yes with no child still asks for a child", () => {
  const reg = { status: "draft", data: JSON.stringify({ ...about, hasMinors: true }) };
  const people = [{ id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started" }];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "minors");
});
