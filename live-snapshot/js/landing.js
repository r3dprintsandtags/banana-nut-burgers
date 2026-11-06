/** Homepage media helpers. Safe to import from tests and from the Pages function. */

export const HERO_MS = 6500;

const PATH_OK = /^(?:\/)?(?:img\/|api\/landing\/file\/)[A-Za-z0-9_./-]{1,160}$/;

export function defaultLanding() {
  return {
    heroOn: true,
    intervalMs: HERO_MS,
    slides: [
      { src: "img/shop-front.jpg", alt: "Banana Nut Burgers dive shop on the beach in West End", altEs: "Tienda de buceo Banana Nut Burgers en la playa de West End", focal: "68% 42%", on: true },
      { src: "img/discover-turtle.png", alt: "Hawksbill turtle with divers on the reef", altEs: "Tortuga carey con buzos en el arrecife", focal: "50% 55%", on: true },
      { src: "img/dive-boat.png", alt: "Dive boat at the shop", altEs: "Bote de buceo en la tienda", focal: "50% 62%", on: true },
      { src: "img/opt/sea-fan.jpg", alt: "Sea fan on the reef in Roatán", altEs: "Abanico de mar en el arrecife de Roatán", focal: "50% 50%", on: true },
      { src: "img/reef-swim.jpg", alt: "Swimming over the reef", altEs: "Nadando sobre el arrecife", focal: "50% 50%", on: true },
      { src: "img/deep-blue.jpg", alt: "Deep blue water off Roatán", altEs: "Agua azul profundo frente a Roatán", focal: "50% 40%", on: true },
    ],
    trust: [
      { en: "Small groups (4-8)", es: "Grupos pequeños (4-8)" },
    ],
    reviews: [],
    hours: "",
    hoursEs: "",
    specialImage: "img/dive-boat.png",
  };
}

export function safePath(v) {
  const s = String(v || "").trim();
  if (!PATH_OK.test(s)) return "";
  if (s.includes("..")) return "";
  return s.replace(/^\//, "");
}

export function safeSrcset(v) {
  const s = String(v || "").trim().slice(0, 240);
  if (!s) return "";
  const urls = s.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  if (!urls.length || !urls.every((u) => safePath(u))) return "";
  return s;
}

export function sanitizeLanding(input) {
  const base = defaultLanding();
  const src = input && typeof input === "object" ? input : {};
  const interval = Number(src.intervalMs);
  const slidesIn = Array.isArray(src.slides) ? src.slides : base.slides;
  const slides = [];
  for (const raw of slidesIn.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const path = safePath(raw.src);
    if (!path) continue;
    const focal = /^\d{1,3}% \d{1,3}%$/.test(String(raw.focal || "")) ? String(raw.focal) : "50% 50%";
    slides.push({
      src: path,
      srcset: safeSrcset(raw.srcset),
      alt: String(raw.alt || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160),
      altEs: String(raw.altEs || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 160),
      focal,
      on: raw.on !== false,
    });
  }
  const trust = [];
  for (const raw of (Array.isArray(src.trust) ? src.trust : base.trust).slice(0, 6)) {
    if (!raw || typeof raw !== "object") continue;
    const en = String(raw.en || "").trim().slice(0, 80);
    const es = String(raw.es || "").trim().slice(0, 80);
    if (!en && !es) continue;
    trust.push({ en, es });
  }
  const reviews = [];
  for (const raw of (Array.isArray(src.reviews) ? src.reviews : []).slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const text = String(raw.text || "").trim().slice(0, 500);
    if (!text) continue;
    const rating = Number(raw.rating);
    reviews.push({
      name: String(raw.name || "").trim().slice(0, 80),
      text,
      textEs: String(raw.textEs || "").trim().slice(0, 500),
      rating: rating >= 1 && rating <= 5 ? Math.round(rating) : 0,
      source: String(raw.source || "").trim().slice(0, 40),
    });
  }
  return {
    heroOn: src.heroOn !== false,
    intervalMs: Number.isFinite(interval) ? Math.min(12000, Math.max(4000, interval)) : HERO_MS,
    slides: slides.length ? slides : base.slides,
    trust,
    reviews,
    hours: String(src.hours || "").trim().slice(0, 160),
    hoursEs: String(src.hoursEs || "").trim().slice(0, 160),
    specialImage: safePath(src.specialImage) || base.specialImage,
  };
}

export function activeSlides(config) {
  const c = config || defaultLanding();
  return (c.slides || []).filter((s) => s && s.on !== false && s.src);
}

export function heroMode(config) {
  if (config && config.heroOn === false) return "static";
  return activeSlides(config).length >= 2 ? "slideshow" : "static";
}

export function nextIndex(index, length, dir) {
  const n = Number(length) || 0;
  if (n <= 0) return 0;
  const d = dir < 0 ? -1 : 1;
  return (Number(index) + d + n * 4) % n;
}

export function countdownParts(endsAt, now) {
  if (!endsAt || !/^\d{4}-\d{2}-\d{2}$/.test(String(endsAt))) return null;
  const end = Date.parse(String(endsAt) + "T23:59:59");
  if (!Number.isFinite(end)) return null;
  const ms = end - Number(now);
  if (ms <= 0) return null;
  return {
    d: Math.floor(ms / 86400000),
    h: Math.floor((ms % 86400000) / 3600000),
  };
}

export function slideAlt(slide, lang) {
  if (!slide) return "";
  if (lang === "es") return slide.altEs || slide.alt || "";
  return slide.alt || slide.altEs || "";
}
