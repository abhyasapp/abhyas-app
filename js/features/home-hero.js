// js/features/home-hero.js — the first thing a student sees: who it is, what day it is,
// where they stand, and one button that puts them back where they left off.
//
// Everything is read from state that already exists (S.stk, S.prog, S.prog.sessions) and
// from ChapterData, so nothing new is stored. Redrawn when Home is entered and when the
// language changes; the app has no reactive store to subscribe to.
//
// Depends on: core/state.js (S), core/i18n.js (I18N), core/text.js (esc),
//             core/router.js (UI.onEnter), js/data/chapters-loader.js (ChapterData at call time).

window.HOME_HERO = (function () {
  'use strict';

  const T = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v) : s);
  const E = (s) => (typeof esc === 'function' ? esc(s) : String(s == null ? '' : s));

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function hour() {
    const d = new Date();
    return d.getHours();
  }
  function greeting() {
    const h = hour();
    if (h < 5) return T('Still up');
    if (h < 12) return T('Good morning');
    if (h < 17) return T('Good afternoon');
    if (h < 21) return T('Good evening');
    return T('Good night');
  }
  function todayLine() {
    const d = new Date();
    return T(DAYS[d.getDay()]) + ', ' + d.getDate() + ' ' + T(MONTHS[d.getMonth()]);
  }

  function name() {
    try {
      const u = (typeof S !== 'undefined' && S.user) ? S.user : null;
      const raw = u && (u.name || u.username);
      return raw ? String(raw).split(' ')[0] : '';
    } catch (e) { return ''; }
  }

  function streakDays() {
    try {
      const st = S.stk || {};
      const days = Array.isArray(st.days) ? st.days : [];
      return days.length;
    } catch (e) { return 0; }
  }

  function accuracy() {
    try {
      const p = S.prog || {};
      const total = Number(p.total) || 0;
      const correct = Number(p.correct) || 0;
      if (!total) return null;
      return Math.round(correct / total * 100);
    } catch (e) { return null; }
  }

  /* The file whose session was most recent, resolved back to a chapter name. */
  function lastRef() {
    try {
      const s = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
      const hit = s.find((x) => x && x.fid);
      if (!hit) return null;
      const refs = (typeof ChapterData !== 'undefined' && ChapterData.allFileRefs) ? ChapterData.allFileRefs() : [];
      const ref = refs.find((r) => r.fid === hit.fid);
      if (!ref) return null;
      let chapter = '';
      try { chapter = ChapterData.chapterName(ref.lv, ref.ch) || ''; } catch (e) { chapter = ''; }
      return { fid: ref.fid, chapter: chapter };
    } catch (e) { return null; }
  }

  function sprintLine() {
    try {
      if (typeof SPRINT_PAGE === 'undefined' || !SPRINT_PAGE.plan) return '';
      const p = SPRINT_PAGE.plan();
      if (!p || !p.dayNum) return '';
      return T('Day {d} of {n}', { d: p.dayNum, n: p.N || 60 });
    } catch (e) { return ''; }
  }

  function stat(n, label) {
    return '<span class="hh-stat"><span class="n">' + E(n) + '</span><span class="l">' + E(label) + '</span></span>';
  }

  function render() {
    const box = document.getElementById('home-hero');
    if (!box) return;

    const who = name();
    const greet = greeting() + (who ? ', ' + who : '');
    const acc = accuracy();
    const streak = streakDays();
    const sprint = sprintLine();
    const last = lastRef();

    /* Only say something the CTA does not already say. */
    const sub = [sprint, acc === null ? '' : T('{n}% accuracy so far', { n: acc })]
      .filter(Boolean).join(' \u00b7 ');

    const stats = [];
    if (streak) stats.push(stat(streak, T('day streak')));
    if (acc !== null) stats.push(stat(acc + '%', T('accuracy')));
    try {
      const p = (S.prog || {});
      if (p.total) stats.push(stat(p.total, T('questions answered')));
    } catch (e) { /* no progress yet */ }

    const cta = last
      ? '<button type="button" class="hh-cta" data-on-click="HOME_HERO.continueLast()">' +
          '<i class="ph ph-play-circle" aria-hidden="true"></i> ' +
          E(T('Continue') + (last.chapter ? ': ' + last.chapter : '')) + '</button>'
      : '<button type="button" class="hh-cta" data-on-click="UI.go(\'online\')">' +
          '<i class="ph ph-books" aria-hidden="true"></i> ' + E(T('Pick a chapter and begin')) + '</button>';

    box.innerHTML =
      '<section class="home-hero" aria-labelledby="hh-greet">' +
        '<p class="hh-kicker">' + E(todayLine()) + '</p>' +
        '<h2 class="hh-greet" id="hh-greet">' + E(greet) + '</h2>' +
        (sub ? '<p class="hh-sub">' + E(sub) + '</p>' : '') +
        (stats.length ? '<div class="hh-stats">' + stats.join('') + '</div>' : '') +
        cta +
      '</section>';
  }

  function continueLast() {
    const last = lastRef();
    if (last && typeof CH_GRID !== 'undefined' && CH_GRID.startFid) {
      CH_GRID.startFid(last.fid, 'flashcard');
      return;
    }
    if (typeof UI !== 'undefined' && UI.go) UI.go('online');
  }

  if (typeof UI !== 'undefined' && UI.onEnter) UI.onEnter('home', render);
  document.addEventListener('abhyas:lang', render);
  document.addEventListener('abhyas:progress', render);

  return { render, continueLast };
})();
