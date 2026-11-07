import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  THEMES, buildFlow, stepLabel, stepProblems, earlierBlock, missingItems, resumeTarget,
  hashFor, parseHash, documentCanAgree, recordSignature, applyReusedSignature, satisfyHiddenGates, submitFailureView,
  themeContrastIssues, legalBundle, firstOpenDocument,
} from "../../functions/_lib/forms/wizard.js";
import { validateAnswers } from "../../functions/_lib/forms/schema.js";
import { onRequestGet } from "../../functions/f/[token].js";

const medical = {
  key: "diver_medical",
  name: "Diver Medical",
  legal: "x".repeat(80),
  schema: {
    key: "diver_medical",
    sections: [
      { id: "ack", fields: [{ key: "ack_box", type: "checkbox", required: true, label: "I acknowledge" }] },
      { id: "about", fields: [{ key: "first_name", type: "text", required: true, label: "First" }] },
      { id: "dm", fields: [{ key: "dm_q1", type: "yes_no", required: true, label: { en: "Chest pain?" } }] },
    ],
  },
};
const fit = { key: "fit_to_dive", name: "Fit to Dive", legal: "y".repeat(80), schema: { sections: [{ id: "fit", fields: [{ key: "fit_q1", type: "yes_no", required: true, label: { en: "Cold?" } }] }] } };
const youth = { key: "youth_addendum", name: "Guardian consent", legal: "Shop guardian consent text that is long enough to show.", schema: { sections: [] } };

function adultAnswers(extra = {}) {
  return {
    first_name: "Maria", last_name: "Lopez", dob: "1990-04-02", city: "Austin", state: "TX", zip: "78701",
    emergency_contact_name: "Ana Lopez", emergency_contact_phone: "50498763374",
    dm_q1: "no", fit_q1: "no",
    __agreements: { diver_medical: { accepted: true }, fit_to_dive: { accepted: true } },
    __signatures: {
      diver_medical: "data:image/png;base64," + "a".repeat(80),
      fit_to_dive: "data:image/png;base64," + "b".repeat(80),
    },
    ...extra,
  };
}

describe("one stepper", () => {
  it("uses the defined steps and does not count documents as steps", () => {
    const flow = buildFlow([medical, fit], adultAnswers());
    assert.deepEqual(flow.steps.map((s) => s.id), ["about", "emergency", "medical", "documents", "review", "finish"]);
    assert.equal(flow.docs.length, 2);
    assert.equal(flow.steps.length, 6);
  });

  it("adds guardian only for a minor", () => {
    const flow = buildFlow([medical, youth], { dob: "2014-01-01" });
    assert.ok(flow.steps.some((s) => s.id === "guardian"));
    assert.equal(buildFlow([medical], adultAnswers()).steps.some((s) => s.id === "guardian"), false);
  });

  it("the packet page has one stepper and no second step counter", async () => {
    const res = await onRequestGet({ params: { token: "demo" } });
    const html = await res.text();
    assert.equal((html.match(/id="stepper"/g) || []).length, 1);
    assert.equal(html.includes('id="steps"'), false);
    assert.equal(html.includes("sections.length"), false);
    assert.equal(/Step "\+/.test(html), false);
    assert.match(html, /\.stepper\{[^}]*flex-direction:column/);
    const reg = fs.readFileSync("register.html", "utf8");
    assert.equal(reg.includes('id="steps"'), false);
    // register.html is the live production page. It loads the status client
    // instead of the packet iframe used by an older repo copy.
    assert.equal(reg.includes("/api/register/status-client"), true);
  });

  it("gives each step its own heading", () => {
    const ids = ["about", "emergency", "guardian", "medical", "documents", "review", "finish"];
    const headings = ids.map((id) => stepLabel(id, "en"));
    assert.equal(new Set(headings).size, headings.length);
  });
});

describe("gating, reload, and back", () => {
  it("locks a later step until earlier required steps are valid", () => {
    const flow = buildFlow([medical, fit], {});
    const block = earlierBlock("documents", flow, {});
    assert.equal(block.stepId, "about");
    assert.match(stepLabel(block.stepId, "en"), /About you/);
  });

  it("resumes the saved step and lets the hash move backward", () => {
    const flow = buildFlow([medical, fit], adultAnswers());
    const saved = adultAnswers({ __ui: { step: "documents", docIndex: 1, medicalSeen: true } });
    assert.deepEqual(resumeTarget(flow, saved), { stepId: "documents", docIndex: 1 });
    assert.equal(resumeTarget(flow, adultAnswers({ __ui: { step: "documents", docIndex: 1 } })).stepId, "medical");
    const prefilled = { first_name: "Maria", last_name: "Lopez", dob: "1990-04-02", city: "Austin", state: "TX", zip: "78701", emergency_contact_name: "Ana Lopez", emergency_contact_phone: "50498763374" };
    assert.equal(resumeTarget(flow, prefilled).stepId, "medical");
    assert.equal(parseHash(hashFor("medical"), flow).stepId, "medical");
    assert.equal(parseHash("#documents:1", flow).docIndex, 1);
  });
});

describe("contrast tokens", () => {
  for (const name of ["light", "dark"]) {
    it(name + " text tokens clear WCAG AA against their surfaces", () => {
      const issues = themeContrastIssues(THEMES[name]);
      assert.deepEqual(issues, []);
    });
  }

  it("the packet stylesheet uses those tokens and keeps paper text dark", async () => {
    const html = await (await onRequestGet({ params: { token: "demo" } })).text();
    assert.match(html, /--paper:#ffffff/);
    assert.match(html, /--paper-text:#0a2533/);
    assert.match(html, /--filled:#08315c/);
    assert.equal(/mix-blend-mode/.test(html), false);
    assert.match(html, /button:disabled\{opacity:1/);
    assert.equal(html.includes("themeBtn"), false);
    assert.equal(/data-theme="dark"/.test(html), false);
    assert.match(html, /Banana Nut Burgers/);
  });
});

describe("completion gates", () => {
  it("enables agree when the document fits, and when the end sentinel is visible", () => {
    assert.equal(documentCanAgree({ overflow: false, sentinelVisible: false }), true);
    assert.equal(documentCanAgree({ overflow: true, sentinelVisible: false }), false);
    assert.equal(documentCanAgree({ overflow: true, sentinelVisible: true }), true);
  });

  it("copies one signature onto every form when asked", () => {
    const url = "data:image/png;base64," + "a".repeat(80);
    const docs = [{ key: "intro_code" }, { key: "fit_to_dive" }, { key: "privacy" }];
    const applied = applyReusedSignature({}, docs, url);
    assert.equal(applied.ok, true);
    assert.equal(applied.map.intro_code, url);
    assert.equal(applied.map.fit_to_dive, url);
    assert.equal(applied.map.privacy, url);
    assert.equal(applied.map._reuse, url);
    const withGuardian = applyReusedSignature({}, docs.concat([{ key: "youth_addendum" }, { key: "guardian" }]), url);
    assert.equal(withGuardian.map.intro_code, url);
    assert.equal(withGuardian.map.youth_addendum, undefined);
    assert.equal(withGuardian.map.guardian, undefined);
    assert.equal(applyReusedSignature({}, docs, "nope").ok, false);
  });
  it("saves a real signature and rejects an empty one", () => {
    const bad = recordSignature({}, "fit_to_dive", "data:image/png;base64,aa");
    assert.equal(bad.ok, false);
    const good = recordSignature({}, "fit_to_dive", "data:image/png;base64," + "c".repeat(90));
    assert.equal(good.ok, true);
    assert.match(good.map.fit_to_dive, /^data:image\/png/);
  });

  it("ignores hidden ack fields and does not invent medical answers", () => {
    const answers = satisfyHiddenGates([medical], adultAnswers({ ack_box: false, dm_q1: "no" }));
    assert.equal(answers.ack_box, true);
    assert.equal(answers.dm_q1, "no");
    const schema = { ...medical.schema, consent: { required: true } };
    const errors = validateAnswers(schema, { ...answers, __consent_accepted: true, dob: "1990-04-02" });
    assert.deepEqual(errors, []);
  });

  it("does not ask an adult for guardian fields", () => {
    const flow = buildFlow([medical], adultAnswers());
    assert.deepEqual(stepProblems("guardian", flow, adultAnswers()), []);
    const minorFlow = buildFlow([medical, youth], { dob: "2015-05-05" });
    assert.equal(stepProblems("guardian", minorFlow, { dob: "2015-05-05" }).some((p) => p.id === "guardian_name"), true);
  });

  it("an adult and a minor can reach an empty missing list", () => {
    const adult = buildFlow([medical, fit], adultAnswers());
    assert.equal(missingItems(adult, adultAnswers()).length, 0);
    const minorBase = {
      ...adultAnswers(),
      dob: "2014-02-02",
      guardian_name: "Ana Lopez",
      __agreements: { diver_medical: { accepted: true }, fit_to_dive: { accepted: true }, youth_addendum: { accepted: true } },
      __signatures: {
        diver_medical: "data:image/png;base64," + "a".repeat(80),
        fit_to_dive: "data:image/png;base64," + "b".repeat(80),
        youth_addendum: "data:image/png;base64," + "c".repeat(80),
        guardian: "data:image/png;base64," + "d".repeat(80),
      },
    };
    const minor = buildFlow([medical, fit, youth], minorBase);
    assert.equal(missingItems(minor, minorBase).length, 0);
    assert.equal(minor.minor, true);
  });

  it("does not trap a signer when legal text arrives as {en, es}", () => {
    const objectLegal = {
      key: "privacy",
      name: "Privacy Policy",
      legal: { en: "x".repeat(80), es: "" },
      schema: { sections: [] },
    };
    const flow = buildFlow([objectLegal], adultAnswers());
    assert.equal(flow.docs[0].missing, false);
    assert.equal(flow.docs[0].legal.length, 80);
    assert.equal(legalBundle(objectLegal.legal).en.length, 80);
    const signed = adultAnswers({
      __agreements: { privacy: { accepted: true } },
      __signatures: { privacy: "data:image/png;base64," + "a".repeat(80) },
    });
    assert.equal(stepProblems("documents", flow, signed).length, 0);
    assert.equal(earlierBlock("review", flow, signed), null);
  });

  it("sends a blocked review back to the unfinished document, not the first one", () => {
    const flow = buildFlow([medical, fit], adultAnswers());
    const partial = adultAnswers({
      __agreements: { diver_medical: { accepted: true } },
      __signatures: { diver_medical: "data:image/png;base64," + "a".repeat(80) },
    });
    delete partial.__agreements.fit_to_dive;
    delete partial.__signatures.fit_to_dive;
    assert.equal(firstOpenDocument(flow, partial), 1);
  });

  it("keeps answers when submit fails and names the missing piece", () => {
    const view = submitFailureView({ error: "Sign Fit to Dive", errors: [{ key: "sign_fit_to_dive", message: "Fit to Dive signature" }] });
    assert.equal(view.retry, true);
    assert.equal(view.items[0].label, "Fit to Dive signature");
  });
});
