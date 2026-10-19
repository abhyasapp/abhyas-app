// js/features/progress.js — running totals + weighted prediction + progress view.
// MUST load AFTER: core/state.js (S), core/storage.js (_save), core/format.js
// (today), core/text.js (esc), data/chapters-data.js (ChapterData),
// features/home.js (HOME), features/streak.js (STREAK),
// features/chapter-stats.js (CHAPSTATS).

const PROG = {
  track(correct){
    { const _d = today(); if(!S._tc || S._tc.d !== _d) S._tc = { d: _d, n: 0 }; S._tc.n++; if(S._tc.n === 5) STREAK.markToday(); }
    S.prog.total = (S.prog.total || 0) + 1;
    if(correct) S.prog.correct = (S.prog.correct || 0) + 1;
    PROG._saveSoon();
    HOME.updateStats();
    HOME.updateBadges();
  },

  _st: null,
  _saveSoon(){
    if(PROG._st) clearTimeout(PROG._st);
    PROG._st = setTimeout(() => { PROG._st = null; _save(LS.PROG, S.prog); }, 150);
  },
  flushNow(){
    if(PROG._st){ clearTimeout(PROG._st); PROG._st = null; _save(LS.PROG, S.prog); }
  },

  recordSession(sess){
    if(!Array.isArray(S.prog.sessions)) S.prog.sessions = [];
    S.prog.sessions.unshift(sess);
    S.prog.sessions = S.prog.sessions.slice(0,50);
    _save(LS.PROG, S.prog);

    try { if (typeof WRONGBY !== 'undefined') WRONGBY._missCache = null; } catch(e){}
    try { if (typeof QHIST !== 'undefined') QHIST._cache = null; } catch(e){}

    HOME.render();
  },

  predict(){
    const sessions = (S.prog.sessions||[]).filter(s=>s.total>0).slice(0,20);
    if(sessions.length < 3) return null;
    let wSum = 0, vSum = 0;
    sessions.forEach((s,i)=>{
      const recencyW = 1 - (i/sessions.length)*0.5;
      const modeW = s.mode==='exam' ? 1.5 : 1.0;
      const w = recencyW * modeW;
      vSum += (s.pct||0) * w;
      wSum += w;
    });
    const predicted = Math.round(vSum/wSum);
    const pcts = sessions.map(s=>s.pct||0);
    const mean = pcts.reduce((a,b)=>a+b,0)/pcts.length;
    const variance = pcts.reduce((a,b)=>a+(b-mean)**2,0)/pcts.length;
    const stdDev = Math.round(Math.sqrt(variance));
    const confidence = sessions.length>=10 && stdDev<15 ? 'High' : sessions.length>=5 ? 'Medium' : 'Low';
    return { predicted, margin: Math.max(3,stdDev), confidence, sampleSize: sessions.length };
  },

  renderPredict(){
    const els = [
      document.getElementById('predict-card-2'),
      document.getElementById('predict-card')
    ].filter(Boolean);
    if (!els.length) return;

    const p = PROG.predict();
    let html;
    if(!p){
      html = `<div class="card"><div class="card-hd"><h3><i class="ph ph-target"></i> Predicted Exam Score</h3></div>
        <div class="empty"><div class="empty-i"><i class="ph ph-target"></i></div><p>Complete at least 3 quizzes (exam mode helps most) to unlock a prediction</p></div></div>`;
    } else {
      const barColor = p.predicted>=70?'var(--grn)':p.predicted>=50?'var(--amb)':'var(--ros)';
      const confColor = p.confidence==='High'?'tg':p.confidence==='Medium'?'ta':'tr';
      html = `<div class="card">
        <div class="card-hd"><h3><i class="ph ph-target"></i> Predicted Exam Score</h3><span class="ctag ${confColor}">${p.confidence} confidence</span></div>
        <div style="display:flex;align-items:baseline;gap:.5rem;margin:.3rem 0 .5rem">
          <span style="font-size:2rem;font-weight:800;color:var(--t1);font-family:var(--fd)">${p.predicted}%</span>
          <span style="font-size:.76rem;color:var(--t3)">± ${p.margin}% · based on your last ${p.sampleSize} session${p.sampleSize!==1?'s':''}</span>
        </div>
        <div class="pb"><div class="pb-f" style="width:${p.predicted}%;background:${barColor};transition:width 0.6s ease-out"></div></div>
        <div style="font-size:.7rem;color:var(--t3);margin-top:.55rem">Recent and exam-mode sessions count more. Not a guarantee — use it to gauge where you stand.</div>
      </div>`;
    }
    els.forEach(el => { el.innerHTML = html; });
  },

  render(){
    PROG.renderPredict();

    const total = S.prog.total, correct = S.prog.correct, wrong = total - correct;
    const pct = total ? Math.round((correct/total)*100) : 0;

    const statsEl = document.getElementById('prog-stats');
    if(statsEl){
      statsEl.innerHTML = `
        <div class="sc"><div class="sv tcy">${total}</div><div class="stat-lbl">Answered</div></div>
        <div class="sc"><div class="sv tc2">${correct}</div><div class="stat-lbl">Correct</div></div>
        <div class="sc"><div class="sv tb2">${wrong}</div><div class="stat-lbl">Wrong</div></div>
        <div class="sc"><div class="sv ta2">${pct}%</div><div class="stat-lbl">Accuracy</div></div>
      `;
    }

    const chapEl = document.getElementById('chap-acc');
    if(chapEl){
      let entries = CHAPSTATS.entries();
      if(!entries.length){
        const byChap = {};
        (S.prog.sessions||[]).forEach(s=>{
          const k = s.chapter||'Unknown';
          if(!byChap[k]) byChap[k] = {correct:0,total:0,sessions:0,lastAt:0};
          byChap[k].correct += s.correct||0;
          byChap[k].total += s.total||0;
          byChap[k].sessions++;
          if((s.at||0) > byChap[k].lastAt) byChap[k].lastAt = s.at||0;
        });
        entries = Object.entries(byChap)
          .map(([chapter,d])=>({chapter, attempted:d.total, correct:d.correct, accuracy:d.total?Math.round((d.correct/d.total)*100):0, sessions:d.sessions, lastAt:d.lastAt}))
          .sort((a,b)=>b.lastAt-a.lastAt);
      }

      if(!entries.length){
        chapEl.innerHTML = '<div class="empty"><div class="empty-i"><i class="ph ph-chart-bar"></i></div><p>Complete a quiz to see chapter breakdowns</p></div>';
      } else {
        const weak = entries.filter(e=> e.attempted>=5 && e.accuracy<60);
        const weakHtml = weak.length ? `
          <div style="background:var(--bad-bg);border:1px solid var(--bad-bd);border-radius:var(--r2);padding:.75rem 1rem;margin-bottom:.8rem">
            <div style="font-size:.72rem;font-weight:800;color:var(--ros);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem"><i class="ph ph-warning"></i> Weak Topics — needs attention</div>
            ${weak.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:.2rem 0;font-size:.76rem"><span style="color:var(--t2)">${esc(e.chapter)}</span><span class="ctag tr">${e.accuracy}%</span></div>`).join('')}
            <div style="margin-top:.5rem;font-size:.7rem;color:var(--t3)">Tip: Use <i class="ph ph-x-circle"></i> Wrong Bank to drill these topics</div>
          </div>` : '';
        
        requestAnimationFrame(() => {
          chapEl.innerHTML = weakHtml + entries.map(e=>{
            const p = e.accuracy;
            const barColor = p>=70?'var(--grn)':p>=50?'var(--amb)':'var(--ros)';
            return `<div class="pb-w">
              <div class="pb-l">
                <span style="font-size:.78rem">${esc(e.chapter)}</span>
                <div style="display:flex;align-items:center;gap:.35rem">
                  <span style="font-size:.68rem;color:var(--t3)">${e.sessions} session${e.sessions!==1?'s':''} · ${e.correct}/${e.attempted}</span>
                  <span class="ctag t${p>=70?'g':p>=50?'a':'r'}" style="font-size:.65rem">${p}%</span>
                </div>
              </div>
              <div class="pb"><div class="pb-f" style="width:${p}%;background:${barColor};transition:width 0.5s ease-out"></div></div>
            </div>`;
          }).join('');
        });
      }
    }
  }
};

document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') PROG.flushNow(); });
window.addEventListener('pagehide', () => PROG.flushNow());

window.PROG = PROG;