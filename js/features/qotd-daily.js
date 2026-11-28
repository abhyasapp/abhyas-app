// js/features/qotd-daily.js — the day's question, taken from the question bank itself.
//
// The written question below it (subj-qotd.js) is graded by an admin; this card is the
// objective one-question practice for the day. Which question it is follows the bank:
//
//   every level      the last subtopic of a chapter is the "Original Questions" bank — source
//                    copies of questions already classified under that chapter's real
//                    subtopics — so it is never the daily question.
//   gk               is the exception: its original-question bucket is the only place some
//                    topics live, so every GK file may be picked.
//
// The pick is fixed for the date (same question all day, new one tomorrow) and read-only: the
// file comes from this device when it is already downloaded, otherwise it is fetched, and the
// set is never saved. The answer is given in place — one tap, right or wrong, with the reason —
// and only that small result is kept, so the card can say "done today" and count a streak.
//
// The result is tied to the QUESTION, not just the day: if the bank changes under the app and
// today's pick becomes a different question, yesterday's answer is not shown against it.
//
// MUST load AFTER: core/state.js, core/question.js (normQ), core/text.js (esc),
// core/toast.js (toast), js/features/quiz-engine.js (QUIZ), data/chapters-loader.js (at call time).

window.QOTD_DAILY = (function () {
  'use strict';

  const KEY = 'abhyas_qotd_daily_v1';
  let _cache = null;                       // { date, ref, q } for this session only
  let _painted = '';                       // the markup already on screen, to avoid repainting

  function warn(e) { if (window.warnCaught) window.warnCaught('js/features/qotd-daily.js', e); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }
  function yesterdayKey() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return dateKey(d);
  }
  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function me() { try { return String((S.user && S.user.username) || '').toLowerCase(); } catch (e) { return ''; } }

  function levelOf(ref) { return String(ref && ref.lv || '').toLowerCase(); }
  function isOriginal(ref) {
    const label = [ref.book, ref.subtopic, ref.name, ref.title].filter(Boolean).join(' ');
    return /\boriginal\b/i.test(label) || /\bold\s+questions?\b/i.test(label);
  }
  /* Every file the daily question may come from. */
  function eligible(refs) {
    return (refs || []).filter((r) => {
      if (!r || !r.fid || !r.key) return false;
      if (levelOf(r) === 'gk') return true;   // GK keeps its original-question files
      return !isOriginal(r);                  // technical levels: real subtopics only
    });
  }
  function allRefs() {
    try { return (typeof ChapterData !== 'undefined' && ChapterData.allFileRefs) ? ChapterData.allFileRefs() : []; }
    catch (e) { return []; }
  }

  async function pick() {
    const date = dateKey();
    if (_cache && _cache.date === date) return _cache;
    const pool = eligible(allRefs());
    if (!pool.length) return null;
    const ref = pool[hash('ref' + date) % pool.length];

    let raw;
    try { raw = await QDB.get(ref.key); } catch (e) { raw = null; }     // a downloaded set costs no network
    if (!raw) {
      if (!S.online || S.forcedOffline) return { date, ref, q: null, offline: true };
      try { raw = await QUIZ._fetchFromCDN(ref.fid, 12000); }
      catch (e) { return { date, ref, q: null, offline: false }; }
    }
    let list;
    try { list = normQ(raw, ref.fid); } catch (e) { list = []; }
    if (!list.length) return { date, ref, q: null, offline: false };
    _cache = { date, ref, q: list[hash('q' + date) % list.length] };
    return _cache;
  }

  /* ── today's result: one small record, nothing else ─────────────────────────────────── */
  function idOf(got) {
    const q = got && got.q;
    if (!got || !got.ref || !q) return '';
    return got.ref.key + '#' + String(q.qid || q.uid || q.q || '').slice(0, 60);
  }
  function stored() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return d && d.date && (d.user || '') === me() ? d : null;
    } catch (e) { return null; }
  }
  /* The record for the question on screen now — not for whatever we answered earlier today. */
  function recordFor(got) {
    const d = stored();
    if (!d || d.date !== dateKey()) return null;
    if (got && d.picked && d.picked !== idOf(got)) return null;
    return d;
  }
  function doneToday() { return !!recordFor(_cache); }
  function streak() {
    const d = stored();
    if (!d) return 0;
    return (d.date === dateKey() || d.date === yesterdayKey()) ? (Number(d.count) || 0) : 0;
  }

  function chapterOf(ref) {
    try { return ChapterData.chapterName(ref.lv, ref.ch); } catch (e) { return 'Chapter ' + ref.ch; }
  }

  /* The daily answer is an answer like any other: it moves the totals, the per-question stats,
     the coverage bits, the practice history and the miss list, through the same functions the
     quiz uses. A wrong one lands in the wrong bank (due now); a right one on a missed question
     counts toward mastery exactly as it does inside a quiz. */
  function recordAnswer(got, ok) {
    const q = got.q, ref = got.ref;
    const row = { uid: q.uid, ok: !!ok };
    if (q.qid !== undefined && q.qid !== null && q.qid !== '') row.qid = q.qid;
    if (q.nid !== undefined && q.nid !== null && q.nid !== '') row.nid = q.nid;
    if (q.pqn) row.pqn = q.pqn;
    const qres = [row];
    const chapter = chapterOf(ref);

    try { if (typeof PROG !== 'undefined' && PROG.track) PROG.track(!!ok); } catch (e) { warn(e); }
    try { if (typeof QSTATS !== 'undefined' && QSTATS.recordSession) QSTATS.recordSession(qres); } catch (e) { warn(e); }
    try { if (typeof COV !== 'undefined' && COV.record) COV.record(qres); } catch (e) { warn(e); }
    try { if (typeof REV !== 'undefined' && REV.trackAnswer) REV.trackAnswer(q, !!ok); } catch (e) { warn(e); }
    const sess = {
      chapter, chapterKey: chapter, mode: 'flashcard',
      total: 1, correct: ok ? 1 : 0, wrong: ok ? 0 : 1, skipped: 0, pct: ok ? 100 : 0,
      at: Date.now(), durationSec: 0, sessionKind: 'new',
      lv: ref.lv, ch: ref.ch, book: ref.book, sub: ref.subtopic, fid: ref.fid,
      weeklyId: '', weeklyTitle: '', sprintKind: '', qres, calibration: null
    };
    try { if (typeof PROG !== 'undefined' && PROG.recordSession) PROG.recordSession(sess); } catch (e) { warn(e); }
    try { if (typeof CHAPSTATS !== 'undefined' && CHAPSTATS.record) CHAPSTATS.record(sess); } catch (e) { warn(e); }
  }

  function optHtml(text, i, state, locked) {
    const color = state === 'right' ? 'var(--grn)' : state === 'wrong' ? 'var(--ros)' : 'var(--sep)';
    const mark = state === 'right' ? ' ✓' : state === 'wrong' ? ' ✗' : '';
    const look = 'display:flex;gap:.5rem;width:100%;text-align:left;align-items:flex-start;'
      + 'padding:.45rem .6rem;margin:.25rem 0;border:1px solid ' + color + ';border-radius:10px;'
      + 'background:transparent;color:inherit;font:inherit;font-size:.8rem;line-height:1.45';
    return '<button type="button"' + (locked ? ' disabled' : '') + ' data-on-click="QOTD_DAILY.answer(' + i + ')"'
      + ' style="' + look + (locked ? ';opacity:.85;cursor:default' : ';cursor:pointer') + '">'
      + '<b>' + String.fromCharCode(65 + i) + ')</b><span>' + esc(String(text)) + mark + '</span></button>';
  }

  function cardHtml(got) {
    const q = got.q, done = recordFor(got);
    const correct = (typeof q.correct === 'number') ? q.correct : null;
    const chosen = done && typeof done.chosen === 'number' ? done.chosen : null;
    const opts = (q.options || []).map((o, i) => {
      if (!done) return optHtml(o, i, '', false);
      const state = correct === null ? (i === chosen ? 'right' : '')
        : i === correct ? 'right' : i === chosen ? 'wrong' : '';
      return optHtml(o, i, state, true);
    }).join('');
    const ctag = !done ? '<span class="ctag ta">One question</span>'
      : done.ok === true ? '<span class="ctag tg"><i class="ph ph-check"></i> Correct</span>'
      : done.ok === false ? '<span class="ctag tr"><i class="ph ph-x"></i> Not this time</span>'
      : '<span class="ctag tg"><i class="ph ph-check"></i> Answered</span>';
    const days = streak();
    const foot = !done
      ? '<p class="t-foot" style="margin:.5rem 0 0">Tap an answer. Same question all day, a new one tomorrow.</p>'
      : '<p class="t-foot" style="margin:.6rem 0 0">' + (days > 1 ? days + '-day streak · ' : '')
        + 'Another question tomorrow.</p>';
    /* role=status: the verdict is the only thing that changes, so it is what a screen reader
       announces after a tap. */
    const why = done
      ? '<p role="status" style="font-size:.76rem;line-height:1.5;color:var(--t2);margin:.5rem 0 0">'
        + (done.ok === true ? 'That is the right answer.' : done.ok === false ? 'That is not the right answer.' : 'Answer saved.')
        + (q.explanation ? ' ' + esc(q.explanation) : '') + '</p>'
      : '';
    return '<section class="card" id="qotd-daily-card">'
      + '<div class="card-hd"><h3><i class="ph ph-sun-horizon"></i> Question of the day</h3>' + ctag + '</div>'
      + '<div class="t-foot" style="margin-bottom:.35rem">' + esc(chapterOf(got.ref)) + (q.topic ? ' · ' + esc(q.topic) : '') + '</div>'
      + '<p style="font-size:.85rem;line-height:1.55;margin:0 0 .5rem">' + esc(q.q) + '</p>'
      + (opts ? '<div role="group" aria-label="Answer options">' + opts + '</div>' : '')
      + why + foot
      + '</section>';
  }

  function paint(box, html) {
    if (html === _painted && box.childNodes.length) return;   // nothing changed: keep focus and scroll
    _painted = html;
    box.innerHTML = html;
  }

  async function render() {
    const box = document.getElementById('qotd-daily-slot');
    if (!box) return;
    const got = await pick();
    if (!got) { paint(box, ''); return; }                      // no chapter tree yet: nothing to add
    if (!got.q) {
      paint(box, got.offline
        ? '<section class="card"><div class="card-hd"><h3><i class="ph ph-sun-horizon"></i> Question of the day</h3></div>'
          + '<p class="t-foot" style="margin:0">Today\'s question is not saved on this device. Connect once and it will be here, offline, next time.</p></section>'
        : '');
      return;
    }
    paint(box, cardHtml(got));
  }

  /* One tap, one answer, for today's question only. */
  function answer(i) {
    const got = _cache;
    if (!got || !got.q) { toast('Today\'s question is not ready yet'); return; }
    if (recordFor(got)) return;
    const correct = (typeof got.q.correct === 'number') ? got.q.correct : null;
    const ok = correct === null ? null : Number(i) === correct;
    const prev = stored();
    const count = (prev && prev.date === yesterdayKey()) ? (Number(prev.count) || 0) + 1 : 1;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        user: me(), date: dateKey(), picked: idOf(got), chosen: Number(i), ok, count
      }));
    } catch (e) { warn(e); }
    if (ok !== null) recordAnswer(got, ok);      // no answer key in the file: nothing to record as right or wrong
    render().catch(warn);
  }

  if (typeof UI !== 'undefined' && UI.onEnter) UI.onEnter('subj-qotd', render);
  window.addEventListener('abhyas:chapters-updated', () => { _cache = null; _painted = ''; render().catch(warn); });

  return { render, pick, answer, eligible, dateKey, streak, doneToday, current: () => _cache };
})();
