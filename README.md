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

## Change content
- Phone, WhatsApp, email: search for `50498763374` and `banananutburgers@gmail.com`.
- Text (English and Spanish): the `T` object at the top of the script.
- Service cards: the `svc` lists in `T`. Photos are base64 inside the file; replace them with image files and update the `src` values if you prefer.
- Share-form link: automatic (the page's own address plus `#book`).
