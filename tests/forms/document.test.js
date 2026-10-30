import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { renderDocumentHtml, htmlUsesPlaceholderAsValue } from "../../functions/_lib/forms/document.js";
import { fillPdf, officialTemplate } from "../../functions/_lib/forms/pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";

const adult = {
  first_name: "Maria",
  last_name: "Lopez",
  full_name_print: "Maria Lopez",
  training_center_name: "Banana Nut Burgers Dive Shop",
  signature_date_display: "10/26/2026",
  dob: "1990-04-02",
};

describe("filled document html", () => {
  const legal = fs.readFileSync("forms-source/intro_code.en.txt", "utf8");

  it("writes the customer name into the blank and keeps the caption small", () => {
    const html = renderDocumentHtml(legal, adult, { minor: false, dateText: "10/26/2026" });
    assert.match(html, /class="filled">Maria Lopez</);
    assert.match(html, /class="cap">print name of participant</);
    assert.deepEqual(htmlUsesPlaceholderAsValue(html), []);
  });

  it("hides guardian lines for an adult", () => {
    const html = renderDocumentHtml(legal, adult, { minor: false });
    assert.equal(/Parent\/Guardian/.test(html), false);
  });

  it("shows a guardian name only for a minor", () => {
    const html = renderDocumentHtml(legal, { ...adult, dob: "2012-01-01", guardian_name: "Ana Lopez" }, { minor: true });
    assert.match(html, /Ana Lopez/);
    assert.match(html, /Parent or guardian name/);
  });
});

describe("flat SSI pdf overlay", () => {
  it("stamps the participant name onto the introductory code pdf", async () => {
    const { bytes } = await fillPdf({
      templateBytes: officialTemplate("intro_code"),
      answers: { ...adult, signature_date: "2026-10-26", __dateFormat: "mm/dd/yyyy" },
      registrationNumber: "BNB-2610-0007",
      audit: { templateKey: "intro_code", templateName: "Introductory Scuba Code" },
    });
    const doc = await getDocument({ data: bytes, disableWorker: true, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((i) => i.str).join(" ");
    assert.match(text, /Maria Lopez/);
    assert.match(text, /BNB-2610-0007/);
  });
});

describe("customer flow has no popups", () => {
  it("register and packet page do not open new windows", () => {
    const reg = fs.readFileSync("register.html", "utf8");
    const packet = fs.readFileSync("functions/f/[token].js", "utf8");
    for (const src of [reg, packet]) {
      assert.equal(src.includes("window.open"), false);
      assert.equal(src.includes('target="_blank"'), false);
      assert.equal(/\balert\s*\(/.test(src), false);
      assert.equal(/\bconfirm\s*\(/.test(src), false);
      assert.equal(/\bprompt\s*\(/.test(src), false);
    }
  });
});
