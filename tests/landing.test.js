import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLanding, safePath, defaultLanding } from "../js/landing.js";

test("landing paths stay inside img and uploaded files", () => {
  assert.equal(safePath("img/shop-front.jpg"), "img/shop-front.jpg");
  assert.equal(safePath("/api/landing/file/landing-abc.jpg"), "api/landing/file/landing-abc.jpg");
  assert.equal(safePath("../secret"), "");
  assert.equal(safePath("https://example.com/a.jpg"), "");
});

test("sanitize keeps the live homepage shape and drops bad slides", () => {
  const out = sanitizeLanding({
    heroOn: false,
    intervalMs: 100,
    slides: [
      { src: "img/dive-boat.png", alt: "Boat", altEs: "Bote", focal: "10% 20%", on: true },
      { src: "../etc/passwd", alt: "no" },
    ],
    trust: [{ en: "Small groups (4-8)", es: "Grupos pequeños (4-8)" }],
    reviews: [{ name: "Ada", text: "Great dive", textEs: "Gran buceo", rating: 5, source: "Google" }],
    hours: "8-4",
    hoursEs: "8-4",
    specialImage: "img/dive-boat.png",
  });
  assert.equal(out.heroOn, false);
  assert.equal(out.intervalMs, 4000);
  assert.equal(out.slides.length, 1);
  assert.equal(out.slides[0].src, "img/dive-boat.png");
  assert.equal(out.reviews[0].rating, 5);
  assert.equal(out.specialImage, "img/dive-boat.png");
  const fresh = sanitizeLanding(null);
  assert.equal(fresh.intervalMs, defaultLanding().intervalMs);
  assert.ok(fresh.slides.length >= 1);
});
