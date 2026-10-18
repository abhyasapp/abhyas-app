// js/core/router.js — the ONE view dispatcher. Every feature registers
// itself with UI.onEnter / UI.onEnterAny instead of wrapping _goRaw.

const UI = {
  cur: 'home',
  ALIAS: { 'subjective': 'subj-qotd', 'heatmap': 'progress', 'server-progress': 'progress' },
  _enter: {},
  _enterAny: [],
  onEnter(view, fn) { (UI._enter[view] = UI._enter[view] || []).push(fn); },
  onEnterAny(fn) { UI._enterAny.push(fn); },
  _goRaw(v) {
    v = UI.ALIAS[v] || v;
    document.getElementById('quiz-wrap').style.display = 'none';
    document.querySelectorAll('.view').forEach(e => e.classList.remove('on'));
    const el = document.getElementById('view-' + v);
    if (el) el.classList.add('on');
    document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('active'));
    const ni = document.getElementById('nav-' + v);
    if (ni) ni.classList.add('active');
    if (typeof NAV !== 'undefined' && NAV.reveal) NAV.reveal(v);

    if (UI.cur === 'home' && v !== 'home' && HOME._clockTimer) { clearInterval(HOME._clockTimer); HOME._clockTimer = null; }
    if (UI.cur === 'timetable' && v !== 'timetable' && TT._clockTimer) { clearInterval(TT._clockTimer); TT._clockTimer = null; }

    UI.cur = v;
    UI.sidebarClose();
    const mainEl = document.getElementById('main');
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0, 0);

    ({
      home:       () => HOME.render(),
      progress:   () => { PROG.render(); if (typeof PUSH !== 'undefined') PUSH.refreshButtonUI(); },
      online:     () => ONPROG.render(),
      offline:    () => CACHE.render(),
      bookmarks:  () => REV.renderList('bk'),
      wrong:      () => REV.renderList('wr'),
      timetable:  () => TT.render(),
      psycho:     () => PSY.init()
    })[v]?.();

    (UI._enter[v] || []).forEach(fn => { try { fn(v); } catch (e) { console.error('screen hook failed for', v, e); } });
    UI._enterAny.forEach(fn => { try { fn(v); } catch (e) { console.error('screen hook failed', e); } });
  },
  go(v) {
    if (S.quiz.active && document.getElementById('quiz-wrap').style.display !== 'none') {
      QUIZ._exitGuard(() => UI._goRaw(v));
      return;
    }
    UI._goRaw(v);
  },
  sidebarToggle() {
    document.getElementById('sb').classList.toggle('open');
    document.getElementById('ov').classList.toggle('show');
  },
  sidebarClose() {
    document.getElementById('sb').classList.remove('open');
    document.getElementById('ov').classList.remove('show');
  },
  theme() {
    document.body.classList.toggle('dark');
    _save('abhyas_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  }
};

window.UI = UI;