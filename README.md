# Banana Nut Burgers Dive Shop: Interactive Digital Card

Single-file, bilingual (English/Spanish) mobile-first site for Banana Nut Burgers Dive Shop, West End, Roatán, Honduras.
Live preview (Claude-hosted): https://claude.ai/artifact/NrKmEMYGdEi6KQgwCyiE6k

## Files
- `index.html`: the whole site (HTML, CSS, JS, and all photos embedded, about 600 KB)
- `HANDOFF.md`: full project handoff, open items, and the master build prompt
- `admin.html`: the owner CRM (served at `/admin`)
- `functions/`: Cloudflare Pages Functions API (`/api/bookings`, `/api/login`)
- `schema.sql`: D1 database schema for bookings
- `wrangler.toml`: Cloudflare Pages config (project `banana-nut-burgers`, no build step, root is the output)
- `_headers`: security headers served by Cloudflare Pages

## Deploy on Cloudflare Pages
This is a static site with no build step. Two ways to deploy:

**Option A — Wrangler (from this folder):**
```powershell
npx wrangler login
npx wrangler pages deploy . --project-name banana-nut-burgers
```

**Option B — Cloudflare dashboard + Git:**
1. Push this repo to GitHub.
2. Cloudflare Dashboard > Workers & Pages > Create > Pages > Connect to Git, pick this repo.
3. Build settings: Framework preset `None`, Build command *(leave empty)*, Build output directory `/`.
4. Every push to `main` then auto-deploys. For banananutburgers.com, add it under the project's Custom domains tab and create the DNS record Cloudflare lists.

## Bookings CRM / backend (Cloudflare D1)
Every booking request is saved automatically to a D1 database, and the owner manages them at **`/admin`** (e.g. `https://banana-nut-burgers.pages.dev/admin`). WhatsApp remains as a backup: after saving, the guest is still offered a prefilled WhatsApp message to +504 9876-3374.

**One-time setup:**
```powershell
npx wrangler login
npx wrangler d1 create banana-nut-burgers-db   # paste the returned database_id into wrangler.toml
npx wrangler d1 execute banana-nut-burgers-db --remote --file=schema.sql
npx wrangler pages secret put ADMIN_PASSWORD --project-name banana-nut-burgers   # owner login password
npx wrangler pages secret put SESSION_SECRET --project-name banana-nut-burgers   # any long random string
npx wrangler pages deploy . --project-name banana-nut-burgers
```
If you deploy via Dashboard + Git instead, add the same two secrets and the D1 binding (`DB` → `banana-nut-burgers-db`) under the Pages project's Settings.

**Optional:** set a `BOOKING_WEBHOOK_URL` secret to also POST each new booking to Zapier/Make/n8n (for owner WhatsApp/email notifications).

**Local dev / test:**
```powershell
npx wrangler d1 execute banana-nut-burgers-db --local --file=schema.sql
npx wrangler pages dev . --binding ADMIN_PASSWORD=test123 --binding SESSION_SECRET=devsecret123
# site: http://localhost:8788  ·  CRM: http://localhost:8788/admin (password: test123)
```

CRM features: live stats, status flow (New → Confirmed → Done), search, booking details (divers, cruise, notes), one-tap WhatsApp/email to the guest, CSV export, auto-refresh, English/Spanish.

## Customer registration, e-signature & compliance
Customers register at **`/register`** (linked from the card as "Customer Registration & Forms"): intro → information → accuracy declaration & separate consents → document review + drawn e-signature → review → confirmation with a public reference like `BNB-2026-AB12CD`. Signed documents and signature images are stored in a **private R2 bucket** (never public); staff view/download them only from the CRM's **Registrations** tab, and every view/download/review is written to the **Audit** tab. Customers can request corrections from `/register` (reference + phone must match; records are never displayed publicly).

**Setup (in addition to the CRM setup above):**
```powershell
npx wrangler r2 bucket create banana-nut-burgers-docs
npx wrangler d1 execute banana-nut-burgers-db --remote --file=migrations/0002_registration.sql
```
(`schema.sql` contains both migrations for fresh databases.)

> ⚠️ **Forms approval required:** No business-approved legal forms were in this workspace, so `registration-v1` in `functions/_form.js` is a safe **default template — not a liability waiver and not legal advice**. Have the business (with qualified legal review) approve or replace the declaration/privacy wording and bump `FORM_VERSION` before production use. Each signature records the exact version + SHA-256 hash of the signed content.

**Corrections & retention:** correction requests are reviewed in the CRM's Corrections tab. No automated deletion/retention policy is enforced yet — set one with the business before production.

## Digital dive check-in journey (redesigned)
The card now opens with a **Digital dive check-in** section: primary **Start Registration**, plus Resume Registration, Dive Shop Information, Contact, and Registration Requirements. `/register` is a 6-step guided wizard with a live progress tracker that reflects actual saved state:

1. **Trip & activity** (activity, date, participants, optional booking ref) → 2. **Diver information** → 3. **Required forms** (loaded from the admin-configurable forms registry, filtered by activity) → 4. **Waivers & acknowledgments + e-signature** → 5. **Safety & medical** (no business-approved medical form exists yet, so this step explains staff will complete screening with the diver — a submitted registration is *never* represented as medical clearance) → 6. **Review & submit** → confirmation showing **Submitted · Awaiting Review** with the reference.

- **Drafts:** progress auto-saves server-side after step 2. Resume needs the reference + resume code (stored hashed; a phone or name alone can never open a draft). Same-device resume is one tap.
- **Idempotency:** every attempt carries a key; double-taps/retries return the original reference instead of duplicating.
- **Admin form configuration:** CRM → **Forms** tab manages form names (EN/ES), descriptions, required/optional, ordering, applicable activities, versions, and staff-review flags. Every edit snapshots the previous version into `form_versions`; previously signed documents keep their original version + hash.
- **Stack note:** the working vanilla HTML/JS + Pages Functions + D1/R2 app was extended rather than rewritten in React/TypeScript, to preserve the deployed site, branding, and tested flows.

**Deploy this update:**
```powershell
npx wrangler d1 execute banana-nut-burgers-db --remote --file=migrations/0003_drafts_forms.sql
npx wrangler pages deploy . --project-name banana-nut-burgers
```

## Change content
- Phone, WhatsApp, email: search for `50498763374` and `banananutburgers@gmail.com`.
- Text (English and Spanish): the `T` object at the top of the script.
- Service cards: the `svc` lists in `T`. Photos are base64 inside the file; replace them with image files and update the `src` values if you prefer.
- Share-form link: automatic (the page's own address plus `#book`).
