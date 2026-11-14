// js/features/my-library.js — one searchable place for personal notes,
// bookmarks, flags and missed questions.
//
// The app already stores these separately. This module joins them by uid so a
// student can find "that note I wrote about" without remembering whether it
// was a bookmark, a flag or a wrong answer.
//
// MUST load AFTER: core/state.js (S), core/text.js (esc, escAttrJs),
// core/toast.js (toast), features/quiz-extras.js (QNOTE), features/review.js
// (REV), features/quiz-engine.js (QUIZ), features/quiz-search.js (QSEARCH).
// ChapterData, chapterRef and QUIZ are read at call time.

window.LIBRARY = {
  TAB: 'all',
  TERM: '',
  _pool: null,
  _loading: false,
  _entries: null,

  _noteMap() {
    try {
      const raw = localStorage.getItem('abhyas_qnotes') || '{}';
      const o = JSON.parse(raw);
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  },

  async _buildPool() {
    if (this._pool) return this._pool;
    if (this._loading) {
      while (this._loading) await new Promise(r => setTimeout(r, 50));
      return this._pool || new Map();
    }
    this._loading = true;
    const map = new Map();
    try {
      if (typeof QSEARCH !== 'undefined' && typeof QSEARCH._build === 'function') {
        const all = await QSEARCH._build();
        (all || []).forEach(q => { if (q && q.uid) map.set(q.uid, q); });
      }
    } catch (e) { window.warnCaught && window.warnCaught('js/features/my-library.js', e); }
    this._pool = map;
    this._loading = false;
    return map;
  },

  _chapter(uid) {
    const fid = String(uid || '').replace(/_\d+$/, '');
    try {
      if (typeof chapterRef === 'function') {
        const ref = chapterRef(fid);
        if (ref && typeof ChapterData !== 'undefined') {
          return ChapterData.chapterName(ref.lv, ref.ch) + ' \u2014 ' + ref.book;
        }
      }
    } catch (e) { window.warnCaught && window.warnCaught('js/features/my-library.js', e); }
    return '';
  },

  _collect() {
    const pool = this._pool || new Map();
    const notes = this._noteMap();
    const map = new Map();

    const add = (q, source) => {
      const uid = q && q.uid;
      if (!uid) return;
      let e = map.get(uid);
      if (!e) {
        const full = pool.get(uid) || q;
        e = {
          uid: uid,
          q: full.q || full.question || q.q || '',
          options: Array.isArray(full.options) ? full.options : (Array.isArray(q.options) ? q.options : []),
          explanation: full.explanation || q.explanation || '',
          correct: full.correct != null ? full.correct : q.correct,
          tag: q.tag || '',
          source: {},
          note: ''
        };
        map.set(uid, e);
      }
      e.source[source] = true;
      if (q.tag && !e.tag) e.tag = q.tag;
    };

    (S.bk || []).forEach(q => add(q, 'bookmark'));
    (S.fl || []).forEach(q => add(q, 'flag'));
    (S.wr || []).forEach(q => { if (!q._withdrawn) add(q, 'missed'); });
    Object.keys(notes).forEach(uid => add({ uid: uid }, 'note'));

    map.forEach(e => { e.note = notes[e.uid] || ''; e.chapter = this._chapter(e.uid); });
    return [...map.values()];
  },

  _match(e, term) {
    if (!term) return true;
    const hay = [
      e.q, e.note, e.tag, e.chapter,
      (e.options || []).join(' '), e.explanation
    ].join(' ').toLowerCase();
    return hay.indexOf(term) !== -1;
  },

  _filtered() {
    const term = String(this.TERM || '').toLowerCase().trim();
    const tab = this.TAB;
    return (this._entries || []).filter(e => {
      if (tab === 'notes' && !e.note) return false;
      if (tab === 'saved' && !(e.source.bookmark || e.source.flag)) return false;
      if (tab === 'missed' && !e.source.missed) return false;
      return this._match(e, term);
    });
  },

  setTab(tab) {
    this.TAB = ['all', 'notes', 'saved', 'missed'].includes(tab) ? tab : 'all';
    this._syncTabs();
    this._paint();
  },

  search(term) {
    this.TERM = String(term || '');
    this._paint();
  },

  clearSearch() {
    this.TERM = '';
    const el = document.getElementById('lib-search');
    if (el) el.value = '';
    this._paint();
  },

  _syncTabs() {
    document.querySelectorAll('#lib-tabs button').forEach(b => {
      const on = b.getAttribute('data-tab') === this.TAB;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  },

  _sources(e) {
    const out = [];
    if (e.note) out.push(['note', 'Note', 'ph-note']);
    if (e.source.bookmark) out.push(['bookmark', 'Saved', 'ph-star']);
    if (e.source.flag) out.push(['flag', 'Flagged', 'ph-flag']);
    if (e.source.missed) out.push(['missed', 'Missed', 'ph-x-circle']);
    return out.map(s =>
      '<span class="ctag lib-src-' + s[0] + '"><i class="ph ' + s[2] + '"></i> ' + s[1] + '</span>'
    ).join('');
  },

  _card(e, i) {
    const uid = escAttrJs(e.uid);
    const opts = (e.options || []).slice(0, 4).map((o, j) =>
      '<div class="eo' + (Number(e.correct) === j ? ' shc' : '') + '">' +
        String.fromCharCode(65 + j) + ') ' + esc(String(o)) +
      '</div>'
    ).join('');
    return '<div class="qcard lib-card">' +
      '<div class="qm">' +
        '<span class="qn mono">#' + (i + 1) + '</span>' +
        this._sources(e) +
        (e.tag ? '<span class="ctag ta"><i class="ph ph-tag"></i> ' + esc(e.tag) + '</span>' : '') +
        '<button class="ib" type="button" data-on-click="LIBRARY.review(\'' + uid + '\')" ' +
          'title="Practise this question" aria-label="Practise this question"><i class="ph ph-play"></i></button>' +
      '</div>' +
      '<div class="qt">' + esc(e.q || 'Question details are not downloaded on this device yet.') + '</div>' +
      (e.chapter ? '<div class="t-cap" style="margin-top:4px">' + esc(e.chapter) + '</div>' : '') +
      (opts ? '<div style="margin-top:.4rem">' + opts + '</div>' : '') +
      (e.note
        ? '<div class="qnote-box" style="margin-top:.6rem">' +
            '<div class="qnote-hd"><i class="ph ph-note"></i> Your note' +
              '<button type="button" class="qnote-act" data-on-click="LIBRARY.editNote(\'' + uid + '\')" ' +
                'aria-label="Edit your note"><i class="ph ph-pencil-simple"></i></button>' +
            '</div>' +
            '<div class="qnote-text">' + esc(e.note) + '</div>' +
          '</div>'
        : '') +
    '</div>';
  },

  _paint() {
    const box = document.getElementById('lib-list');
    if (!box) return;
    const rows = this._filtered();
    const sum = document.getElementById('lib-summary');
    if (sum) {
      const all = (this._entries || []).length;
      sum.textContent = rows.length === all
        ? all + ' item' + (all === 1 ? '' : 's') + ' in your library'
        : rows.length + ' of ' + all + ' items';
    }
    if (!rows.length) {
      const searching = String(this.TERM || '').trim();
      box.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-books"></i></div>' +
        '<p>' + (searching ? 'Nothing matches' : 'Your library is empty') + '</p>' +
        '<p style="font-size:.72rem;color:var(--t3);margin-top:.15rem">' +
          (searching
            ? 'Try a shorter word, or switch back to All.'
            : 'Add a note, star a question or miss one in practice and it will appear here.') +
        '</p></div>';
      return;
    }
    box.innerHTML = rows.map((e, i) => this._card(e, i)).join('');
    try { if (typeof renderMath === 'function') renderMath(box); } catch (e) { window.warnCaught && window.warnCaught('js/features/my-library.js', e); }
  },

  _syncEmpty() {
    const box = document.getElementById('lib-list');
    if (box && !box.dataset.loaded) this._paint();
  },

  async render() {
    const box = document.getElementById('lib-list');
    if (!box) return;
    this._syncTabs();
    if (!this._entries) {
      box.innerHTML = '<div class="card"><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div></div>';
    }
    await this._buildPool();
    this._entries = this._collect();
    box.dataset.loaded = '1';
    this._paint();
  },

  review(uid) {
    const e = (this._entries || []).find(x => x.uid === uid);
    if (!e || !e.q || !e.options.length) { toast('Question details are not downloaded yet.'); return; }
    if (typeof QUIZ === 'undefined' || typeof QUIZ.startWith !== 'function') { toast('Practice is not available right now.'); return; }
    QUIZ.startWith([{
      uid: e.uid, q: e.q, options: e.options.slice(),
      correct: e.correct, explanation: e.explanation
    }], 'flashcard', 'My library', null);
  },

  start() {
    const rows = this._filtered().filter(e => e.q && e.options.length);
    if (!rows.length) { toast('Nothing here can be practised yet.'); return; }
    if (typeof QUIZ === 'undefined' || typeof QUIZ.startWith !== 'function') { toast('Practice is not available right now.'); return; }
    QUIZ.startWith(rows.map(e => ({
      uid: e.uid, q: e.q, options: e.options.slice(),
      correct: e.correct, explanation: e.explanation
    })), 'flashcard', 'My library \u00b7 ' + rows.length + ' items', null);
  },

  editNote(uid) {
    const note = (typeof QNOTE !== 'undefined') ? QNOTE.get(uid) : '';
    const safe = escAttrJs(uid);
    MODAL.sheet('Your note',
      '<div class="field"><label for="lib-note-edit">Write something you want to remember</label>' +
      '<textarea class="textarea" id="lib-note-edit" maxlength="500" style="min-height:140px">' + esc(note) + '</textarea></div>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" data-on-click="LIBRARY.saveNote(\'' + safe + '\')">Save note</button>' +
      '</div>');
  },

  saveNote(uid) {
    const el = document.getElementById('lib-note-edit');
    if (!el || typeof QNOTE === 'undefined') return;
    QNOTE.set(uid, el.value);
    MODAL.close('sheet');
    toast(QNOTE.get(uid) ? 'Note saved' : 'Note cleared');
    this.render();
  },

  exportNotes() {
    if (typeof EXPORTNOTES !== 'undefined' && EXPORTNOTES.run) EXPORTNOTES.run();
    else toast('Note export is not available right now.');
  }
};