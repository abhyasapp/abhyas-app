/* ═══════════════════════════════════════════════════════════════════════
   js/features/pdf-viewer.js — the shared in-app PDF viewer.
   Two modes: view-only (student) and annotate (admin marking).

   Depends on (call-time only, all optional):
     window.pdfjsLib   — renders pages to canvas (falls back to <embed> if absent)
     window.PDFLib     — produces overlays (annotation is disabled if absent)

   Public API:
     PDFVIEW.open({ title, load, filename?, annotate? })  → Promise<void>
        load()      → { base64, filename }
        annotate?   → { saveLabel, autosave, onSave(overlays, info) }
        overlays[].page    = page number (1-indexed)
        overlays[].dataUrl = PNG data URL, page-sized
        info               = { bytes: Uint8Array, pageCount: number }

     PDFVIEW.close()
     PDFVIEW.isOpen()            → boolean
     PDFVIEW.isAnnotating()      → boolean
     PDFVIEW.hasUnsavedMarks()   → boolean   (used by admin beforeunload)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const MAX_RENDER_DIM = 2000; // px; caps canvas memory on long papers

  const state = {
    open: false,
    annotating: false,
    unsaved: false,
    root: null,
    canvasWrap: null,
    canvas: null,
    ink: null,
    pageLabel: null,
    prevBtn: null,
    nextBtn: null,
    saveBtn: null,
    closeBtn: null,
    ctx: null,          // { title, load, filename, annotate }
    doc: null,          // pdfjs document (when available)
    bytes: null,        // Uint8Array of the original PDF
    pageCount: 1,
    current: 1,
    renderTask: null,
    drawing: false,
    lastPoint: null,
    overlays: new Map()  // page → canvas (offscreen, full page size)
  };

  /* ── DOM construction ─────────────────────────────────────────────── */
  function _build() {
    if (state.root) return;
    const root = document.createElement('div');
    root.id = 'pdfview';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.style.cssText =
      'position:fixed;inset:0;z-index:10020;display:none;flex-direction:column;' +
      'background:rgba(0,0,0,.92);color:#fff;';

    root.innerHTML =
      '<div id="pdfview-bar" style="display:flex;align-items:center;gap:.5rem;' +
        'padding:.5rem .75rem;background:rgba(20,20,20,.98);border-bottom:1px solid #333">' +
        '<strong id="pdfview-title" style="flex:1;font-size:.85rem;overflow:hidden;' +
          'text-overflow:ellipsis;white-space:nowrap"></strong>' +
        '<span id="pdfview-page" style="font-size:.72rem;opacity:.7;font-family:monospace"></span>' +
        '<button id="pdfview-prev" type="button" style="padding:.25rem .6rem;' +
          'background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">&larr;</button>' +
        '<button id="pdfview-next" type="button" style="padding:.25rem .6rem;' +
          'background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">&rarr;</button>' +
        '<button id="pdfview-save" type="button" style="padding:.25rem .75rem;' +
          'background:#f59e0b;color:#111;border:none;border-radius:6px;cursor:pointer;' +
          'font-weight:700;display:none">Save &amp; send</button>' +
        '<button id="pdfview-close" type="button" style="padding:.25rem .6rem;' +
          'background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer">&times;</button>' +
      '</div>' +
      '<div id="pdfview-body" style="flex:1;overflow:auto;display:flex;' +
        'align-items:flex-start;justify-content:center;padding:1rem">' +
        '<div id="pdfview-wrap" style="position:relative;max-width:100%">' +
          '<canvas id="pdfview-canvas" style="display:block;max-width:100%;height:auto"></canvas>' +
          '<canvas id="pdfview-ink" style="position:absolute;inset:0;width:100%;' +
            'height:100%;pointer-events:none;touch-action:none"></canvas>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);

    state.root = root;
    state.canvasWrap = root.querySelector('#pdfview-wrap');
    state.canvas = root.querySelector('#pdfview-canvas');
    state.ink = root.querySelector('#pdfview-ink');
    state.pageLabel = root.querySelector('#pdfview-page');
    state.prevBtn = root.querySelector('#pdfview-prev');
    state.nextBtn = root.querySelector('#pdfview-next');
    state.saveBtn = root.querySelector('#pdfview-save');
    state.closeBtn = root.querySelector('#pdfview-close');

    state.closeBtn.addEventListener('click', () => PDFVIEW.close());
    state.prevBtn.addEventListener('click', () => _goTo(state.current - 1));
    state.nextBtn.addEventListener('click', () => _goTo(state.current + 1));
    state.saveBtn.addEventListener('click', _save);
    document.addEventListener('keydown', _onKey);

    /* Ink drawing for annotate mode. */
    state.ink.addEventListener('pointerdown', _inkStart);
    state.ink.addEventListener('pointermove', _inkMove);
    state.ink.addEventListener('pointerup', _inkEnd);
    state.ink.addEventListener('pointercancel', _inkEnd);
    state.ink.addEventListener('pointerleave', _inkEnd);
  }

  function _onKey(e) {
    if (!state.open) return;
    if (e.key === 'Escape') { e.preventDefault(); PDFVIEW.close(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); _goTo(state.current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); _goTo(state.current + 1); }
  }

  /* ── Ink overlay helpers ─────────────────────────────────────────── */
  function _ensureOverlay(n) {
    if (state.overlays.has(n)) return state.overlays.get(n);
    const src = state.canvas;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    state.overlays.set(n, c);
    return c;
  }

  function _inkStart(e) {
    if (!state.annotating) return;
    e.preventDefault();
    state.drawing = true;
    state.lastPoint = _localPoint(e);
  }

  function _inkMove(e) {
    if (!state.drawing) return;
    e.preventDefault();
    const p = _localPoint(e);
    if (!p || !state.lastPoint) return;
    const c = _ensureOverlay(state.current);
    const cx = c.getContext('2d');
    cx.strokeStyle = 'rgba(220,30,30,0.95)';
    cx.lineWidth = Math.max(2, Math.round(c.width / 500));
    cx.lineCap = 'round';
    cx.lineJoin = 'round';
    cx.beginPath();
    cx.moveTo(state.lastPoint.x, state.lastPoint.y);
    cx.lineTo(p.x, p.y);
    cx.stroke();
    _paintInk();
    state.unsaved = true;
    state.lastPoint = p;
  }

  function _inkEnd() { state.drawing = false; state.lastPoint = null; }

  function _localPoint(e) {
    const c = state.canvas;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) * (c.width / r.width);
    const y = (e.clientY - r.top) * (c.height / r.height);
    return { x, y };
  }

  function _paintInk() {
    const ink = state.ink;
    const src = state.canvas;
    ink.width = src.width;
    ink.height = src.height;
    ink.style.width = '100%';
    ink.style.height = '100%';
    const cx = ink.getContext('2d');
    cx.clearRect(0, 0, ink.width, ink.height);
    const overlay = state.overlays.get(state.current);
    if (overlay) cx.drawImage(overlay, 0, 0);
  }

  /* ── PDF rendering ───────────────────────────────────────────────── */
  function _hasPdfJs() { return typeof window.pdfjsLib !== 'undefined'; }

  async function _renderPage(n) {
    if (!state.doc) return;
    if (n < 1 || n > state.pageCount) return;
    state.current = n;
    state.pageLabel.textContent = n + ' / ' + state.pageCount;
    state.prevBtn.disabled = n <= 1;
    state.nextBtn.disabled = n >= state.pageCount;

    if (state.renderTask) { try { state.renderTask.cancel(); } catch (e) {} state.renderTask = null; }

    const page = await state.doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_RENDER_DIM / vp1.width, MAX_RENDER_DIM / vp1.height, 2.5);
    const vp = page.getViewport({ scale });

    state.canvas.width = Math.round(vp.width);
    state.canvas.height = Math.round(vp.height);
    const cx = state.canvas.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    state.renderTask = page.render({ canvasContext: cx, viewport: vp });
    try { await state.renderTask.promise; } catch (e) { /* cancelled */ }
    state.renderTask = null;

    /* Size the ink canvas to match, then repaint any marks already on this page. */
    _paintInk();
  }

  function _goTo(n) { _renderPage(n); }

  /* ── Public API ──────────────────────────────────────────────────── */
  const PDFVIEW = {
    async open(opts) {
      if (!opts || typeof opts.load !== 'function') {
        throw new Error('PDFVIEW.open: opts.load is required');
      }
      _build();

      state.ctx = opts;
      state.annotating = !!(opts.annotate && typeof opts.annotate.onSave === 'function');
      state.unsaved = false;
      state.overlays.clear();
      state.current = 1;
      state.doc = null;
      state.bytes = null;

      state.root.querySelector('#pdfview-title').textContent = opts.title || 'PDF';
      state.saveBtn.style.display = state.annotating ? '' : 'none';
      state.saveBtn.textContent = (opts.annotate && opts.annotate.saveLabel) || 'Save & send';
      state.saveBtn.disabled = false;
      state.ink.style.pointerEvents = state.annotating ? 'auto' : 'none';

      state.root.style.display = 'flex';
      state.open = true;
      document.body.style.overflow = 'hidden';

      /* Fetch the PDF bytes. */
      let payload;
      try {
        payload = await opts.load();
      } catch (e) {
        PDFVIEW.close();
        if (typeof toast === 'function') toast('Could not open the PDF: ' + (e.message || 'unknown error'), 6000);
        return;
      }
      if (!payload || !payload.base64) {
        PDFVIEW.close();
        if (typeof toast === 'function') toast('The PDF came back empty.', 5000);
        return;
      }

      /* base64 → Uint8Array */
      const bin = atob(payload.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      state.bytes = bytes;

      /* pdfjs render, or <embed> fallback. */
      if (_hasPdfJs()) {
        try {
          state.doc = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
          state.pageCount = state.doc.numPages;
          await _renderPage(1);
          return;
        } catch (e) {
          console.warn('[PDFVIEW] pdfjs failed, falling back to embed', e);
        }
      }

      /* Fallback: <embed> — no annotation, but the student still sees the paper. */
      state.annotating = false;
      state.saveBtn.style.display = 'none';
      state.ink.style.pointerEvents = 'none';
      state.canvas.style.display = 'none';
      state.ink.style.display = 'none';
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const wrap = state.canvasWrap;
      wrap.innerHTML = '';
      const embed = document.createElement('embed');
      embed.src = url;
      embed.type = 'application/pdf';
      embed.style.cssText = 'width:100%;height:80vh;border:none;background:#fff';
      wrap.appendChild(embed);
      state.pageLabel.textContent = '';
      state.prevBtn.disabled = state.nextBtn.disabled = true;
      state._fallbackUrl = url;
    },

    close() {
      if (!state.open) return;
      if (state.annotating && state.unsaved) {
        if (!confirm('You have unsaved marks. Close without saving?')) return;
      }
      /* Restore canvases in case fallback swapped in an <embed>. */
      if (state._fallbackUrl) {
        try { URL.revokeObjectURL(state._fallbackUrl); } catch (e) {}
        state._fallbackUrl = null;
        state.canvasWrap.innerHTML =
          '<canvas id="pdfview-canvas" style="display:block;max-width:100%;height:auto"></canvas>' +
          '<canvas id="pdfview-ink" style="position:absolute;inset:0;width:100%;height:100%;' +
          'pointer-events:none;touch-action:none"></canvas>';
        state.canvas = state.canvasWrap.querySelector('#pdfview-canvas');
        state.ink = state.canvasWrap.querySelector('#pdfview-ink');
        state.ink.addEventListener('pointerdown', _inkStart);
        state.ink.addEventListener('pointermove', _inkMove);
        state.ink.addEventListener('pointerup', _inkEnd);
        state.ink.addEventListener('pointercancel', _inkEnd);
        state.ink.addEventListener('pointerleave', _inkEnd);
      }

      state.root.style.display = 'none';
      state.open = false;
      state.annotating = false;
      state.unsaved = false;
      state.doc = null;
      state.bytes = null;
      state.overlays.clear();
      if (!document.querySelector('.overlay.show')) document.body.style.overflow = '';
    },

    isOpen() { return state.open; },
    isAnnotating() { return state.annotating; },
    hasUnsavedMarks() { return state.unsaved; }
  };

  /* ── Save handler (annotate mode only) ───────────────────────────── */
  async function _save() {
    if (!state.annotating || !state.ctx || !state.ctx.annotate || !state.bytes) return;
    if (typeof window.PDFLib === 'undefined') {
      if (typeof toast === 'function')
        toast('pdf-lib did not load, so marks cannot be saved. Check your connection and reload.', 6000);
      return;
    }
    const overlays = [];
    state.overlays.forEach((c, page) => {
      overlays.push({ page: page, dataUrl: c.toDataURL('image/png') });
    });
    if (!overlays.length) {
      if (typeof toast === 'function') toast('Nothing has been marked yet', 3500);
      return;
    }
    overlays.sort((a, b) => a.page - b.page);

    state.saveBtn.disabled = true;
    const origLabel = state.saveBtn.textContent;
    state.saveBtn.textContent = 'Saving…';
    try {
      const ok = await state.ctx.annotate.onSave(overlays, {
        bytes: state.bytes,
        pageCount: state.pageCount
      });
      if (ok) {
        state.unsaved = false;
        PDFVIEW.close();
      } else {
        state.saveBtn.disabled = false;
        state.saveBtn.textContent = origLabel;
      }
    } catch (e) {
      console.error('[PDFVIEW] save threw', e);
      if (typeof toast === 'function') toast('Could not save the marks: ' + (e.message || 'unknown'), 6000);
      state.saveBtn.disabled = false;
      state.saveBtn.textContent = origLabel;
    }
  }

  window.PDFVIEW = PDFVIEW;
})();