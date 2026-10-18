# Security

Please report vulnerabilities privately by e-mail to **abhyasbymku@gmail.com**
(the contact already listed on the privacy page). Do not open a public issue.

## What is public by design

The Supabase function URL, the Google Apps Script URL and the Google OAuth
client ID in `js/core/config.js` are public identifiers, not secrets. Real
protection comes from the **server side** (the Supabase Edge Function and the
Apps Script), which must:

- validate the session token on every action and expire/rotate it;
- authorise admin and payment actions per user, never trusting the client;
- rate-limit login and verification endpoints;
- keep paid content protected even though the content repo is served publicly.

Never commit a Supabase `service_role` key, private keys, or passwords.
`npm test` fails if it finds one.

## Known hardening work

- The CSP still allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`
  (needed today by the `data-on-*` dispatcher in `js/core/actions.js`, which
  compiles handlers with `new Function`, and by inline scripts in the HTML).
- The session token is stored in `localStorage`, so XSS would expose it. Every
  `innerHTML` use must go through `esc()` (`js/core/text.js`).
