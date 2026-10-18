// js/features/shell-ui.js — bottom nav sheet, admin switch, sidebar
// customizations, announcements, text-size, focus mode.
// MUST load AFTER: core/state.js (S), core/dom.js ($, $$, set), core/text.js (esc, escAttrJs),
// core/toast.js (toast), core/nav.js (NAV). Uses _setAdminVisible (shell-hooks.js),
// TUTORIAL, ACT.later, PSYNC, UI, ABHYAS_CONFIG, APPS at call time only.

window.BN = {
  _activeKey: null,
  open(key){
    const sec = NAV.sheet(key);
    if (!sec) return;
    set('bn-sheet-title-el', sec.title);
    $('bn-sheet-icon').className = 'ph ' + sec.icon;

    let adminCard = '';
    try {
      if (typeof S !== 'undefined' && S.user && S.user.adminCapable) {
        adminCard =
          '<button class="bn-sheet-item admin" data-on-click="BN.close();ACT.later(120,APP_SWITCH,\'toAdmin\')">' +
            '<span class="bn-sheet-ic"><i class="ph ph-shield-check"></i></span>' +
            '<span class="bn-sheet-info"><span class="bn-sheet-name">Admin console</span>' +
            '<span class="bn-sheet-sub">Students, payments and grading</span></span>' +
            '<i class="ph ph-arrow-square-out bn-sheet-arrow"></i>' +
          '</button>';
      }
    } catch(e){}

    const row = it => {
      const go = it.special === 'tutorial'
        ? "BN.close();setTimeout(function(){TUTORIAL.open()},140)"
        : "BN.close();setTimeout(function(){UI.go('" + it.view + "')},100)";
      return '<button class="bn-sheet-item" data-on-click="' + go + '">' +
        '<span class="bn-sheet-ic"><i class="ph ' + it.icon + '"></i></span>' +
        '<span class="bn-sheet-info"><span class="bn-sheet-name">' + esc(it.label) + '</span>' +
        (it.sub ? '<span class="bn-sheet-sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
        '<i class="ph ph-caret-right bn-sheet-arrow"></i>' +
      '</button>';
    };
    $('bn-sheet-grid').innerHTML = sec.sections.map(sc =>
      (sc.label ? '<div class="bn-sheet-lbl">' + esc(sc.label) + '</div>' : '') + sc.items.map(row).join('')
    ).join('') + (key === 'more' ? adminCard : '');

    $('bn-sheet').classList.add('show');
    $('bn-sheet-backdrop').classList.add('show');
    document.body.style.overflow = 'hidden';
    this._activeKey = key;
    setTimeout(() => { const f = $('bn-sheet-grid').querySelector('button'); if (f) f.focus(); }, 60);
  },
  close(){
    $('bn-sheet').classList.remove('show');
    $('bn-sheet-backdrop').classList.remove('show');
    document.body.style.overflow = '';
    this._activeKey = null;
  }
};

window.APP_SWITCH = {
  _capable: false,

  async refresh(){
    let user = null;
    try { user = (typeof S !== 'undefined' && S.user) ? S.user : null; } catch(e){}
    if (!user) { _setAdminVisible(false); return; }
    if (user.adminCapable) { this._capable = true; _setAdminVisible(true); }

    let online = false, token = '';
    try { online = (typeof S !== 'undefined' && S.online && !S.forcedOffline); token = user.token || ''; } catch(e){}
    if (!online || !token) return;

    let url = '';
    try { url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || (typeof APPS !== 'undefined' ? APPS : ''); } catch(e){}
    if (!url) return;

    try {
      const r = await fetch(url, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'checkAdminCapable', username:user.username, token:user.token })
      });
      const data = await r.json();
      if (data && data.success && data.adminCapable) { this._capable = true; _setAdminVisible(true); }
    } catch(e){}
  },

  async toAdmin(){
    let user = null;
    try { user = (typeof S !== 'undefined' && S.user) ? S.user : null; } catch(e){}
    if (!user || !user.token) { toast('Please log in again.'); return; }

    let online = true;
    try { online = (typeof S !== 'undefined' && S.online && !S.forcedOffline); } catch(e){}
    if (!online) { toast('You need a connection to open the admin console.'); return; }

    const btn = $('tb-admin-btn');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="margin:0"></span>'; }

    let url = '';
    try { url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || ''; } catch(e){}
    if (!url) { if (btn) { btn.disabled = false; btn.innerHTML = orig; } return; }

    try {
      const r = await fetch(url, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'adminSwitchFromUser', username:user.username, token:user.token })
      });
      const data = await r.json();

      if (!data || !data.success) {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        if (data && data.sessionInvalid) {
          toast('Your session expired — log in again.', 4500);
          try { localStorage.removeItem('abhyas_session'); localStorage.removeItem('abhyas_admin'); } catch(e){}
          setTimeout(() => { window.location.href = 'index.html'; }, 1500);
          return;
        }
        if (data && data.error && /does not have admin access/i.test(data.error)) {
          toast('This account is not an admin.', 4000);
          return;
        }
        toast((data && data.error) || 'Could not switch.');
        return;
      }

      localStorage.setItem('abhyas_admin', JSON.stringify({
        user: data.username || user.username,
        token: data.adminToken,
        expires: Date.now() + (data.expiresInMs || 86400000)
      }));
      try { if (typeof PSYNC !== 'undefined' && PSYNC._timer) PSYNC._beaconSync(); } catch(e){}
      toast('Opening the admin console…');
      setTimeout(() => { window.location.href = 'admin.html'; }, 250);
    } catch(e){
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      toast(e.message || 'Network error.');
    }
  }
};

window.SIDEBAR = {
  /* v1.26: nothing to relocate — the More tools section was removed and
     the utilities moved onto the Progress page. Kept as an empty list so
     the module stays a safe no-op. */
  SECONDARY: [],
  _expanded: false,
  init(){
    const target = document.getElementById('sb-more-items');
    if (!target || target.dataset.init === '1') return;
    target.dataset.init = '1';
    /* v1.25: purge any leftover Focus-mode button from a device that
       still had one. */
    const focusBtn = document.getElementById('nav-focus');
    if (focusBtn && focusBtn.parentNode) focusBtn.parentNode.removeChild(focusBtn);
    this.SECONDARY.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.parentNode) return;
      const clone = el.cloneNode(true);
      clone.classList.add('sb-secondary-item');
      target.appendChild(clone);
      el.style.display = 'none';
    });
    /* Hide any section whose items all moved to More tools. */
    document.querySelectorAll('#sb .sb-sec').forEach(sec => {
      const items = sec.querySelectorAll('.sb-item');
      if (!items.length) return;
      const visible = Array.prototype.filter.call(items, el => el.style.display !== 'none');
      if (!visible.length) sec.style.display = 'none';
    });
    this._applyState();
  },
  _applyState(){
    const items = document.getElementById('sb-more-items');
    const chev  = document.getElementById('sb-more-chev');
    if (items) items.style.display = this._expanded ? '' : 'none';
    if (chev)  chev.className = 'ph ' + (this._expanded ? 'ph-caret-up' : 'ph-caret-down');
    try { localStorage.setItem('abhyas_sb_expanded', this._expanded ? '1' : '0'); } catch(e){}
  },
  restore(){
    try { if (localStorage.getItem('abhyas_sb_expanded') === '1'){ this._expanded = true; this._applyState(); } } catch(e){}
  }
};

window.ANNOUNCE = {
  _last: 0,
  _text: '',
  async load(){
    if (Date.now() - this._last < 5 * 60 * 1000) { this.render(); return; }
    let url = '', online = true;
    try { url = (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || ''; } catch(e){}
    try { online = !!(S.online && !S.forcedOffline); } catch(e){}
    if (!url || !online) { this.render(); return; }
    this._last = Date.now();
    try {
      const r = await fetch(url + '?action=getPublicInfo', { cache: 'no-store' });
      const res = await r.json();
      if (res && res.success) {
        this._text = String(res.announcement || '').trim();
        try { localStorage.setItem('abhyas_announce', this._text); } catch(e){}
        try { localStorage.setItem('abhyas_lscheme', String(res.loksewaScheme || '')); } catch(e){}
        const cv = String(res.contentVersion || '');
        if (cv) {
          try {
            if (localStorage.getItem('abhyas_cv') !== cv) {
              localStorage.removeItem('abhyas_qts');
              localStorage.setItem('abhyas_cv', cv);
            }
          } catch(e){}
        }
      }
    } catch(e){}
    this.render();
  },
  _key(t){ let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return String(h); },
  render(){
    const bar = $('announce-bar'), tx = $('announce-text');
    if (!bar || !tx) return;
    let t = this._text;
    if (!t) { try { t = localStorage.getItem('abhyas_announce') || ''; } catch(e){} }
    let hidden = '';
    try { hidden = localStorage.getItem('abhyas_announce_hidden') || ''; } catch(e){}
    if (!t || hidden === this._key(t)) { bar.hidden = true; return; }
    tx.textContent = t;
    bar.hidden = false;
  },
  dismiss(){
    let t = this._text || '';
    try { t = t || localStorage.getItem('abhyas_announce') || ''; localStorage.setItem('abhyas_announce_hidden', this._key(t)); } catch(e){}
    this.render();
  }
};

window.FONT = {
  STEPS: [100, 112, 125],
  NAMES: ['Normal', 'Large', 'Extra large'],
  get(){
    try {
      const v = JSON.parse(localStorage.getItem('abhyas_fs') || '100');
      return this.STEPS.indexOf(v) === -1 ? 100 : v;
    } catch(e){ return 100; }
  },
  apply(v){ document.documentElement.style.fontSize = v === 100 ? '' : v + '%'; },
  cycle(){
    const i = (this.STEPS.indexOf(this.get()) + 1) % this.STEPS.length;
    const v = this.STEPS[i];
    try { localStorage.setItem('abhyas_fs', JSON.stringify(v)); } catch(e){}
    this.apply(v);
    toast('Text size: ' + this.NAMES[i]);
  }
};

window.FOCUSMODE = {
  KEY: 'abhyas_focus_mode',
  on(){ try { return localStorage.getItem(this.KEY) === '1'; } catch(e){ return false; } },
  toggle(){
    const next = !this.on();
    try { localStorage.setItem(this.KEY, next ? '1' : '0'); } catch(e){}
    this.apply();
    toast(next ? 'Focus mode on \u2014 streaks and badges hidden' : 'Focus mode off', 3000);
  },
  apply(){
    const on = this.on();
    document.documentElement.classList.toggle('focus-mode', on);
    const banner = document.getElementById('focus-banner');
    if (banner) banner.hidden = !on;
    const btn = document.getElementById('nav-focus');
    if (btn) btn.classList.toggle('active', on);
  }
};