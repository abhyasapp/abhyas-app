// js/admin/features/palette.js — Cmd+K command palette.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, TOAST), core/admin-nav.js (ADMIN_NAV).
// Uses UI, PAYMENTS, USERS, WEEKLYSETS at call time — all guarded via typeof in the
// _build() callbacks but not at the top of _build(). Safe: references resolve when a
// user actually presses Ctrl+K, by which time those objects are loaded.

const PALETTE = {
  _items: [], _filtered: [], _idx: 0, _bound: false,

  open(){
    $('palette').classList.add('show');
    document.body.style.overflow = 'hidden';
    const input = $('palette-q');
    input.value = '';
    this._build();
    this._filtered = this._items;
    this._idx = 0;
    this._render();
    setTimeout(() => input.focus(), 30);
    if (!this._bound) {
      this._bound = true;
      input.addEventListener('input', () => { this._filter(input.value); this._render(); });
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { this.close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); this._pick(this._idx); }
      });
    }
  },
  close(){
    $('palette').classList.remove('show');
    if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
  },
  _move(d){
    if (!this._filtered.length) return;
    this._idx = Math.max(0, Math.min(this._filtered.length - 1, this._idx + d));
    this._render();
  },

  _build(){
    const items = [];
    const add = (group, title, sub, icon, action) => items.push({ group, title, sub, icon, action });

    add('Go to','Today','','ph-sun-horizon', () => UI.nav('today'));
    add('Go to','Insights','','ph-chart-bar', () => UI.nav('dashboard'));
    add('Go to','Students','','ph-users-three', () => UI.nav('users'));
    add('Go to','Payments','','ph-credit-card', () => UI.nav('payments'));
    add('Go to','Admins','','ph-shield-check', () => UI.nav('admins'));
    add('Go to','Weekly sets','','ph-calendar-check', () => UI.nav('weeklysets'));
    add('Go to','Grading','','ph-note-pencil', () => UI.nav('subjective'));
    add('Go to','Reports','','ph-flag', () => UI.nav('qreports'));
    add('Go to','Activity','','ph-clock-counter-clockwise', () => UI.nav('logs'));
    add('Go to','Data & upkeep','','ph-database', () => UI.nav('data'));
    add('Go to','Settings','','ph-gear', () => UI.nav('settings'));

    add('Do','Refresh data','Ctrl R','ph-arrow-clockwise', () => ADMIN.refresh());
    add('Do','Export students as CSV','','ph-download-simple', () => ADMIN.exportUsers());
    add('Do','Export payments as CSV','','ph-download-simple', () => ADMIN.exportPayments());
    add('Do','Schedule a weekly set','','ph-calendar-plus', () => { UI.nav('weeklysets'); setTimeout(() => WEEKLYSETS.openCreate(), 150); });
    add('Do','Switch theme','','ph-circle-half', () => toggleTheme());
    add('Do','Change my password','','ph-key', () => ADMIN.changePassword());
    add('Do','Sign out','','ph-sign-out', () => ADMIN.logout());

    (ADMIN.data.payments || []).filter(p => p.status === 'pending').forEach(p => {
      add('Payments awaiting review', p.name || p.username, 'TXN ' + (p.txId || '—'), 'ph-credit-card',
        () => { UI.nav('payments'); setTimeout(() => PAYMENTS.review(p.username), 120); });
    });
    (ADMIN.data.users || []).slice(0, 400).forEach(u => {
      add('Students', u.name || u.username, u.username + (u.email ? ' · ' + u.email : ''), 'ph-user',
        () => { UI.nav('users'); setTimeout(() => USERS.view(u.username), 120); });
    });
    const sets = (typeof WEEKLYSETS !== 'undefined' && WEEKLYSETS.list) || [];
     sets.forEach(s => {
     add('Weekly sets', s.title, s.chapterLabel || '', 'ph-calendar-check', () => UI.nav('weeklysets'));
    });

    this._items = items;
  },

  _score(item, term){
    const hay = (item.title + ' ' + (item.sub || '') + ' ' + item.group).toLowerCase();
    if (hay.includes(term)) return item.title.toLowerCase().startsWith(term) ? 0 : 1;
    let i = 0;
    for (const ch of hay) { if (ch === term[i]) i++; if (i === term.length) return 2; }
    return -1;
  },
  _filter(q){
    const term = (q || '').toLowerCase().trim();
    this._idx = 0;
    if (!term) { this._filtered = this._items; return; }
    this._filtered = this._items
      .map(it => ({ it, s: this._score(it, term) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map(x => x.it);
  },

  _render(){
    const box = $('palette-list');
    if (!this._filtered.length) {
      box.innerHTML = '<div class="empty" style="padding:var(--sp-8) var(--sp-4)"><i class="ph ph-magnifying-glass"></i>' +
        '<div class="t">No matches</div><div class="d">Try a username, transaction ID or section name.</div></div>';
      return;
    }
    const shown = this._filtered.slice(0, 50);
    const groups = {};
    shown.forEach((it, i) => { (groups[it.group] = groups[it.group] || []).push({ it, i }); });
    box.innerHTML = Object.keys(groups).map(g =>
      '<div class="palette-group">' + esc(g) + '</div>' +
      groups[g].map(({ it, i }) =>
        '<button class="palette-item' + (i === this._idx ? ' sel' : '') + '" role="option" aria-selected="' + (i === this._idx) + '" data-on-click="PALETTE._pick(' + i + ')">' +
          '<i class="ph ' + it.icon + '"></i>' +
          '<span class="p-title">' + esc(it.title) + '</span>' +
          (it.sub ? '<span class="p-sub">' + esc(it.sub) + '</span>' : '') +
        '</button>'
      ).join('')
    ).join('');
    const sel = box.querySelector('.palette-item.sel');
    if (sel) sel.scrollIntoView({ block:'nearest' });
  },

  _pick(i){
    const it = this._filtered[i];
    if (!it) return;
    this.close();
    try { it.action(); } catch(e){ TOAST.show(e.message || 'That action failed', 'error'); }
  }
};

window.PALETTE = PALETTE;