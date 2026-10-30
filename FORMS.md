# Digital forms + e-sign (Banana Nut Burgers)

## Repo adaptation (read this)

The build prompt described a **multi-shop** CRM (`shop_id`, appointments, Telnyx WhatsApp Utility `form_link`, host `3agdigitalmediagroup.com`). **This repo is a single-shop** dive card: `customers` + `registrations` + `bookings`, admin cookie auth, private R2 `DOCS`.

| Prompt concept | This repo |
|---|---|
| `shop_id` | Omitted (single tenant). Shop code from `SHOP_CODE` (default `BNB`). |
| `contacts` | `customers` |
| `appointment_id` | `booking_id` (nullable FK to `bookings`) |
| `https://3agdigitalmediagroup.com/f/{token}` | `https://<this-site>/f/{token}` |
| WhatsApp Utility template send | **Done**: Telnyx `form_link` via `functions/_lib/forms/whatsapp.js`; wa.me deeplink fallback if keys missing. |
| SSI PDFs in `/forms-source/` | Drop files → `npm run inspect:pdfs` → upload in **admin-forms.html** (automap + click-to-place). Consent: paste into `*.en.txt` → `npm run sync:legal`. |

Registration flow: packet forms run inside `register.html` (and via `/f/{token}`). Each customer gets a stable **`registration_number`** on `customers`, stamped on PDFs, searchable in admin CRM.

## Cloudflare / pdf-lib — docs vs prompt (Oct 2026)

1. **pdf-lib on Workers**: Yes — pure JS, works on workerd. No HTML→PDF. AcroForm fill + drawImage/drawText/overlay are supported.
2. **CPU**: Workers **Free = 10 ms CPU** — too low for multi-page SSI fill. Use **Workers Paid** (CPU up to 5 min). Plan for `waitUntil` on submit.
3. **Memory**: 128 MB Worker limit — large 12-page guidance PDF as *attachment* is fine in R2; avoid loading all SSI PDFs in one isolate at once.
4. **D1**: Max row/BLOB **2 MB**. Encrypted answers JSON must stay under that. Queries/invocation: Paid 1000 / Free 50.
5. **R2**: Private bucket + auth streaming only — matches prompt. No egress fee.
6. **Turnstile**: Free unlimited challenges; **server Siteverify required**; tokens expire **300s**, single-use.
7. **Cron Triggers**: Free **5** / Paid **250** per account — enough for retention + `valid_until` reminders.
8. **Unverified in docs here**: exact AcroForm field names on *your* SSI PDFs (need binary files); Telnyx Utility template approval for `form_link`.

## Cloudflare resources to create

| Resource | Name / notes |
|---|---|
| D1 | existing `banana-nut-burgers-db` — run migration `0004_forms_esign.sql` |
| R2 | existing `banana-nut-burgers-docs` (private) |
| Turnstile | widget for form submit hostnames |
| Secret | `FORMS_ENC_KEY` — 32-byte hex (64 hex chars) |
| Secret | `TURNSTILE_SECRET_KEY` |
| Var | `TURNSTILE_SITE_KEY`, `SHOP_CODE=BNB`, `SHOP_TZ=America/Tegucigalpa`, `SHOP_NAME`, `FORMS_BASE_URL` |
| Cron | `0 * * * *` → `/api/forms/cron` (retention + waiver reminders) |

See `.env.example` for exact names.

## Quick start (after deploy + PDFs)

1. Run migrations `0004`, `0005`, `0006` on D1.
2. Drop SSI PDFs into `forms-source/` → `npm run inspect:pdfs`.
3. Paste legal text into `forms-source/<key>.en.txt` → `npm run sync:legal` (then POST consents) **or** paste in admin-forms upload.
4. Open **`/admin-forms.html`** → upload each PDF (automap) → click-to-place pins → Save → Preview.
5. Set `TELNYX_*` + Turnstile + `FORMS_ENC_KEY` in Cloudflare.
6. Customer: `/register` → packet forms → registration # on CRM.
7. Staff send: create request → `POST .../send` with `link` (WhatsApp Utility `form_link`).

## Former TODOs (done)

1. **PDF inspect + automap + R2 upload** — `inspect-pdfs.mjs`, `/api/forms/templates/upload`, automap rules.
2. **Legal text from files** — `*.en.txt` / `sync:legal` + consent fields on upload/mapper.
3. **Telnyx `form_link`** — wired with deeplink fallback.
4. **Click-to-place mapper** — `/admin-forms.html` (pdf.js canvas + pins + preview).

Also: physician guidance PDF attach, instructor/facility shop settings, youth addendum flag.
