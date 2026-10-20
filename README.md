# Banana Nut Burgers Dive Shop: Interactive Digital Card

Single-file, bilingual (English/Spanish) mobile-first site for Banana Nut Burgers Dive Shop, West End, Roatán, Honduras.
Live preview (Claude-hosted): https://claude.ai/artifact/NrKmEMYGdEi6KQgwCyiE6k

## Files
- `index.html`: the whole site (HTML, CSS, JS, and all photos embedded, about 600 KB)
- `HANDOFF.md`: full project handoff, open items, and the master build prompt
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

## How booking works when hosted here
- GitHub Pages is static, so there is no database. Every request opens a prefilled **WhatsApp** message to +504 9876-3374, and guests can also **email themselves a copy**.
- To collect requests automatically, create an endpoint that accepts a JSON POST (Formspree, Cloudflare Worker, Google Apps Script, or your own server) and paste its URL into `ENDPOINT=""` near the top of the script in `index.html`. The page then POSTs each request as JSON before offering WhatsApp.
- The owner inbox only appears in the Claude-hosted version.

## Change content
- Phone, WhatsApp, email: search for `50498763374` and `banananutburgers@gmail.com`.
- Text (English and Spanish): the `T` object at the top of the script.
- Service cards: the `svc` lists in `T`. Photos are base64 inside the file; replace them with image files and update the `src` values if you prefer.
- Share-form link: automatic (the page's own address plus `#book`).
