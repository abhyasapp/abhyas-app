/* ═══════════════════════════════════════════════════════════════════════
   report/report-shared.js (v1.46) — constants and pure helpers used by
   BOTH the student reporting code (userreport.js) and the admin one
   (adminreport.js).

   Also exports qReportHtml, the small "Report an issue" button that goes
   on every question card in quiz-engine.js, review.js and wrong-bank-ui.js.

   No DOM, no network, no storage. Classic script. Load it BEFORE
   report-matching.js, userreport.js and adminreport.js.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

/* The words shown for each reason and each section. The student form and
   the admin screen both read these. The codes are what the server stores;
   do not rename them. */
const REPORT_REASON_LABELS = {
  wrong_answer:  'Wrong answer marked',
  unclear:       'Unclear wording or options',
  typo:          'Typo or formatting',
  incomplete:    'Incomplete question',
  image_problem: 'Image, table or diagram problem',
  other:         'Something else'
};
const REPORT_SECTION_LABELS = {
  practice: 'Chapter practice', exam: 'Timed exam',
  'daily-paper': 'Daily 75-mark paper', weekly: 'Weekly test',
  hourly: 'Hourly 50', results: 'Results review',
  'review-missed': 'Missed list', 'review-saved': 'Saved list',
  'review-flagged': 'Flagged list', other: 'Other'
};

/* Where the offline report queue lives on the device (survives a restart). */
const REPORT_QUEUE_KEY = 'abhyas_report_queue';

/* A view-only copy of what this device reported. The queue above is deleted
   after a successful send; this list keeps the question and its state so the
   student can look back at it. It is deliberately local: there is no student
   API for reading report history from another device. */
const REPORT_HISTORY_KEY = 'abhyas_report_history_v1';
const REPORT_HISTORY_MAX = 100;

/* A question is identified by QKEY (js/core/qkey.js): non-public id first, then
   public number, then position (only for content with neither). The reason is
   part of the identity, so one question can be reported once per reason. */
function _rid(r) { return (typeof QKEY !== 'undefined' && QKEY.primary(r)) || String((r && r.uid) || ''); }
function reportSameQuestionReason(a, b) {
  if (!a || !b || String(a.reason || '') !== String(b.reason || '')) return false;
  /* A report that carries an id and one that carries only a position are kept
     apart: the position may now belong to a different question, and a lost
     report costs more than a duplicate one. */
  const x = QKEY.ids(a), y = QKEY.ids(b);
  if (!!(x.nid || x.pqn) !== !!(y.nid || y.pqn)) return false;
  return QKEY.same(a, b);
}
function reportHistoryKey(r) {
  return String(_rid(r)) + '|' + String((r && r.reason) || '');
}

function reportHistoryAdd(list, entry, now) {
  const src = Array.isArray(list) ? list : [];
  if (!entry || !entry.reason) return src.slice();
  if (!QKEY.of(entry)) return src.slice();
  const t = Number(now) || Date.now();
  const out = src.filter(x => x && !reportSameQuestionReason(x, entry));
  out.push(Object.assign({ status: 'queued', reportedAt: t }, entry));
  return out.slice(-REPORT_HISTORY_MAX);
}

/* `id` is a report/question object (preferred) or a bare qid/uid string.
   With an object the permanent id decides: two rows that both carry a qid are
   the same question only when the qids match, whatever their uids say. */
function reportHistoryUpdate(list, id, reason, patch) {
  const ref = (id && typeof id === 'object') ? id : null;
  const want = ref ? '' : String(id == null ? '' : id);
  const why = String(reason || '');
  return (Array.isArray(list) ? list : []).map(x => {
    if (!x || (!ref && !want)) return x;
    const mine = ref ? QKEY.same(x, ref) : QKEY.same(x, want);
    return (mine && String(x.reason || '') === why)
      ? Object.assign({}, x, patch || {})
      : x;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   OFFLINE REPORT QUEUE (v1.33, pure, unit-tested)
   A report written offline (or one that failed to send) waits here and is
   sent when the device is back online. Same question + same reason is kept
   once. The queue is capped so it can never grow without limit.
   ═══════════════════════════════════════════════════════════════════════ */
const REPORT_REASONS = ['wrong_answer', 'unclear', 'typo', 'incomplete', 'image_problem', 'other'];
/* 100 reports can wait on the device (a long offline revision session). When
   the queue is full the NEW report is refused with a message (see
   reportQueueIsFull); an older, unsent report is never silently dropped. */
const REPORT_QUEUE_MAX = 100;

/* The queue sends reports, so it has to agree with the server on what "the
   same question" means: the stable qid when the export carries one, the
   positional uid otherwise. Keying on uid alone meant a qid-only report
   could never be queued and could never be removed after it was sent. */
function reportQueueId(r) {
  return r ? QKEY.of(r) : '';
}

function reportQueueKey(r) {
  const id = reportQueueId(r) && _rid(r);
  return id ? id + '|' + String((r && r.reason) || '') : '';
}

function reportQueueAdd(queue, report, now) {
  const q = Array.isArray(queue) ? queue.filter(x => x && reportQueueId(x)) : [];
  if (!report || !reportQueueId(report)) return q;
  if (REPORT_REASONS.indexOf(report.reason) === -1) return q;
  const note = String(report.note || '').slice(0, 500);
  const dup = q.findIndex(x => reportSameQuestionReason(x, report));
  const entry = Object.assign({}, report, { note, queuedAt: Number(now) || Date.now() });
  if (dup !== -1) q[dup] = entry; else q.push(entry);
  return q.slice(-REPORT_QUEUE_MAX);
}

/* True when adding `report` would push out an unsent one. Re-reporting a
   question+reason that is already queued just replaces it, so that is fine. */
function reportQueueIsFull(queue, report) {
  const q = Array.isArray(queue) ? queue.filter(x => x && reportQueueId(x)) : [];
  if (q.length < REPORT_QUEUE_MAX) return false;
  return !q.some(x => reportSameQuestionReason(x, report));
}

function reportQueueRemove(queue, report) {
  const src = Array.isArray(queue) ? queue : [];
  if (!reportQueueKey(report)) return src.slice();
  return src.filter(x => !(x && reportSameQuestionReason(x, report)));
}

/* qid-aware names used by the report sheet's call sites. Both share the
   canonical implementation above, so a legacy uid-only row is still found. */
function reportHistoryAddQid(list, entry, now) { return reportHistoryAdd(list, entry, now); }

function reportHistoryUpdateQid(list, id, reason, patch) { return reportHistoryUpdate(list, id, reason, patch); }

/* Which section a reported question came from. `where` is 'results' or
   'review-missed' / 'review-saved' / 'review-flagged'. */
function reportSection(scope, mode, where) {
  if (where) return where;
  const sc = scope || {};
  if (sc.weeklyId) return 'weekly';
  if (sc.loksewaMock) return 'daily-paper';
  if (sc.hourlySprint) return 'hourly';
  return mode === 'exam' ? 'exam' : 'practice';
}

/* ═══════════════════════════════════════════════════════════════════════
   qReportHtml — the "Report an issue" button. Returns '' for questions
   that cannot be reported (local files, withdrawn questions), so callers
   can interpolate it unconditionally:

     qReportHtml(q, `USER_REPORT.exam(${qi})`)
     qReportHtml(q, `USER_REPORT.reportList(${kindJson},${uidJson})`)
     qReportHtml(q, `USER_REPORT.result(${i})`, `Report an issue with Q${i+1}`)

   Uses `esc` (from js/core/text.js) to HTML-escape the code that ends up
   inside the data-on-click attribute — an onClickCode containing a
   double-quote (e.g. `USER_REPORT.reportList("bk","fid_3")`) would break
   the attribute otherwise.
   ═══════════════════════════════════════════════════════════════════════ */
function qReportHtml(q, onClickCode, ariaLabel) {
  if (!q || !q.uid) return '';
  if (q.fileId === 'local' || String(q.uid).indexOf('local_') === 0) return '';
  if (q._withdrawn) return '';
  const label = String(ariaLabel || 'Report an issue with this question');
  const code  = String(onClickCode || '');
  return '<button type="button" class="ib" ' +
           'data-on-click="' + esc(code) + '" ' +
           'title="Report an issue with this question" ' +
           'aria-label="' + esc(label) + '">' +
           '<i class="ph ph-warning-circle"></i>' +
         '</button>';
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN FIX DRAFTS (pure, unit-tested)
   The admin writes each correction as a draft first (instant, no network),
   then pushes every draft in one go. Drafts live in localStorage so a
   closed tab loses nothing.

   A draft is keyed by the question's stable id (qid) when the report has
   one, otherwise by its positional uid. One question has one draft: saving
   again replaces it.

   adminDraftEvent() builds the exact shape the Drive-to-Neon pipeline
   (sync/apply_corrections.py) reads: uid, qid, fileId, correctedAt (ISO,
   fixed when the draft is saved so a retry is idempotent), before{question,
   options} and after{question, options, correctIndex, explanation}.
   ═══════════════════════════════════════════════════════════════════════ */
const ADMIN_DRAFT_KEY = 'abhyas_admin_qdrafts_v1';
const ADMIN_DRAFT_MAX = 500;

/* Question text without its printed number, case and spacing. */
function reportQuestionBody(text) {
  return String(text || '').replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* Does what the file holds at the reported position still look like the
   question the student reported? `snapshot` is the first 1000 characters
   the student's app captured. When nothing was captured we cannot tell, so
   we do not warn. */
function questionMatchesSnapshot(current, snapshot) {
  const want = reportQuestionBody(snapshot);
  if (!want) return true;
  const have = reportQuestionBody(current);
  if (!have) return false;
  const n = Math.min(have.length, want.length, 200);
  return have.slice(0, n) === want.slice(0, n);
}

function adminDraftKey(d) {
  if (!d) return '';
  /* non-public id, then public number, then position (see QKEY) */
  const p = (typeof QKEY !== 'undefined') ? QKEY.primary(d) : ((d.qid !== undefined && d.qid !== null && d.qid !== '') ? String(d.qid) : '');
  if (p) return 'q' + p;
  return d.uid ? 'u' + d.uid : '';
}

function adminDraftsUpsert(list, draft, now) {
  const key = adminDraftKey(draft);
  if (!key) return Array.isArray(list) ? list.slice() : [];
  const t = Number(now) || Date.now();
  const out = (Array.isArray(list) ? list : []).filter(x => x && adminDraftKey(x) !== key);
  out.push(Object.assign({}, draft, {
    key: key, state: 'pending', error: '',
    savedAt: t, correctedAt: new Date(t).toISOString()
  }));
  return out.slice(-ADMIN_DRAFT_MAX);
}

function adminDraftsRemove(list, key) {
  return (Array.isArray(list) ? list : []).filter(x => x && x.key !== key);
}

function adminDraftEvent(d) {
  const b = d.before || {};
  const a = d.after || {};
  return {
    key: d.key,
    uid: d.uid,
    qid: (d.qid === undefined || d.qid === '') ? null : d.qid,
    nid: (d.nid === undefined || d.nid === '') ? null : d.nid,
    pqn: d.pqn || null,
    fileId: d.fileId,
    index: d.index,
    reportId: d.reportId,
    reportReason: d.reportReason || null,
    correctedAt: d.correctedAt,
    expectedQ: b.question || '',
    before: { question: b.question || '', options: Array.isArray(b.options) ? b.options : [] },
    after: {
      question: a.question || '',
      options: Array.isArray(a.options) ? a.options : [],
      correctIndex: Number.isInteger(a.correctIndex) ? a.correctIndex : null,
      explanation: a.explanation || ''
    },
    adminNote: d.adminNote || null,
    closeReport: d.closeReport !== false
  };
}