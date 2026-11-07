import { test } from "node:test";
import assert from "node:assert/strict";
import { getRegistrationStatus } from "../../functions/_lib/forms/reg-status.js";

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
  assert.equal(status.nextRequiredTask.taskId, "ask");
  assert.equal(status.nextRequiredTask.personId, undefined);
  assert.equal(status.hasMinors, null);
});

test("Yes with no child still asks for a child", () => {
  const reg = { status: "draft", data: JSON.stringify({ ...about, hasMinors: true }) };
  const people = [{ id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started" }];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "minors");
  assert.equal(status.nextRequiredTask.taskId, "add_child");
  assert.equal(status.hasMinors, true);
});

test("a child already on the roster counts as Yes even if the flag lagged", () => {
  const reg = { status: "draft", data: JSON.stringify(about) };
  const people = [
    { id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started" },
    { id: 8, role: "guest", firstName: "Kid", lastName: "Lovelace", dob: "2015-01-01", ownGear: "yes", status: "not_started" },
  ];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "health");
  assert.equal(status.steps.minors.status, "done");
});

test("a child without gear keeps the flow on that child's details", () => {
  const reg = { status: "draft", data: JSON.stringify({ ...about, hasMinors: true }) };
  const people = [
    { id: 7, role: "primary", firstName: "Ada", lastName: "Lovelace", dob: "1990-01-01", status: "not_started" },
    { id: 8, role: "guest", firstName: "Kid", lastName: "Lovelace", dob: "2015-01-01", status: "not_started" },
  ];
  const status = getRegistrationStatus(reg, people);
  assert.equal(status.nextRequiredTask.step, "minors");
  assert.equal(status.nextRequiredTask.personId, 8);
});
