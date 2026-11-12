// js/features/shell-ui.js — bottom nav sheet, admin switch, sidebar
// customizations, announcements, text-size, focus mode.

window.BN = {
  _activeKey: null,
  open(key){
    const sec = NAV.sheet(key);
    if (!sec) return;

    if (navigator.vibrate) navigator.vibrate(10);

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
    } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }

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
    /* Tab-trap the sheet; Escape is handled by shell-hooks.js. */
    DIALOG.open($('bn-sheet'));
  },
  close(){
    const sheet = $('bn-sheet');
    if (!sheet.classList.contains('show')) return;
    sheet.classList.remove('show');
    $('bn-sheet-backdrop').classList.remove('show');
    document.body.style.overflow = '';
    this._activeKey = null;
    DIALOG.release(sheet);
  }
};

window.APP_SWITCH = {
  _capable: false,

  async refresh(){
    let user = null;
    try { user = (typeof S !== 'undefined' && S.user) ? S.user : null; } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!user) { _setAdminVisible(false); return; }
    if (user.adminCapable) { this._capable = true; _setAdminVisible(true); }

    let online = false, token = '';
    try { online = (typeof S !== 'undefined' && S.online && !S.forcedOffline); token = user.token || ''; } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!online || !token) return;

    /* checkAdminCapable is Supabase per handover §3. Route explicitly. */
    try {
      const r = await netFetch(ABHYAS_CONFIG.SUPABASE_URL, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'checkAdminCapable', username:user.username, token:user.token })
      }, 15000);
      const data = await r.json();
      if (data && data.success && data.adminCapable) { this._capable = true; _setAdminVisible(true); }
    } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
  },

  async toAdmin(){
    let user = null;
    try { user = (typeof S !== 'undefined' && S.user) ? S.user : null; } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!user || !user.token) { toast('Please log in again.'); return; }

    let online = true;
    try { online = (typeof S !== 'undefined' && S.online && !S.forcedOffline); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!online) { toast('You need a connection to open the admin console.'); return; }

    const btn = $('tb-admin-btn');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin" style="margin:0"></span>'; }

    /* adminSwitchFromUser is Supabase per handover §3. */
    try {
      const r = await netFetch(ABHYAS_CONFIG.SUPABASE_URL, {
        method:'POST', headers:{ 'Content-Type':'text/plain' },
        body: JSON.stringify({ action:'adminSwitchFromUser', username:user.username, token:user.token })
      }, 15000);
      const data = await r.json();

      if (!data || !data.success) {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
        if (data && data.sessionInvalid) {
          toast('Your session expired — log in again.', 4500);
          try { localStorage.removeItem('abhyas_session'); localStorage.removeItem('abhyas_admin'); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
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
      try { if (typeof PSYNC !== 'undefined' && PSYNC._timer) PSYNC._beaconSync(); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
      toast('Opening the admin console…');
      setTimeout(() => { window.location.href = 'admin.html'; }, 250);
    } catch(e){
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      toast(e.message || 'Network error.');
    }
  }
};

window.SIDEBAR = {
  SECONDARY: [],
  _expanded: false,
  init(){
    const target = document.getElementById('sb-more-items');
    if (!target || target.dataset.init === '1') return;
    target.dataset.init = '1';
    
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
    try { localStorage.setItem('abhyas_sb_expanded', this._expanded ? '1' : '0'); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
  },
  restore(){
    try { if (localStorage.getItem('abhyas_sb_expanded') === '1'){ this._expanded = true; this._applyState(); } } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
  }
};

window.ANNOUNCE = {
  _last: 0,
  _text: '',
  async load(){
    if (Date.now() - this._last < 5 * 60 * 1000) { this.render(); return; }
    
    let online = true;
    try { online = !!(S.online && !S.forcedOffline); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!online) { this.render(); return; }
    
    this._last = Date.now();
    try {
      /* getPublicInfo is Supabase per handover §3. Route via netFetch so the
         routing layer decides; explicit SUPABASE_URL for clarity. */
      const r = await netFetch(ABHYAS_CONFIG.SUPABASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'getpublicinfo' })
      }, 10000);

      const res = await r.json();
      if (res && res.success) {
        this._text = String(res.announcement || '').trim();
        try { localStorage.setItem('abhyas_announce', this._text); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
        try { localStorage.setItem('abhyas_lscheme', String(res.loksewaScheme || '')); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
        const cv = String(res.contentVersion || '');
        if (cv) {
          try {
            if (localStorage.getItem('abhyas_cv') !== cv) {
              localStorage.removeItem('abhyas_qts');
              localStorage.setItem('abhyas_cv', cv);
            }
          } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
        }
      }
    } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    this.render();
  },
  _key(t){ let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return String(h); },
  render(){
    const bar = $('announce-bar'), tx = $('announce-text');
    if (!bar || !tx) return;
    let t = this._text;
    if (!t) { try { t = localStorage.getItem('abhyas_announce') || ''; } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); } }
    let hidden = '';
    try { hidden = localStorage.getItem('abhyas_announce_hidden') || ''; } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    if (!t || hidden === this._key(t)) { bar.hidden = true; return; }
    tx.textContent = t;
    bar.hidden = false;
  },
  dismiss(){
    let t = this._text || '';
    try { t = t || localStorage.getItem('abhyas_announce') || ''; localStorage.setItem('abhyas_announce_hidden', this._key(t)); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
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
  set(v){
    if (this.STEPS.indexOf(v) === -1) return;
    try { localStorage.setItem('abhyas_fs', JSON.stringify(v)); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    this.apply(v);
  },
  cycle(){
    const i = (this.STEPS.indexOf(this.get()) + 1) % this.STEPS.length;
    const v = this.STEPS[i];
    try { localStorage.setItem('abhyas_fs', JSON.stringify(v)); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
    this.apply(v);
    toast('Text size: ' + this.NAMES[i]);
  }
};

window.FOCUSMODE = {
  KEY: 'abhyas_focus_mode',
  on(){ try { return localStorage.getItem(this.KEY) === '1'; } catch(e){ return false; } },
  toggle(){
    const next = !this.on();
    try { localStorage.setItem(this.KEY, next ? '1' : '0'); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
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

window.HEADERMENU = {
  _listening: false,
  toggle() {
    const pop = document.getElementById('tb-menu-pop');
    const btn = document.getElementById('tb-more-btn');
    if (!pop) return;
    const opening = pop.hidden;
    pop.hidden = !opening;
    if (btn) btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening && !this._listening) {
      this._listening = true;
      const close = (e) => {
        if (!e.target || !e.target.closest) return;
        if (!e.target.closest('.tb-more')) {
          window.HEADERMENU.close();
          document.removeEventListener('click', close, true);
          window.HEADERMENU._listening = false;
        }
      };
      setTimeout(() => document.addEventListener('click', close, true), 0);
    }
  },
  close() {
    const pop = document.getElementById('tb-menu-pop');
    const btn = document.getElementById('tb-more-btn');
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  },
};

window.HOMEFOCUS = (function () {
  const KEY = 'abhyas_home_mode_v1';
  function _get() {
    try { return localStorage.getItem(KEY) === 'detailed' ? 'detailed' : 'simple'; } catch (e) { return 'simple'; }
  }
  function _paint(mode) {
    document.querySelectorAll('.home-mode-opt').forEach(b => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode));
    });
    const btn = document.getElementById('home-mode-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', String(mode === 'detailed'));
      btn.textContent = mode === 'detailed' ? 'Show less on Home' : 'Show more on Home';
    }
  }
  const obj = {
    mode: _get,
    setMode(mode) {
      mode = mode === 'detailed' ? 'detailed' : 'simple';
      try { localStorage.setItem(KEY, mode); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
      if (typeof HOME_LAYOUT !== 'undefined' && typeof HOME_LAYOUT.applyPreset === 'function') {
        try { HOME_LAYOUT.applyPreset(mode); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); }
      }
      _paint(mode);
    },
    toggleMode() { obj.setMode(_get() === 'detailed' ? 'simple' : 'detailed'); },
    init() { _paint(_get()); },
  };
  return obj;
})();

/* ── Quick switch: one searchable command sheet for the whole student app ──
   It is deliberately built on demand: no extra button in the top bar and no
   permanent DOM. Ctrl/Cmd+K opens it; the top-bar More menu exposes it too. */
window.QUICK = {
  _all: null,
  _results: [],
  _active: 0,
  _tr(s) { return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(s) : s; },
  _build() {
    const out = [];
    const seen = new Set();
    const add = (item) => {
      if (!item || seen.has(item.key)) return;
      seen.add(item.key);
      out.push(item);
    };
    add({
      key: 'view:home', label: 'Home', sub: 'Today and your next session', group: 'Go to', icon: 'ph-house',
      run: () => UI.go('home')
    });
    if (typeof NAV !== 'undefined' && Array.isArray(NAV.ALL)) {
      const groupLabels = {};
      (NAV.GROUPS || []).forEach(g => { groupLabels[g.key] = g.label; });
      NAV.ALL.forEach(it => {
        add({
          key: 'view:' + it.view,
          label: this._tr(it.label || it.view),
          sub: this._tr(it.sub || ''),
          group: this._tr(groupLabels[it.group] || 'Go to'),
          icon: it.icon || 'ph-circle',
          run: () => {
            if (it.special === 'tutorial' && typeof TUTORIAL !== 'undefined') TUTORIAL.open();
            else UI.go(it.view);
          }
        });
      });
    }
    [
      { key: 'action:search', label: 'Search questions', sub: 'Find a word in the questions on this device', group: 'Actions', icon: 'ph-magnifying-glass', run: () => QSEARCH.open() },
      { key: 'action:theme', label: 'Switch light or dark', sub: 'Change the app appearance', group: 'Actions', icon: 'ph-circle-half', run: () => UI.theme() },
      { key: 'action:focus', label: 'Toggle focus mode', sub: 'Hide streaks and badges while studying', group: 'Actions', icon: 'ph-eye', run: () => FOCUSMODE.toggle() },
      { key: 'action:font', label: 'Change text size', sub: 'Cycle the reading size on this device', group: 'Actions', icon: 'ph-text-aa', run: () => FONT.cycle() },
      { key: 'action:backup', label: 'Back up now', sub: 'Save progress to your account', group: 'Actions', icon: 'ph-cloud-arrow-up', run: () => DATA.syncNow() },
      { key: 'action:keys', label: 'Keyboard shortcuts', sub: 'See every shortcut in the app', group: 'Actions', icon: 'ph-keyboard', run: () => KEYSHEET.open() }
    ].forEach(a => add(a));
    return out;
  },
  isOpen() {
    const m = document.getElementById('quick-modal');
    return !!(m && m.classList.contains('show'));
  },
  open() {
    if (typeof HEADERMENU !== 'undefined') HEADERMENU.close();
    let modal = document.getElementById('quick-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'quick-modal';
      modal.className = 'mbg quick-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'quick-title');
      modal.innerHTML =
        '<div class="mbox wide" data-on-click="event.stopPropagation()">' +
          '<div class="mhd"><h3 id="quick-title"><i class="ph ph-command"></i> Quick switch</h3>' +
            '<button class="mcl" type="button" aria-label="Close" data-on-click="QUICK.close()"><i class="ph ph-x"></i></button></div>' +
          '<div class="mbody quick-body">' +
            '<div class="quick-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>' +
              '<input class="input" id="quick-input" type="search" placeholder="Go to a screen or run a command\u2026" autocomplete="off" spellcheck="false" aria-label="Search screens and commands" aria-controls="quick-list" aria-autocomplete="list" role="combobox" aria-expanded="true">' +
            '</div>' +
            '<div id="quick-list" class="quick-list" role="listbox" aria-label="Quick switch results"></div>' +
            '<div class="quick-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open</span><span id="quick-count"></span></div>' +
          '</div>' +
        '</div>';
      modal.addEventListener('click', e => { if (e.target === modal) QUICK.close(); });
      const input = modal.querySelector('#quick-input');
      input.addEventListener('input', () => QUICK._paint());
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); QUICK._move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); QUICK._move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); QUICK.pick(QUICK._active); }
      });
      document.body.appendChild(modal);
    }
    this._all = this._build();
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    const input = modal.querySelector('#quick-input');
    input.value = '';
    input.setAttribute('aria-expanded', 'true');
    this._active = 0;
    this._paint();
    DIALOG.open(modal, { focus: '#quick-input', onEscape: () => QUICK.close() });
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); } }, 30);
  },
  close() {
    const modal = document.getElementById('quick-modal');
    if (!modal || !modal.classList.contains('show')) return;
    modal.classList.remove('show');
    const input = document.getElementById('quick-input');
    if (input) input.setAttribute('aria-expanded', 'false');
    if (!document.querySelector('.mbg.show')) document.body.style.overflow = '';
    DIALOG.release(modal);
  },
  _paint() {
    const input = document.getElementById('quick-input');
    const list = document.getElementById('quick-list');
    const count = document.getElementById('quick-count');
    if (!input || !list) return;
    const q = String(input.value || '').trim().toLowerCase();
    let items = (this._all || []).filter(it => {
      if (!q) return true;
      return (it.label + ' ' + it.sub + ' ' + it.group).toLowerCase().includes(q);
    });
    if (q) {
      items = items.sort((a, b) => {
        const al = a.label.toLowerCase(), bl = b.label.toLowerCase();
        const ap = al.startsWith(q) ? 0 : 1, bp = bl.startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return al.localeCompare(bl);
      });
    }
    this._results = items.slice(0, 40);
    this._active = Math.min(this._active, Math.max(0, this._results.length - 1));
    if (!this._results.length) {
      list.innerHTML = '<div class="quick-empty"><i class="ph ph-magnifying-glass"></i><p>No screen or action matches “' + esc(input.value) + '”.</p></div>';
      if (count) count.textContent = '0 results';
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.innerHTML = this._results.map((it, i) =>
      '<button type="button" class="quick-item' + (i === this._active ? ' active' : '') + '" id="quick-opt-' + i + '" role="option" aria-selected="' + (i === this._active) + '" data-on-click="QUICK.pick(' + i + ')">' +
        '<span class="qi-ic"><i class="ph ' + esc(it.icon) + '"></i></span>' +
        '<span class="qi-main"><span class="qi-name">' + esc(it.label) + '</span>' +
          (it.sub ? '<span class="qi-sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
        '<span class="qi-group">' + esc(it.group) + '</span>' +
        '<i class="ph ph-arrow-right qi-arrow" aria-hidden="true"></i>' +
      '</button>'
    ).join('');
    if (count) count.textContent = this._results.length + (this._results.length === 1 ? ' result' : ' results');
    this._setActive(this._active, false);
  },
  _setActive(i, scroll) {
    const list = document.getElementById('quick-list');
    const input = document.getElementById('quick-input');
    if (!list || !this._results.length) return;
    this._active = (i + this._results.length) % this._results.length;
    list.querySelectorAll('.quick-item').forEach((el, n) => {
      const on = n === this._active;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', String(on));
    });
    const current = list.querySelector('#quick-opt-' + this._active);
    if (current) {
      if (input) input.setAttribute('aria-activedescendant', current.id);
      if (scroll) current.scrollIntoView({ block: 'nearest' });
    }
  },
  _move(delta) { this._setActive(this._active + delta, true); },
  pick(i) {
    const item = this._results[i];
    if (!item) return;
    this.close();
    setTimeout(() => { try { item.run(); } catch (e) { window.warnCaught && window.warnCaught('js/features/shell-ui.js', e); } }, 0);
  }
};