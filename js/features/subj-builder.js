// js/features/subj-builder.js — the custom-paper generator, rate-limited
// to one every six hours per user.

function _buildCustomExam(chapterIds, targetMarks, markFilter) {
  const cdMs = _customExamCooldownRemainingMs();
  if (cdMs > 0) {
    toast('⏳ Custom paper is on cooldown — available again in ' + _fmtCooldown(cdMs), 5000);
    return;
  }
  const all = _allQuestions();
  if (!all.length) { toast('Question bank not loaded yet'); return; }
  let pool = chapterIds && chapterIds.length
    ? all.filter(q => chapterIds.includes(q.chapterId))
    : all;
  if (markFilter === '5')  pool = pool.filter(q => q.marks === 5);
  if (markFilter === '10') pool = pool.filter(q => q.marks === 10);
  if (!pool.length) { toast('No questions match those filters'); return; }

  const shuffled = _shuffle(pool);
  const picked = [];
  let total = 0;
  for (const q of shuffled) {
    if (total >= targetMarks && picked.length >= 3) break;
    if (total + q.marks > targetMarks + 10) continue;
    picked.push(q);
    total += q.marks;
    if (total >= targetMarks) break;
  }
  if (!picked.length) { toast('Could not build a paper — try a lower total'); return; }

  /* EXAM is a global object from subj-exam.js. Assigning an object literal
   * to it is not permitted (const), so mutate in place. */
  EXAM.generatedAt = Date.now();
  EXAM.deadlineAt = EXAM.generatedAt + TIMERS.examSeconds * 1000;
  EXAM.uploadEndsAt = EXAM.generatedAt + (TIMERS.examSeconds + TIMERS.examUploadSeconds) * 1000;
  EXAM.sections = [{
    group: 'custom',
    name: 'Custom Paper — ' + picked.length + ' questions',
    targetMarks: total,
    questions: picked
  }];
  EXAM.submitted = false;
  EXAM.submittedAt = 0;
  EXAM.queued = false;

  /* _persistExam is in subj-exam.js. It is a global function, so it is
   * reachable here. */
  _persistExam();
  _markCustomExamUsed();
  _renderExam();
  toast('✅ Custom paper ready · ' + picked.length + ' Qs · ' + total + ' marks · next custom paper in 6h', 5000);
}

function _notifyBuilder() {
  try {
    if (window.SUBJ_BUILDER && typeof window.SUBJ_BUILDER._updateCooldownUI === 'function') {
      window.SUBJ_BUILDER._updateCooldownUI();
    }
  } catch (e) {}
}

function _markCustomExamUsed() {
  _setCustomExamLast(Date.now());
  setTimeout(() => {
    if (document.getElementById('view-subj-exam')?.classList.contains('on')) _renderExam();
    _notifyBuilder();
  }, 50);
}