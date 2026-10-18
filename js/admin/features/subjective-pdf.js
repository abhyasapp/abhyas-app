// js/admin/features/subjective-pdf.js — replace / fetch / annotate a
// submission PDF.
// MUST load AFTER: core.js (ADMIN, $, esc, escAttrJs, driveFileId, BUSY,
// TOAST, MODAL, CONFIRM), app/pdf-viewer.js (PDFVIEW),
// vendor/pdf-lib/pdf-lib.min.js (PDFLib), vendor/pdfjs/pdf.min.js (pdfjsLib).
// Uses SUBJ_STORE, SUBJ_TABS, SUBJ_QOTD, SUBJ_EXAM at call time only.

const SUBJ_PDF = {
  _ctx: null,
  _file: null,

  open(id, username, pdfUrl){
    const fileId = driveFileId(pdfUrl);
    if (!fileId) {
      TOAST.show('That submission has no Drive file to replace', 'error');
      return;
    }
    this._ctx = { id, username, fileId, pdfUrl };
    this._file = null;

    MODAL.sheet('Replace PDF — ' + username,
      '<div class="banner banner-warning"><i class="ph ph-warning"></i><span>' +
        'The file in Drive is <b>overwritten in place</b>. The URL the student already has will point at the new content the moment you finish. ' +
        'A backup of the original is kept for 30 days.' +
      '</span></div>' +
      '<dl class="dl mb4">' +
        '<div><dt>Student</dt><dd class="mono">' + esc(username) + '</dd></div>' +
        '<div><dt>Drive file</dt><dd class="mono" style="overflow-wrap:anywhere">' + esc(fileId) + '</dd></div>' +
      '</dl>' +
      '<div class="field"><span class="field-label">Step 1 — get the original</span>' +
        '<div class="flex g2 wrap mt2">' +
          '<button class="btn btn-secondary btn-sm" data-on-click="SUBJ_PDF.downloadOriginal()"><i class="ph ph-download-simple"></i> Download original</button>' +
          '<button class="btn btn-secondary btn-sm" data-on-click="openPdf(\'' + escAttrJs(id) + '\',\'' + escAttrJs(username) + '\')"><i class="ph ph-eye"></i> View the original</button>' +
          '<button class="btn btn-primary btn-sm" data-on-click="MODAL.close(\'sheet\');PDF_ANNOTATE.open(\'' + escAttrJs(id) + '\',\'' + escAttrJs(username) + '\',\'' + escAttrJs(pdfUrl) + '\')"><i class="ph ph-highlighter-circle"></i> Mark it here instead</button>' +
        '</div>' +
        '<span class="field-hint mt2">Annotate in this console, or in any external PDF editor and save the copy to your device.</span>' +
      '</div>' +
      '<div class="field"><span class="field-label">Step 2 — upload the replacement</span>' +
        '<label class="file-drop" for="pdf-replace-file" style="margin-top:var(--sp-2)">' +
          '<input type="file" id="pdf-replace-file" accept="application/pdf,.pdf" data-on-change="SUBJ_PDF.onFile(this)">' +
          '<i class="ph ph-file-pdf fd-icon"></i>' +
          '<span class="fd-main" id="pdf-replace-name">Choose the updated PDF</span>' +
          '<span class="fd-sub">Must be a PDF · under 10 MB</span>' +
        '</label>' +
      '</div>' +
      '<div class="flex g2 mt4">' +
        '<button class="btn btn-quiet" style="flex:1" data-on-click="MODAL.close(\'sheet\')">Cancel</button>' +
        '<button class="btn btn-primary" style="flex:1" id="pdf-replace-go" disabled data-on-click="SUBJ_PDF.commit()">Upload &amp; replace</button>' +
      '</div>',
      { wide:false });
  },

  async downloadOriginal(){
    if (!this._ctx) return;
    const name = (this._ctx.username || 'submission') + '_original.pdf';
    TOAST.show('Preparing the download', 'info', 2000);
    BUSY.start();
    try {
      const res = await fetchSubmissionPdf(this._ctx.id);
      const chars = atob(res.base64);
      const bytes = new Uint8Array(chars.length);
      for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      TOAST.show('Downloaded', 'success');
    } catch(e){ TOAST.show(e.message || 'Download failed', 'error', 6000); }
    BUSY.stop();
  },

  onFile(input){
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      TOAST.show('That file is over 10 MB', 'error', 5000);
      input.value = '';
      $('pdf-replace-name').textContent = 'Choose the updated PDF';
      this._file = null;
      $('pdf-replace-go').disabled = true;
      return;
    }
    const looksLikePdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!looksLikePdf) {
      TOAST.show('That is not a PDF', 'error', 5000);
      input.value = '';
      $('pdf-replace-name').textContent = 'Choose the updated PDF';
      this._file = null;
      $('pdf-replace-go').disabled = true;
      return;
    }
    this._file = f;
    $('pdf-replace-name').textContent = f.name + ' · ' + (f.size / 1024).toFixed(0) + ' KB';
    $('pdf-replace-go').disabled = false;
  },

  async commit(){
    if (!this._file || !this._ctx) return;
    const ctx = this._ctx;
    const file = this._file;

    const ok = await CONFIRM.ask({
      title: 'Replace the PDF',
      body: 'The Drive file is <b>overwritten</b>. <b>' + esc(ctx.username) + '</b> will see the new version immediately. ' +
            'A backup of the original is kept for 30 days.',
      confirmText: 'Replace', tone: 'danger'
    });
    if (!ok) return;

    const btn = $('pdf-replace-go');
    btn.classList.add('loading');
    BUSY.start();
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });

      const res = await ADMIN.post('adminReplaceSubmissionPdf', {
        id: ctx.id,
        fileId: ctx.fileId,
        fileData: dataUrl,
        filename: file.name
      });
      if (!res.success) throw new Error(res.error || 'Replace failed.');

      TOAST.show('PDF replaced — ' + ctx.username + ' now sees the updated version', 'success', 5000);
      MODAL.close('sheet');
      await SUBJ_STORE.load(true);
       if (typeof SUBJ_QOTD !== 'undefined' && SUBJ_TABS.current === 'qotd') SUBJ_QOTD.render();
       if (typeof SUBJ_EXAM !== 'undefined' && SUBJ_TABS.current === 'exam') SUBJ_EXAM.render();
    } catch(e) {
      TOAST.show(e.message || 'Could not replace that PDF', 'error', 6000);
    }
    BUSY.stop();
    btn.classList.remove('loading');
  }
};

/* ═══════════════ MARKING A PAPER — adapter over the shared viewer ═══════
   The console no longer ships its own PDF surface. It opens the same
   pdf-viewer.js the students read with, in annotation mode, so both sides
   see identical rendering, zoom, paging and find. This module only does the
   part that is genuinely admin-specific: take the ink overlays the viewer
   produces, stamp them onto the ORIGINAL PDF with pdf-lib, and upload the
   result through adminReplaceSubmissionPdf.

   Stamping rather than flattening is what keeps the student's scan sharp and
   its text selectable. Pages that were never marked keep their exact bytes.
   ═══════════════════════════════════════════════════════════════════════ */
const PDF_ANNOTATE = {
  ctx: null,

  open(id, username, pdfUrl){
    if (typeof PDFVIEW === 'undefined') {
      return TOAST.show('The PDF viewer did not load — reload the page and try again', 'error', 6000);
    }
    if (typeof PDFLib === 'undefined') {
      return TOAST.show('pdf-lib did not load, so marks cannot be saved — check your connection and reload', 'error', 6000);
    }
    const fileId = driveFileId(pdfUrl);
    if (!fileId) return TOAST.show('That submission has no Drive file to mark', 'error');

    this.ctx = { id, username, fileId, pdfUrl };
    PDFVIEW.open({
      title: 'Marking — ' + username,
      filename: 'marked_' + username + '.pdf',
      annotate: {
        saveLabel: 'Save & send',
        autosave: false,
        onSave: (overlays, info) => PDF_ANNOTATE._commit(overlays, info)
      },
      load: async () => {
        const res = await fetchSubmissionPdf(id);
        return { base64: res.base64, filename: res.filename };
      }
    });
  },

  close(){ if (typeof PDFVIEW !== 'undefined') PDFVIEW.close(); },

  /* Returns true on success; anything else leaves the viewer's save chip in
     its failed state with the marks still on screen. */
  async _commit(overlays, info){
    const ctx = this.ctx;
    if (!ctx) return false;
    if (!overlays.length) { TOAST.show('Nothing has been marked yet', 'warning'); return false; }

    const ok = await CONFIRM.ask({
      title: 'Send the marked paper',
      body: 'This replaces the paper <b>' + esc(ctx.username) + '</b> sees, on ' +
            plural(overlays.length, 'page') + '. Your marks go on top of their original pages, ' +
            'so the scan keeps its quality. The original is backed up automatically.',
      confirmText: 'Save & send', tone: 'danger'
    });
    if (!ok) return false;

    BUSY.start();
    try {
      const bytes = await this._stamp(overlays, info);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
      }
      const res = await ADMIN.post('adminReplaceSubmissionPdf', {
        id: ctx.id, fileId: ctx.fileId,
        fileData: 'data:application/pdf;base64,' + btoa(binary),
        filename: 'marked_' + ctx.username + '.pdf'
      });
      if (!res.success) throw new Error(res.error || 'The server refused the upload.');

      TOAST.show(ctx.username + ' can now see the marked paper', 'success', 5000);
      await SUBJ_STORE.load(true);
      if (typeof SUBJ_QOTD !== 'undefined' && SUBJ_TABS.current === 'qotd') SUBJ_QOTD.render();
      if (typeof SUBJ_EXAM !== 'undefined' && SUBJ_TABS.current === 'exam') SUBJ_EXAM.render();
      return true;
    } catch(e){
      TOAST.show(e.message || 'Could not save the marked paper', 'error', 7000);
      return false;
    } finally {
      BUSY.stop();
    }
  },

  /* The ink overlays arrive as data URLs; extract the base64 payload with a
     clear error rather than letting a malformed string throw a TypeError
     deep inside pdf-lib with no clue what went wrong. */
  _base64FromDataUrl(dataUrl){
    const s = String(dataUrl || '');
    const i = s.indexOf(',');
    if (i < 0 || i === s.length - 1) throw new Error('A mark overlay arrived without data.');
    return s.slice(i + 1);
  },

  /* Overlay-on-original where possible; flatten only if pdf-lib cannot
     reopen the file or a page is rotated, and say so when that happens. */
  async _stamp(overlays, info){
    try {
      const doc = await PDFLib.PDFDocument.load(info.bytes.slice());
      const pages = doc.getPages();
      if (pages.length !== info.pageCount) throw new Error('page count mismatch');
      for (const o of overlays) {
        const page = pages[o.page - 1];
        if (!page) throw new Error('missing page ' + o.page);
        if (((page.getRotation().angle % 360) + 360) % 360 !== 0) throw new Error('rotated page');
        const base64 = this._base64FromDataUrl(o.dataUrl);
        const png = await doc.embedPng(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
        const size = page.getSize();
        page.drawImage(png, { x: 0, y: 0, width: size.width, height: size.height });
      }
      return await doc.save();
    } catch(e){
      console.warn('[marking] overlay failed, flattening instead:', e && e.message);
      TOAST.show('This PDF could not take an overlay, so it is being flattened to images.', 'warning', 6000);
      return await this._flatten(overlays, info);
    }
  },

  /* Flatten at three quality tiers, stopping as soon as the output fits
     inside the upload ceiling. A 30-page paper at scale 2 hits 9–12 MB,
     over what the endpoint and the browser's own file input will accept —
     degrading quality is better than failing the whole save. */
  async _flatten(overlays, info){
    if (typeof pdfjsLib === 'undefined') throw new Error('The PDF engine is not available.');
    const src = await pdfjsLib.getDocument({ data: info.bytes.slice() }).promise;
    const byPage = {};
    overlays.forEach(o => { byPage[o.page] = o; });

    const MAX_BYTES = 8 * 1024 * 1024;
    const tiers = [
      { scale: 2.0, quality: 0.92 },
      { scale: 1.6, quality: 0.80 },
      { scale: 1.3, quality: 0.65 }
    ];

    let lastBytes = null;
    try {
      for (let t = 0; t < tiers.length; t++) {
        const { scale, quality } = tiers[t];
        const out = await PDFLib.PDFDocument.create();
        for (let n = 1; n <= src.numPages; n++) {
          const page = await src.getPage(n);
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const cx = c.getContext('2d');
          await page.render({ canvasContext: cx, viewport: vp }).promise;
          if (byPage[n]) {
            await new Promise(res => {
              const img = new Image();
              img.onload = () => { cx.drawImage(img, 0, 0, c.width, c.height); res(); };
              img.onerror = res;
              img.src = byPage[n].dataUrl;
            });
          }
          const jpeg = c.toDataURL('image/jpeg', quality);
          const emb = await out.embedJpg(Uint8Array.from(atob(jpeg.split(',')[1]), ch => ch.charCodeAt(0)));
          const p = out.addPage([emb.width, emb.height]);
          p.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
        }
        const bytes = await out.save();
        lastBytes = bytes;
        if (bytes.length <= MAX_BYTES) return bytes;
        if (t < tiers.length - 1) {
          TOAST.show('Paper is large — re-rendering at lower quality to fit the upload limit.', 'warning', 4000);
        }
      }
    } finally {
      try { src.destroy(); } catch(e){}
    }

    const mb = (lastBytes ? (lastBytes.length / 1048576).toFixed(1) : '8+');
    throw new Error('This paper is too long to flatten inside the browser — the smallest copy is ' + mb +
      ' MB, over the 8 MB upload limit. Use "Replace PDF" to upload a compressed copy instead.');
  }
};

/* Answer PDFs live in the SubjectiveAnswers Drive folder, which
   adminDownloadScreenshot deliberately refuses to read — it only serves
   files from PaymentScreenshots. adminDownloadSubmissionPdf is the endpoint
   for these, it is gated on subjective_view rather than screenshots, and it
   takes the submission id instead of a Drive URL. */
async function fetchSubmissionPdf(id){
  const res = await ADMIN.post('adminDownloadSubmissionPdf', { id });
  if (!res.success) throw new Error(res.error || 'Could not fetch that PDF.');
  return res;
}

async function openPdf(id, username){
  if (!id) return TOAST.show('No PDF was attached to this submission', 'warning');

  if (window.PDFVIEW) {
    PDFVIEW.open({
      title: username ? 'Answer paper — ' + username : 'Answer paper',
      filename: (username || 'submission') + '.pdf',
      load: async () => {
        const res = await fetchSubmissionPdf(id);
        return { base64: res.base64, filename: res.filename };
      }
    });
    return;
  }

  TOAST.show('Loading the answer PDF', 'info', 2000);
  try {
    const res = await fetchSubmissionPdf(id);
    const chars = atob(res.base64);
    const bytes = new Uint8Array(chars.length);
    for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mimeType || 'application/pdf' }));
    const tab = window.open(url, '_blank');
    if (!tab) TOAST.show('Your browser blocked the pop-up — allow pop-ups for this site', 'error', 6000);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch(e){
    TOAST.show(e.message || 'Could not open that PDF', 'error', 6000);
  }
}

window.SUBJ_PDF     = SUBJ_PDF;
window.PDF_ANNOTATE = PDF_ANNOTATE;
window.openPdf      = openPdf;