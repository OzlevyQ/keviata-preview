# קביעותא · Keviata

**שאלה אחת מהעתיד, תשובה מהמקורות, כל יום.**

Each day one AI/tech story, examined through Torah, Mishna, Talmud and Rashi.
Static PWA hosted on GitHub Pages: https://ozlevyq.github.io/keviata/

## Structure
- `index.html`, `js/`, `css/`: the app (hash router: `#/today`, `#/archive`, `#/progress`, `#/profile`, `#/settings`, `#/read/<date>`). `?date=YYYY-MM-DD` deep-links to an edition.
- `login/`: Descope sign-in (Google OAuth; email OTP behind `FLAGS.emailLogin`). Reading never requires login; login enables sync.
- `admin/`: admin dashboard (Supabase edge functions `admin-overview`, `admin-users`).
- `sw.js`: service worker (offline shell, cache-first fonts/vendor/images, only touches `keviata-*` caches).
- `vendor/`: self-hosted, pinned DOMPurify, supabase-js, Descope web-js SDK (DOMPurify 3.4.17, supabase-js 2.109.0, Descope web-js-sdk 1.53.1; hashes in `vendor/SHA256SUMS`).
- `fonts/`: self-hosted Frank Ruhl Libre and Heebo (OFL, licenses included).
- `images/CREDITS.md`: image credits. `images/og-default.png`: social share card.

## Config and flags
`js/config.js` holds the Supabase URL/anon key, Descope project id and feature flags:
- `emailLogin`: email OTP via Descope (requires OTP email enabled in the Descope project).
- `dedications`: dedication UI (needs a `dedications` table).
- `serverAccountDelete`: use a `delete-account` edge function instead of client-side row deletes.

Backend work needed for flagged features is specified in the venture repo (`product/backend-changes.md`).

## Local preview
Serve the repo root with any static server (e.g. `python3 -m http.server`) and open `/`.
