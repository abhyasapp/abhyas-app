// js/features/chapter-nav.js — chapter grid, mastery, verdicts, heatmap.
// MUST load AFTER: core/state.js (S), core/dom.js ($, $$), core/text.js (esc, escAttrJs),
// core/format.js (shuf), core/storage.js (QDB), core/modal.js (openMod, closeMod),
// core/progress.js (chapterMastery, SPRINT_LEVELS), core/toast.js (toast),
// data/chapters-data.js (ChapterData), features/online-study.js (prettySub, ON),
// features/quiz-engine.js (QUIZ), features/wrong-bank-ui.js (WRONGBY),
// features/chapter-stats.js (CHAPSTATS), features/print-q.js (PRINT_Q).
// WRONGBY, ON, QUIZ, PRINT_Q are used at call time only, so this file can load
// before any of them — it never runs a call at parse.

window.MASTERY = {
  _fids(lv, ch){ return ChapterData.chapterFileRefs(lv, ch).map(r => r.fid); },
  chapter(lv, ch){
    return chapterMastery({ fids: this._fids(lv, ch), fcount: S.fcount, cov: S.cov, wr: S.wr });
  },
  /* the chapters the 60-day sprint is planned over: Level 7 and General Knowledge */
  filteredChapters(){
    const out = [];
    SPRINT_LEVELS.forEach(lv => {
      try { Object.keys(ChapterData.chapters(lv)).forEach(ch => { if (ChapterData.chapterFileRefs(lv, ch).length) out.push({ lv, ch }); }); } catch(e){}
    });
    return out;
  },
  summary(){
    const list = this.filteredChapters();
    let done = 0;
    list.forEach(c => { if (this.chapter(c.lv, c.ch).state === 'complete') done++; });
    return { done, total: list.length };
  }
};

window.CH_GRID = {
  lv: '',
  LEVELS: [['level7', 'Level 7'], ['level5', 'Level 5'], ['gk', 'General Knowledge']],

  _stats(refs){
    let seen = 0, total = 0, known = 0;
    refs.forEach(r => {
      const c = S.cov && S.cov[r.fid];
      if (c && c.p) for (let i = 0; i < c.p.length; i++) if (c.p[i] !== '0') seen++;
      const n = S.fcount && S.fcount[r.fid];
      if (n != null) { total += n; known++; }
    });
    return { seen: seen, total: total, complete: refs.length > 0 && known === refs.length };
  },

  _last(){
    return ((S.prog && S.prog.sessions) || []).find(x => x.fid && x.lv && x.ch) || null;
  },

  _ref(fid){
    return ChapterData.allFileRefs().find(r => r.fid === fid) || null;
  },

  render(){
    const box = $('chgrid');
    if (!box || typeof ChapterData === 'undefined') return;
    const last = this._last();
    if (!this.lv) this.lv = (last && last.lv) || 'level7';

    let html = '';
    const lastRef = last ? this._ref(last.fid) : null;
    if (lastRef) {
      const st = this._stats([lastRef]);
      html += '<div class="card" style="border-color:var(--accent-line);background:var(--accent-soft)">' +
        '<div class="t-cap" style="color:var(--accent);font-weight:700">Continue</div>' +
        '<div class="t-t3" style="margin:2px 0 var(--sp-2)">' + esc(ChapterData.chapterName(lastRef.lv, lastRef.ch)) + ': ' + esc(prettySub(lastRef.subtopic)) + '</div>' +
        '<div class="t-foot mb3">' + (st.total ? st.seen + ' of ' + st.total + ' seen' : st.seen + ' seen') + '</div>' +
        '<div class="bg"><button class="btn btn-solid" type="button" data-on-click="CH_GRID.startFid(\'' + lastRef.fid + '\',\'flashcard\')">Practise</button>' +
        '<button class="btn btn-quiet" type="button" data-on-click="CH_GRID.startFid(\'' + lastRef.fid + '\',\'exam\')">Timed test</button></div></div>';
    }

    const tabs = this.LEVELS.map(l =>
      '<button type="button" class="' + (l[0] === this.lv ? 'active' : '') + '" data-on-click="CH_GRID.setLevel(\'' + l[0] + '\')">' + esc(l[1]) + '</button>').join('');
    const chs = ChapterData.chapters(this.lv);
    const cards = Object.keys(chs).map(ch => {
      const refs = ChapterData.chapterFileRefs(this.lv, ch);
      const has = refs.length > 0;
      const st = this._stats(refs);
      const pct = (st.complete && st.total) ? Math.min(100, Math.round(st.seen / st.total * 100)) : null;
      const missed = (typeof WRONGBY !== 'undefined') ? WRONGBY.countForChapter(this.lv, ch) : 0;
      const mst = has ? MASTERY.chapter(this.lv, ch) : null;
      const done = !!mst && mst.state === 'complete';
      const gate = (mst && mst.state === 'in-progress' && mst.needs.length) ? mst.needs[0] : '';
      const meta = !has ? 'Coming soon'
        : (done ? 'Complete \u00b7 ' + Math.round(mst.accuracy * 100) + '% accuracy \u00b7 ' : (pct !== null ? pct + '% seen \u00b7 ' : (st.seen ? st.seen + ' seen \u00b7 ' : ''))) + refs.length + (refs.length === 1 ? ' set' : ' sets') +
          (missed ? ' \u00b7 ' + missed + ' missed' : '') + (gate ? ' \u00b7 ' + gate : '');
      const missedBadge = missed
        ? '<span class="ctag tr" style="position:absolute;top:.4rem;right:.4rem">' + missed + ' missed</span>'
        : '';
      return '<button type="button" class="chg-card" style="position:relative"' + (has ? '' : ' disabled') + ' data-on-click="CH_GRID.open(\'' + this.lv + '\',\'' + ch + '\')">' +
        missedBadge +
        '<span class="chg-name">' + (done ? '<i class="ph ph-seal-check" style="color:var(--success)" aria-label="Complete"></i> ' : '') + esc(chs[ch]) + '</span>' +
        (has ? '<span class="pb" style="display:block"><span class="pb-f" style="display:block;width:' + (pct === null ? 0 : pct) + '%"></span></span>' : '') +
        '<span class="chg-meta">' + esc(meta) + '</span></button>';
    }).join('');
    box.innerHTML = html + '<div class="chg-tabs">' + tabs + '</div><div class="chg-grid">' + cards + '</div>';
  },

  setLevel(id){ this.lv = id; this.render(); },

  async open(lv, ch){
    const refs = ChapterData.chapterFileRefs(lv, ch);
    if (!refs.length) return;
    const name = ChapterData.chapterName(lv, ch);
    let keys = new Set();
    try { keys = new Set(await QDB.keys()); } catch(e){}
    const offline = !(S.online && !S.forcedOffline);
    const missedFor = fid => (typeof WRONGBY !== 'undefined') ? WRONGBY.countFor(fid) : 0;
    const rows = refs.map(r => {
      const st = this._stats([r]);
      const cached = keys.has(r.key);
      const blocked = offline && !cached;
      const m = missedFor(r.fid);
      return '<div class="row" style="padding:var(--sp-2) 0">' +
        '<div class="row-main"><div class="t-callout" style="color:var(--ink);font-weight:600">' + esc(prettySub(r.subtopic)) + '</div>' +
        '<div class="t-cap">' + (st.total ? st.seen + ' of ' + st.total + ' seen' : (st.seen ? st.seen + ' seen' : 'Not started')) +
        (cached ? ' · saved on this device' : (blocked ? ' · needs a connection' : '')) +
        (m ? ' · ' + m + ' missed' : '') + '</div></div>' +
        '<button class="btn btn-sm btn-a" type="button"' + (blocked ? ' disabled' : '') + ' data-on-click="CH_GRID.go(\'' + r.fid + '\',\'flashcard\')">Practise</button>' +
        (m ? '<button class="btn btn-sm btn-r" type="button" data-on-click="closeMod();WRONGBY.startFile(\'' + escAttrJs(r.fid) + '\',false)">Missed (' + m + ')</button>' : '') +
        '<button class="btn btn-sm btn-quiet" type="button"' + (blocked ? ' disabled' : '') + ' data-on-click="CH_GRID.go(\'' + r.fid + '\',\'exam\')">Test</button>' +
        '<button class="btn btn-sm ch-row-print" type="button" title="Print a revision sheet"' + (blocked ? ' disabled' : '') + ' data-on-click="PRINT_Q.sheet(\'' + escAttrJs(r.fid) + '\')"><i class="ph ph-printer"></i></button>' +
        '</div>';
    }).join('');
    const head = refs.length > 1
      ? '<div class="bg mb3"><button class="btn btn-solid" type="button"' + (offline ? ' disabled' : '') + ' data-on-click="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'flashcard\')">Practise the whole chapter</button>' +
        '<button class="btn btn-quiet" type="button"' + (offline ? ' disabled' : '') + ' data-on-click="CH_GRID.startChapter(\'' + lv + '\',\'' + ch + '\',\'exam\')">Timed test</button></div>'
      : '';
    openMod(name, head + '<div class="rows">' + rows + '</div>');
  },

  go(fid, mode){ closeMod(); this.startFid(fid, mode); },

  startFid(fid, mode){
    const r = this._ref(fid);
    if (!r) { toast('That set is not available.'); return; }
    const name = ChapterData.chapterName(r.lv, r.ch) + ' \u2014 ' + r.book;
    QUIZ.load(r.fid, r.key, mode, name, { lv: r.lv, ch: r.ch, book: r.book, sub: r.subtopic, fid: r.fid });
  },

  async startChapter(lv, ch, mode){
    closeMod();
    const refs = ChapterData.chapterFileRefs(lv, ch);
    if (!refs.length) return;
    QUIZ._showLoader('Loading ' + refs.length + ' sets…');
    const all = [];
    let i = 0, done = 0, failed = 0;
    const worker = async () => {
      while (i < refs.length) {
        const ref = refs[i++];
        try { all.push(...normQ(await QUIZ._fetch(ref.fid, ref.key), ref.fid)); }
        catch(e){ failed++; }
        done++;
        const m = $('quiz-loader-msg');
        if (m) m.textContent = 'Loading sets (' + done + '/' + refs.length + ')…';
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, refs.length) }, worker));
    QUIZ._hideLoader();
    if (!all.length) { toast('Could not load this chapter. Download it while online first.', 5000); return; }
    if (failed) toast(failed + ' set(s) could not load. Starting with ' + all.length + ' questions.', 4000);
    QUIZ.startWith(all, mode, ChapterData.chapterName(lv, ch) + ' \u2014 ' + refs[0].book, { lv: lv, ch: ch });
  }
};

window.CHAP_VERDICTS = {
  render(){
    const box = $('chap-verdicts');
    if (!box) return;
    let entries = [];
    try { entries = (typeof CHAPSTATS !== 'undefined') ? CHAPSTATS.entries() : []; } catch(e){}
    entries = entries.filter(e => e.attempted >= 3);
    if (!entries.length) {
      box.innerHTML = '<p class="t-foot" style="padding:var(--sp-2) 0">Complete a few sessions to see which chapters are strongest.</p>';
      return;
    }
    entries.sort((a, b) => a.accuracy - b.accuracy);
    box.innerHTML = entries.slice(0, 5).map(e => {
      const pct = e.accuracy;
      const kind = pct >= 80 ? 'ready' : pct >= 60 ? 'needs' : 'weak';
      const icon = pct >= 80 ? 'ph-check-circle' : pct >= 60 ? 'ph-warning-circle' : 'ph-x-circle';
      return '<button class="chap-verdict ' + kind + '" data-on-click="CHAP_VERDICTS.go(\'' + escAttrJs(e.chapter) + '\')">' +
        '<i class="ph ' + icon + ' mark"></i>' +
        '<span class="lbl">' + esc(e.chapter) + '</span>' +
        '<span class="t-cap mono">' + e.correct + '/' + e.attempted + '</span>' +
        '<span class="t-cap" style="color:var(--ink-3);font-weight:650">' + pct + '%</span>' +
      '</button>';
    }).join('');
  },
  go(chapter){
    try {
      UI.go('online');
      setTimeout(() => {
        const refs = ChapterData.allFileRefs();
        const ref = refs.find(r => ChapterData.chapterName(r.lv, r.ch) === chapter);
        if (!ref) return;
        const lvSel = $('on-lv');
        if (lvSel && ref.lv) {
          lvSel.value = ref.lv;
          if (typeof ON !== 'undefined' && ON.onLv) ON.onLv();
          const chSel = $('on-ch');
          if (chSel) { chSel.value = ref.ch; if (ON.onCh) ON.onCh(); }
        }
      }, 200);
    } catch(e){ UI.go('progress'); }
  }
};

window.HEATMAP = {
  render(){
    const box = document.getElementById('heatmap-body');
    if (!box || typeof ChapterData === 'undefined') return;
    const levels = [['level7','Level 7 — Civil'], ['level5','Level 5 — Diploma'], ['gk','General Knowledge']];
    const stats = {};
    (typeof CHAPSTATS !== 'undefined' ? CHAPSTATS.entries() : []).forEach(e => { stats[e.chapter] = e; });
    box.innerHTML = levels.map(([lv, name]) => {
      const chs = ChapterData.chapters(lv);
      const cards = Object.keys(chs).map(ch => {
        const refs = ChapterData.chapterFileRefs(lv, ch);
        if (!refs.length) return '';
        const label = ChapterData.chapterName(lv, ch);
        const s = stats[label];
        const acc = s ? s.accuracy : null;
        let seen = 0;
        refs.forEach(r => { const c = S.cov && S.cov[r.fid]; if (c && c.a) seen += c.a; });
        const cls = acc === null ? 'untouched' : acc >= 80 ? 'strong' : acc >= 60 ? 'workable' : 'weak';
        const missed = (typeof WRONGBY !== 'undefined') ? WRONGBY.countForChapter(lv, ch) : 0;
        const barColor = cls === 'strong' ? 'var(--success)'
                       : cls === 'workable' ? 'var(--accent)'
                       : cls === 'weak' ? 'var(--danger)'
                       : 'var(--sep-strong)';
        return '<button type="button" class="chg-card" style="border-left:4px solid ' + barColor + '" data-on-click="HEATMAP.go(\'' + lv + '\',\'' + ch + '\')">' +
          '<span class="chg-name">' + esc(chs[ch]) + '</span>' +
          '<span class="chg-meta">' +
            (acc === null ? 'Not started' : acc + '% · ' + seen + ' answered') +
            (missed ? ' · ' + missed + ' missed' : '') +
          '</span></button>';
      }).join('');
      if (!cards) return '';
      return '<div class="section-head"><h2>' + esc(name) + '</h2></div><div class="chg-grid">' + cards + '</div>';
    }).join('');
  },
  go(lv, ch){
    if (typeof CH_GRID !== 'undefined') { CH_GRID.lv = lv; CH_GRID.open(lv, ch); }
  }
};