// js/features/subj-list.js — the browse-questions view.
// MUST load AFTER: subj-bank.js (BANK, _allQuestions, _questionsByChapter),
// core/text.js (esc). subj-public.js supplies _emptyCard and _retryBtn at
// RUNTIME only — the order that file loads does not matter.

function _populateYearSelect(filter) {
  const sel = document.getElementById('subj-list-year');
  if (!sel) return;
  const years = Array.from(new Set(_allQuestions().map(q => _sourceYear(q.source)).filter(Boolean))).sort().reverse();
  const signature = years.join('|');
  if (sel.dataset.years !== signature) {
    const current = filter.year || sel.value || '';
    sel.innerHTML = '<option value="">All exam years</option>' +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
    sel.value = years.includes(current) ? current : '';
    sel.dataset.years = signature;
  }
  filter.year = sel.value;
}

function _renderList(){
  const body = document.getElementById('subj-list-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching the question bank.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-list-dashes','Nothing to browse yet',
      BANK.error || 'Once questions are added, this becomes a chapter-by-chapter index.',
      BANK.error ? _retryBtn : '');
    return;
  }

  const f = Object.assign({ query: '', chapter: '', year: '', status: '', marks: '' },
    (window.SUBJ && SUBJ._listFilter) || {});
  _populateYearSelect(f);
  const chapters = window.SUBJECTIVE_CHAPTERS || [];
  const tree = chapters
    .filter(ch => !f.chapter || ch.id === f.chapter)
    .map(ch => {
      let qs = _questionsByChapter(ch.id);
      if(f.query) qs = qs.filter(q => (q.q || '').toLowerCase().includes(f.query));
      if(f.year) qs = qs.filter(q => _sourceYear(q.source) === f.year);
      if(f.marks) qs = qs.filter(q => Number(q.marks) === Number(f.marks));
      if(f.status === 'unseen') qs = qs.filter(q => !_isSubjAttempted(q.id));
      if(f.status === 'attempted') qs = qs.filter(q => _isSubjAttempted(q.id));
      if(!qs.length) return '';

      const byTopic = {};
      qs.forEach(q => {
        const key = q.topic || 'General';
        (byTopic[key] = byTopic[key] || []).push(q);
      });
      const topics = Object.keys(byTopic).sort();

      const topicBlocks = topics.map(topic => {
        const tQs = byTopic[topic];
        return `<div style="margin:0 0 .55rem">` +
          `<div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:.35rem .3rem .2rem;border-bottom:1px solid var(--b1)">` +
            `${esc(topic)} <span style="font-weight:500;opacity:.6">(${tQs.length})</span>` +
          `</div>` +
          tQs.map((q, i) => `<div class="subj-q-row">` +
            `<span class="qn">${i+1}.</span>` +
            `<span class="qt">${esc(q.q)}${q.source ? `<span class="qsrc">${esc(q.source)}</span>` : ''}</span>` +
            `<span class="qm ${_markClass(q.marks)}">${q.marks}M</span>` +
          `</div>`).join('') +
        `</div>`;
      }).join('');

      const openClass = (f.query || f.chapter) ? ' open' : '';
      return `<div class="subj-group${openClass}">` +
        `<div class="subj-group-hd" data-on-click="this.parentElement.classList.toggle('open')">` +
          `<div><div>${ch.icon || ''} ${esc(ch.name)} <span style="color:var(--t3);font-weight:400">· Group ${esc(ch.group || '')}</span></div>` +
          `<div class="meta">${qs.length} question${qs.length !== 1 ? 's' : ''} · ${topics.length} section${topics.length !== 1 ? 's' : ''}</div></div>` +
          `<div style="display:flex;align-items:center;gap:.35rem">` +
            `<button type="button" class="btn btn-quiet btn-sm" title="Print all ${qs.length} written questions" aria-label="Print all ${qs.length} written questions" data-on-click="event.stopPropagation();PRINT_Q.subjSheet('${escAttrJs(ch.id)}')"><i class="ph ph-printer"></i></button>` +
            `<i class="ph ph-caret-right chev"></i>` +
          `</div>` +
        `</div>` +
        `<div class="subj-group-body">${topicBlocks}</div>` +
      `</div>`;
    }).filter(Boolean).join('');

  const active = !!(f.query || f.chapter || f.year || f.status || f.marks);
  const summary = active
    ? `<div class="t-cap" style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2);margin:0 0 var(--sp-2)">` +
        `<span>Filters are on — only matching questions are shown.</span>` +
        `<button class="btn btn-quiet btn-sm" data-on-click="SUBJ._clearListFilters()">Clear filters</button>` +
      `</div>`
    : '';
  body.innerHTML = summary + (tree || _emptyCard('ph-list-dashes','No matching questions',
    active ? 'Try clearing the filters or choosing a different chapter.' : 'Once questions are added, this becomes a chapter-by-chapter index.',
    active ? `<button class="btn btn-a" style="margin-top:.9rem" data-on-click="SUBJ._clearListFilters()"><i class="ph ph-x-circle"></i> Clear filters</button>` : ''));
}

window._renderList = _renderList;