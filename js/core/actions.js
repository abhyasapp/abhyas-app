/* js/core/actions.js — the ONE dispatcher for every data-on-* attribute.
 *
 *   data-on-click="QUIZ.fcAnswer(0)"
 *   data-on-change="QUIZ._tagCurrent(this.value)"
 *   data-on-keydown="ACT.enterOrSpace(event)&&this.querySelector('input').click()"
 *   data-on-error="ACT.hideParent(this)"
 *   data-on-click="this.parentElement.classList.toggle('open')"
 *   data-on-click="PAYMENTS.toggle('user', event)"
 *
 * Binding rules (match standard inline handler semantics):
 *   this  = the element carrying the attribute
 *   event = the DOM event
 *   return false  →  preventDefault() + stopPropagation()
 *
 * Handlers are parsed by a small safe interpreter (no eval / new Function).
 * Names resolve on `window`; see js/core/expose.js.
 */
(function () {
  'use strict';

  /* Safe expression interpreter — replaces new Function(). Supports exactly what
     data-on-* attributes use: calls, member access, literals, this/event,
     !, ===, !==, &&, ||, ?:, {object} literals, `;` and `return`. */
  const _cache = new Map();
  function _lex(src) {
    const out = []; let i = 0; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, v = '';
        while (j < n && src[j] !== c) {
          if (src[j] === '\\') {
            const e = src[j + 1];
            if (e === 'u') { v += String.fromCharCode(parseInt(src.substr(j + 2, 4), 16)); j += 6; continue; }
            if (e === 'x') { v += String.fromCharCode(parseInt(src.substr(j + 2, 2), 16)); j += 4; continue; }
            v += ({ n: '\n', t: '\t', r: '\r' })[e] || e; j += 2; continue;
          }
          v += src[j++];
        }
        out.push({ t: 'lit', v }); i = j + 1; continue;
      }
      let m = /^-?\d+(\.\d+)?/.exec(src.slice(i));
      if (m && (c !== '-' || !out.length || out[out.length - 1].t === 'op')) { out.push({ t: 'lit', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      if (m) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      m = /^(===|!==|&&|\|\||[()[\]{}.,:;?!])/.exec(src.slice(i));
      if (!m) throw new Error('unsupported token at ' + i);
      out.push({ t: 'op', v: m[0] }); i += m[0].length;
    }
    return out;
  }
  function _parse(src) {
    const tk = _lex(src); let p = 0;
    const peek = () => tk[p], isOp = v => tk[p] && tk[p].t === 'op' && tk[p].v === v;
    const eat = v => { if (!isOp(v)) throw new Error('expected ' + v); p++; };
    function primary() {
      const t = tk[p++]; if (!t) throw new Error('unexpected end');
      if (t.t === 'lit') return () => t.v;
      if (t.t === 'op' && t.v === '(') { const e = expr(); eat(')'); return e; }
      if (t.t === 'op' && t.v === '{') {
        const props = [];
        while (!isOp('}')) {
          const k = tk[p++].v; eat(':'); props.push([k, expr()]); if (isOp(',')) p++;
        }
        eat('}'); return c => { const o = {}; props.forEach(([k, e]) => { o[k] = e(c); }); return o; };
      }
      if (t.t === 'op' && t.v === '[') {
        const items = []; while (!isOp(']')) { items.push(expr()); if (isOp(',')) p++; }
        eat(']'); return c => items.map(e => e(c));
      }
      if (t.t === 'id') {
        const v = t.v;
        if (v === 'true') return () => true;
        if (v === 'false') return () => false;
        if (v === 'null') return () => null;
        if (v === 'undefined') return () => undefined;
        if (v === 'this') return c => c.el;
        if (v === 'event') return c => c.ev;
        return () => { if (!(v in window)) throw new ReferenceError(v + ' is not defined'); return window[v]; };
      }
      throw new Error('unexpected ' + t.v);
    }
    function postfix() {
      let e = primary();
      for (;;) {
        if (isOp('.')) {
          p++; const k = tk[p++].v, base = e;
          e = Object.assign(c => base(c)[k], { base, k });
        } else if (isOp('[')) {
          p++; const ke = expr(), base = e; eat(']');
          e = Object.assign(c => base(c)[ke(c)], { base, ke });
        } else if (isOp('(')) {
          p++; const args = [];
          while (!isOp(')')) { args.push(expr()); if (isOp(',')) p++; }
          eat(')'); const f = e;
          e = c => {
            const self = f.base ? f.base(c) : undefined;
            const fn = f(c);
            if (typeof fn !== 'function') throw new TypeError('not a function');
            return fn.apply(self, args.map(a => a(c)));
          };
        } else return e;
      }
    }
    function unary() { if (isOp('!')) { p++; const e = unary(); return c => !e(c); } return postfix(); }
    function eq() {
      let l = unary();
      while (isOp('===') || isOp('!==')) {
        const o = tk[p++].v, r = unary(), a = l;
        l = c => (o === '===' ? a(c) === r(c) : a(c) !== r(c));
      }
      return l;
    }
    function and() { let l = eq(); while (isOp('&&')) { p++; const r = eq(), a = l; l = c => a(c) && r(c); } return l; }
    function or() { let l = and(); while (isOp('||')) { p++; const r = and(), a = l; l = c => a(c) || r(c); } return l; }
    function expr() {
      const cnd = or();
      if (isOp('?')) { p++; const a = expr(); eat(':'); const b = expr(); return c => (cnd(c) ? a(c) : b(c)); }
      return cnd;
    }
    const stmts = [];
    while (p < tk.length) {
      if (isOp(';')) { p++; continue; }
      if (peek().t === 'id' && peek().v === 'return') {
        p++; const e = (p >= tk.length || isOp(';')) ? (() => undefined) : expr(); stmts.push({ ret: true, e });
      } else stmts.push({ ret: false, e: expr() });
    }
    return function (el, ev) {
      const c = { el, ev }; let r;
      for (const s of stmts) { r = s.e(c); if (s.ret) return r; }
      return r;
    };
  }
  function _compile(code) {
    let fn = _cache.get(code);
    if (fn) return fn;
    try { fn = _parse(code); }
    catch (e) { console.error('[actions] Unsupported handler:', code, e); fn = function () {}; }
    if (_cache.size >= 1000) Array.from(_cache.keys()).slice(0, 500).forEach(k => _cache.delete(k));
    _cache.set(code, fn);
    return fn;
  }

  function _fire(el, attrName, evt) {
    const code = el.getAttribute(attrName);
    if (!code) return;
    let stopRequested = false;
    evt.stopPropagation = function () { stopRequested = true; evt.__actStopped = true; };
    let result;
    try { result = _compile(code)(el, evt); }
    catch (e) {
      console.error('[actions] Handler threw (' + attrName + '):', code, e);
      if (typeof toast === 'function') toast('An unexpected error occurred. Please try again.', 4000);
      return;
    }
    finally { delete evt.stopPropagation; }
    if (result === false && evt) {
      if (evt.preventDefault) evt.preventDefault();
      stopRequested = true; evt.__actStopped = true;
    }
    if (stopRequested && evt.bubbles) {
      const stopper = ev => { if (ev === evt) ev.stopPropagation(); };
      el.addEventListener(evt.type, stopper);
      setTimeout(() => el.removeEventListener(evt.type, stopper), 0);
    }
  }

  const TYPES = ['click', 'keydown', 'change', 'input', 'focus', 'mousedown', 'error'];

  TYPES.forEach(type => {
    document.addEventListener(type, e => {
      let el = e.target;
      while (el && el !== document && el !== window) {
        if (el.getAttribute && el.getAttribute('data-on-' + type) != null) {
          _fire(el, 'data-on-' + type, e);
          if (e.__actStopped) break;
        }
        el = el.parentElement;
      }
    }, true);
  });

  window.ACT = {
    enterOrSpace(e) {
      return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
    },

    /* Full-page navigation from a data-on-click (the trial chip uses it to
       reach the payment screen). Kept here because both pages need it. */
    go(url) {
      if (!url) return;
      try { window.location.assign(String(url)); } catch (e) { console.error('[ACT.go]', e); }
    },

    /* "Save new chapters automatically on Wi-Fi". CACHE reads this key in
       autoSync(), so persisting it here is all the wiring the toggle needs. */
    autosync(el) {
      try { _save('abhyas_autosync', !!(el && el.checked)); } catch (e) { window.warnCaught && window.warnCaught('js/core/actions.js', e); }
    },
    hideParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = 'none';
    },
    showParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = '';
    },
    later(ms, target, method) {
      const rest = Array.prototype.slice.call(arguments, 3);
      setTimeout(() => {
        try {
          if (typeof target === 'function') target.apply(null, method === undefined ? [] : [method].concat(rest));
          else if (target && typeof target[method] === 'function') target[method].apply(target, rest);
        } catch (e) { console.error('[ACT.later]', e); }
      }, Number(ms) || 0);
    }
  };
})();