import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { autoMapFields, defaultOverlayPlacements } from "../../functions/_lib/forms/automap.js";

describe("automap", () => {
  it("maps common AcroForm names to shared keys", () => {
    const m = autoMapFields(["First Name", "ParticipantLastName", "DateOfBirth", "Email Address", "Signature"]);
    assert.equal(m.fields["First Name"].source, "first_name");
    assert.equal(m.fields["ParticipantLastName"].source, "last_name");
    assert.equal(m.fields["DateOfBirth"].source, "dob");
    assert.equal(m.fields["Email Address"].source, "email");
    assert.ok(m.signatures.length >= 1);
  });
  it("returns overlay defaults when flat", () => {
    const m = autoMapFields([]);
    assert.equal(m.mode, "overlay");
    assert.ok(defaultOverlayPlacements().length > 3);
  });
});
