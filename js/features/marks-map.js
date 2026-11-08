// js/features/marks-map.js — ranks chapters by exam marks at stake and the gap
// in your accuracy, so the next study block targets the most valuable chapter.
// MUST load AFTER: core/state.js (S), core/text.js (esc, escAttrJs),
// data/chapters-data.js (ChapterData), core/loksewa.js (via LKS),
// features/chapter-stats.js (CHAPSTATS), features/syllabus.js (LKS).
// CH_GRID and WRONGBY are referenced at call time only.

const MARKS_MAP = {
  CACHE_MS: 5000,
  _cache: { at: 0, rows: [] },
  _sort: 'gap',

  _name(ref){
    try { return ChapterData.chapterName(ref.lv, ref.ch) || ref.ch; } catch (e) { return ref.ch; }
  },

  _stats(name){
    let attempted = 0, correct = 0;
    try {
      Object.keys(S.chapStats || {}).forEach(k => {
        if(k === name || k.indexOf(name + ' \u2014 ') === 0){
          attempted += Number(S.chapStats[k].attempted) || 0;
          correct += Number(S.chapStats[k].correct) || 0;
        }
      });
    } catch (e) { window.warnCaught && window.warnCaught('js/features/marks-map.js', e); }
    if(!attempted){
      try {
        const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
        sessions.forEach(s => {
          if(!s) return;
          const label = String(s.chapter || '');
          if(s.chapterKey !== name && label.indexOf(name + ' \u2014 ') !== 0) return;
          attempted += Number(s.total) || 0;
          correct += Number(s.correct) || 0;
        });
      } catch (e) { window.warnCaught && window.warnCaught('js/features/marks-map.js', e); }
    }
    return { attempted, correct, accuracy: attempted ? correct / attempted : 0 };
  },

  rows(){
    const now = Date.now();
    if(now - this._cache.at < this.CACHE_MS) return this._cache.rows;
    const out = [];
    try {
      const scheme = (typeof LKS !== 'undefined') ? LKS.scheme() : null;
      const refs = (typeof ChapterData !== 'undefined') ? (ChapterData.allFileRefs() || []) : [];
      if(!scheme || !refs.length) return [];

      const chapters = new Map();
      refs.forEach(r => {
        if(!r || !r.lv || !r.ch) return;
        const key = r.lv + '|' + r.ch;
        let c = chapters.get(key);
        if(!c){
          c = { lv: r.lv, ch: r.ch, name: this._name(r), fids: [], files: 0, questions: 0 };
          chapters.set(key, c);
        }
        c.files++;
        if(r.fid) c.fids.push(r.fid);
        const n = Number((S.fcount || {})[r.fid]);
        if(isFinite(n) && n > 0) c.questions += n;
      });

      const groupOf = c => (typeof loksewaGroupFor === 'function') ? loksewaGroupFor(scheme, c.lv, c.ch) : null;
      const groupQuestions = {}, groupChapters = {};
      chapters.forEach(c => {
        const g = groupOf(c);
        if(!g) return;
        groupQuestions[g.key] = (groupQuestions[g.key] || 0) + c.questions;
        groupChapters[g.key] = (groupChapters[g.key] || 0) + 1;
      });

      chapters.forEach(c => {
        const g = groupOf(c);
        if(!g) return;
        const totalQ = groupQuestions[g.key] || 0;
        const share = totalQ ? (c.questions || 0) / totalQ : 1 / (groupChapters[g.key] || 1);
        const marks = Math.max(0, (Number(g.marks) || 0) * share);
        const stats = this._stats(c.name);
        let wrong = 0;
        try {
          if(typeof WRONGBY !== 'undefined'){
            c.fids.forEach(f => { wrong += WRONGBY.countFor(f) || 0; });
          }
        } catch (e) { window.warnCaught && window.warnCaught('js/features/marks-map.js', e); }
        out.push({
          lv: c.lv, ch: c.ch, name: c.name, group: g.name,
          files: c.files, questions: c.questions,
          marks: Math.round(marks * 10) / 10,
          attempted: stats.attempted,
          accuracy: stats.accuracy,
          wrong: wrong,
          score: Math.round(marks * (1 - stats.accuracy) * 10) / 10
        });
      });

      out.sort((a, b) => b.score - a.score || b.marks - a.marks || a.name.localeCompare(b.name));
    } catch (e) { window.warnCaught && window.warnCaught('js/features/marks-map.js', e); }
    this._cache = { at: now, rows: out };
    return out;
  },

  _sortRows(rows){
    const out = (rows || []).slice();
    if(this._sort === 'weakest'){
      out.sort((a, b) => {
        const aSeen = a.attempted > 0, bSeen = b.attempted > 0;
        if(aSeen !== bSeen) return aSeen ? -1 : 1;
        if(aSeen && a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
        return b.marks - a.marks || a.name.localeCompare(b.name);
      });
    } else {
      out.sort((a, b) => b.score - a.score || b.marks - a.marks || a.name.localeCompare(b.name));
    }
    return out;
  },

  setSort(mode){
    this._sort = mode === 'weakest' ? 'weakest' : 'gap';
    this.render();
  },

  best(){ return this._sortRows(this.rows().filter(r => r.marks > 0))[0] || null; },

  _groups(rows){
    const seen = new Set();
    return rows.map(r => r.group).filter(g => {
      if(!g || seen.has(g)) return false;
      seen.add(g);
      return true;
    });
  },

  _rowHtml(r){
    const acc = r.attempted ? Math.round(r.accuracy * 100) + '% accuracy' : 'not started';
    return '<div class="row" style="align-items:flex-start;gap:var(--sp-2);padding:var(--sp-2) 0;border-top:1px solid var(--sep-soft)">' +
      '<div class="row-main" style="min-width:0">' +
        '<div class="t-callout" style="color:var(--ink);font-weight:650">' + esc(r.name) + '</div>' +
        '<div class="t-cap">' + esc(r.group) + ' \u00b7 ' + acc + ' \u00b7 ' + r.questions + ' question' + (r.questions === 1 ? '' : 's') + '</div>' +
      '</div>' +
      '<div style="text-align:right;white-space:nowrap">' +
        '<div class="ctag ta">' + r.marks + ' marks</div>' +
        '<div class="t-cap">' + (r.attempted ? (r.wrong ? r.wrong + ' missed' : 'no missed') : 'not started') + '</div>' +
      '</div>' +
      '<button class="btn btn-sm btn-quiet" type="button" aria-label="Study ' + esc(r.name) + '" data-on-click="MARKS_MAP.start(\'' + escAttrJs(r.lv) + '\',\'' + escAttrJs(r.ch) + '\')">Study</button>' +
    '</div>';
  },

  /* The Home card stays short; this sheet is the complete ranking. Filters use
     the scheme group name, so they follow the syllabus rather than a hard-coded
     level list. */
  openAll(group){
    if(typeof openMod !== 'function') return;
    const all = this._sortRows(this.rows().filter(r => r.marks > 0));
    if(!all.length){ if(typeof toast === 'function') toast('No chapter marks available yet.'); return; }
    const groups = this._groups(all);
    const selected = (group && groups.indexOf(group) !== -1) ? group : 'all';
    const rows = selected === 'all' ? all : all.filter(r => r.group === selected);
    const chip = (id, label, n) =>
      '<button class="btn btn-sm ' + (selected === id ? 'btn-solid' : 'btn-quiet') + '" type="button" data-on-click="MARKS_MAP.openAll(\'' + escAttrJs(id) + '\')">' +
        esc(label) + ' (' + n + ')</button>';

    const html =
      '<div class="bg" style="flex-wrap:wrap;gap:var(--sp-1);margin-bottom:var(--sp-3)">' +
        chip('all', 'All chapters', all.length) +
        groups.map(g => chip(g, g, all.filter(r => r.group === g).length)).join('') +
      '</div>' +
      '<p class="t-foot" style="margin:0 0 var(--sp-2);line-height:1.5">Exam weight \u00d7 the gap in your accuracy. The chapters at the top can add the most marks in your next study block.</p>' +
      '<div class="rows">' + rows.map(r => this._rowHtml(r)).join('') + '</div>' +
      '<p class="t-cap" style="margin-top:var(--sp-3);line-height:1.5">Marks are estimated by sharing each scheme group\u2019s marks across its chapters by question count. Accuracy uses chapter practice and quiz history.</p>';
    openMod('Marks map', html, { wide:true });
  },

  render(){
    const box = document.getElementById('marks-map-slot');
    if(!box) return;
    const all = this.rows().filter(r => r.marks > 0);
    if(!all.length){ box.innerHTML = ''; return; }
    const rows = this._sortRows(all);
    const top = rows.slice(0, 3);
    const totalMarks = Math.round(all.reduce((n, r) => n + r.marks, 0) * 10) / 10;
    const sortChip = (id, label) =>
      '<button class="btn btn-sm ' + (this._sort === id ? 'btn-solid' : 'btn-quiet') + '" type="button" aria-pressed="' + (this._sort === id) + '" data-on-click="MARKS_MAP.setSort(\'' + id + '\')">' + label + '</button>';
    const rowsHtml = top.map((r, i) =>
      '<div style="display:flex;align-items:center;gap:var(--sp-2);padding:.5rem 0;border-top:1px solid var(--sep-soft)">' +
        '<span class="mono" style="font-size:.7rem;color:var(--ink-3);width:1.1rem">' + (i + 1) + '</span>' +
        '<span class="grow" style="min-width:0">' +
          '<span style="display:block;font-size:.8rem;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.name) + '</span>' +
          '<span class="t-cap" style="display:block">' + esc(r.group) + ' \u00b7 ' + (r.attempted ? Math.round(r.accuracy * 100) + '% accuracy' : 'not started') + '</span>' +
        '</span>' +
        '<span style="text-align:right;white-space:nowrap">' +
          '<span class="ctag ta">' + r.marks + ' marks</span>' +
          '<span class="t-cap" style="display:block">' + (r.attempted ? (r.wrong ? r.wrong + ' missed' : 'no missed') : 'not started') + '</span>' +
        '</span>' +
        '<button class="btn btn-sm btn-quiet" type="button" aria-label="Study ' + esc(r.name) + '" data-on-click="MARKS_MAP.start(\'' + escAttrJs(r.lv) + '\',\'' + escAttrJs(r.ch) + '\')">Study</button>' +
      '</div>').join('');

    box.innerHTML =
      '<section class="card" style="border-color:var(--accent-line)">' +
        '<div class="card-hd"><h3><i class="ph ph-target"></i> Highest return next</h3>' +
          '<button class="btn btn-sm btn-quiet" type="button" data-on-click="MARKS_MAP.openAll()" aria-label="View all chapters in the marks map"><i class="ph ph-squares-four"></i> All ' + all.length + '</button></div>' +
        '<p class="t-foot" style="margin-bottom:var(--sp-2);line-height:1.5">' + totalMarks + ' marks across ' + all.length + ' chapters. Exam weight \u00d7 the gap in your accuracy.</p>' +
        '<div class="bg" role="group" aria-label="Sort chapters" style="gap:var(--sp-1);margin-bottom:var(--sp-2)">' +
          sortChip('gap', 'Best gap') + sortChip('weakest', 'Weakest first') +
        '</div>' +
        rowsHtml +
        '<button class="btn btn-solid btn-blk" style="margin-top:var(--sp-3)" data-on-click="MARKS_MAP.start(\'' + escAttrJs(top[0].lv) + '\',\'' + escAttrJs(top[0].ch) + '\')"><i class="ph ph-play-circle"></i> Start with ' + esc(top[0].name) + '</button>' +
      '</section>';
  },

  start(lv, ch){
    const row = (lv && ch) ? { lv: lv, ch: ch } : this.best();
    if(!row || typeof CH_GRID === 'undefined') return;
    try { if(typeof closeMod === 'function') closeMod(); } catch (e) { window.warnCaught && window.warnCaught('js/features/marks-map.js', e); }
    CH_GRID.startChapter(row.lv, row.ch, 'flashcard');
  }
};

window.MARKS_MAP = MARKS_MAP;
