// js/core/text.js — the ONE HTML escaper, plus the tiny string helpers.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function escAttrJs(s) {
  const js = String(s == null ? '' : s).replace(/[\\'"]/g, c => '\\' + c);
  return js.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pluralize(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : (pluralWord || word + 's')}`;
}

function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return Math.round(n / 1024) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

function localISODate(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
window.esc          = esc;
window.escAttrJs    = escAttrJs;
window.pluralize    = pluralize;
window.formatBytes  = formatBytes;
window.localISODate = localISODate;

function driveFileId(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s || /^data:/i.test(s)) return '';
  if (/^[-\w]{25,}$/.test(s)) return s;
  const m = s.match(/\/d\/([-\w]{25,})/) ||
            s.match(/[?&]id=([-\w]{25,})/) ||
            s.match(/\/([-\w]{25,})(?:\/|$)/);
  return m ? m[1] : '';
}
window.driveFileId = driveFileId;