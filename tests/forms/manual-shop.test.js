import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checklist, isManualShopRegistration } from "../../functions/_shared.js";

describe("in-person shop registration", () => {
  it("recognizes the column and the stored flag", () => {
    assert.equal(isManualShopRegistration({ manual_shop: 1, data: "{}" }), true);
    assert.equal(isManualShopRegistration({ manual_shop: 0, data: JSON.stringify({ manualShop: true }) }), true);
    assert.equal(isManualShopRegistration({ manual_shop: 0, data: JSON.stringify({ collectedInPerson: true }) }), true);
    assert.equal(isManualShopRegistration({ manual_shop: 0, data: JSON.stringify({ staffCreated: true }) }), false);
  });

  it("counts paper forms as collected without a digital signature", () => {
    const reg = {
      status: "complete",
      manual_shop: 1,
      first_name: "Ada",
      phone: "50499999999",
      data: JSON.stringify({ firstName: "Ada", phone: "50499999999", manualShop: true, collectedInPerson: true }),
    };
    const list = checklist(reg, { hasSignature: false, hasDeclaration: false });
    assert.equal(list.forms, "complete");
    assert.equal(list.waivers, "complete");
    assert.equal(list.diverInfo, "complete");
    assert.equal(list.review, "complete");
    assert.equal(list.safety, "pending_approved_form");
  });

  it("still requires a signature for a remote staff draft", () => {
    const reg = {
      status: "draft",
      manual_shop: 0,
      data: JSON.stringify({ firstName: "Ada", phone: "50499999999", staffCreated: true, formsSource: "link" }),
    };
    const list = checklist(reg, { hasSignature: false, hasDeclaration: false });
    assert.equal(list.forms, "action_required");
    assert.equal(list.waivers, "action_required");
    assert.equal(list.review, "not_started");
  });
});
