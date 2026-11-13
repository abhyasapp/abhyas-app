# Acquisition readiness

This is an honest due-diligence note for anyone evaluating Abhyas as an
acquisition. It separates what is in this repository from what only the owner
can transfer.

## What a buyer receives here

- The complete static PWA frontend (`index.html`, `user.html`, `admin.html`).
- 50 automated test files and the `npm run verify` gate.
- The admin console, content import tools, written-answer grading, offline
  cache, progress sync client and service worker.
- A proprietary `LICENSE` and this transfer checklist.

## The five likely reasons a buyer walks away

| Blocker | Why it matters | Status |
|---|---|---|
| Backend source is not in this repository | The app calls a Supabase Edge Function and a Google Apps Script deployment. Without their source, a buyer cannot operate or audit the product independently. | **Owner action required.** Transfer `../backend`, the Supabase project and the Apps Script project, or give the buyer a written right to use the existing hosted backend. |
| Content rights are unclear | Questions and scanned pages were compiled from Loksewa material and commercial books. A buyer inherits the legal risk, not just the files. | **Owner action required.** Provide source/provenance records and permission for every commercial book. Remove anything that cannot be cleared. |
| No credential-free full-product demo | A buyer cannot click through the real app without an account, backend and admin session. The public sample question is useful but not a substitute for a demo workspace. | **Not solved.** The safe way to demo is a dedicated staging account with seeded data, not a client-side paywall bypass. |
| Revenue depends on manual payment approval | A QR transfer plus a human checking a screenshot does not scale and makes the business look owner-operated. | **Owner action required.** Add a payment gateway or a documented back-office process with response-time commitments. |
| Accounts, domain and brand are owner-locked | Supabase, Apps Script, Google OAuth, the domain, the content CDN and the support inbox are all in the owner's name. | **Owner action required.** Use the checklist below; a code change cannot transfer ownership. |

## Smaller risks a technical reviewer will notice

- `script-src` still allows `'unsafe-inline'` and `'unsafe-eval'` because of the
  `data-on-*` dispatcher and inline page scripts.
- Session tokens live in `localStorage`, so any XSS becomes account takeover.
- The app is a PWA, not a native Play Store / App Store package.
- The objective question bank is served from a public CDN; paid access is
  enforced by the backend, not by the files themselves.
- There is no formal SLA, company address or named data-protection officer.

## Transfer checklist

1. Sign a written assignment of code, content, trademarks and customer data.
2. Transfer the domain, DNS, TLS and e-mail inbox.
3. Transfer or recreate the Supabase project, buckets, Edge Function, secrets
   and database backups. Do not hand over a personal access token.
4. Transfer or recreate the Apps Script project and its Drive folders.
5. Transfer the Google OAuth client, or create a new one for the buyer's domain.
6. Transfer the content repository/CDN and confirm every content licence.
7. Transfer the payment QR/account or connect a gateway in the buyer's name.
8. Rotate every credential the outgoing owner ever had.
9. Give the buyer a staging account and a seeded demo workspace.
10. Hand over the business report exported from **Admin → Insights → Business
    report**, plus 12 months of payment records.

## What this release changed

- Added transparent pricing on the landing page, using the same public amount
  as the payment screen.
- Added a one-click **Business report** CSV in the admin Insights page.
- Added a proprietary `LICENSE` so the default rights are no longer ambiguous.
- Removed the `V1` suffix from the in-app version label.
- Fixed the `npm run audit` false positive that made a normal error string look
  like a broken import.

## What still requires the owner

The backend transfer, content permissions, payment gateway, demo workspace and
company/legal details cannot be created from this frontend repository. A buyer
who will not explain their objection is usually stuck on one of those, not on
another screen or animation.