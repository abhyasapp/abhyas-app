(function () {
  'use strict';
  if (typeof window.ACT === 'undefined') window.ACT = {};
  if (!window.ACT.go) window.ACT.go = function (h) { if (h) window.location.href = h; };
  if (!window.ACT.showParent) window.ACT.showParent = function (el) { if (el && el.parentNode) el.parentNode.style.display = ''; };
  if (!window.ACT.autosync) window.ACT.autosync = function (el) {
    var on = !!(el && el.checked);
    try { localStorage.setItem('abhyas_autosync', JSON.stringify(on)); } catch (e) {}
    if (on && typeof CACHE !== 'undefined' && typeof CACHE.autoSync === 'function') { try { CACHE.autoSync(); } catch (e) {} }
    if (typeof toast === 'function') toast(on ? 'Chapters will download automatically on Wi-Fi.' : 'Automatic download is off.');
  };
  if (typeof window.HEADERMENU === 'undefined') {
    window.HEADERMENU = {
      toggle: function () { var p = document.getElementById('tb-menu-pop'), b = document.getElementById('tb-more-btn'); if (!p || !b) return; var o = p.hidden; p.hidden = !o; b.setAttribute('aria-expanded', String(o)); },
      close: function () { var p = document.getElementById('tb-menu-pop'), b = document.getElementById('tb-more-btn'); if (p) p.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
    };
    document.addEventListener('click', function (e) { if (e.target && e.target.closest && !e.target.closest('.tb-more')) { try { window.HEADERMENU.close(); } catch (x) {} } });
  }
  if (typeof window.HOMEFOCUS === 'undefined') {
    var K = 'abhyas_home_mode_v1';
    function m() { try { return localStorage.getItem(K) === 'detailed' ? 'detailed' : 'simple'; } catch (e) { return 'simple'; } }
    function paint() {
      var mode = m();
      document.querySelectorAll('.home-mode-opt').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)); });
      var btn = document.getElementById('home-mode-btn');
      if (btn) { btn.setAttribute('aria-pressed', String(mode === 'detailed')); btn.textContent = mode === 'detailed' ? 'Show less on Home' : 'Show more on Home'; }
    }
    window.HOMEFOCUS = {
      mode: m,
      setMode: function (mode) { mode = mode === 'detailed' ? 'detailed' : 'simple'; try { localStorage.setItem(K, mode); } catch (e) {} if (typeof HOME_LAYOUT !== 'undefined' && typeof HOME_LAYOUT.applyPreset === 'function') { try { HOME_LAYOUT.applyPreset(mode); } catch (e) {} } paint(); },
      toggleMode: function () { window.HOMEFOCUS.setMode(m() === 'detailed' ? 'simple' : 'detailed'); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
  }
})();
