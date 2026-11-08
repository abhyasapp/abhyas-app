// js/features/exam-mode.js — the last-three-days home card. It does not hide
// anything; it just narrows the advice to reviews, a revision sheet and one
// final timed paper once the exam date is close.
// MUST load AFTER: core/text.js (esc) only. REV / SYLLABUS_MOCK at call time.

const EXAM_MODE = {
  KEY: 'abhyas_exam_date',

  _date(){
    let iso;
    try { iso = localStorage.getItem(this.KEY) || ''; } catch (e) { return null; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const parts = iso.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d;
  },

  daysLeft(){
    const exam = this._date();
    if(!exam) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((exam.getTime() - today.getTime()) / 86400000);
  },

  active(){
    const d = this.daysLeft();
    return d !== null && d >= 0 && d <= 3;
  },

  render(){
    const box = document.getElementById('exam-mode-slot');
    if(!box) return;
    const d = this.daysLeft();
    if(d === null || d < 0 || d > 3){ box.innerHTML = ''; return; }
    let due = 0;
    try { if(typeof REV !== 'undefined' && REV.dueCount) due = REV.dueCount(); } catch (e) { window.warnCaught && window.warnCaught('js/features/exam-mode.js', e); }
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days';
    box.innerHTML =
      '<section class="card" style="border-color:var(--warning-line);background:var(--warning-soft)">' +
        '<div class="card-hd"><h3><i class="ph ph-hourglass-high"></i> Exam ' + when + '</h3><span class="ctag ta">Final stretch</span></div>' +
        '<p class="t-foot" style="line-height:1.55;margin-bottom:var(--sp-2)">No new chapters now. Clear due reviews, read one revision sheet, then finish with a timed paper so nothing feels unfamiliar.</p>' +
        '<div class="bg">' +
          (due ? '<button class="btn btn-solid" data-on-click="REV.start(\'wr\',\'flashcard\',true)"><i class="ph ph-arrow-counter-clockwise"></i> Review ' + due + ' due</button>' : '') +
          '<button class="btn btn-quiet" data-on-click="SYLLABUS_MOCK.start()"><i class="ph ph-note-pencil"></i> Final mock</button>' +
          '<button class="btn btn-quiet" data-on-click="UI.go(\'sprint\')"><i class="ph ph-calendar-check"></i> Plan</button>' +
        '</div>' +
      '</section>';
  }
};

window.EXAM_MODE = EXAM_MODE;
