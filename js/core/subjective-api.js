// js/core/subjective-api.js — the transport for the written-answer backend.
// Two thin wrappers around ABHYAS_CONFIG.GAS_URL so a change of host or
// auth shape is a one-file change.

function _backendUrl() {
  try {
    if (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.GAS_URL) {
      return ABHYAS_CONFIG.GAS_URL;
    }
  } catch (e) {}
  try {
    if (typeof APPS !== 'undefined' && APPS) return APPS;
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.ABHYAS_CONFIG && window.ABHYAS_CONFIG.GAS_URL) {
      return window.ABHYAS_CONFIG.GAS_URL;
    }
  } catch (e) {}
  return '';
}

function _authParams() {
  try {
    if (typeof S !== 'undefined' && S && S.user) {
      return { username: S.user.username || '', token: S.user.token || '' };
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.S && window.S.user) {
      return { username: window.S.user.username || '', token: window.S.user.token || '' };
    }
  } catch (e) {}
  return { username: '', token: '' };
}

async function _api(action, params, method) {
  const url = _backendUrl();
  if (!url) return { success: false, error: 'Backend URL not configured.' };
  const base = _authParams();
  try {
    if (method === 'GET') {
      const qs = new URLSearchParams({ action, ...base, ...(params || {}) }).toString();
      const r = await fetch(url + '?' + qs, { redirect: 'follow' });
      return await r.json();
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...base, ...(params || {}) })
    });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message || 'Network error' };
  }
}