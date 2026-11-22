/* ===================================================================
 * js/features/home-layout.js
 *
 * Customizable Home grid. Registers cards, persists order/visibility/size,
 * moves existing DOM nodes into cards at runtime, opens the customize sheet.
 *
 * Fixes vs. previous version:
 *   - defines window.EXPORTNOTES (was referenced but never declared)
 *   - uses the shared `esc` from js/core/text.js instead of a private
 *     weaker escaper that missed the single quote
 *
 * v1.47: Removed the "Today's plan" card at the student's request — the
 * greeting + Start session button is the whole "today" concept now.
 * #today-body stays in the hidden source block (nothing appends it to a
 * card), so TODAY_PLAN.render() painting into it is invisible and harmless.
 * =================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'abhyas_home_layout_v1';

  const CARDS = [
    { id:'start',    title:'Start session', sub:'Greeting + main action', size:'full', on:true  },
    { id:'sprint',   title:'60-day sprint', sub:'Progress strip',         size:'full', on:true  },
    { id:'streak',   title:'Streak',        sub:'7-day strip',            size:'half', on:false },
    { id:'forecast', title:'Exam forecast', sub:'Readiness score',        size:'half', on:false },
    { id:'badges',   title:'Achievements',  sub:'Earned badges',          size:'full', on:false },
    { id:'digest',   title:'Weekly digest', sub:'Last 7 days summary',    size:'full', on:false },
    { id:'weekly',   title:'Weekly board',  sub:'Leaderboard',            size:'full', on:false },
    { id:'tools',    title:'Tools',         sub:'Share / export',         size:'full', on:false },
  ];

  const PRESETS = {
    simple:   ['start', 'sprint'],
    detailed: ['start', 'sprint', 'streak', 'forecast'],
    sprint:   ['sprint'],
    all:      CARDS.map(c => c.id),
  };

  let _nodes = null;
  let _current = null;
  let _inited = false;

  function _defaultLayout() {
    return {
      order: CARDS.map(c => c.id),
      hidden: new Set(CARDS.filter(c => !c.on).map(c => c.id)),
      size: Object.fromEntries(CARDS.map(c => [c.id, c.size])),
    };
  }

  function _loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return _defaultLayout();
      const saved = JSON.parse(raw);
      const def = _defaultLayout();
      const order = Array.isArray(saved.order) && saved.order.length
        ? saved.order.filter(id => CARDS.some(c => c.id === id))
        : def.order.slice();
      for (const c of CARDS) if (!order.includes(c.id)) order.push(c.id);
      // drop any stale id (like the removed 'today' card) from the saved hidden set
      const savedHidden = Array.isArray(saved.hidden) ? saved.hidden.filter(id => CARDS.some(c => c.id === id)) : Array.from(def.hidden);
      const savedSize = {};
      if (saved.size && typeof saved.size === 'object') {
        Object.keys(saved.size).forEach(k => { if (CARDS.some(c => c.id === k)) savedSize[k] = saved.size[k]; });
      }
      return {
        order,
        hidden: new Set(savedHidden),
        size: Object.assign({}, def.size, savedSize),
      };
    } catch (e) { return _defaultLayout(); }
  }

  function _saveLayout(layout) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        order: layout.order,
        hidden: Array.from(layout.hidden),
        size: layout.size,
      }));
    } catch (e) { window.warnCaught && window.warnCaught('js/features/home-layout.js', e); }
  }

  function _captureNodes() {
    const _g = id => document.getElementById(id);
    const todayCard = _g('today-card');
    _nodes = {
      start: {
        greetLine:    todayCard ? todayCard.querySelector('.greet-line') : null,
        greeting:     _g('greeting'),
        sessionStart: _g('session-start'),
        startAlt:     todayCard ? todayCard.querySelector('.start-alt') : null,
        homeFoot:     todayCard ? todayCard.querySelector('.home-foot') : null,
      },
      sprint:   _g('sprint-card'),
      // 'today' — removed. #today-body stays in the hidden source block;
      // TODAY_PLAN.render() writing into it is invisible and harmless.
      streak:   _g('streak-card'),
      forecast: _g('forecast-slot'),
      badges:   _g('badges-strip'),
      digest:   _g('digest-slot'),
      weekly:   _g('weekly-board-slot'),
    };
  }

  function _buildCard(card) {
    const el = document.createElement('div');
    el.className = 'home-card';
    el.dataset.card = card.id;
    el.dataset.size = _current.size[card.id] || card.size;

    if (card.id === 'start') {
      const n = _nodes.start;
      if (n.greetLine)    el.appendChild(n.greetLine);
      if (n.greeting)     el.appendChild(n.greeting);
      if (n.sessionStart) el.appendChild(n.sessionStart);
      if (n.startAlt)     el.appendChild(n.startAlt);
      if (n.homeFoot)     el.appendChild(n.homeFoot);
    } else if (card.id === 'tools') {
      el.innerHTML =
        '<div class="section-head"><h2>Tools</h2></div>' +
        '<div class="bg">' +
          '<button class="btn btn-secondary" data-on-click="SHARECARD.run()"><i class="ph ph-share-network"></i> Share my progress</button>' +
          '<button class="btn btn-secondary" data-on-click="EXPORTNOTES.run()"><i class="ph ph-download-simple"></i> Export my notes</button>' +
        '</div>';
    } else {
      const node = _nodes[card.id];
      if (node) el.appendChild(node);
    }
    return el;
  }

  function render() {
    const grid = document.getElementById('home-grid');
    if (!grid || !_nodes || !_current) return;
    grid.innerHTML = '';
    _current.order.forEach(id => {
      if (_current.hidden.has(id)) return;
      const card = CARDS.find(c => c.id === id);
      if (card) grid.appendChild(_buildCard(card));
    });
  }

  function _move(id, delta) {
    const idx = _current.order.indexOf(id);
    if (idx < 0) return;
    const tgt = idx + delta;
    if (tgt < 0 || tgt >= _current.order.length) return;
    const tmp = _current.order[idx];
    _current.order[idx] = _current.order[tgt];
    _current.order[tgt] = tmp;
    _saveLayout(_current); render(); _renderCustomizeList();
  }

  function _toggleCard(id) {
    if (_current.hidden.has(id)) _current.hidden.delete(id);
    else _current.hidden.add(id);
    _saveLayout(_current); render(); _renderCustomizeList();
  }

  function _toggleSize(id) {
    _current.size[id] = _current.size[id] === 'full' ? 'half' : 'full';
    _saveLayout(_current); render(); _renderCustomizeList();
  }

  function _renderCustomizeList() {
    const host = document.getElementById('home-customize-list');
    if (!host) return;
    host.innerHTML = '';
    _current.order.forEach((id, i) => {
      const card = CARDS.find(c => c.id === id);
      if (!card) return;
      const on   = !_current.hidden.has(id);
      const full = _current.size[id] === 'full';
      const row = document.createElement('div');
      row.className = 'home-customize-row';
      row.innerHTML =
        '<div class="hc-title">' + esc(card.title) + '<small>' + esc(card.sub) + '</small></div>' +
        '<div class="hc-controls">' +
          '<button class="hc-move" type="button" aria-label="Move up"' + (i === 0 ? ' disabled' : '') +
            ' data-on-click="HOME_LAYOUT.moveUp(\'' + id + '\')">↑</button>' +
          '<button class="hc-move" type="button" aria-label="Move down"' + (i === _current.order.length - 1 ? ' disabled' : '') +
            ' data-on-click="HOME_LAYOUT.moveDown(\'' + id + '\')">↓</button>' +
          '<button class="hc-size' + (full ? ' full' : '') + '" type="button" aria-label="Toggle size"' +
            ' data-on-click="HOME_LAYOUT.toggleSize(\'' + id + '\')">' + (full ? 'F' : 'H') + '</button>' +
          '<button class="hc-toggle" type="button" role="switch" aria-pressed="' + on + '" aria-label="Show on Home"' +
            ' data-on-click="HOME_LAYOUT.toggleCard(\'' + id + '\')"></button>' +
        '</div>';
      host.appendChild(row);
    });
  }

  /* ── EXPORTNOTES — real implementation. Was referenced as
        EXPORTNOTES.run() but never declared anywhere, so the Tools card
        threw ReferenceError on tap. ── */
  if (typeof window.EXPORTNOTES === 'undefined') {
    /* Notes are stored under a question's id ('q:48213', 'q:G0011.110001'), which means
       nothing to a person. An export must say WHICH question each note is about: the
       readable QN number, the id, and the question text whenever this device has it
       (from the Library, the saved list or the wrong bank). */
    const _noteRows = () => {
      let notes = {};
      try { notes = JSON.parse(localStorage.getItem('abhyas_qnotes') || '{}') || {}; } catch (e) { notes = {}; }
      const known = [];
      try { if (typeof LIBRARY !== 'undefined' && Array.isArray(LIBRARY._entries)) known.push.apply(known, LIBRARY._entries); } catch (e) { /* optional */ }
      try { if (typeof S !== 'undefined') [S.bk, S.fl, S.wr].forEach(l => { if (Array.isArray(l)) known.push.apply(known, l); }); } catch (e) { /* optional */ }
      return Object.keys(notes).map(key => {
        const k = (typeof QKEY !== 'undefined') ? QKEY.ids(key.indexOf('q:') === 0 ? key : 'u:' + key) : {};
        let row = null;
        if (typeof QKEY !== 'undefined') row = known.find(x => x && x.q && QKEY.same(x, key.indexOf('q:') === 0 ? key : 'u:' + key)) || null;
        const r = row ? QKEY.ids(row) : k;
        return {
          qn: (r.pqn || r.nid || (row && row.qid) || '') + '',
          nid: r.nid || '', pqn: r.pqn || '',
          key: key,
          question: row ? String(row.q || '') : '',
          note: String(notes[key] || '')
        };
      }).filter(x => x.note);
    };
    const _download = (name, text, type) => {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    window.EXPORTNOTES = {
      rows: _noteRows,
      run() {
        try {
          const rows = _noteRows();
          if (!rows.length) { if (typeof toast === 'function') toast('You have no question notes yet.'); return; }
          const raw = JSON.parse(localStorage.getItem('abhyas_qnotes') || '{}');
          const payload = {
            exportedAt: new Date().toISOString(),
            count: rows.length,
            /* readable list: which question each note is about */
            notes: rows.map(r => ({ qn: r.qn, nid: r.nid || undefined, pqn: r.pqn || undefined, question: r.question || undefined, note: r.note })),
            /* the stored form, so a restore is exact */
            raw: raw
          };
          _download('abhyas_notes_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json');
          if (typeof toast === 'function') toast('Exported ' + rows.length + ' note' + (rows.length === 1 ? '' : 's'));
        } catch (e) {
          if (typeof toast === 'function') toast('Could not export notes: ' + (e && e.message || 'unknown'), 5000);
        }
      },
      /* Plain text: something to print, or hand to a teacher, with the QN to quote. */
      text() {
        const rows = _noteRows();
        const lines = ['Abhyas \u2014 my question notes', 'Exported ' + new Date().toLocaleDateString(), ''];
        rows.forEach((r, i) => {
          lines.push((i + 1) + '. ' + (r.qn ? 'QN ' + r.qn : 'Question') + (r.nid && String(r.nid) !== r.qn ? '  (id ' + r.nid + ')' : ''));
          if (r.question) lines.push('   ' + r.question.replace(/\s+/g, ' ').trim());
          lines.push('   Note: ' + r.note.replace(/\n/g, '\n         '));
          lines.push('');
        });
        return lines.join('\n');
      },
      runText() {
        try {
          const rows = _noteRows();
          if (!rows.length) { if (typeof toast === 'function') toast('You have no question notes yet.'); return; }
          _download('abhyas_notes_' + new Date().toISOString().slice(0, 10) + '.txt', window.EXPORTNOTES.text(), 'text/plain');
          if (typeof toast === 'function') toast('Exported ' + rows.length + ' note' + (rows.length === 1 ? '' : 's') + ' as text');
        } catch (e) {
          if (typeof toast === 'function') toast('Could not export notes: ' + (e && e.message || 'unknown'), 5000);
        }
      }
    };
  }

  window.HOME_LAYOUT = {
    init() {
      if (_inited) { render(); return; }
      _captureNodes();
      _current = _loadLayout();
      render();
      _inited = true;
    },
    render() { render(); },
    openCustomize() {
      _renderCustomizeList();
      const el = document.getElementById('mbg-home-customize');
      if (!el) return;
      el.classList.add('show');
      /* Escape / Tab-trap are handled centrally; the ✕ + Done buttons close. */
      DIALOG.open(el, { onEscape: () => window.HOME_LAYOUT.closeCustomize() });
    },
    closeCustomize() {
      const el = document.getElementById('mbg-home-customize');
      if (!el || !el.classList.contains('show')) return;
      el.classList.remove('show');
      DIALOG.release(el);
    },
    moveUp(id) { _move(id, -1); },
    moveDown(id) { _move(id, 1); },
    toggleCard(id) { _toggleCard(id); },
    toggleSize(id) { _toggleSize(id); },
    applyPreset(name) {
      const preset = PRESETS[name];
      if (!preset) return;
      _current.hidden = new Set(CARDS.filter(c => !preset.includes(c.id)).map(c => c.id));
      _current.order = [
        ...CARDS.filter(c =>  preset.includes(c.id)).map(c => c.id),
        ...CARDS.filter(c => !preset.includes(c.id)).map(c => c.id),
      ];
      _saveLayout(_current); render(); _renderCustomizeList();
    },
    reset() {
      _current = _defaultLayout();
      _saveLayout(_current); render(); _renderCustomizeList();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.HOME_LAYOUT.init(), { once: true });
  } else {
    window.HOME_LAYOUT.init();
  }
})();