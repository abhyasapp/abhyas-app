// js/admin/features/content-health.js — one queue for question quality.
//
// Reports and most-missed questions already live on two separate screens.
// This view joins them by uid so a question that is both reported and heavily
// missed rises to the top, with the evidence and the fix action in one place.
//
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, BUSY, TOAST),
// features/dashboard.js (CHAPTERS, MISSED), report/adminreport.js (QREPORTS).
// All are read at call time.

window.HEALTH = {
  _loading: false,
  _reports: [],
  _missed: [],
  _rows: [],
  _qmap: {},
  _term: '',
  _filter: 'all',

  setFilter(v) {
    this._filter = ['all', 'combined', 'reported', 'missed'].includes(v) ? v : 'all';
    this.paint();
  },

  search(v) {
    this._term = String(v || '').toLowerCase().trim();
    this.paint();
  },

  clearFilters() {
    this._term = '';
    this._filter = 'all';
    const s = $('ch-search'); if (s) s.value = '';
    const f = $('ch-filter'); if (f) f.value = 'all';
    this.paint();
  },

  _chapter(fileId) {
    try {
      return (typeof CHAPTERS !== 'undefined' && CHAPTERS.labelFor) ? CHAPTERS.labelFor(fileId) : '';
    } catch (e) { return ''; }
  },

  _reason(r) {
    const labels = {
      wrong_answer: 'Wrong answer', unclear: 'Unclear wording', typo: 'Typo',
      incomplete: 'Incomplete', image_problem: 'Image problem', other: 'Other'
    };
    return labels[r] || r || 'Reported';
  },

  _buildRows() {
    const map = new Map();
    const rowFor = (uid, qid) => {
      const key = uid ? 'u:' + uid : 'q:' + qid;
      let row = map.get(key);
      if (!row) {
        row = { key: key, uid: uid || '', qid: qid || null, fileId: '', questionSnapshot: '',
          reportId: '', open: 0, total: 0, reasons: {}, latest: 0,
          wrongRate: null, uniqueStudents: 0, totalAttempts: 0, hasMissed: false };
        map.set(key, row);
      }
      return row;
    };

    (this._reports || []).forEach(r => {
      if (!r) return;
      const row = rowFor(r.uid, r.qid);
      row.fileId = row.fileId || r.fileId || '';
      row.questionSnapshot = row.questionSnapshot || r.questionSnapshot || '';
      row.total++;
      if (r.status === 'open') {
        row.open++;
        if (!row.reportId) row.reportId = r.id;
      } else if (!row.reportId) {
        row.reportId = r.id;
      }
      const reason = r.reason || 'other';
      row.reasons[reason] = (row.reasons[reason] || 0) + 1;
      row.latest = Math.max(row.latest, Number(r.reportedAt) || 0);
    });

    (this._missed || []).forEach(m => {
      if (!m) return;
      const row = rowFor(m.uid, null);
      row.hasMissed = true;
      row.fileId = row.fileId || m.fileId || '';
      if (row.index == null && m.index != null) row.index = Number(m.index);
      row.wrongRate = m.wrongRate != null ? Number(m.wrongRate) : (m.accuracy != null ? 100 - Number(m.accuracy) : null);
      row.uniqueStudents = Math.max(row.uniqueStudents, Number(m.uniqueStudents) || 0);
      row.totalAttempts = Math.max(row.totalAttempts, Number(m.total) || 0);
    });

    this._rows = [...map.values()].map(row => {
      row.chapter = this._chapter(row.fileId);
      row.kind = row.open && row.hasMissed ? 'combined' : row.open ? 'reported' : 'missed';
      row.score = row.open * 12 + (row.wrongRate || 0) + Math.min(20, row.uniqueStudents) + (row.kind === 'combined' ? 10 : 0);
      row.text = this._questionText(row) || row.questionSnapshot;
      return row;
    }).sort((a, b) => b.score - a.score || b.latest - a.latest);
  },

  _questionText(row) {
    if (!row.fileId || row.index == null) return '';
    const list = this._qmap[row.fileId];
    const q = list && list[row.index];
    return q ? (q.q || q.question || q.stem || q.text || '') : '';
  },

  _asList(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.questions)) return raw.questions;
    if (raw && Array.isArray(raw.data)) return raw.data;
    if (raw && Array.isArray(raw.items)) return raw.items;
    return null;
  },

  async _hydrate() {
    const want = [...new Set(this._missed
      .filter(m => m && m.fileId && !this._qmap[m.fileId])
      .map(m => m.fileId))].slice(0, 24);
    if (!want.length) return;
    const readEntry = v => {
      if (v == null) return null;
      if (typeof v === 'string') { try { return this._asList(JSON.parse(v)); } catch (e) { return null; } }
      if (v && typeof v.content === 'string') { try { return this._asList(JSON.parse(v.content)); } catch (e) { return null; } }
      return this._asList(v);
    };
    const BATCH = 8;
    for (let i = 0; i < want.length; i += BATCH) {
      const part = want.slice(i, i + BATCH);
      if (part.length) {
        try {
          const b = await ADMIN.post('getFiles', { fileIds: part.join(',') });
          const files = b && b.success ? (b.files || b.data || b.results) : null;
          if (files && typeof files === 'object') {
            part.forEach(fid => { const list = readEntry(files[fid]); if (list) this._qmap[fid] = list; });
          }
        } catch (e) { /* per-file fallback below */ }
      }
      for (const fid of part) {
        if (this._qmap[fid]) continue;
        try {
          const f = await ADMIN.post('getFile', { fileId: fid });
          const list = readEntry(f && (f.result !== undefined ? f.result : f));
          this._qmap[fid] = list || [];
        } catch (e) { this._qmap[fid] = []; }
      }
    }
  },

  async load(force) {
    if (this._loading) return;
    const box = $('ch-list');
    if (!box) return;
    if (!force && this._rows.length) { this.paint(); return; }
    this._loading = true;
    box.innerHTML = '<div class="sk-block"><div class="skeleton sk-80"></div><div class="skeleton sk-60"></div></div>' +
      '<div class="sk-block"><div class="skeleton sk-70"></div><div class="skeleton sk-40"></div></div>';
    let reports = null, missed = null, errors = [];
    try {
      const [rr, mr] = await Promise.all([
        ADMIN.post('adminListQuestionReports').catch(e => ({ success: false, error: e.message })),
        ADMIN.post('adminMostMissedQuestions', { minAttempts: 3, limit: 60, level: '', chapter: '' })
          .catch(e => ({ success: false, error: e.message }))
      ]);
      if (rr && rr.success) reports = rr.reports || rr.qreports || [];
      else errors.push((rr && rr.error) || 'Reports could not load.');
      if (mr && mr.success) missed = mr.results || [];
      else errors.push((mr && mr.error) || 'Most-missed questions could not load.');
      this._reports = reports || [];
      this._missed = missed || [];
      if (reports === null && missed === null) throw new Error(errors.join(' '));
      await this._hydrate();
      this._buildRows();
      this.paint();
      if (errors.length) TOAST.show('Some content health data did not load: ' + errors[0], 'warning', 6000);
    } catch (e) {
      box.innerHTML = '<div class="banner banner-danger"><i class="ph ph-warning-circle"></i><span>' +
        esc(e.message || 'Could not load content health.') +
        ' <button class="btn btn-sm btn-quiet" data-on-click="HEALTH.load(true)">Try again</button></span></div>';
    } finally {
      this._loading = false;
    }
  },

  _visible() {
    const t = this._term;
    return this._rows.filter(r => {
      if (this._filter === 'combined' && r.kind !== 'combined') return false;
      if (this._filter === 'reported' && !r.open) return false;
      if (this._filter === 'missed' && !r.hasMissed) return false;
      if (!t) return true;
      return [r.text, r.questionSnapshot, r.uid, r.qid, r.chapter]
        .join(' ').toLowerCase().indexOf(t) !== -1;
    });
  },

  _metrics(rows) {
    const box = $('ch-metrics');
    if (!box) return;
    const open = rows.reduce((n, r) => n + r.open, 0);
    const combined = rows.filter(r => r.kind === 'combined').length;
    const wrong = rows.filter(r => Number(r.wrongRate) >= 50).length;
    box.innerHTML =
      '<div class="metric"><div class="v">' + rows.length + '</div><div class="l">Questions in the queue</div></div>' +
      '<div class="metric"><div class="v">' + open + '</div><div class="l">Open reports</div></div>' +
      '<div class="metric"><div class="v">' + combined + '</div><div class="l">Reported and heavily missed</div></div>' +
      '<div class="metric"><div class="v">' + wrong + '</div><div class="l">Missed by half or more</div></div>';
  },

  _rowHtml(r, i) {
    const title = r.text || r.questionSnapshot || ('Question ' + (r.uid || r.qid || ''));
    const reasons = Object.keys(r.reasons).map(k => this._reason(k) + ' \u00d7' + r.reasons[k]).join(' \u00b7 ');
    const reportAction = r.reportId
      ? '<button class="btn btn-secondary btn-sm" data-on-click="HEALTH.fix(\'' + escAttrJs(r.reportId) + '\')"><i class="ph ph-pencil-simple"></i> Fix the question</button>'
      : '';
    return '<div class="miss">' +
      '<div class="miss-top">' +
        '<div class="miss-q"><div class="t-cap" style="margin-bottom:3px">#' + (i + 1) +
          (r.kind === 'combined' ? ' <span class="ctag tr">Reported + missed</span>' : r.open ? ' <span class="ctag ta">Reported</span>' : ' <span class="ctag">Heavily missed</span>') +
        '</div>' + esc(String(title).slice(0, 260)) + '</div>' +
        '<div class="miss-rate"><div class="v">' + (r.wrongRate == null ? '—' : r.wrongRate + '%') + '</div>' +
          '<div class="l">' + (r.totalAttempts ? r.totalAttempts + ' answers' : 'no practice data') + '</div></div>' +
      '</div>' +
      '<div class="miss-tags">' +
        (r.chapter ? '<span class="badge flat">' + esc(r.chapter) + '</span>' : '') +
        (r.qid ? '<span class="badge flat mono">qid ' + esc(String(r.qid)) + '</span>' : '') +
        (r.open ? '<span class="badge warn">' + r.open + ' open report' + (r.open === 1 ? '' : 's') + '</span>' : '') +
        (r.uniqueStudents ? '<span class="badge flat">' + r.uniqueStudents + ' student' + (r.uniqueStudents === 1 ? '' : 's') + '</span>' : '') +
      '</div>' +
      (reasons ? '<div class="t-cap" style="margin-top:var(--sp-2)">' + esc(reasons) + '</div>' : '') +
      '<div class="miss-meta">' +
        '<span>' + (r.total ? r.total + ' report' + (r.total === 1 ? '' : 's') : 'No reports') + '</span>' +
        (r.latest ? '<span>last ' + esc(relTime(r.latest)) + '</span>' : '') +
      '</div>' +
      '<div class="bg mt3">' + reportAction +
        (r.open ? '<button class="btn btn-quiet btn-sm" data-on-click="HEALTH.showReports()">Open reports</button>' : '') +
        (r.hasMissed ? '<button class="btn btn-quiet btn-sm" data-on-click="HEALTH.showMissed()">Most-missed list</button>' : '') +
      '</div>' +
    '</div>';
  },

  paint() {
    const rows = this._visible();
    this._metrics(rows);
    const box = $('ch-list');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="empty"><i class="ph ph-check-circle"></i><div class="t">Nothing in this queue</div>' +
        '<div class="d">No question matches the current filter. Try All, or reload the data.</div></div>';
      return;
    }
    box.innerHTML = rows.map((r, i) => this._rowHtml(r, i)).join('');
  },

  async fix(reportId) {
    if (typeof QREPORTS === 'undefined') return TOAST.show('The reports screen is not loaded.', 'error');
    try {
      if (!Array.isArray(QREPORTS.all) || !QREPORTS.all.some(r => r.id === reportId)) await QREPORTS.load(true);
      QREPORTS.editQ(reportId);
    } catch (e) { TOAST.show(e.message || 'Could not open that report.', 'error'); }
  },

  showReports() {
    UI.nav('qreports');
  },

  showMissed() {
    UI.nav('dashboard');
    setTimeout(() => {
      const el = $('missed-list');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  },

  exportCSV() {
    const rows = this._visible();
    if (!rows.length) return TOAST.show('Nothing to export', 'warning');
    ADMIN.downloadCSV(ADMIN.toCSV(
      ['Question', 'UID', 'QID', 'Chapter', 'Open reports', 'Total reports', 'Wrong rate %', 'Students', 'Answers'],
      rows.map(r => [
        r.text || r.questionSnapshot || '', r.uid || '', r.qid || '', r.chapter || '',
        r.open, r.total, r.wrongRate == null ? '' : r.wrongRate, r.uniqueStudents, r.totalAttempts
      ])
    ), 'content_health.csv');
  }
};