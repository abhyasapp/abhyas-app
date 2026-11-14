// js/features/reports-view.js — a read-only list of the questions this device
// reported, newest first. The student report sheet records the entry before it
// sends, so this works offline and after a restart.

(function () {
  'use strict';

  const REPORTS = {
    render() {
      const body = document.getElementById('reports-body');
      if (!body) return;
      const list = (typeof USER_REPORT !== 'undefined' && USER_REPORT.history)
        ? USER_REPORT.history() : [];

      if (!list.length) {
        body.innerHTML = '<div class="empty"><i class="ph ph-flag"></i>' +
          '<div class="t">No reports yet</div>' +
          '<div class="d">When you tap the flag on a question, it appears here with its send status.</div>' +
          '<div class="a"><button class="btn btn-quiet" data-on-click="UI.go(\'online\')">Browse chapters</button></div></div>';
        return;
      }

      body.innerHTML = list.map(r => {
        const sent = r.status === 'sent';
        const failed = r.status === 'failed';
        const tag = sent ? 'ctag tg' : failed ? 'ctag tr' : 'ctag ta';
        const label = sent ? 'Sent' : failed ? 'Not sent' : 'Waiting to send';
        const reason = (typeof REPORT_REASON_LABELS !== 'undefined' && REPORT_REASON_LABELS[r.reason]) || r.reason || 'Reported';
        const section = (typeof REPORT_SECTION_LABELS !== 'undefined' && REPORT_SECTION_LABELS[r.section]) || r.section || '';
        const when = (typeof relTime === 'function') ? relTime(r.reportedAt) : '';
        const exact = (typeof fullTime === 'function') ? fullTime(r.reportedAt) : '';
        return '<div class="sub-card">' +
          '<div class="sub-top">' +
            '<div class="flex g2 wrap center">' +
              '<span class="' + tag + '">' + esc(label) + '</span>' +
              '<span class="badge flat">' + esc(reason) + '</span>' +
            '</div>' +
            '<div class="t-cap"' + (exact ? ' title="' + esc(exact) + '"' : '') + '>' + esc(when) + '</div>' +
          '</div>' +
          '<div class="t-callout mt3" style="color:var(--ink);line-height:1.6">' +
            esc(r.question || 'The question text was not captured.') +
          '</div>' +
          (r.note ? '<div class="sub-feedback">' + esc(r.note) + '</div>' : '') +
          (failed && r.error ? '<div class="t-foot" style="color:var(--danger);margin-top:6px">' + esc(r.error) + '</div>' : '') +
          '<div class="t-cap mt2">' + esc(section) +
            (r.qid ? ' \u00b7 question ' + esc(String(r.qid)) : '') +
            ' \u00b7 kept on this device</div>' +
        '</div>';
      }).join('');
    }
  };

  window.REPORTS = REPORTS;
  if (typeof UI !== 'undefined' && UI.onEnter) {
    UI.onEnter('reports', () => { try { REPORTS.render(); } catch (e) { window.warnCaught && window.warnCaught('js/features/reports-view.js', e); } });
  }
})();