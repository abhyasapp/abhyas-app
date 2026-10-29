// js/features/study-docs.js — model-answer PDFs and the recovery panel.
// The corrections poller lives in report/userreport.js as
// USER_REPORT.checkCorrections — this file does NOT define a CORRECTIONS object.

window.STUDYDOCS = {
  LIST_KEY: 'abhyas_studydocs', SEEN_KEY: 'abhyas_studydocs_seen', CACHE_KEY: 'abhyas_studydocs_cache',
  MAX_CACHE_BYTES: 25 * 1024 * 1024, STALE_MS: 10 * 60 * 1000,
  docs: [], loaded: false, loading: false, cat: 'all', q: '', chapter: '', newIds: new Set(), _at: 0,

  _user(){ try { return (typeof S !== 'undefined' && S.user) ? S.user : null; } catch(e){ return null; } },
  _online(){ try { return !!(S.online && !S.forcedOffline); } catch(e){ return navigator.onLine; } },
  _read(key, dflt){ try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? dflt : v; } catch(e){ return dflt; } },
  _write(key, v){ try { localStorage.setItem(key, JSON.stringify(v)); } catch(e){} },

  _urlFor(action){
    try {
      if (typeof abhyasEndpointFor === 'function' && typeof ABHYAS_CONFIG !== 'undefined') {
        return abhyasEndpointFor(action) === 'gas'
          ? (ABHYAS_CONFIG.GAS_URL || '')
          : (ABHYAS_CONFIG.SUPABASE_URL || '');
      }
    } catch(e){}
    return (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG.GAS_URL) || '';
  },

  async _post(body){
    const u = this._user();
    if (!u || !u.token) throw new Error('Please sign in again.');
    const url = this._urlFor(body && body.action);
    if (!url) throw new Error('The backend address is not set up.');
    const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'text/plain' },
      body: JSON.stringify(Object.assign({ username:u.username, token:u.token }, body)) });
    if (!r.ok) throw new Error('The server replied with an error (' + r.status + ').');
    const res = await r.json();
    if (!res || !res.success) { const e = new Error((res && res.error) || 'Request failed.'); e.needsPayment = !!(res && res.needsPayment); throw e; }
    return res;
  },

  async _fetchList(){
    const res = await this._post({ action:'listStudyDocs' });
    this.docs = res.docs || [];
    this._write(this.LIST_KEY, this.docs);
    this.loaded = true; this._at = Date.now();
    this._purgeStale();
    return this.docs;
  },

  _updateBadge(){
    const seen = this._read(this.SEEN_KEY, null);
    const n = seen === null ? 0 : studyDocsNewIds(this.docs, seen).length;
    const b = $('sdc');
    if (b) { b.hidden = n === 0; b.textContent = n > 99 ? '99+' : String(n); }
    const hint = document.querySelector('#nav-studydocs');
    if (hint) hint.setAttribute('title', n ? n + ' new' : '');
    return n;
  },

  async refreshBadge(){
    if (!this._user() || !this._online() || (Date.now() - this._at) < this.STALE_MS) return;
    try { await this._fetchList(); this._updateBadge(); } catch(e){ /* the badge is a nicety */ }
  },

  async load(force){
    const box = $('studydocs-body');
    if (!box) return;
    if (this.loading) return;
    
    const fresh = this.loaded && (Date.now() - this._at) < this.STALE_MS;
    let offlineNote = '';
    
    if (!(fresh && !force)) {
      this.loading = true;
      if (!this.loaded) {
        box.innerHTML = `<div class="card">
          <div class="skel w80"></div><div class="skel w60"></div><div class="skel w100"></div>
        </div>`;
      }
      
      try {
        if (!this._online()) throw Object.assign(new Error('offline'), { offline: true });
        await this._fetchList();
      } catch(e){
        if (e.needsPayment) {
          box.innerHTML = '<div class="card"><div class="banner banner-warning"><i class="ph ph-lock"></i><span>' + esc(e.message) + '</span></div></div>';
          this.loading = false; return;
        }
        const saved = this._read(this.LIST_KEY, null);
        if (saved && saved.length) { 
          this.docs = saved; this.loaded = true; 
          offlineNote = e.offline ? 'You are offline. Showing the list from your last visit.' : (e.message || 'Could not refresh.') + ' Showing the list from your last visit.'; 
        } else {
          box.innerHTML = '<div class="card"><div class="banner banner-' + (e.offline ? 'warning' : 'danger') + '"><i class="ph ph-' + (e.offline ? 'wifi-slash' : 'warning-circle') + '"></i><span>' +
            esc(e.offline ? 'You are offline. Connect once to download the list; PDFs you open are kept for offline reading.' : (e.message || 'Could not load.')) +
            ' <button class="btn btn-sm btn-quiet" data-on-click="STUDYDOCS.load(true)">Try again</button></span></div></div>';
          this.loading = false; return;
        }
      }
      this.loading = false;
    }
    
    const seen = this._read(this.SEEN_KEY, null);
    this.newIds = new Set(seen === null ? [] : studyDocsNewIds(this.docs, seen));
    this.render(offlineNote);
    this._write(this.SEEN_KEY, this.docs.map(d => d.id));
    this._updateBadge();
  },

  async ensureLoaded(){
    if (this.loaded && (Date.now() - this._at) < this.STALE_MS) return this.docs;
    if (!this._user() || !this._online()) { const saved = this._read(this.LIST_KEY, null); if (saved && !this.loaded) { this.docs = saved; this.loaded = true; } return this.docs; }
    try { await this._fetchList(); } catch(e){}
    return this.docs;
  },

  showChapter(chapterId){
    const docs = studyDocsForChapter(this.docs, chapterId);
    if (docs.length === 1) { this.open(docs[0].id); return; }
    this.chapter = chapterId || ''; this.cat = 'all'; this.q = '';
    const q = $('sd-q'); if (q) q.value = '';
    UI.go('studydocs');
  },
  clearChapter(){ this.chapter = ''; this.render(); },

  setCat(c){ this.cat = c || 'all'; this.render(); },
  setQuery(v){ this.q = String(v || ''); clearTimeout(this._qt); this._qt = setTimeout(() => this.render(), 120); },

  _cacheIndex(){ return this._read(this.CACHE_KEY, []); },
  _isCached(d){ const e = this._cacheIndex().find(x => x.id === d.id); return !!(e && e.updatedAt === d.updatedAt); },

  render(note){
    const box = $('studydocs-body'), chips = $('sd-chips');
    if (!box) return;
    
    const cats = studyDocsCategories(this.docs);
    if (this.cat !== 'all' && !cats.some(c => c.category === this.cat)) this.cat = 'all';
    
    if (chips) {
      chips.innerHTML = cats.length < 2 ? '' :
        '<button type="button" class="sd-chip' + (this.cat === 'all' ? ' on' : '') + '" data-on-click="STUDYDOCS.setCat(\'all\')">All<small>' + this.docs.length + '</small></button>' +
        cats.map(c => '<button type="button" class="sd-chip' + (this.cat === c.category ? ' on' : '') + '" data-on-click="STUDYDOCS.setCat(\'' + c.category + '\')">' + esc(c.label) + '<small>' + c.count + '</small></button>').join('');
    }
    
    const chapBar = this.chapter
      ? '<div class="banner" style="margin-bottom:var(--sp-2)"><i class="ph ph-funnel"></i><span>Showing PDFs for <b>' + esc(subjChapterName(this.chapter) || 'this chapter') + '</b>. <button class="btn btn-sm btn-quiet" data-on-click="STUDYDOCS.clearChapter()">Show all</button></span></div>' : '';
    const banner = chapBar + (note ? '<div class="banner banner-warning" style="margin-bottom:var(--sp-2)"><i class="ph ph-wifi-slash"></i><span>' + esc(note) + '</span></div>' : '');
    
    if (!this.docs.length) {
      box.innerHTML = banner + '<div class="card"><div class="empty"><div class="empty-i"><i class="ph ph-file-pdf"></i></div><p>No PDFs yet</p><p>When your teacher adds model answers or notes, they will appear here.</p></div></div>';
      return;
    }
    
    let list = studyDocsFilter(this.docs, { cat: this.cat, q: this.q });
    if (this.chapter) list = list.filter(d => d.chapterId === this.chapter);
    
    if (!list.length) {
      box.innerHTML = banner + '<div class="card"><div class="empty"><div class="empty-i"><i class="ph ph-magnifying-glass"></i></div><p>Nothing matches</p><p>Try a different word, or choose All.</p></div></div>';
      return;
    }
    
    requestAnimationFrame(() => {
      box.innerHTML = banner + '<div class="sd-list">' + list.map(d => {
        const off = this._isCached(d);
        return '<div class="card sd-card">' +
          '<div class="sd-ic"><i class="ph ph-file-pdf"></i></div>' +
          '<div class="sd-main">' +
            '<div class="sd-title">' + esc(d.title) + '</div>' +
            (d.description ? '<div class="sd-desc">' + esc(d.description) + '</div>' : '') +
            '<div class="sd-meta"><span class="sd-tag">' + esc(STUDYDOC_LABELS[d.category] || 'Other') + '</span>' +
              (d.chapterId && subjChapterName(d.chapterId) ? '<span class="sd-tag">' + esc(subjChapterName(d.chapterId)) + '</span>' : '') +
              (this.newIds.has(d.id) ? '<span class="sd-new">New</span>' : '') +
              '<span>' + esc(formatBytes(d.sizeBytes)) + '</span>' +
              (off ? '<span class="sd-off"><i class="ph ph-check-circle"></i> Works offline</span>' : '') + '</div>' +
            '<div class="sd-acts"><button class="btn btn-solid btn-sm" data-on-click="STUDYDOCS.open(\'' + escAttrJs(d.id) + '\')"><i class="ph ph-book-open"></i> Read</button>' +
              (off ? '<button class="btn btn-quiet btn-sm" data-on-click="STUDYDOCS.removeOffline(\'' + escAttrJs(d.id) + '\')"><i class="ph ph-trash"></i> Free up space</button>' : '') +
            '</div>' +
          '</div></div>';
      }).join('') + '</div>';
    });
  },

  async _cacheSet(d, res){
    try {
      if (typeof QDB === 'undefined' || !res.base64) return;
      if (res.base64.length * 0.75 > this.MAX_CACHE_BYTES) return;
      if (!(await QDB.set('studydoc:' + d.id, { base64: res.base64, filename: res.filename || d.fileName || 'study.pdf' }))) return;
      let idx = this._cacheIndex().filter(x => x.id !== d.id);
      idx.push({ id: d.id, at: Date.now(), updatedAt: d.updatedAt, size: Math.round(res.base64.length * 0.75) });
      idx.sort((a, b) => b.at - a.at);
      this._write(this.CACHE_KEY, idx);
      this.render();
    } catch(e){}
  },

  _purgeStale(){ /* intentionally does not delete anything */ },

  async removeOffline(id){
    try { await QDB.del('studydoc:' + id); } catch(e){}
    this._write(this.CACHE_KEY, this._cacheIndex().filter(x => x.id !== id));
    this.render();
    toast('Removed from this device');
  },

  open(id){
    const d = this.docs.find(x => x.id === id);
    if (!d) { toast('That PDF is no longer available.'); return; }
    if (!window.PDFVIEW) { toast('The PDF reader did not load. Reload the page and try again.', 5000); return; }

    PDFVIEW.open({
      title: d.title,
      load: async () => {
        if (this._isCached(d)) {
          const hit = await QDB.get('studydoc:' + d.id);
          if (hit && hit.base64) return { base64: hit.base64, filename: hit.filename || d.fileName };
        }
        if (!this._online()) throw new Error('You are offline and this PDF was not saved on this device yet. Open it once while online.');
        const res = await this._post({ action:'getStudyDocPdf', id: d.id });
        if (res.base64) {
          /* The API can answer success with an error page's bytes. Refuse
             anything that is not a PDF, so a broken file never reaches the
             offline cache. */
          if (String(res.base64).slice(0, 6) !== 'JVBERi') {
            throw new Error('The server did not send a PDF for this document. Try again — if it keeps failing, ask your teacher to re-upload it.');
          }
          this._cacheSet(d, res); return { base64: res.base64, filename: res.filename || d.fileName };
        }
        if (!res.url) throw new Error('The server did not return a PDF URL.');
        const blob = await fetch(res.url).then(rr => {
          if (!rr.ok) throw new Error('The signed URL replied with HTTP ' + rr.status + '.');
          return rr.blob();
        });
        const base64 = await new Promise((ok, bad) => {
          const fr = new FileReader();
          fr.onload = () => ok(String(fr.result).split(',')[1]);
          fr.onerror = () => bad(new Error('Could not read the PDF.'));
          fr.readAsDataURL(blob);
        });
        /* Same guard for the signed-URL path: never cache a non-PDF. */
        if (String(base64).slice(0, 6) !== 'JVBERi') {
          throw new Error('That link did not return a PDF — it may have expired. Try again.');
        }
        this._cacheSet(d, { base64, filename: res.filename || d.fileName });
        return { base64, filename: res.filename || d.fileName };
      }
    });
  }
};

window.RECOVER = {
  REASONS: {
    'before-sync': 'Before combining with another device', 'before-restore': 'Before adding your cloud backup',
    'before-merge': 'Before a merge', 'before-import': 'Before loading a backup file',
    'before-recover': 'Before adding back a copy', 'before-account-switch': 'Before signing in as someone else', 'test': 'Test'
  },
  _msg(t, bad){ const m = $('recover-msg'); if (m) { m.textContent = t || ''; m.style.color = bad ? 'var(--danger)' : ''; } },
  _when(ms){ const d = new Date(ms); return isNaN(d) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); },
  _line(c){ return [c.wr + ' missed', c.bk + ' saved', c.fl + ' flagged', c.sessions + ' sessions'].join(' \u00b7 '); },

  render(){
    const box = $('recover-local');
    if (!box) return;
    const snaps = (typeof PSYNC !== 'undefined') ? PSYNC.listSnapshots() : [];
    
    requestAnimationFrame(() => {
      box.innerHTML = snaps.length ? snaps.map((s, i) =>
        '<div class="rec-row"><div class="rec-main"><div class="rec-t">' + esc(this._when(s.at)) + '</div>' +
        '<div class="rec-s">' + esc(this.REASONS[s.reason] || 'Before a sync') + '<br>' + esc(this._line(s.counts || {wr:0,bk:0,fl:0,sessions:0})) + '</div></div>' +
        '<button class="btn btn-a btn-sm" data-on-click="RECOVER.addLocal(' + i + ')">Add back</button></div>').join('')
        : '<div class="t-foot">Nothing yet. A copy is saved here automatically before any sync changes your data.</div>';
    });
  },

  async addLocal(i){
    this._msg('Adding\u2026');
    const out = await PSYNC.recoverSnapshot(i);
    this._done(out);
  },

  async loadCloud(){
    const box = $('recover-cloud');
    if (!S.online) { this._msg('Connect to the internet to see earlier cloud copies.', true); return; }
    box.innerHTML = '<div class="t-foot">Checking\u2026</div>';
    try {
      const entries = await PSYNC.listCloudHistory();
      requestAnimationFrame(() => {
        box.innerHTML = entries.length ? entries.map(e =>
          '<div class="rec-row"><div class="rec-main"><div class="rec-t">' + esc(this._when(new Date(e.savedAt).getTime())) + '</div>' +
          '<div class="rec-s">Earlier cloud copy \u00b7 ' + esc(formatBytes(e.chars)) + '</div></div>' +
          '<button class="btn btn-a btn-sm" data-on-click="RECOVER.addCloud(' + Number(e.slot) + ')">Add back</button></div>').join('')
          : '<div class="t-foot">No earlier cloud copies yet. The server starts keeping them from your next backup.</div>';
      });
    } catch (e) {
      box.innerHTML = '<button class="btn btn-quiet btn-sm" data-on-click="RECOVER.loadCloud()"><i class="ph ph-cloud-arrow-down"></i> Check earlier cloud copies</button>';
      this._msg(e.message || 'Could not load earlier cloud copies.', true);
    }
  },

  async addCloud(slot){
    this._msg('Adding\u2026');
    this._done(await PSYNC.recoverCloud(slot));
  },

  _done(out){
    if (!out || !out.ok) { this._msg((out && out.error) || 'That copy could not be added.', true); return; }
    const a = out.added, n = a.wr + a.bk + a.fl + a.sessions + a.notes;
    this._msg(n > 0 ? 'Added ' + [a.wr && a.wr + ' missed', a.bk && a.bk + ' saved', a.fl && a.fl + ' flagged', a.sessions && a.sessions + ' sessions', a.notes && a.notes + ' notes'].filter(Boolean).join(', ') + '. Nothing was removed.' : 'That copy had nothing new. Nothing was removed.');
    this.render();
  }
};