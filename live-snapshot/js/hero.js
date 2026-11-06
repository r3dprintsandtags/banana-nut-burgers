import {
  defaultLanding, sanitizeLanding, activeSlides, heroMode, nextIndex,
  countdownParts, slideAlt,
} from "./landing.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fineHover = window.matchMedia("(hover: hover)").matches;
let cfg = defaultLanding();
let slides = activeSlides(cfg);
let index = 0;
let timer = 0;
let hidden = document.hidden;

const $ = (id) => document.getElementById(id);

function lang() {
  return document.documentElement.lang === "es" ? "es" : "en";
}

function mountSlides() {
  const box = $("heroSlides");
  if (!box) return;
  const mode = heroMode(cfg);
  const list = mode === "slideshow" ? slides : slides.slice(0, 1);
  if (!list.length) return;
  box.innerHTML = "";
  list.forEach((s, i) => {
    const img = document.createElement("img");
    img.className = "hero-slide" + (i === 0 ? " is-on" : "");
    img.alt = slideAlt(s, lang());
    img.style.objectPosition = s.focal || "50% 50%";
    img.decoding = "async";
    img.width = 1024;
    img.height = 576;
    if (i === 0) {
      img.src = s.src;
      if (s.srcset) img.srcset = s.srcset;
      img.sizes = "100vw";
      img.setAttribute("fetchpriority", "high");
    } else {
      img.dataset.src = s.src;
      img.alt = slideAlt(s, lang());
    }
    box.appendChild(img);
  });
  const dots = $("heroDots");
  if (dots) {
    dots.hidden = list.length < 2;
    dots.innerHTML = "";
    list.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hero-dot" + (i === 0 ? " is-on" : "");
      b.setAttribute("aria-label", (lang() === "es" ? "Foto " : "Photo ") + (i + 1));
      b.onclick = () => go(i, true);
      dots.appendChild(b);
    });
  }
  if (mode === "slideshow" && !reduced) warmAndPlay();
}

function warmAndPlay() {
  const imgs = [...document.querySelectorAll("#heroSlides .hero-slide")];
  let left = 0;
  imgs.forEach((img, i) => {
    if (i === 0 || img.src) return;
    left++;
    const pre = new Image();
    pre.onload = pre.onerror = () => {
      img.src = img.dataset.src;
      left--;
      if (left <= 0) arm();
    };
    pre.src = img.dataset.src;
  });
  if (left === 0) arm();
}

function arm() {
  clearInterval(timer);
  if (reduced || hidden || heroMode(cfg) !== "slideshow") return;
  if (!isHeroVisible()) return;
  timer = setInterval(() => go(nextIndex(index, slideCount(), 1), false), cfg.intervalMs || 6500);
  restartBar();
}

function slideCount() {
  return document.querySelectorAll("#heroSlides .hero-slide").length;
}

function go(next, manual) {
  const imgs = [...document.querySelectorAll("#heroSlides .hero-slide")];
  if (imgs.length < 2) return;
  index = nextIndex(next, imgs.length, 0);
  // nextIndex with dir 0 treats as +1. Set directly when manual.
  if (manual || true) index = ((next % imgs.length) + imgs.length) % imgs.length;
  imgs.forEach((img, i) => {
    img.classList.toggle("is-on", i === index);
    if (img.dataset.src && !img.src) img.src = img.dataset.src;
    img.alt = slideAlt(slides[i] || {}, lang());
  });
  document.querySelectorAll(".hero-dot").forEach((d, i) => d.classList.toggle("is-on", i === index));
  if (manual) arm();
  else restartBar();
}

function restartBar() {
  document.querySelectorAll(".hero-dot").forEach((d) => {
    d.classList.remove("run");
    void d.offsetWidth;
    if (!hidden && !reduced) d.classList.add("run");
  });
}

function isHeroVisible() {
  const hero = document.querySelector(".hero");
  if (!hero) return true;
  const r = hero.getBoundingClientRect();
  return r.bottom > 80 && r.top < window.innerHeight;
}

function bindHero() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  hero.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowRight") { ev.preventDefault(); go(index + 1, true); }
    if (ev.key === "ArrowLeft") { ev.preventDefault(); go(index - 1, true); }
  });
  let x0 = 0;
  hero.addEventListener("touchstart", (ev) => { x0 = ev.changedTouches[0].clientX; }, { passive: true });
  hero.addEventListener("touchend", (ev) => {
    const dx = ev.changedTouches[0].clientX - x0;
    if (Math.abs(dx) < 40) return;
    go(index + (dx < 0 ? 1 : -1), true);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    hidden = document.hidden;
    if (hidden) clearInterval(timer);
    else arm();
  });
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) arm();
    else clearInterval(timer);
  }, { threshold: 0.2 });
  io.observe(hero);
}

function paintTrust() {
  const row = $("trustRow");
  if (!row) return;
  row.hidden = true;
}

function paintReviews() {
  const sec = $("reviewCarousel");
  if (!sec) return;
  const list = cfg.reviews || [];
  sec.hidden = !list.length;
  if (!list.length) return;
  sec.innerHTML = list.map((r) => {
    const text = lang() === "es" ? (r.textEs || r.text) : r.text;
    const stars = r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : "";
    return `<blockquote class="rev-card"><p>${esc(text)}</p><footer>${esc(r.name || "")}${r.source ? " · " + esc(r.source) : ""} ${stars ? `<span class="stars">${stars}</span>` : ""}</footer></blockquote>`;
  }).join("");
}

function paintHours() {
  const el = $("findHours");
  if (!el) return;
  const text = lang() === "es" ? (cfg.hoursEs || cfg.hours) : cfg.hours;
  el.hidden = !text;
  el.textContent = text || "";
}

function paintSpecialImage() {
  const card = $("promoCard");
  if (!card || !cfg.specialImage) return;
  card.style.setProperty("--promo-img", `url("${cfg.specialImage}")`);
}

function tickCountdown() {
  const el = $("promoCount");
  const ends = window.__promoEnds || "";
  const parts = countdownParts(ends, Date.now());
  if (!el) return;
  if (!parts) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = lang() === "es"
    ? `Termina en ${parts.d}d ${parts.h}h`
    : `Ends in ${parts.d}d ${parts.h}h`;
}

function bindHeader() {
  const head = $("siteHead");
  const onScroll = () => {
    if (head) head.classList.toggle("scrolled", window.scrollY > 24);
    const bar = $("bookBar");
    const hero = document.querySelector(".hero");
    if (bar && hero) bar.classList.toggle("show", hero.getBoundingClientRect().bottom < 40);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  const toggle = $("navToggle");
  const menu = $("mobileNav");
  if (toggle && menu) {
    toggle.onclick = () => {
      const open = menu.hasAttribute("hidden");
      if (open) menu.removeAttribute("hidden"); else menu.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
      menu.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", "false");
    }));
  }
}

let cardIO = null;
let cardTimer = 0;
function bindCards() {
  if (reduced || fineHover) return;
  if (cardIO) cardIO.disconnect();
  cardIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle("inview", e.isIntersecting));
  }, { threshold: 0.5 });
  document.querySelectorAll(".sv").forEach((c) => cardIO.observe(c));
  if (!cardTimer) {
    cardTimer = setInterval(() => {
      document.querySelectorAll(".sv.inview .sv-photos img.b").forEach((img) => {
        img.parentElement.parentElement.classList.toggle("swap");
      });
    }, 4000);
  }
}

function bindReveal() {
  if (reduced) {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

function bindLightbox() {
  const lb = $("lb");
  if (!lb) return;
  const img = lb.querySelector("img");
  let items = [];
  let at = 0;
  const show = (i) => {
    items = [...document.querySelectorAll(".mos img")];
    if (!items.length) return;
    at = (i + items.length) % items.length;
    img.src = items[at].currentSrc || items[at].src;
    img.alt = items[at].alt || "";
    lb.style.display = "flex";
    lb.focus();
  };
  document.querySelectorAll(".mos img").forEach((el, i) => {
    el.onclick = () => show(i);
  });
  lb.onclick = (ev) => { if (ev.target === lb) lb.style.display = "none"; };
  lb.onkeydown = (ev) => {
    if (ev.key === "Escape") lb.style.display = "none";
    if (ev.key === "ArrowRight") show(at + 1);
    if (ev.key === "ArrowLeft") show(at - 1);
  };
  let x0 = 0;
  lb.addEventListener("touchstart", (ev) => { x0 = ev.changedTouches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (ev) => {
    const dx = ev.changedTouches[0].clientX - x0;
    if (Math.abs(dx) < 40) return;
    show(at + (dx < 0 ? 1 : -1));
  }, { passive: true });
  window.BNBShowLightbox = show;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function boot() {
  try {
    const d = await (await fetch("/api/landing")).json();
    if (d && d.landing) cfg = sanitizeLanding(d.landing);
  } catch { cfg = defaultLanding(); }
  slides = activeSlides(cfg);
  mountSlides();
  paintTrust();
  paintReviews();
  paintHours();
  paintSpecialImage();
  tickCountdown();
  setInterval(tickCountdown, 60000);
  bindHero();
  bindHeader();
  bindCards();
  bindReveal();
  bindLightbox();
  const hero = document.querySelector(".hero");
  if (hero) requestAnimationFrame(() => hero.classList.add("ready"));
}

window.BNBLanding = {
  refresh() {
    slides = activeSlides(cfg);
    document.querySelectorAll("#heroSlides .hero-slide").forEach((img, i) => {
      if (slides[i]) img.alt = slideAlt(slides[i], lang());
    });
    paintTrust();
    paintReviews();
    paintHours();
    tickCountdown();
    bindCards();
    bindLightbox();
  },
  setEnds(v) { window.__promoEnds = v || ""; tickCountdown(); },
};

boot();
