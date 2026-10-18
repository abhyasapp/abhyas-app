// js/admin/router.js — the view dispatcher + keyboard handlers + periodic refresh.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, MODAL, CONFIRM, TOAST, BUSY,
// LS_USER, LS_ADMIN), core/admin-nav.js (ADMIN_NAV),
// features/today.js / users.js / payments.js / logs.js / expiring.js /
// admins.js / palette.js / weeklysets.js / studydocs.js / subjective-*.js /
// dashboard.js / settings.js / data.js — all deferred to call time.
// PDFVIEW, PALETTE, EXPIRING, TRENDS, MISSED, SUBJ_TABS, SUBJ_STORE,
// STUDYDOCS are referenced at call time via typeof where possible.

const UI = {
  current: 'today',
  TITLES: ADMIN_NAV.TITLES,
  FEATURES: ADMIN_NAV.FEATURES,
  _scroll: {},

  nav(id, opts = {}){
    const tabMap = { 'subj-qotd':'qotd', 'subj-exam':'exam', 'subj-add':'add' };
    let tab = null;
    if (tabMap[id]) { tab = tabMap[id]; id = 'subjective'; }

    const feat = this.FEATURES[id];
    const allowed = !feat || (Array.isArray(feat) ? feat.some(f => ADMIN.can(f)) : ADMIN.can(feat));
    if (!allowed) return TOAST.show('You do not have access to that section', 'warning');

    if (this.current) this._scroll[this.current] = window.scrollY;

    $$('.view').forEach(v => { v.classList.remove('on', 'animate'); });
    const view = $('view-' + id);
    if (view) { view.classList.add('on'); if (id !== this.current) view.classList.add('animate'); }

    $$('.rail-item').forEach(i => { i.classList.remove('active'); i.removeAttribute('aria-current'); });
    const navBtn = $('nav-' + id);
    if (navBtn) { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }

    $('crumb').textContent = this.TITLES[id] || 'Abhyas';
    document.title = (this.TITLES[id] || 'Admin') + ' · Abhyas Admin';

    const prev = this.current;
    this.current = id;

    if (id === 'today') EXPIRING.load();
    if (id === 'dashboard') TRENDS.load();
    if (id === 'dashboard' && !MISSED.lastResults.length) MISSED.load();
    if (id === 'subjective') SUBJ_TABS.go(tab || SUBJ_TABS.current);
    if (id === 'admins') ADMIN._paintCurrentView('admins');
    if (id === 'studydocs') STUDYDOCS.load();
    if (id === 'qreports' && typeof QREPORTS !== 'undefined') QREPORTS.load();

    this.railClose();
    if (opts.keepScroll && prev === id) window.scrollTo(0, this._scroll[id] || 0);
    else window.scrollTo({ top: 0, behavior: 'auto' });
    $('content').focus({ preventScroll:true });
  },

  scrollTop(){ window.scrollTo({ top: 0, behavior:'smooth' }); },

  railOpen(){
    $('rail').classList.add('open');
    $('rail-scrim').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('rail').querySelector('.rail-item')?.focus(), 60);
  },
  railClose(){
    $('rail').classList.remove('open');
    $('rail-scrim').classList.remove('show');
    if (!document.querySelector('.overlay.show') && !(window.PDFVIEW && PDFVIEW.isOpen())) document.body.style.overflow = '';
  },

  toggleMenu(e){
    e.stopPropagation();
    const m = $('account-menu');
    const open = m.classList.toggle('show');
    $('account-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
  },
  closeMenu(){
    $('account-menu').classList.remove('show');
    $('account-btn').setAttribute('aria-expanded', 'false');
  }
};

const _gateForm = $('gate-form');
if (_gateForm) _gateForm.addEventListener('submit', e => { e.preventDefault(); ADMIN.login(); });
['ad-user','ad-pass'].forEach(id => { const el = $(id); if (el) el.addEventListener('input', () => ADMIN.hideErr()); });

if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  const kh = $('kbd-hint'); if (kh) kh.textContent = '⌘K';
  $$('.menu-item .kb').forEach(k => k.textContent = '⌘K');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.menu-wrap')) UI.closeMenu();
  const picker = $('promote-results');
  if (picker && picker.classList.contains('show') && !e.target.closest('.picker')) picker.classList.remove('show');
});

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);

  if (window.PDFVIEW && PDFVIEW.isOpen()) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('app').classList.contains('on')) PALETTE.open();
    return;
  }
  if (e.key === '/' && !typing && $('app').classList.contains('on')) {
    e.preventDefault(); PALETTE.open(); return;
  }
   if (e.key === 'Escape') {
    if ($('ov-confirm').classList.contains('show')) { CONFIRM._no(); return; }
    if ($('palette').classList.contains('show')) { PALETTE.close(); return; }
    UI.closeMenu();
    MODAL.closeAll();
    UI.railClose();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (e.key === 'r') { e.preventDefault(); ADMIN.refresh(); return; }
    const order = ['today','dashboard','users','payments','admins','weeklysets','subjective','qreports','logs'];
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= order.length) { e.preventDefault(); UI.nav(order[n - 1]); }
  }
});

window.addEventListener('beforeunload', e => {
  if (!window.PDFVIEW || typeof PDFVIEW.isOpen !== 'function' || !PDFVIEW.isOpen()) return;
  const hasUnsaved = (typeof PDFVIEW.hasUnsavedMarks === 'function')
    ? PDFVIEW.hasUnsavedMarks()
    : (typeof PDFVIEW.isAnnotating === 'function' ? PDFVIEW.isAnnotating() : false);
  if (!hasUnsaved) return;
  e.preventDefault();
  e.returnValue = '';
});

setInterval(() => {
  if (document.hidden || !ADMIN.creds) return;
  if (document.querySelector('.overlay.show, #palette.show') || (window.PDFVIEW && PDFVIEW.isOpen())) return;
  const scope = ({
    today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
    admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
    logs:['logs'], settings:['settings']
  })[UI.current];
  if (scope) ADMIN.refresh(scope);
}, 60000);

setInterval(() => ADMIN.paintSync(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ADMIN.paintSync(); });

(function(){
  try {
    const s = JSON.parse(localStorage.getItem(LS_USER) || 'null');
    const admin = (JSON.parse(localStorage.getItem(LS_ADMIN) || '{}').user || '').toLowerCase();
    if (s && s.type === 'user' && s.username && admin && s.username.toLowerCase() === admin) {
      $('rail-switch-label').textContent = 'Switch to student app';
    }
  } catch(e){}
})();

(function(){
  try {
    const el = $('rail-version');
    if (el) el.textContent = 'Abhyas V1' + (typeof APP_VERSION !== 'undefined' ? ' · v' + APP_VERSION : '');
  } catch(e){}
})();

(function(){
  const pill = $('offline-pill');
  let wasOffline = !navigator.onLine;
  function paint(){
    const off = !navigator.onLine;
    if (pill) pill.classList.toggle('show', off);
    if (off && !wasOffline) {
      TOAST.show('You\u2019re offline \u2014 showing the last synced data', 'warning', 4000);
    } else if (!off && wasOffline) {
      TOAST.show('Back online \u2014 refreshing', 'success');
      ADMIN.refresh(({
        today:['stats'], dashboard:['stats'], users:['users'], payments:['payments'],
        admins:['admins'], weeklysets:['weeklysets'], qreports:['qreports'],
        logs:['logs'], settings:['settings']
      })[UI.current]);
    }
    wasOffline = off;
  }
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  if (pill) pill.classList.toggle('show', !navigator.onLine);
})();

ADMIN.init();

window.UI = UI;