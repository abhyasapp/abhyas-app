// tools/smoke-live.mjs — verify the deployed product, not just the repo.
// No secrets and no browser: checks the public shell, version and health API.
import fs from 'node:fs';

const APP = (process.env.ABHYAS_LIVE_APP || 'https://app.mku.name.np').replace(/\/$/, '');
const API = (process.env.ABHYAS_LIVE_API || 'https://kdysjiiefvxnkrykgykz.supabase.co/functions/v1/api').replace(/\/$/, '');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const errors = [];

async function get(path, timeoutMs = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { redirect: 'follow', signal: ctl.signal });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, text: '', error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function check(name, condition, detail) {
  if (condition) console.log(`  ok  ${name}`);
  else { errors.push(`${name}: ${detail}`); console.log(`  FAIL ${name}: ${detail}`); }
}

console.log(`Live smoke: ${APP} (expected app ${pkg.version})`);

const home = await get(`${APP}/`);
check('landing page responds', home.status === 200, `HTTP ${home.status}${home.error ? ' ' + home.error : ''}`);
check('landing page is the app', /Abhyas/i.test(home.text), 'expected "Abhyas" in HTML');

const user = await get(`${APP}/user.html`);
check('student page responds', user.status === 200, `HTTP ${user.status}${user.error ? ' ' + user.error : ''}`);
check('student page is the app shell', /Abhyas/i.test(user.text), 'expected "Abhyas" in HTML');

const version = await get(`${APP}/js/core/version.js`);
const liveVersion = (/APP_VERSION\s*=\s*'([^']+)'/.exec(version.text) || [])[1];
check('live version matches package', liveVersion === pkg.version, `live ${liveVersion || 'missing'}, package ${pkg.version}`);

const health = await get(`${API}?action=health`);
let body = null;
try { body = JSON.parse(health.text); } catch (e) { /* handled below */ }
check('backend health responds', health.status === 200, `HTTP ${health.status}${health.error ? ' ' + health.error : ''}`);
check('backend is healthy', !!(body && body.success === true), health.text.slice(0, 160));
if (body) console.log(`  info backend ${body.backend || 'unknown'} ${body.version || ''}`.trim());

if (errors.length) {
  console.error(`\n${errors.length} smoke check(s) failed`);
  process.exit(1);
}
console.log('\nAll live smoke checks passed');
