// js/admin/features/subjective-coverage.js — server-bank coverage audit.
// Loads every chapter file an admin can open and reports empty chapters,
// syllabus topics with no questions, and the exam years actually present.
// MUST load AFTER: core.js (ADMIN, $, esc, TOAST, BUSY), subjective-import.js
// (SUBJADMIN._unwrap). SUBJECTIVE_CHAPTERS / SUBJECTIVE_FILE_REFS are read at
// call time.

const SUBJ_COVERAGE = {
  async run(){
    const box = $('subj-coverage');
    if (!box) return;
    const refs = (window.SUBJECTIVE_FILE_REFS || []).filter(r => r.fileId && !/^REPLACE_WITH/.test(r.fileId));
    if (!refs.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-files"></i><div class="t">No chapter files configured</div><div class="d">Add file IDs in subjective-data.js first.</div></div>';
      return;
    }
    box.innerHTML = '<div class="sk-block"><div class="skeleton sk-60"></div><div class="skeleton sk-80"></div></div>';
    BUSY.start();
    const rows = [];
    for (const ref of refs) {
      try {
        const res = await ADMIN.post('getFile', { fileId: ref.fileId });
        if (!res || !res.success) throw new Error((res && res.error) || 'Could not open the file.');
        let payload = SUBJADMIN._unwrap(res);
        if (typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (e) { payload = null; }
        }
        const sections = payload && Array.isArray(payload.sections)
          ? payload.sections
          : (Array.isArray(payload) ? [{ section: ref.name, questions: payload }] : []);
        const questions = [];
        sections.forEach(sec => {
          const fallbackTopic = String((sec && sec.section) || ref.name || 'General').trim();
          (Array.isArray(sec && sec.questions) ? sec.questions : []).forEach(q => {
            if (!q || typeof q !== 'object') return;
            const text = String(q.q || q.question || '').trim();
            if (!text) return;
            questions.push({
              topic: String(q.topic || q.chapter || fallbackTopic).trim(),
              source: String(q.source || '').trim()
            });
          });
        });

        const ch = (window.SUBJECTIVE_CHAPTERS || []).find(c => c.id === ref.chapterId);
        const expected = (ch && Array.isArray(ch.topics)) ? ch.topics : [];
        const present = new Set(questions.map(q => q.topic.toLowerCase()));
        const missing = expected.filter(t => !present.has(String(t).toLowerCase()));
        const years = Array.from(new Set(questions.map(q => {
          const m = q.source.match(/(?:^|\D)(20\d{2})(?:\D|$)/);
          return m ? m[1] : '';
        }).filter(Boolean))).sort().reverse();
        rows.push({ ref, total: questions.length, sections: sections.length, missing, years, error: '' });
      } catch (e) {
        rows.push({ ref, total: 0, sections: 0, missing: [], years: [], error: e.message || 'Could not load.' });
      }
    }
    BUSY.stop();

    const empty = rows.filter(r => !r.error && !r.total).length;
    const gaps = rows.reduce((n, r) => n + r.missing.length, 0);
    const errors = rows.filter(r => r.error).length;
    const summary = errors
      ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' + errors + ' chapter file' + (errors === 1 ? '' : 's') + ' could not be read. Coverage for those is unknown, not zero.</span></div>'
      : empty
        ? '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' + empty + ' chapter' + (empty === 1 ? ' has' : 's have') + ' no questions on the server yet.</span></div>'
        : '<div class="banner banner-accent"><i class="ph ph-check-circle"></i><span>Every configured chapter has questions on the server.</span></div>';

    box.innerHTML = summary + rows.map(r => {
      const name = esc(r.ref.name || r.ref.chapterId);
      if (r.error) {
        return '<div class="maint"><div class="info"><div class="t">' + name + '</div>' +
          '<div class="d" style="color:var(--danger)"><i class="ph ph-x-circle"></i> ' + esc(r.error) + '</div></div></div>';
      }
      const topicLine = r.missing.length
        ? '<div class="d" style="color:var(--warning)"><i class="ph ph-warning-circle"></i> No questions in: ' + esc(r.missing.join(', ')) + '</div>'
        : (r.ref.chapterId === 'publicHealth'
            ? '<div class="d" style="color:var(--ink-3)">All three syllabus topics have questions. The bundled seed is separate until it is imported.</div>'
            : '<div class="d" style="color:var(--success)"><i class="ph ph-check-circle"></i> Every configured topic has at least one question.</div>');
      const yearLine = r.years.length
        ? '<div class="d">Exam years: ' + esc(r.years.join(', ')) + '</div>'
        : '<div class="d">No exam-source years stored yet.</div>';
      return '<div class="maint"><div class="info"><div class="t">' + name + ' · ' + r.total + ' question' + (r.total === 1 ? '' : 's') + '</div>' +
        '<div class="d">' + r.sections + ' section' + (r.sections === 1 ? '' : 's') + ' in the file</div>' + topicLine + yearLine + '</div></div>';
    }).join('');

    if (gaps && !errors) {
      box.insertAdjacentHTML('beforeend', '<p class="t-cap" style="margin-top:var(--sp-2)">' + gaps + ' syllabus topic' + (gaps === 1 ? ' is' : 's are') + ' still empty.</p>');
    }
  }
};

window.SUBJ_COVERAGE = SUBJ_COVERAGE;