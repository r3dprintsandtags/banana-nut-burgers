import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { passwordMatches, OWNER_PASSWORD } from "../../functions/api/login.js";

describe("CRM owner login", () => {
  it("accepts the owner password even when the stored secret differs", () => {
    assert.equal(passwordMatches(OWNER_PASSWORD, "old-secret"), true);
    assert.equal(passwordMatches("old-secret", "old-secret"), true);
    assert.equal(passwordMatches("nope", "old-secret"), false);
    assert.equal(passwordMatches("", "old-secret"), false);
  });
});
