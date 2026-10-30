import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.js";
import { PDFDocument } from "pdf-lib";
import { fillPdf, officialTemplate, stampMapFor, combinePacket } from "../../functions/_lib/forms/pdf.js";
import { stampPdf, downloadName } from "../../functions/_lib/forms/stamp.js";
import { pngStroke } from "../../scripts/png-stroke.mjs";

const KEYS = ["try_scuba_reg", "intro_code", "fit_to_dive", "privacy", "rec_waiver", "diver_medical"];

const adult = {
  first_name: "María", last_name: "Peña-Müller", full_name_print: "María Peña-Müller",
  dob: "1984-03-09",
  mailing_address: "1234 Avenida de los Cocoteros, Apartment 12, West End, Roatán, Islas de la Bahía",
  email: "maria.pena@example.com", cell_phone: "+504 9876-3374",
  emergency_contact_name: "José Peña", emergency_contact_relationship: "Spouse",
  emergency_contact_email: "jose.pena@example.com", emergency_contact_cell: "+504 9999-0000",
  training_center_name: "Banana Nut Burgers Dive Shop", training_center_street: "West End Road",
  training_center_zip_city: "34101 Roatán", training_center_state_country: "Bay Islands, Honduras",
  instructor_name: "Adrian Cruz", facility_name: "Banana Nut Burgers Dive Shop",
  signature_date: "2026-10-27", __dateFormat: "mm/dd/yyyy",
  fit_q1: "no", fit_q2: "no", fit_q3: "yes", fit_q4: "no", fit_q5: "no", fit_q6: "no", fit_q7: "no",
  dm_q1: "no", over_45: "no", dm_q3: "yes", dm_q4: "no", dm_q5: "no", dm_q6: "no", dm_q7: "no", dm_q8: "no", dm_q9: "no", dm_q10: "no",
  dm_box_A_1: "yes",
};
const minor = { ...adult, first_name: "Luis", last_name: "Peña", full_name_print: "Luis Peña", dob: "2014-06-02", guardian_name: "María Peña-Müller", signature_date: "2026-10-28" };

async function load(bytes) {
  const doc = await getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pages.push({
      width: vp.width,
      height: vp.height,
      items: tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({
        s: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || 0,
      })),
    });
  }
  return pages;
}

function centerIn(item, rect) {
  const cx = item.x + (item.w || 0) / 2;
  const cy = item.y + 3;
  return cx >= rect.x - 2 && cx <= rect.x + rect.w + 2 && cy >= rect.y - 2 && cy <= rect.y + rect.h + 4;
}

function rectsFor(map, pageIndex) {
  const rects = [];
  for (const field of map.fields || []) {
    if ((field.page || 0) !== pageIndex) continue;
    if (field.type === "yes_no") {
      if (field.yes) rects.push(field.yes);
      if (field.no) rects.push(field.no);
    } else rects.push(field);
  }
  return rects;
}

function sameItem(a, b) {
  return a.s === b.s && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;
}

describe("SSI stamp", () => {
  for (const key of KEYS) {
    it(`${key} keeps the original pages and only adds text inside mapped blanks`, async () => {
      const map = stampMapFor(key);
      const original = officialTemplate(key);
      const sig = pngStroke();
      const { bytes, placed } = await fillPdf({
        templateBytes: original,
        answers: adult,
        signaturePngBytes: sig,
        registrationNumber: "BNB-2610-0001",
        audit: { templateKey: key },
      });
      const src = await PDFDocument.load(original);
      const out = await PDFDocument.load(bytes);
      assert.equal(out.getPageCount(), src.getPageCount());
      assert.equal(out.getPageCount(), map.pages);
      out.getPages().forEach((page, i) => {
        const size = page.getSize();
        const orig = src.getPage(i).getSize();
        assert.ok(Math.abs(size.width - orig.width) < 0.2);
        assert.ok(Math.abs(size.height - orig.height) < 0.2);
        assert.ok(Math.abs(size.width - map.pageSize[i][0]) < 0.2);
        assert.ok(Math.abs(size.height - map.pageSize[i][1]) < 0.2);
      });

      const before = await load(original);
      const after = await load(bytes);
      after.forEach((page, i) => {
        const pool = before[i].items.slice();
        const extras = [];
        for (const item of page.items) {
          const hit = pool.findIndex((orig) => sameItem(orig, item));
          if (hit >= 0) pool.splice(hit, 1);
          else extras.push(item);
        }
        assert.equal(pool.length, 0, `${key} page ${i} lost preprinted text`);
        const margin = { x: page.width - 140, y: page.height - 18, w: 140, h: 16 };
        for (const item of extras) {
          const rects = [...rectsFor(map, i), margin];
          assert.ok(rects.some((r) => centerIn(item, r)), `${key} extra "${item.s}" at ${item.x.toFixed(1)},${item.y.toFixed(1)} is outside a blank`);
        }
      });

      for (const p of placed) {
        if (!p.value || p.key === "__registration_number") continue;
        const page = after[p.page || 0];
        const inside = page.items.filter((item) => centerIn(item, p) && !before[p.page || 0].items.some((orig) => sameItem(orig, item)));
        const got = inside.map((item) => item.s).join(" ").replace(/\s+/g, " ").trim();
        assert.equal(got, p.value, `${key} ${p.key}`);
      }

      assert.equal(placed.some((p) => p.key === "guardian_name" || p.key === "guardian_signature"), false);
      assert.equal(placed.some((p) => /physician|clinic|hospital/i.test(p.key)), false);
    });
  }

  it("fills guardian lines for a minor and leaves them empty for an adult", async () => {
    const sig = pngStroke();
    const grown = await fillPdf({
      templateBytes: officialTemplate("intro_code"),
      answers: adult,
      signaturePngBytes: sig,
      registrationNumber: "BNB-2610-0001",
      audit: { templateKey: "intro_code" },
    });
    const kid = await fillPdf({
      templateBytes: officialTemplate("intro_code"),
      answers: minor,
      signaturePngBytes: sig,
      guardianPng: sig,
      registrationNumber: "BNB-2610-0002",
      audit: { templateKey: "intro_code" },
    });
    assert.equal(grown.placed.some((p) => p.key === "guardian_name"), false);
    assert.ok(kid.placed.some((p) => p.key === "guardian_name" && p.value === "María Peña-Müller"));
    const sigs = kid.placed.filter((p) => p.key === "signature_png" || p.key === "guardian_signature");
    const map = stampMapFor("intro_code");
    for (const hit of sigs) {
      const field = map.fields.find((f) => f.key === hit.key && (f.page || 0) === (hit.page || 0));
      assert.ok(field);
      assert.ok(hit.x >= field.x - 0.5 && hit.y >= field.y - 0.5);
      assert.ok(hit.x + hit.w <= field.x + field.w + 0.5);
      assert.ok(hit.y + hit.h <= field.y + field.h + 0.5);
    }
  });

  it("writes a different signature date per document", async () => {
    const sig = pngStroke();
    const first = await stampPdf({
      templateBytes: officialTemplate("intro_code"),
      map: stampMapFor("intro_code"),
      answers: { ...adult, signature_date: "2026-10-27" },
      fontBytes: fs.readFileSync("functions/_lib/forms/fonts/NotoSans-Regular.ttf"),
      signaturePng: sig,
    });
    const second = await stampPdf({
      templateBytes: officialTemplate("rec_waiver"),
      map: stampMapFor("rec_waiver"),
      answers: { ...adult, signature_date: "2026-10-28" },
      fontBytes: fs.readFileSync("functions/_lib/forms/fonts/NotoSans-Regular.ttf"),
      signaturePng: sig,
    });
    assert.equal(first.placed.find((p) => p.key === "signature_date").value, "10/27/2026");
    assert.equal(second.placed.find((p) => p.key === "signature_date").value, "10/28/2026");
    assert.notEqual(first.placed.find((p) => p.key === "signature_date").value, second.placed.find((p) => p.key === "signature_date").value);
  });

  it("names the download and matches the sample packet page count", async () => {
    assert.equal(downloadName({ last: "Peña-Müller", first: "María", formName: "Try Scuba Registration", iso: "2026-10-27" }), "Peña-Müller_María_Try_Scuba_Registration_2026-10-27.pdf");
    const parts = KEYS.map((key) => officialTemplate(key));
    const packet = await combinePacket(parts);
    const doc = await PDFDocument.load(packet);
    const expected = KEYS.reduce((n, key) => n + stampMapFor(key).pages, 0);
    assert.equal(doc.getPageCount(), expected);
    assert.equal(stampMapFor("youth_addendum").status, "missing-pdf");
    assert.equal(stampMapFor("diving_medical_guidance").reference, true);
    const sample = fs.readFileSync("forms-output-samples/try_scuba_reg.adult.pdf");
    const again = await fillPdf({
      templateBytes: officialTemplate("try_scuba_reg"),
      answers: adult,
      signaturePngBytes: pngStroke(),
      registrationNumber: "BNB-2610-0001",
      audit: { templateKey: "try_scuba_reg" },
    });
    assert.equal(Buffer.from(again.bytes).equals(sample), false);
    const a = await load(sample);
    const b = await load(again.bytes);
    assert.equal(a[0].items.map((i) => i.s).join("|"), b[0].items.map((i) => i.s).join("|"));
  });

  it("customer pages do not open new windows", () => {
    const files = ["register.html", "functions/f/[token].js", "functions/_lib/forms/packet-client.js"];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      assert.equal(src.includes("window.open"), false, file);
      assert.equal(src.includes('target="_blank"'), false, file);
      assert.equal(/\balert\s*\(/.test(src), false, file);
      assert.equal(/\bconfirm\s*\(/.test(src), false, file);
      assert.equal(/\bprompt\s*\(/.test(src), false, file);
    }
  });
});
