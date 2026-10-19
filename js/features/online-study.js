// js/features/online-study.js — Chapters screen: the cascade picker AND
// the per-scope progress panel below it.
// MUST load AFTER: core/state.js, core/dom.js, core/text.js (esc, escAttrJs),
// core/storage.js (QDB), core/scope.js (scopeLeaves, scopedStats),
// data/chapters-data.js (ChapterData), features/count.js (CNT),
// features/quiz-engine.js (QUIZ).

function prettySub(name){
  return String(name)
    .replace(/^UNCLASSIFIED\s+Unclassified questions/i, 'Mixed questions')
    .replace(/\s*&\s*/g, ' & ');
}

const ON = {
  onLv(){
    if (navigator.vibrate) navigator.vibrate(5);
    const lv = document.getElementById('on-lv').value;
    const cs = document.getElementById('on-ch');
    cs.innerHTML = '<option value="">📘 Select Chapter…</option>'; cs.disabled = !lv;
    const bs = document.getElementById('on-bk'); bs.innerHTML = '<option value="">📚 Select Book…</option>'; bs.disabled = true;
    const ts = document.getElementById('on-to'); ts.innerHTML = '<option value="">📑 Select Subtopic…</option>'; ts.disabled = true;
    
    if (lv){
      requestAnimationFrame(() => {
        Object.entries(ChapterData.chapters(lv)).forEach(([k,n])=>{
          const fc = ChapterData.fileCount(lv,k);
          const o = document.createElement('option'); o.value = k; o.textContent = `Ch${k}: ${n}${fc?'':' (coming soon)'}`; cs.appendChild(o);
        });
      });
    }
    ONPROG.render();
  },
  onCh(){
    if (navigator.vibrate) navigator.vibrate(5);
    const lv = document.getElementById('on-lv').value, ch = document.getElementById('on-ch').value;
    const bs = document.getElementById('on-bk');
    bs.innerHTML = '<option value="">📚 Select Book…</option>'; bs.disabled = true;
    const ts = document.getElementById('on-to'); ts.innerHTML = '<option value="">📑 Select Subtopic…</option>'; ts.disabled = true;
    
    if (lv && ch){
      const books = ChapterData.books(lv,ch);
      if (!Object.keys(books).length){
        bs.innerHTML = '<option value="">No books yet for this chapter</option>';
        toast('ℹ️ This chapter has no question files yet');
      } else {
        requestAnimationFrame(() => {
          Object.keys(books).forEach(book=>{
            const fc = ChapterData.fileCount(lv,ch,book);
            const o = document.createElement('option'); o.value = book; o.textContent = `${book}${fc?'':' (coming soon)'}`; bs.appendChild(o);
          });
          bs.disabled = false;
          const _bk = Object.keys(books);
          bs.style.display = _bk.length === 1 ? 'none' : '';
          if (_bk.length === 1){ bs.value = _bk[0]; ON.onBook(); return; }
        });
      }
    }
    ONPROG.render();
  },
  async onBook(){
    if (navigator.vibrate) navigator.vibrate(5);
    const lv = document.getElementById('on-lv').value, ch = document.getElementById('on-ch').value, book = document.getElementById('on-bk').value;
    const ts = document.getElementById('on-to');
    ts.innerHTML = '<option value="">📑 Select Subtopic…</option>'; ts.disabled = true;
    
    if (lv && ch && book){
      const files = ChapterData.files(lv,ch,book);
      if (!Object.keys(files).length){
        ts.innerHTML = '<option value="">No files yet for this book</option>';
        toast('ℹ️ This book has no question files yet');
      } else {
        const isOfflineMode = !S.online || S.forcedOffline;
        const cachedKeys = new Set(await QDB.keys());
        let anyEnabled = false;
        
        requestAnimationFrame(() => {
          Object.entries(files).forEach(([n,id])=>{
            if (!id) return;
            const cacheKey = `${lv}_${ch}_${book}_${n}`;
            const isCached = cachedKeys.has(cacheKey);
            const o = document.createElement('option');
            o.value = id;
            o.dataset.key = cacheKey;
            o.dataset.sub = n;
            if (isOfflineMode && !isCached){
              o.textContent = `🔒 ${prettySub(n)} (not cached)`;
              o.disabled = true;
              o.style.color = 'var(--t3)';
            } else {
              o.textContent = isCached ? `📦 ${prettySub(n)}` : prettySub(n);
              anyEnabled = true;
            }
            ts.appendChild(o);
          });
          ts.disabled = false;
          if (isOfflineMode && !anyEnabled){
            ts.innerHTML = '<option value="">No cached files for this book</option>';
            toast('📡 You\'re offline — no cached files in this book. Cache them first while online.');
          }
        });
      }
    }
    ONPROG.render();
  },
  start(mode){
    if (navigator.vibrate) navigator.vibrate(10);
    const ts = document.getElementById('on-to');
    const fid = ts.value, opt = ts.options[ts.selectedIndex], key = opt?.dataset?.key;
    const ch = document.getElementById('on-ch').value, lv = document.getElementById('on-lv').value, book = document.getElementById('on-bk').value;
    if (!fid || !key){ toast('Select a subtopic'); return; }
    const sub = opt?.dataset?.sub || '';
    const name = `${ChapterData.chapterName(lv,ch)} — ${book}`;
    QUIZ.load(fid, key, mode, name, {lv, ch, book, sub, fid});
  }
};

const ONPROG = {
  metric: 'practised',
  filewiseOpen: false,
  _seq: 0,
  _lastLeaves: [],

  setMetric(m){
    ONPROG.metric = m;
    document.querySelectorAll('#on-prog-tabs .mtab').forEach(b=>b.classList.toggle('active', b.dataset.m === m));
    ONPROG.render();
  },

  toggleFilewise(){
    ONPROG.filewiseOpen = !ONPROG.filewiseOpen;
    ONPROG.render();
  },

  async resetFile(fid){
    if (!fid) return;
    const ref = ONPROG._lastLeaves.find(l=>l.fid===fid);
    const label = ref ? `${ref.book} — ${ref.subtopic}` : 'this file';
    const ok = await ASK.confirm({
      title: 'Reset practice progress?',
      body:  'Reset progress for <b>' + esc(label) + '</b>? This clears only the Practised / Attempted / Correct / Wrong counts for this one file. Bookmarks, flags and your wrong-answer bank are not touched — the question file itself is never modified.',
      ok:    'Reset',
      danger: true
    });
    if (!ok) return;
    
    let removedTotal = 0, removedCorrectTotal = 0;
    S.prog.sessions.forEach(s=>{
      if (!s.qres || !s.qres.length) return;
      const kept = [];
      let removedHere = 0, removedCorrectHere = 0;
      s.qres.forEach(q=>{
        if (q && q.uid && fidFromUid(q.uid) === fid){
          removedHere++;
          if (q.ok) removedCorrectHere++;
        } else kept.push(q);
      });
      if (removedHere){
        s.qres = kept;
        s.correct = Math.max(0,(s.correct||0) - removedCorrectHere);
        s.wrong   = Math.max(0,(s.wrong||0)   - (removedHere - removedCorrectHere));
        s.total   = Math.max(0,(s.total||0)   - removedHere);
        removedTotal += removedHere;
        removedCorrectTotal += removedCorrectHere;
      }
    });
    S.prog.sessions = S.prog.sessions.filter(s => (s.qres && s.qres.length) || (s.total||0) > 0);
    S.prog.total   = Math.max(0,(S.prog.total||0)   - removedTotal);
    S.prog.correct = Math.max(0,(S.prog.correct||0) - removedCorrectTotal);
    _save(LS.PROG, S.prog);
    if (S.cov && typeof S.cov === 'object'){ delete S.cov[fid]; _save(LS.COV, S.cov); }
    toast(removedTotal ? `✅ Reset "${label}" — ${removedTotal} record(s) cleared` : `Nothing to reset for "${label}"`);
    ONPROG.render();
    if (typeof HOME !== 'undefined' && HOME.render) HOME.render();
  },

  _scope(){
    const lv   = document.getElementById('on-lv')?.value   || '';
    const ch   = document.getElementById('on-ch')?.value   || '';
    const book = document.getElementById('on-bk')?.value   || '';
    const ts   = document.getElementById('on-to');
    const opt  = ts && ts.selectedIndex >= 0 ? ts.options[ts.selectedIndex] : null;
    const valid = opt && opt.dataset && opt.dataset.sub && !opt.disabled;
    return { lv, ch, book, sub: valid ? opt.dataset.sub : '', fid: valid ? opt.value : '' };
  },

  async render(force = false){
    ONPROG._renderOldPreview();

    const el      = document.getElementById('on-progress-card');
    const titleEl = document.getElementById('on-prog-title');
    const bodyEl  = document.getElementById('on-prog-body');
    if (!el || !titleEl || !bodyEl) return;

    const { lv, ch, book, sub, fid } = ONPROG._scope();
    const mySeq = ++ONPROG._seq;

    if (!lv){
      titleEl.textContent = '📊 Overall Progress';
      const total = S.prog.total, correct = S.prog.correct, wrong = total - correct;
      const pct = total ? Math.round((correct/total)*100) : 0;
      bodyEl.innerHTML = `
        <div class="prog-grid">
          <div class="sc"><div class="sv tcy">${total}</div><div class="stat-lbl">Attempted</div></div>
          <div class="sc"><div class="sv tc2">${correct}</div><div class="stat-lbl">Correct</div></div>
          <div class="sc"><div class="sv tb2">${wrong}</div><div class="stat-lbl">Wrong</div></div>
        </div>
        <div class="pb-w" style="margin-top:.6rem"><div class="pb-l"><span>Accuracy</span><span>${pct}%</span></div><div class="pb"><div class="pb-f" style="width:${pct}%"></div></div></div>
        <div style="font-size:.68rem;color:var(--t3);margin-top:.5rem">Pick a Level, Chapter, Book or Subtopic above to see coverage for that scope.</div>`;
      return;
    }

    const lvLabel = document.getElementById('on-lv').selectedOptions[0]?.textContent.replace(/^📖\s*/,'') || lv;
    const label = fid  ? `${ChapterData.chapterName(lv,ch)} — ${book} — ${sub}`
                : book ? `${ChapterData.chapterName(lv,ch)} — ${book}`
                : ch   ? ChapterData.chapterName(lv,ch)
                : lvLabel;
    titleEl.textContent = `📊 ${label}`;

    const leaves = scopeLeaves(lv,ch,book,sub);
    ONPROG._lastLeaves = leaves;
    const scoped = scopedStats(leaves);
    const known = CNT.knownTotal(leaves);

    const paint = (info)=>{
      if (mySeq !== ONPROG._seq) return;
      const total = info.total;
      const missedNow = leaves.reduce((n, ref) => n + fileMissedNowCount(ref.fid), 0);
      const vals = { practised: scoped.practised, attempted: scoped.attempted, correct: scoped.correct, wrong: scoped.wrong, missedNow };
      const metricVal = vals[ONPROG.metric];
      const metricLabel = { practised:'Practised', attempted:'Attempted', correct:'Correct', wrong:'Ever missed', missedNow:'Missed right now' }[ONPROG.metric];
      const barColor = (ONPROG.metric === 'wrong' || ONPROG.metric === 'missedNow') ? 'var(--ros)'
                     : ONPROG.metric === 'correct' ? 'var(--grn)'
                     : 'var(--amb)';
      const pct = total ? Math.min(100, Math.round((metricVal / total) * 100)) : 0;
      const unknownNote = info.unknown
        ? `<div style="font-size:.66rem;color:var(--t3);margin-top:.45rem"><i class="ph ph-warning"></i> ${info.unknown} of ${info.files} file${info.files>1?'s':''} not counted yet${CNT._lastError ? ' — ' + esc(CNT._lastError) : ' (offline, or not downloaded)'}</div>`
        : '';
      const confirmBtn = info.needsConfirm
        ? `<button class="btn btn-sm btn-a" style="margin-top:.5rem" data-on-click="ONPROG.render(true)"><i class="ph ph-list-numbers"></i> Count questions (${info.files} files)</button>`
        : '';

      let filewiseHtml = '';
      if (leaves.length > 1 && leaves.length <= 100){
        const showBook = !book;
        const rows = leaves.map(ref=>{
          const rec = scoped.fileMap.get(ref.fid) || { practised: new Set(), attempted: 0, correct: 0, wrong: 0 };
          const fVals = { practised: rec.practised.size, attempted: rec.attempted, correct: rec.correct, wrong: rec.wrong, missedNow: fileMissedNowCount(ref.fid) };
          const fVal = fVals[ONPROG.metric];
          const fTotal = S.fcount[ref.fid];
          const fPct = fTotal ? Math.min(100, Math.round((fVal/fTotal)*100)) : 0;
          const rowLabel = showBook ? `${ref.book} — ${ref.subtopic}` : ref.subtopic;
          return `<div class="pb-w fw-row">
            <div class="pb-l">
              <span>${esc(rowLabel)}</span>
              <span class="fw-row-right">${fVal} / ${fTotal != null ? fTotal : '?'}${fTotal != null ? ` (${fPct}%)` : ''}
                <button class="fw-reset" title="Reset progress for this file" aria-label="Reset progress for this file" data-fid="${esc(ref.fid)}" data-on-click="event.stopPropagation();ONPROG.resetFile(this.dataset.fid)"><i class="ph ph-trash"></i></button>
              </span>
            </div>
            <div class="pb"><div class="pb-f" style="width:${fTotal != null ? fPct : 0}%;background:${barColor}"></div></div>
          </div>`;
        }).join('');
        filewiseHtml = `
          <div class="fw-toggle" data-on-click="ONPROG.toggleFilewise()">
            <span>${ONPROG.filewiseOpen?'▾':'▸'}</span> <i class="ph ph-folder"></i> Filewise breakdown (${leaves.length} files)
          </div>
          <div id="on-fw-list" style="display:${ONPROG.filewiseOpen?'block':'none'}">${rows}</div>`;
      }

      const scopeResetBtn = fid
        ? ` <button class="fw-reset" title="Reset progress for this file" aria-label="Reset progress for this file" data-fid="${esc(fid)}" data-on-click="ONPROG.resetFile(this.dataset.fid)"><i class="ph ph-trash"></i></button>`
        : '';

      requestAnimationFrame(() => {
        bodyEl.innerHTML = `
          <div class="prog-grid">
            <div class="sc"><div class="sv tcy">${scoped.practised}</div><div class="stat-lbl">Practised</div></div>
            <div class="sc"><div class="sv ta2">${scoped.attempted}</div><div class="stat-lbl">Attempted</div></div>
            <div class="sc"><div class="sv tc2">${scoped.correct}</div><div class="stat-lbl">Correct</div></div>
            <div class="sc"><div class="sv tb2">${scoped.wrong}</div><div class="stat-lbl">Wrong</div></div>
          </div>
          ${info.needsConfirm ? confirmBtn : `
            <div class="pb-w" style="margin-top:.65rem">
              <div class="pb-l">
                <span>${metricLabel} coverage (compiled)</span>
                <span>${metricVal} / ${total || '?'} (${pct}%)${scopeResetBtn}</span>
              </div>
              <div class="pb"><div class="pb-f" style="width:${pct}%;background:${barColor}"></div></div>
            </div>`}
          ${unknownNote}
          ${info.needsConfirm ? '' : filewiseHtml}
        `;
      });
    };

    if (known.unknown === 0){ paint(known); return; }
    bodyEl.innerHTML = `<div class="empty" style="padding:.8rem 0"><div class="empty-i">⏳</div><p>Counting questions…</p></div>`;
    const info = await CNT.totalFor(lv, ch, book, sub, {
      force,
      onTick:(done, files)=>{
        if (mySeq !== ONPROG._seq) return;
        const p = bodyEl.querySelector('p');
        if (p && files > 1) p.textContent = `Counting questions… ${done}/${files} files`;
      }
    });
    paint(info);
  },

  _renderOldPreview(){
    const el = document.getElementById('on-progress-preview');
    if (!el) return;
    const lv = document.getElementById('on-lv')?.value || '';
    const ch = document.getElementById('on-ch')?.value || '';
    const book = document.getElementById('on-bk')?.value || '';
    if (!lv || !ch){ el.innerHTML = ''; return; }
    const chapterLabel = ChapterData.chapterName(lv,ch) + (book ? ' — ' + book : '');
    const match = CHAPSTATS.entries().find(c=>c.chapter === chapterLabel);
    if (!match){
      el.innerHTML = `<p style="font-size:.7rem;color:var(--t3);margin-top:.3rem">No attempts yet for this chapter.</p>`;
      return;
    }
    el.innerHTML = `<p style="font-size:.7rem;color:var(--t3);margin-top:.3rem">📊 Your accuracy here so far: <strong style="color:${match.accuracy>=75?'var(--ok)':match.accuracy>=50?'var(--amb)':'var(--bad)'}">${match.accuracy}%</strong> (${match.correct}/${match.attempted})</p>`;
  }
};

window.ON = ON;
window.ONPROG = ONPROG;
window.prettySub = prettySub;