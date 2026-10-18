// js/core/study-docs.js — labels and filters for the model-answer PDFs.

const STUDYDOC_LABELS = {
  'model-answer': 'Model answers',
  'notes': 'Notes',
  'past-paper': 'Past papers',
  'syllabus': 'Syllabus',
  'other': 'Other'
};

function studyDocsFilter(docs, opts) {
  const o = opts || {};
  const cat = o.cat && o.cat !== 'all' ? String(o.cat) : '';
  const words = String(o.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (Array.isArray(docs) ? docs : []).filter(d => {
    if (!d) return false;
    if (cat && d.category !== cat) return false;
    if (!words.length) return true;
    const hay = ((d.title || '') + ' ' + (d.description || '') + ' ' + (STUDYDOC_LABELS[d.category] || '')).toLowerCase();
    return words.every(w => hay.indexOf(w) !== -1);
  });
}

function studyDocsNewIds(docs, seenIds) {
  const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
  return (Array.isArray(docs) ? docs : [])
    .filter(d => d && d.id && !seen.has(d.id))
    .map(d => d.id);
}

function studyDocsCategories(docs) {
  const counts = {};
  (Array.isArray(docs) ? docs : []).forEach(d => {
    if (d) counts[d.category] = (counts[d.category] || 0) + 1;
  });
  return Object.keys(STUDYDOC_LABELS)
    .filter(c => counts[c])
    .map(c => ({ category: c, label: STUDYDOC_LABELS[c], count: counts[c] }));
}

function studyDocsForChapter(docs, chapterId) {
  const id = String(chapterId || '');
  if (!id) return [];
  return (Array.isArray(docs) ? docs : []).filter(d => d && d.chapterId === id);
}

function subjChapterName(chapterId) {
  try {
    const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chapterId);
    return c ? c.name : '';
  } catch (e) { return ''; }
}
window.STUDYDOC_LABELS = STUDYDOC_LABELS;
window.subjChapterName = subjChapterName;