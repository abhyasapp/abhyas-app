# Abhyas

Offline-first exam-prep PWA for **Loksewa Civil Engineering** (Nepal): practice
questions by chapter, weekly sets, subjective answers with PDF upload and
grading, progress/streak tracking, reports, and an admin console.

Live: https://app.mku.name.np/

Evaluating Abhyas as an acquisition? See
[`docs/ACQUISITION-READINESS.md`](docs/ACQUISITION-READINESS.md) for the honest
transfer checklist and the blockers that need owner action. The code is
proprietary; see [`LICENSE`](LICENSE).

## Quick start

```bash
npm install
npm run serve        # http://localhost:5500
npm run verify       # syntax + handlers + buttons + i18n + SEO + lint + tests (what CI runs)
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
| `css/` | `tokens.css` (design tokens, light + dark, shared by both student pages) and `app.css` (all styles of `user.html`). The landing page keeps its small stylesheet inline for first paint; `admin.html` is self-contained |
| `js/core/` | Shared foundations: config, constants, auth, access rules, storage, sync, net, text/format helpers, `modal.js` (dialog focus manager), `i18n.js` (English / Nepali) |
| `js/features/settings-ui.js` | The "Display and accessibility" (theme, text size, language, reduce motion, focus mode) and "Storage" (usage meter, downloaded sets, protect data, backup, remove downloads) cards on Data & backup |
| `js/features/` | Student features: quiz engine, review, weekly/hourly sets, PDF viewer, insights, subjective exams |
| `js/admin/` | Admin features: users, payments, weekly sets, subjective grading, logs |
| `js/report/` | User and admin reports |
| `js/data/` | Loaders/indexes for chapter and question data |
| `js/app/` | Page entry point for the landing page (`index-page.js`); the old `document.write` loader shims were removed |
| `tools/` | `audit*.mjs/js`, `check-syntax.mjs`, `check-i18n.mjs`, `sync-shell.mjs`, `build-content-index.mjs`, `e2e/` (Playwright + axe suites) and self-hosted `vendor/` libraries |
| `tests/` | Vitest unit + repo-integrity tests |

### Backend (three tiers)

- **Supabase Edge Function** (`SUPABASE_URL`): primary API for everything not in `DRIVE_ACTIONS`.
- **Google Apps Script** (`GAS_URL`): Drive-only actions (files, content keys, e-mail verification, hard questions).
- **jsDelivr CDN** (`CONTENT_CDN_BASE`): question content from the `abhyasapp/content` repo.

`abhyasEndpointFor(action)` in `js/core/config.js` decides which tier an action goes to.
The server code lives in [`../backend`](../backend).

## Content (chapters) delivery — the single point of failure, and how it is contained

The app cannot run without `chapters-data.js` from the content repo. `js/data/chapters-loader.js`:

- tries several **mirrors** of the same file (jsDelivr, its fastly and gcore hosts, raw GitHub), all derived
  from `CONTENT_CDN_BASE`. To pin content to a tag or commit, change `@main` to `@<tag-or-sha>` there once
  and every mirror follows;
- trusts a download only if it **looks like** the chapters file, and keeps it as the "last good" copy only after it
  has **run and passed the contract** (`ChapterData.levels / chapterName / allFileRefs`). A bad commit to the
  content repo therefore falls back to the last good copy instead of breaking learners, and the bad file is
  remembered so it is not stored again;
- runs the source from a `blob:` URL, so `script-src` needs no `'unsafe-inline'`;
- makes the app wait (`ChapterDataReady`) and shows a retry screen that also retries when the device is back online;
- reports `boot_failure` / `csp` to the activity log (`crash-report.js`).

**Deploy gate:** `tools/e2e/smoke_browser.py` loads the app in real Chromium cold then warm and fails on any console
error, CSP violation, missing `ChapterData` or icon font. It runs in `verify.yml` (normal, bad-commit, mirror-down,
poisoned-cache) and in `smoke-live.yml` against the deployed site and the real CDN.
Run it locally: `python3 tools/e2e/smoke_browser.py --scenario bad-commit`.

- **Sync you can see.** `PSYNC.describe()` says in words whether work is only on the device, uploading, failed
  or safely backed up (with the number of waiting changes); the results screen and the toolbar button show it.
- **App lock.** An optional PIN for shared phones (`js/features/app-lock.js`): salted PBKDF2 hash, locks on open and
  after 3 minutes in the background, wrong-try back-off, "forgot" = sign out. It keeps casual snoopers out; it is not
  protection against someone inspecting the device. Browser test: `python3 tools/e2e/applock.py`.
- **Admin permissions are explained.** A button the admin may not use shows as a locked button naming the permission
  (`ADMIN.lockedBtn`), instead of silently disappearing.

## Updates reach students without a hard reload

Opening the app, or an ordinary browser reload, is enough. Nothing needs Ctrl+Shift+R.

- **App code** (HTML/JS/CSS): the service worker is network-first with revalidation, so a normal reload gets the new
  deploy. Each page declares its version (`<meta name="abhyas-version">`, kept equal to `APP_VERSION` by a test); if a slow
  connection ever assembles a page from two deploys, `PWA.forceFresh()` does one clean fully-fresh reload (once per
  version, so no loop). An update found while the app is in the background is applied silently; in the foreground a
  "Reload" bar appears and never interrupts a quiz.
- **Chapter data** (`chapters-data.js`): checked on every open (and on return to the app, every 5 minutes, and when the
  device comes back online) with a conditional request (`If-None-Match`: a 304 costs almost nothing). A newer file is run
  in the open page and swapped in **live**, only if it passes the contract; a broken one is refused and remembered.
  Raw GitHub is asked first (jsDelivr caches a branch URL for hours).
- **Question files** (`content/<file>.json`): when a chapter is opened and its saved copy was last checked more than
  10 minutes ago (`QUIZ.REVAL_MS`), a conditional check runs first (2 s cap, then the saved copy opens and the check
  finishes behind it). A corrected question therefore shows the next time the chapter opens.
- Test: `python3 tools/e2e/live_update.py`.

### Things to know before editing

- **Every question is identified by id, in this priority: NON-PUBLIC id, then PUBLIC number, then position.**
  `QKEY` (`js/core/qkey.js`) is the one definition. `nid` is the internal numeric id; `pqn` is the readable
  `public_qn` (`"G0011.110001"`); `uid` (`fileId_position`) is the last resort, used only for content that publishes
  neither id and only while the question text still agrees. `qid` is kept on every record as the primary of those
  (`nid`, else `pqn`) because older code and the backend read it; a stored `qid` is classified by its shape (digits only
  = non-public id, anything else = public number), so data saved before this priority existed keeps working and upgrades
  itself when its set is next parsed (`QKEY.adoptSet`). Never compare `uid` or `qid` directly: use `QKEY.same / of /
  ids / mapKeys / mergeLists / makeIndex`. This covers solving history, misses, coverage (`S.cov.<file>.m` is keyed by id;
  its position string `p` is rebuilt for the file's current order), bookmarks, the wrong bank, notes, stats, sync,
  backup export and import, corrections and reports (which now send `uid`, `qid`, `nid` and `pqn`; the server should
  match by `nid`, then `pqn`, then `uid`). Tests: `tests/id-priority.test.js`, `qkey-identity`, `saved-by-qid`.
- **Reporting is id-first end to end.** A report carries the `qid` (the `uid` is a hint).
  The offline queue holds up to 100 reports on the device, keyed by `qid + reason`; when it
  is full the NEW report is refused with a message, an unsent one is never dropped. A flush
  sends them one by one, retries by itself after a dropped connection or a rate limit, and
  marks the report-history row by `qid`. The admin screen opens a report from its `qid` +
  file even when the `uid` has no usable position. Tests: `tests/report-qid-queue.test.js`.
- **Sign-in speed.** A student whose stored session is still inside its trial/licence
  window opens the app immediately and is verified in the background (a rejected session
  signs out as soon as the answer arrives). Admin sign-in requests permissions and data
  together and opens the first screen as soon as permissions are known.
- **One home per idea.** Saved questions and notes live in *My library*; missed questions
  live in *Weak spots*. `UI.go('bookmarks')` / `#bookmarks` open Library → Saved.

- **Script load order matters.** `js/core/config.js` must load first and exactly once;
  `constants.js`, `text.js`, `format.js` etc. follow. Everything shares globals.
- **Always escape.** Any dynamic value put into `innerHTML` must go through `esc()`.
- **Click handlers** are `data-on-click="OBJ.method()"` attributes dispatched by `js/core/actions.js`.
  The target must be reachable as a global (see `js/core/expose.js`).
- **PDFs share one component.** `js/features/pdf-viewer.js` is the only PDF
  surface in the app — students read study PDFs and answer papers with it, admins
  open the same paper in annotate mode. Marks are stored in PDF points (they
  survive zooming and rotation) and on save it hands ink-only per-page PNG
  overlays to `annotate.onSave(overlays, info)`; the admin console stamps them
  onto the original PDF with pdf-lib. The pdf.js engine is self-hosted in
  `tools/vendor/pdfjs/` (service-worker precached) with a cdnjs fallback.
- **Content changes reach offline downloads.** `chapters-loader.js` fires
  `abhyas:chapters-updated` when `chapters-data.js` changes while the app is open;
  `CACHE.refreshFromUpdate` (`js/features/cache.js`) then purges deleted files,
  fetches files added to your picked groups, and rechecks every downloaded set
  against the CDN (`refresh=1` bypasses the service worker's CDN mirror in
  `cdnCacheFirst`). Offline or on a weak connection it stores
  `abhyas_chapters_refresh_pending` and retries on reconnect / next boot.
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
npm run audit:buttons # boots every page, checks each button has a working handler (~45 s; included in verify)
npm run check-i18n   # every data-i18n string has a Nepali translation
npm run audit:seo    # titles, canonical, structured data, heading and CSS-weight checks
npm run audit        # duplicate symbols, orphan files, unused vendor files (report only)

# real-browser suites (need: pip install playwright && playwright install chromium; npm i --no-save axe-core)
python3 tools/e2e/walk.py light 390   # every screen: JS errors, axe, overflow (also dark 390, light 320/768/1280, dark 1280)
python3 tools/e2e/flows.py            # onboarding, quiz, bookmark, saved progress
python3 tools/e2e/flows2.py           # landing, register, login, admin smoke, service worker + OFFLINE reload
python3 tools/e2e/sprint.py           # 60-day sprint end to end
python3 tools/e2e/search.py           # question search
python3 tools/e2e/exam.py             # timed exam: unselect an answer (click again, Clear, c key) and scoring
python3 tools/e2e/qbank.py            # remove from the wrong-answer bank (with Undo), report a question
python3 tools/e2e/history.py          # practice history is never trimmed or lost on cloud merge
python3 tools/e2e/storage.py          # early storage warning, nothing deleted automatically
python3 tools/e2e/sprint-accuracy.py  # syllabus is complete only at 85% accuracy
python3 tools/e2e/sprint-i18n.py      # sprint page in Nepali
python3 tools/e2e/admin-perms.py      # what each kind of admin can see
python3 tools/e2e/settings.py         # Data & backup: display and storage cards
```

Scripts are plain globals, so tests load them with `tests/helpers/load-globals.js`
(a small `vm` sandbox) instead of importing them.

`tests/pages.test.js` boots `index.html`, `user.html` and `admin.html` in jsdom with
the real scripts and fails on any `SyntaxError`. A classic-script redeclaration
(two files both declaring `const ADMIN`) silently kills the later file — and the
feature with it — so this is the check that catches it.

## Roadmap (suggested)

1. Tests for scoring and the quiz engine (`js/features/quiz-engine.js`). Progress sync is covered by `tests/psync.test.js`.
2. ~~Replace the ~300 empty `catch {}` blocks with a tiny `warn()` helper~~ (done: they call `window.warnCaught` from `js/core/config.js`, silent unless `localStorage.abhyas_debug = '1'`; `no-empty` now flags empty non-catch blocks).
3. ~~Remove `document.write` shims in `js/app/`~~ (done in 1.48.0).
4. ~~Move inline JS out; drop `'unsafe-inline'` from `script-src`~~ (done in 2.49, scripts live in `js/boot/`). Remaining: inline CSS and `style=` attributes.
5. ~~Replace the `new Function` dispatcher; drop `'unsafe-eval'`~~ (done in 2.48: safe interpreter in `js/core/actions.js`, covered by `tests/actions-safe.test.js`).
6. ~~Add a licence~~ (done: proprietary, all rights reserved; a buyer needs a
   written assignment).
