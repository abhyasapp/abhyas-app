// js/features/streak.js — study days, streak current/longest, 7-day bar.
// MUST load AFTER: core/format.js (today, localDateOffset), core/storage.js,
// core/state.js, features/home.js (HOME).

const STREAK = {
  markToday(){
    const t = today();
    if(!S.stk.days) S.stk.days = [];
    if(!S.stk.days.includes(t)) S.stk.days.push(t);
    S.stk.last = t;
    if(S.stk.days.length>400) S.stk.days = S.stk.days.slice(-400);
    _save(LS.STK, S.stk);
    HOME.render();
  },
  currentStreak(){
    const set = new Set(S.stk.days||[]);
    if(!set.size) return 0;
    const hasToday = set.has(today());
    const hasYesterday = set.has(localDateOffset(new Date(), -1));
    if(!hasToday && !hasYesterday){
      if(!set.has(localDateOffset(new Date(), -2))) return 0;
    }
    let n = 0;
    let offset = hasToday ? 0 : 1;
    let skipBudget = 1;
    while(n <= 400){
      if(set.has(localDateOffset(new Date(), -offset))){
        n++;
        offset++;
        continue;
      }
      if(skipBudget > 0){
        skipBudget--;
        offset++;
        continue;
      }
      break;
    }
    return n;
  },
  current(){ return STREAK.currentStreak(); },
  longest(){
    if(!S.stk.days || !S.stk.days.length) return 0;
    const sorted = [...new Set(S.stk.days)].sort();
    let longest = 1, cur = 1;
    for(let i=1;i<sorted.length;i++){
      const prev = new Date(sorted[i-1]);
      const curD = new Date(sorted[i]);
      const diffDays = Math.round((curD-prev)/(24*60*60*1000));
      if(diffDays===1){ cur++; longest=Math.max(longest,cur); }
      else cur = 1;
    }
    return longest;
  },
  renderBar(){
    const el = document.getElementById('sk-bar');
    if(!el) return;
    const days = [];
    const d = new Date();
    for(let i=6;i>=0;i--) days.push(localDateOffset(d,-i));
    el.innerHTML = days.map(ds=>{
      const done = S.stk.days.includes(ds);
      const isToday = ds===today();
      const [yy,mm,dd] = ds.split('-').map(Number);
      const label = new Date(yy,mm-1,dd).toLocaleDateString(undefined,{weekday:'short'})[0];
      return `<div class="sk-d ${done?'done':''} ${isToday?'today':''}">${label}</div>`;
    }).join('');
    const tag = document.getElementById('stk-tag');
    if(tag) tag.textContent = `🔥 ${STREAK.currentStreak()} day streak`;
  }
};

window.STREAK = STREAK;