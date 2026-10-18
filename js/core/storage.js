// js/core/storage.js — the ONLY place that touches localStorage directly.
// _load and _save are still function declarations so they are available
// to any file that runs after this one (state.js needs _load at load time).

function _load(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : d;
  } catch (e) { return d; }
}

let _lastStorageWarnAt = 0;
function _save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    if (PSYNC_KEYS.has(k)) PSYNC.scheduleSync();
    return true;
  } catch (e) {
    const now = Date.now();
    if (now - _lastStorageWarnAt > 30000) {
      _lastStorageWarnAt = now;
      const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      toast(isQuota
        ? '⚠️ Device storage is full — new progress/bookmarks may not be saved. Try removing some old bookmarks or flagged questions to free space.'
        : '⚠️ Could not save — some data may not have been saved.', 5000);
    }
    return false;
  }
}

/* IndexedDB question-set cache. Same public shape as before. */
const QDB = (() => {
  const DB_NAME = 'abhyas_question_cache';
  const STORE = 'sets';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB not supported')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function get(key) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  }
  async function set(key, value) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }
  async function del(key) {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function keys() {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return []; }
  }
  async function clear() {
    try {
      const db = await open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  async function migrateFromLocalStorage() {
    const oldKeys = Object.keys(localStorage).filter(k => k.startsWith(LS.QC));
    if (!oldKeys.length) return;
    for (const k of oldKeys) {
      try {
        const value = JSON.parse(localStorage.getItem(k));
        await set(k.slice(LS.QC.length), value);
      } catch (e) {}
      localStorage.removeItem(k);
    }
  }
  return { get, set, del, keys, clear, migrateFromLocalStorage };
})();