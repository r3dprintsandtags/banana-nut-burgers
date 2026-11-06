# Production snapshot

Saved from https://banana-nut-burgers.pages.dev on 2026-11-06 (America/New_York).
This branch is a backup only. It is not a deploy and it does not change D1.

Files:

- `admin.html` — response body of `GET /admin` (the CRM).
- `index.html` — response body of `GET /`.
- `register.html` — response body of `GET /register.html`.
- `api-landing.json` — response body of `GET /api/landing`.
- `js/hero.js` — `GET /js/hero.js` (loaded by the live homepage).
- `js/landing.js` — `GET /js/landing.js` (imported by `hero.js`; comment in the file says the Pages function imports it too).
- `js/status-client.js` — `GET /api/register/status-client` (loaded by `/admin` and `register.html`).

`GET /admin`, `GET /`, `GET /register.html`, `GET /api/landing`, `GET /js/hero.js`, `GET /js/landing.js`, and `GET /api/register/status-client` all returned HTTP 200 with no login cookie.

## Routes the live pages call

### Public

| Method and path | Who calls it | Response |
| --- | --- | --- |
| `GET /api/landing` | `admin.html` `loadHome`, `js/hero.js` `boot` | `200` `{"landing":{...}}`, `cache-control: public, max-age=60`. Keys: `heroOn` (bool), `intervalMs` (number, live value 6500), `slides` (array, max used 6), `trust` (array of `{en,es}`), `reviews` (array), `hours`, `hoursEs`, `specialImage`. Each slide: `src`, `srcset`, `alt`, `altEs`, `focal`, `on`. |
| `GET /api/promotions` | `index.html` `loadPromos` | JSON `{promotions: [...]}` used by the homepage special card. |
| `POST /api/schedule-requests` | `index.html` cancel/reschedule sheet | JSON body `{reservationNumber, phone, fullName, kind, preferredDate}`. `kind` is `cancel` or `reschedule`. |
| `GET /api/register/status-client` | `/admin` and `register.html` script tag | `200` `content-type: application/javascript; charset=utf-8`, `cache-control: public, max-age=300`. Defines `STATUS_WORDS`, `STATUS_ICONS`, `CHIP_COLORS`, `CHIP_CSS`, `possessive`, `taskLabel`, `primaryAction`. |
| `GET /js/hero.js` and `GET /js/landing.js` | homepage | Static scripts. `safePath` only allows `img/...` and `api/landing/file/...`. |
| `POST /api/bookings` | public booking form (repo function, not re-fetched) | Existing create-booking route. |

### Admin cookie `bnb_admin` (401 without it)

`admin.html` `api()` sends `Content-Type: application/json` and treats HTTP 401 as logged out.

| Method and path | Request | Response used by the page |
| --- | --- | --- |
| `POST /api/login` | `{password}` | `200 {ok:true}` sets the cookie. `401 {error:"Wrong password"}`. |
| `DELETE /api/login` | empty | clears the cookie. |
| `GET /api/bookings?status=&q=` | `status` is empty, `today`, `newtoday`, `done`, `complete`, or `archive`. `q` is the search box. Unauthenticated call returned `401 {"error":"Unauthorized"}`. | `{bookings:[...], stats:{daily, fresh, done, complete, archive}}`. The page reads `stats.daily` (Daily total), `stats.fresh` (New today), `stats.done` (IN THE BOAT), `stats.complete` (Dive completed), `stats.archive` (Archive). Each booking may include `dive_done`, `archived`, `date`, `time`, `status`, `checkin`. |
| `PATCH /api/bookings/:id` | `{status:"confirmed"\|"done"\|"new"}` or `{archived:0\|1}` or `{diveDone:0\|1}` | `{ok:true}`. |
| `DELETE /api/bookings/:id` | empty | deletes one booking. |
| `GET /api/bookings/:id/party?lang=` | | `{registrations, headcount, registeredCount, booking}`. |
| `GET /api/landing` | | same JSON as the public GET. |
| `POST /api/landing` | `{landing:{heroOn, intervalMs, slides, trust, reviews, hours, hoursEs, specialImage}}` | `{landing}` or `{error}`. |
| `POST /api/landing/upload` | `multipart/form-data` field `file` (jpeg, png, webp, gif). Sent with `fetch`, not the JSON helper. | `{src}` on success, `{error}` otherwise. `src` must match `img/...` or `api/landing/file/...` (see `js/landing.js`). |
| `GET /api/registrations?...` | `q`, `status`, and the in-person filter uses `manual=1` | `{registrations, stats}`. Stats include `total`, `drafts`, `submitted`, `under_review`, `approved`, `flagged`, `corrections`, and `manual`. |
| `POST /api/registrations/staff` | `{firstName, lastName, phone, email, manualShop}` | `{ok, ref, url, manualShop, registrationNumber}`. |
| `GET /api/registrations/:id` | | registration detail, including `manual_shop` / `data.manualShop`. |
| `PATCH /api/registrations/:id` | `{status, reviewNote}` | status change. |
| `DELETE /api/registrations/:id` | | delete registration. |
| `GET /api/registrations/:id/signature` | | signature image. |
| `GET /api/audit` | | `{audit:[{created_at, actor, action, entity, entity_id, details}]}`. |
| `GET /api/corrections` and `PATCH /api/corrections` | `{id, status}` | correction requests. |
| `GET /api/schedule-requests` and `PATCH /api/schedule-requests` | `{id, status}` | schedule changes. |
| `GET /api/promotions?all=1` and `POST /api/promotions` | promotion fields | staff promotion editor. |
| `POST /api/forms/submissions/:id` related deletes | | form packet delete from the CRM. |

`GET /api/bookings` without a cookie is blocked. The homepage editor GET is not.

These server files were not in any git branch, stash, reflog, or worktree, and the live URLs do not return their source: `functions/api/landing.js`, `functions/api/landing/upload.js`, and the bookings `archived` / `dive_done` / daily-stats behavior.
