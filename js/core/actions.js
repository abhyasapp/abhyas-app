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
 * Handlers run inside `new Function('event', code)` — top-level const QUIZ,
 * PAYMENTS, SUBJ, etc. are visible because new Function bodies run in the
 * global scope, which includes the global lexical environment.
 */
(function () {
  'use strict';

  const _cache = new Map();

  function _compile(code) {
    let fn = _cache.get(code);
    if (fn) return fn;
    try { fn = new Function('event', code); }
    catch (e) {
      console.error('[actions] Failed to compile:', code, e);
      fn = function () {};
    }
    _cache.set(code, fn);
    return fn;
  }

  function _fire(el, attrName, evt) {
    const code = el.getAttribute(attrName);
    if (!code) return;
    let result;
    try { result = _compile(code).call(el, evt); }
    catch (e) {
      console.error('[actions] Handler threw:', attrName, code, e);
      return;
    }
    /* Inline-handler semantics: `return false` cancels the event. */
    if (result === false && evt) {
      if (evt.preventDefault)   evt.preventDefault();
      if (evt.stopPropagation)  evt.stopPropagation();
    }
  }

  /* All types use capture: true — `error` and `focus` don't bubble.
     The walk from e.target upward fires handlers innermost-first, so a
     nested `data-on-click` on a child runs before the parent's, and
     `event.stopPropagation()` in the child prevents the parent's. */
  const TYPES = ['click', 'keydown', 'change', 'input', 'focus', 'mousedown', 'error'];

  TYPES.forEach(type => {
    document.addEventListener(type, e => {
      let el = e.target;
      while (el && el !== document && el !== window) {
        if (el.getAttribute && el.getAttribute('data-on-' + type) != null) {
          _fire(el, 'data-on-' + type, e);
          if (e.cancelBubble) break;
        }
        el = el.parentElement;
      }
    }, true);
  });

  window.ACT = {
    enterOrSpace(e) {
      return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
    },
    hideParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = 'none';
    }
  };
})();