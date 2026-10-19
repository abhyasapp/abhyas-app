# Abhyas

Offline-first exam-prep PWA for **Loksewa Civil Engineering** (Nepal): practice
questions by chapter, weekly sets, subjective answers with PDF upload and
grading, progress/streak tracking, reports, and an admin console.

Live: https://app.mku.name.np/

## Quick start

```bash
npm install
npm run serve        # http://localhost:5500
npm run verify       # syntax check + lint + tests (what CI runs)
```

There is no build step: the app is static files (plain browser scripts, no bundler).

## How it fits together

| Path | What it is |
|---|---|
| `index.html` | Landing, sign-in, registration, payment entry |
| `user.html` | The signed-in student app |
| `admin.html` | Admin console (never cached by the service worker) |
| `privacy.html`, `terms.html` | Legal pages |
| `sw.js` | Service worker: app-shell precache, network-first shell, cache-first CDN/vendor |
| `manifest.json` | PWA manifest |
| `js/core/` | Shared foundations: config, constants, auth, access rules, storage, sync, net, text/format helpers |
| `js/features/` | Student features: quiz engine, review, weekly/hourly sets, PDF viewer, insights, subjective exams |
| `js/admin/` | Admin features: users, payments, weekly sets, subjective grading, logs |
| `js/report/` | User and admin reports |
| `js/data/` | Loaders/indexes for chapter and question data |
| `js/app/` | Page entry point for the landing page (`index-page.js`); the old `document.write` loader shims were removed |
| `tools/` | `audit.mjs`, `audit-handlers.js`, `check-syntax.mjs`, and self-hosted `vendor/` libraries |
| `tests/` | Vitest unit + repo-integrity tests |

### Backend (three tiers)

- **Supabase Edge Function** (`SUPABASE_URL`): primary API for everything not in `DRIVE_ACTIONS`.
- **Google Apps Script** (`GAS_URL`): Drive-only actions (files, content keys, e-mail verification, hard questions).
- **jsDelivr CDN** (`CONTENT_CDN_BASE`): question content from the `abhyasapp/content` repo.

`abhyasEndpointFor(action)` in `js/core/config.js` decides which tier an action goes to.
The server code is **not** in this repo.

### Things to know before editing

- **Script load order matters.** `js/core/config.js` must load first and exactly once;
  `constants.js`, `text.js`, `format.js` etc. follow. Everything shares globals.
- **Always escape.** Any dynamic value put into `innerHTML` must go through `esc()`.
- **Click handlers** are `data-on-click="OBJ.method()"` attributes dispatched by `js/core/actions.js`.
  The target must be reachable as a global (see `js/core/expose.js`).
- **Releasing:** bump the version in all three places — `js/core/config.js`,
  `js/core/version.js`, `package.json` (a test fails if they differ). The service
  worker cache name is derived from it, which is how clients pick up new files.
  Add new shell files to the `SHELL` list in `sw.js`: run `npm run sync-shell` (a test fails if a script or
  stylesheet loaded by `index.html`/`user.html` is not precached, or if a listed file does not exist).

## Testing

```bash
npm test             # vitest run
npm run test:cov     # with coverage
npm run lint         # ESLint (lenient on purpose — see eslint.config.mjs; no-eval / no-new-func are errors)
npm run check-syntax # node --check on every first-party file
npm run audit:buttons # boots every page, checks each button has a working handler (~45 s)
npm run audit        # duplicate symbols, orphan files, unused vendor files (report only)
```

Scripts are plain globals, so tests load them with `tests/helpers/load-globals.js`
(a small `vm` sandbox) instead of importing them.

## Roadmap (suggested)

1. Tests for progress sync (`js/core/psync.js`), scoring and the quiz engine.
2. Replace the ~300 empty `catch {}` blocks with a tiny `warn()` helper (`no-empty` now flags empty non-catch blocks; empty catches are still allowed).
3. ~~Remove `document.write` shims in `js/app/`~~ (done in 1.48.0).
4. Move inline CSS/JS out of `user.html` / `admin.html`; then drop `'unsafe-inline'` from the CSP.
5. Replace the `new Function` dispatcher with `addEventListener`-based delegation; then drop `'unsafe-eval'`.
6. Add a licence once you decide how the code may be used.
