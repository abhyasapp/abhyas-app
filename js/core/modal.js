// js/core/modal.js — the sheet modal plus the destructive-confirm dialog.

function openMod(title, html) {
  document.getElementById('mtitle').textContent = title;
  document.getElementById('mbody').innerHTML = html;
  document.getElementById('mbg').classList.add('show');
}
function closeMod() {
  document.getElementById('mbg').classList.remove('show');
}
function _anyModalOpen() {
  if (document.getElementById('mbg')?.classList.contains('show')) return true;
  return ['#quiz-limit-modal', '#exam-resume-modal', '#quiz-exit-modal', '#quiz-error-card', '#quiz-loader']
    .some(sel => { const el = document.querySelector(sel); return el && el.offsetParent !== null; });
}

/* A destructive action needs a typed confirmation, so it can never be
   dismissed by accident. Same contract as before: resolves true / false,
   disables the OK button until the typed text matches, traps Tab. */
const ASK = {
  confirm(o) {
    o = o || {};
    return new Promise(resolve => {
      const prev = document.activeElement;
      const need = o.requireText ? String(o.requireText) : '';
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:1.2rem;background:var(--scrim);backdrop-filter:blur(4px)';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.innerHTML = `<div style="width:100%;max-width:380px;background:var(--surface-2,var(--surface));border:1px solid var(--sep);border-radius:var(--r-sheet);box-shadow:var(--sh-modal,var(--sh-3));padding:1.25rem">
        <div style="font-size:var(--fs-t3);font-weight:650;margin-bottom:.4rem">${esc(o.title || 'Are you sure?')}</div>
        <div class="t-callout" style="margin-bottom:${need ? '.8rem' : '1.1rem'};line-height:1.55">${esc(o.body || '')}</div>
        ${need ? `<input class="input" id="ask-typed" autocomplete="off" placeholder="Type ${esc(need)} to confirm" style="margin-bottom:1rem">` : ''}
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-quiet" id="ask-no" style="flex:1" type="button">Cancel</button>
          <button class="btn ${o.danger ? 'btn-r' : 'btn-solid'}" id="ask-yes" style="flex:1" type="button" ${need ? 'disabled' : ''}>${esc(o.ok || 'Confirm')}</button>
        </div></div>`;
      document.body.appendChild(wrap);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
      const done = v => {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        try { if (prev && prev.focus) prev.focus(); } catch (e) {}
        resolve(v);
      };
      document.addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => { if (e.target === wrap) done(false); });
      wrap.querySelector('#ask-no').onclick = () => done(false);
      const yes = wrap.querySelector('#ask-yes');
      yes.onclick = () => done(true);
      const typed = wrap.querySelector('#ask-typed');
      if (typed) {
        typed.addEventListener('input', () => { yes.disabled = typed.value.trim().toUpperCase() !== need.toUpperCase(); });
        typed.focus();
      } else yes.focus();
    });
  }
};