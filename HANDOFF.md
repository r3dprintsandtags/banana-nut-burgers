# Banana Nut Burgers: Handoff and Master Build Prompt

Updated October 20, 2026. Supersedes the earlier handoff document (it predates the full dive questionnaire).

## 1. Status
- Claude-hosted version (with database and owner inbox): https://claude.ai/artifact/NrKmEMYGdEi6KQgwCyiE6k
- GitHub-ready copy: `index.html` in this package (static; booking goes to WhatsApp, optional `ENDPOINT`).
- Tested in a desktop browser at phone size with a stand-in database: validation, two divers, cruise questions, other-certification box, share link, email copy, WhatsApp fallback, Spanish, owner inbox display, and the page loading without errors with no Claude runtime.
- Not tested: real database writes on the live page, a real email app, real WhatsApp sends, real phones.

## 2. Reference-site analysis (short)
| Site | Keep | Avoid |
|---|---|---|
| banananutburgers.com | Personal voice, reviews, WhatsApp | No booking path, outdated, English only, no zoom |
| islanddivingcenter.com | Clear service split, WhatsApp on each service, trust stats | Cart, search, heavy banners |
| idcroatan.com | Strong personal brand, simple navigation | Stale content, basic contact page |
| seahuntdivers.com | Online booking, visible prices, demo-dive request | Very long page, accounts and store |

## 3. What the page contains
Hero with logo and WhatsApp/Book/Call; swipeable service cards (Try Scuba, Dives & courses, Island tours, Snorkel, Beach & bar, Hike & explore); stats band; photo gallery with lightbox; booking questionnaire; directions; fixed bottom action bar; Spanish/English; light/dark.

### Booking questionnaire
- Service (cards), name, guests, WhatsApp or email, email for a copy, arrival date, departure date
- Per diver (up to two per submission): certification level (required: None, Open Water, Advanced Open Water, Rescue, Other + text), number of logged dives, date of last dive, fun-dive dropdown (No fun dives, Only one dive, One day 2-3 dives, Multiple dives 5-dive package), dive course Yes/No + which courses
- Cruise ship guest (dropdowns, default "Not a cruise ship guest"): fun dives, snorkel tour, try scuba on port day
- Notes; "Email me a copy" checkbox; share-form link for groups larger than two (each person fills their own form)
- Dive questions are hidden for Beach & bar and Hike & explore.

### Record saved (Claude-hosted `bookings` collection, or POSTed to `ENDPOINT`)
`name, contact, email, guests, arrival, departure, service, divers[{name?, cert, certOther, logged, last, fun, course, courses}], cruise{fun, snorkel, tryScuba}?, note, at, done`
Option codes: cert = cNone/cOW/cAOW/cRes/cOth; fun = f0/f1/f2/f5; yes/no = yes/no.

## 4. Assets
- 13 photos from the shop's Facebook captures; only the hero is large (775 px), the rest are 206 px thumbnails (soft when enlarged). Dolphin photo is a crop of a video thumbnail.
- Logo is a drawn SVG, not the official logo.
- No bonfire photo exists in the supplied files, so the card is named "Beach & bar".

## 5. Business facts used
Banana Nut Burgers Dive Shop at Tita's Pink Seahorse Bar, West End, Roatán. WhatsApp/phone +504 9876-3374. Email banananutburgers@gmail.com. Instagram and Facebook: banananutburgers. No prices were published, so none are shown.

## 6. Open items
1. Real bonfire/sunset photo; original full-resolution photos; official logo.
2. Prices or packages (optional).
3. Tagline "Dive. Laugh. Repeat." confirmation.
4. Owner notifications (email/WhatsApp) need a real backend.
5. Hosted-page database access: only signed-in people with interact access can write; read access is shared at that level.

## 7. Master build prompt (Replit, Cursor, or similar)
> You are a senior full-stack engineer and designer. Build a production-ready, mobile-first, bilingual (English/Spanish) interactive digital card and booking site for **Banana Nut Burgers Dive Shop**, West End, Roatán, Honduras. Use `index.html` as the visual, content, and behavior reference; keep its look, copy, and questionnaire exactly.
>
> **Brand:** ocean blue #0a86b0, banana yellow #ffc928, navy #06161f, sand #fff8e6; playful, photo-led.
>
> **Front end:** sticky bottom action bar (WhatsApp, Call, Book); full-screen photo hero; swipeable service cards that preselect the form; stats band; gallery with lightbox; the full booking questionnaire in section 3 (required certification level, up to two divers, cruise-guest dropdowns, share-form link, "email me a copy"); Spanish/English toggle defaulting to browser language; light/dark; 48 px tap targets; WCAG AA; lazy WebP images; Lighthouse 90+.
>
> **Back end:** Node.js/Express (or Cloudflare Pages Functions + D1). `POST /api/bookings` validates, rate-limits, and stores the record schema in section 3. Notify the owner by email and WhatsApp/SMS on each request. Keep the prefilled-WhatsApp fallback if the API fails. Send the guest a confirmation copy when they provide an email.
>
> **Admin:** `/admin` with hashed-password login, secure session cookie, CSRF protection; bookings table with status (new, confirmed, done), search, CSV export, English/Spanish.
>
> **Security and SEO:** HTTPS, CSP/HSTS/X-Content-Type-Options headers, input sanitizing, honeypot, no personal data in logs; title, meta description, Open Graph image, LocalBusiness structured data, sitemap, robots.
>
> **Do not invent prices or testimonials.** Deliver full source, `.env.example`, deployment steps with the custom domain banananutburgers.com, and a README.
