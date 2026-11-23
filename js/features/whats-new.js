// js/features/whats-new.js — the "What's new" section.
//
// Two parts:
//   * a card in Settings ("What's new") with the latest release open and the earlier
//     ones one tap away;
//   * a one-time bar the first time the app opens after an update ("Abhyas updated to
//     v2.62"), so a student learns what changed without hunting for it. A brand-new
//     install never sees it, and dismissing it (or opening the card) marks the version seen.
//
// RELEASES is the single list to edit when shipping: newest first. tests/whats-new.test.js
// fails if the newest entry is not the running APP_VERSION, so it cannot be forgotten.
const WHATS_NEW = {
  SEEN_KEY: 'abhyas_seen_version',

  RELEASES: [
    { version: '2.64', date: '2026-11-23', title: 'One portal, one system', items: [
      { icon: 'ph-layout', title: 'Every screen on the same grid', text: 'Nineteen screens now share one page header, one card, one row and one set of controls — so a button, a label or a progress bar sits in the same place wherever you meet it.' },
      { icon: 'ph-books', title: 'A library with one voice', text: 'My library no longer says its name three times: one header, its two actions, a segmented filter and one clear empty state.' },
      { icon: 'ph-cards', title: 'A calmer question card', text: 'The quiz, the options and the explanation use the same surfaces as the rest of the app, with larger answer rows and a clearer right/wrong state.' }
    ] },
    { version: '2.63', date: '2026-11-22', title: 'A calmer home, and data tools you can trust', items: [
      { icon: 'ph-house', title: 'Home greets you', text: 'Your name, the date, your streak and your accuracy at the top of Home, with one button that puts you back where you left off.' },
      { icon: 'ph-paint-brush', title: 'A quieter, clearer app', text: 'A calmer top bar, a floating tab bar, roomier cards and larger tap targets — the same screens, easier to read and to reach.' },
      { icon: 'ph-broom', title: 'Download all, refresh, clean up', text: 'Settings can now save every question set at once, fetch the newest copy of the questions, and remove only the broken or out-of-date cached files. Progress and notes are never touched.' }
    ] },
    { version: '2.62', date: '2026-11-22', title: 'Notes you can read, and a What\u2019s new section', items: [
      { icon: 'ph-note', title: 'Export notes that say which question they are about', text: 'The exported file now lists the QN number and the question for every note, and there is a plain-text version you can print or show a teacher.' },
      { icon: 'ph-hash', title: 'The QN number on your saved questions too', text: 'My library cards carry the same QN chip as the quiz, review, print sheets and search.' },
      { icon: 'ph-sparkle', title: 'This section', text: 'After an update the app tells you what changed, once. The full list lives here in Settings.' }
    ] },
    { version: '2.61', date: '2026-11-21', title: 'Chapters load faster and more reliably', items: [
      { icon: 'ph-lightning', title: 'A blocked or slow server no longer holds the app up', text: 'The app tries several sources at once and uses the first good answer, instead of waiting out each one.' },
      { icon: 'ph-arrows-clockwise', title: 'Check for new chapters now', text: 'Settings shows where your chapters came from and when the server was last asked, with a button to check right away.' },
      { icon: 'ph-warning-circle', title: 'Clear messages when something fails', text: 'The retry screen names the source that failed and why, so a problem can be fixed instead of guessed at.' }
    ] },
    { version: '2.60', date: '2026-11-20', title: 'Always the latest questions', items: [
      { icon: 'ph-cloud-arrow-down', title: 'Online, the current question file is always fetched', text: 'A correction shows the next time you open the chapter. Offline, your saved questions are used.' },
      { icon: 'ph-gauge', title: 'Faster first open', text: 'The published site is built into far fewer files, about a third quicker on a slow connection.' }
    ] },
    { version: '2.59', date: '2026-11-19', title: 'Updates without a hard reload', items: [
      { icon: 'ph-arrow-counter-clockwise', title: 'Opening the app is enough', text: 'New chapters, corrected questions and new app versions arrive on a normal open or reload.' }
    ] },
    { version: '2.58', date: '2026-11-18', title: 'Every question tracked by its id', items: [
      { icon: 'ph-fingerprint', title: 'Your progress follows the question, not its position', text: 'Saved items, missed questions, notes, chapter coverage and reports use the question\u2019s id, so re-ordering a chapter never mixes them up.' },
      { icon: 'ph-lock-key', title: 'PIN lock for shared phones', text: 'Optional. Turn it on in Settings.' },
      { icon: 'ph-cloud-check', title: 'Backup status in plain words', text: 'The results screen says whether your work is only on this phone or safely backed up.' }
    ] }
  ],

  current() { return (typeof APP_VERSION !== 'undefined') ? APP_VERSION : ''; },
  _seen() { try { return localStorage.getItem(this.SEEN_KEY) || ''; } catch (e) { return ''; } },
  _markSeen() { try { localStorage.setItem(this.SEEN_KEY, this.current()); } catch (e) { window.warnCaught && window.warnCaught('js/features/whats-new.js', e); } },

  /* The Settings card. */
  render() {
    const box = document.getElementById('whats-new-list');
    if (!box) return;
    box.textContent = '';
    this.RELEASES.forEach((r, i) => {
      const d = document.createElement('details');
      d.className = 'wn-rel';
      if (i === 0) d.open = true;
      const sum = document.createElement('summary');
      sum.style.cssText = 'cursor:pointer;min-height:44px;display:flex;align-items:center;gap:.5rem;font-weight:650;font-size:.85rem';
      const v = document.createElement('span'); v.className = 'ctag ta'; v.textContent = 'v' + r.version;
      const t = document.createElement('span'); t.textContent = r.title;
      sum.append(v, t);
      if (i === 0) { const n = document.createElement('span'); n.className = 'ctag tg'; n.textContent = 'New'; sum.append(n); }
      d.appendChild(sum);
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;margin:0 0 .6rem;padding:0;display:grid;gap:.55rem';
      r.items.forEach(it => {
        const li = document.createElement('li');
        li.style.cssText = 'display:flex;gap:.6rem;align-items:flex-start';
        const ic = document.createElement('i'); ic.className = 'ph ' + it.icon; ic.setAttribute('aria-hidden', 'true');
        ic.style.cssText = 'color:var(--accent);margin-top:.15rem';
        const col = document.createElement('div');
        const h = document.createElement('div'); h.style.cssText = 'font-weight:650;font-size:.82rem'; h.textContent = it.title;
        const p = document.createElement('div'); p.className = 't-foot'; p.textContent = it.text;
        col.append(h, p); li.append(ic, col); ul.appendChild(li);
      });
      d.appendChild(ul);
      box.appendChild(d);
    });
    const dt = document.getElementById('whats-new-version');
    if (dt) dt.textContent = 'v' + this.current();
  },

  /* The one-time bar after an update. */
  _showBar() {
    if (document.getElementById('wn-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'wn-bar'; bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:.75rem;right:.75rem;bottom:calc(var(--safe-b,0px) + 4.2rem);z-index:9997;display:flex;align-items:center;gap:.6rem;'
      + 'background:var(--surface,#fff);color:var(--ink,#111);border:1px solid var(--accent-line,var(--sep,#ccc));border-radius:12px;padding:.55rem .8rem;box-shadow:var(--sh-3,0 6px 20px rgba(0,0,0,.18))';
    const t = document.createElement('div'); t.style.cssText = 'flex:1;font-size:.8rem;line-height:1.35';
    const latest = this.RELEASES[0];
    t.textContent = 'Abhyas updated to v' + this.current() + (latest && latest.version === this.current() ? ': ' + latest.title : '');
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'See what\u2019s new';
    go.style.cssText = 'min-height:44px;padding:0 .9rem;border:none;border-radius:10px;background:var(--accent,#1E7A4C);color:var(--on-accent,#fff);font-weight:700;font-size:.78rem;cursor:pointer;font-family:inherit';
    go.addEventListener('click', () => { bar.remove(); WHATS_NEW.open(); });
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.textContent = '\u00d7';
    x.style.cssText = 'min-width:44px;min-height:44px;border:none;background:none;color:var(--ink-3,#555);font-size:1.2rem;cursor:pointer';
    x.addEventListener('click', () => { bar.remove(); WHATS_NEW._markSeen(); });
    bar.append(t, go, x);
    document.body.appendChild(bar);
  },

  open() {
    this._markSeen();
    try { if (typeof UI !== 'undefined' && UI.go) UI.go('data'); } catch (e) { window.warnCaught && window.warnCaught('js/features/whats-new.js', e); }
    setTimeout(() => {
      const c = document.getElementById('whats-new-card');
      if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
  },

  init() {
    if (this._wired) return;
    this._wired = true;
    this.render();
    const seen = this._seen();
    if (!seen) { this._markSeen(); return; }                       // a new install: nothing has changed for them
    if (seen === this.current()) return;                           // already told
    /* Wait until the student is actually in the app (signed in, no quiz running). */
    const tryShow = () => {
      const inQuiz = (typeof S !== 'undefined') && S.quiz && S.quiz.active;
      const signedIn = (typeof S !== 'undefined') && S.user && S.user.token;
      if (signedIn && !inQuiz && !document.querySelector('.mbg.show, #applock')) { this._showBar(); return true; }
      return false;
    };
    let n = 0;
    const iv = setInterval(() => { if (tryShow() || ++n > 40) clearInterval(iv); }, 1500);
  }
};
window.WHATS_NEW = WHATS_NEW;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => WHATS_NEW.init());
else WHATS_NEW.init();
