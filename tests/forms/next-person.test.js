import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("next person / start new registration (Done screen)", () => {
  const html = fs.readFileSync(path.join(root, "register.html"), "utf8");

  it("removes invite framing in EN and ES customer copy", () => {
    assert.equal(/Invite another adult/i.test(html), false);
    assert.equal(/Invitar a otro adulto/i.test(html), false);
    assert.equal(/Get invite link/i.test(html), false);
    assert.equal(/Obtener enlace de invitación/i.test(html), false);
    assert.equal(html.includes("inviteAdultBtn"), false);
    assert.ok(html.includes('nextPersonH:"Next person?"'));
    assert.ok(html.includes("¿Siguiente persona?"));
    assert.ok(html.includes("Start new registration"));
    assert.ok(html.includes("Iniciar nuevo registro"));
  });

  it("wires Start new registration, QR toggle, Share, and idle stay controls", () => {
    assert.ok(html.includes('id="startNewRegBtn"'));
    assert.ok(html.includes('id="showNextQrBtn"'));
    assert.ok(html.includes('id="nextPersonShareBtn"'));
    assert.ok(html.includes('id="nextPersonQr"'));
    assert.ok(html.includes('id="nextPersonStay"'));
    assert.ok(html.includes("function startNewRegistration"));
    assert.ok(html.includes("function buildFreshRegistrationUrl"));
    assert.ok(html.includes("function wipePersonalFields"));
    assert.ok(html.includes("function clearBrowserPersonalStorage"));
    assert.ok(html.includes("armDoneIdleReset"));
  });

  it("fresh link carries booking context only (no personal tokens)", () => {
    assert.ok(html.includes('u.searchParams.set("booking"'));
    assert.ok(html.includes('u.searchParams.set("fresh", "1")'));
    assert.match(html, /Never attach ref\/token/);
    assert.ok(html.includes('["ref", "token", "resume", "name", "registration", "reg"]'));
  });

  it("blocks reset while save pending/failed and announces reset", () => {
    assert.ok(html.includes("confirmSaveOk"));
    assert.ok(html.includes("nextPersonSaving"));
    assert.ok(html.includes("nextPersonSaveFail"));
    assert.ok(html.includes("nextPersonSavedA11y"));
    assert.ok(html.includes("New registration started"));
  });

  it("does not add popup / new-tab / dialog APIs in the customer reset flow", () => {
    // Confined checks around next-person helpers (page may still have legacy none).
    assert.equal(/\balert\s*\(/.test(html), false);
    assert.equal(/\bconfirm\s*\(/.test(html), false);
    assert.equal(/\bprompt\s*\(/.test(html), false);
    assert.equal(/window\.open\s*\(/.test(html), false);
  });

  it("logs analytics events without personal data fields in the payload builder", () => {
    assert.ok(html.includes("new_registration_started_from_done"));
    assert.ok(html.includes("registration_link_shared"));
    assert.ok(html.includes('fetch("/api/register/events"'));
    const events = fs.readFileSync(path.join(root, "functions/api/register/events.js"), "utf8");
    assert.ok(events.includes("bookingId"));
    assert.ok(events.includes("method="));
    assert.equal(/firstName|lastName|phone|email|token/.test(events), false);
  });
});
