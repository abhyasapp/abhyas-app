// js/features/local-file.js — practise a set from this device, or any file the app's own
// question bank already points at (every level, chapter, book and subtopic).
//
// Opening a question-bank file here is READ-ONLY: the questions come from the copy saved on the
// device when there is one, otherwise straight from the content repo. Nothing is downloaded,
// saved or attributed to a chapter — this screen only fills S.localQs and starts the quiz the
// same way a device file does.
//
// MUST load AFTER: core/state.js, core/question.js (normQ), core/text.js (pluralize),
// core/toast.js (toast), data/chapters-loader.js (ChapterData at call time).

const LOC = {
  _refs: null,

  onFile(){
    const f = document.getElementById('loc-file').files[0]; if (!f) return;
    const nameEl = document.getElementById('loc-file-name');
    if (nameEl) nameEl.textContent = f.name;
    const r = new FileReader();
    r.onload = e => {
      try {
        const raw = JSON.parse(e.target.result);
        const qs2 = normQ(raw, 'local');
        if (!qs2.length){ toast('❌ No valid questions found in file'); return; }
        S.localQs = qs2;
        /* A question-bank export names its own chapter; use that name so the
           set is not just "file (537).json" while you practise it. */
        const named = raw && typeof raw === 'object' ? String(raw.chapter || raw.chapter_title || '').trim() : '';
        LOC._label = named || f.name;
        const info = document.getElementById('loc-info');
        info.style.display = ''; info.style.color = ''; info.textContent = `✅ ${pluralize(qs2.length,'question')} loaded from "${LOC._label}"`;
        document.getElementById('loc-pr').disabled = false;
        document.getElementById('loc-ex').disabled = false;
        toast(`✅ ${pluralize(qs2.length,'question')} ready`);
      } catch{ toast('❌ Invalid JSON file'); }
    };
    r.onerror = () => toast('❌ Could not read file');
    r.readAsText(f);
  },

  /* ── the question bank picker ──────────────────────────────────────────────────────────
     Every file ref the chapter tree holds: the same list Chapters and Offline downloads use,
     so nothing can drift from it. Rebuilt from the tree, never stored. */
  refs(){
    if (LOC._refs) return LOC._refs;
    try { LOC._refs = (window.ChapterData ? ChapterData.allFileRefs() : []).filter(r => r && r.fid && r.key); }
    catch (e) { LOC._refs = []; }
    return LOC._refs;
  },

  /* One option per file, grouped by level and chapter, narrowed by the search box. */
  fillBank(q){
    const sel = document.getElementById('loc-bank-file');
    if (!sel) return;
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const keep = sel.value;
    const groups = new Map();
    LOC.refs().forEach(r => {
      let level = String(r.lv), chapter = 'Chapter ' + r.ch;
      try { level = ChapterData.levelLabel(r.lv) || level; chapter = ChapterData.chapterName(r.lv, r.ch); } catch (e) { /* tree unreadable: keep the plain ids */ }
      const hay = [level, chapter, r.book, r.subtopic].join(' ').toLowerCase();
      if (!words.every(w => hay.indexOf(w) !== -1)) return;
      const name = level + ' · ' + chapter;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(r);
    });
    const bits = ['<option value="">Choose a file…</option>'];
    groups.forEach((rows, name) => {
      bits.push('<optgroup label="' + esc(name) + '">');
      rows.forEach(r => bits.push('<option value="' + esc(r.key) + '">' + esc(r.book + ' — ' + r.subtopic) + '</option>'));
      bits.push('</optgroup>');
    });
    sel.innerHTML = bits.join('');
    if (keep){ sel.value = keep; if (sel.value !== keep) sel.selectedIndex = 0; }
  },

  async openBank(){
    const sel = document.getElementById('loc-bank-file');
    const ref = LOC.refs().find(r => r.key === (sel && sel.value));
    if (!ref){ toast('Choose a file from the question bank first'); return; }

    const info = document.getElementById('loc-info');
    const say = (msg, bad) => {
      if (!info) return;
      info.style.display = ''; info.style.color = bad ? 'var(--ros,#B3261E)' : '';
      info.textContent = msg;
    };
    let chapter = 'Chapter ' + ref.ch;
    try { chapter = ChapterData.chapterName(ref.lv, ref.ch); } catch (e) { /* keep the plain id */ }
    const label = chapter + ' — ' + ref.book + ' — ' + ref.subtopic;

    say('Opening ' + label + '…');
    let raw, from = 'this device';
    try { raw = (await QDB.get(ref.key)) || null; } catch (e) { raw = null; }   // a saved set costs no network
    if (!raw){
      if (!S.online || S.forcedOffline){
        say('You are offline and this set is not saved on this device. Download it from Chapters, or open a file from your device above.', true);
        toast('Connect to the internet, or download this set first');
        return;
      }
      from = 'the question bank';
      try { raw = await QUIZ._fetchFromCDN(ref.fid, 12000); }
      catch (e) {
        say('Could not read that file right now. Try again in a moment.', true);
        toast('❌ Could not open that set');
        return;
      }
    }

    let qs;
    try { qs = normQ(raw, 'local'); } catch (e) { qs = []; }
    if (!qs.length){
      say('That file has no readable questions.', true);
      toast('❌ No valid questions found in that file');
      return;
    }

    S.localQs = qs;
    const nameEl = document.getElementById('loc-file-name');
    if (nameEl) nameEl.textContent = label;
    const fileEl = document.getElementById('loc-file');
    if (fileEl) fileEl.value = '';
    document.getElementById('loc-pr').disabled = false;
    document.getElementById('loc-ex').disabled = false;
    LOC._label = label;
    say(`✅ ${pluralize(qs.length,'question')} loaded from ${from}: ${label}. Nothing was saved or changed.`);
    toast(`✅ ${pluralize(qs.length,'question')} ready`);
  },

  start(mode){
    if (!S.localQs){ toast('Open a set first'); return; }
    QUIZ.startWith([...S.localQs], mode, LOC._label || 'Local File');
  }
};

/* The list follows the chapter tree: built when the screen opens, rebuilt when chapters update. */
if (typeof UI !== 'undefined' && UI.onEnter) UI.onEnter('local', () => LOC.fillBank());
window.addEventListener('abhyas:chapters-updated', () => { LOC._refs = null; LOC.fillBank(); });

window.LOC = LOC;
