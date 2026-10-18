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
    /* This dispatcher runs in the CAPTURE phase, before the event reaches its
       target. If a handler's `event.stopPropagation()` were passed straight
       through, it would also stop the event from ever reaching buttons wired
       with element.onclick / addEventListener inside that element (that is how
       the modal's "Send Report" button went dead: the modal box carries
       data-on-click="event.stopPropagation()").
       So during the handler we swap in a stand-in that only RECORDS the request,
       then replay it in the bubble phase at `el`: handlers deeper than `el` still
       run, handlers above it do not — exactly what a real inline onclick does. */
    let stopRequested = false;
    evt.stopPropagation = function () { stopRequested = true; evt.__actStopped = true; };
    let result;
    try { result = _compile(code).call(el, evt); }
    catch (e) {
      console.error('[actions] Handler threw:', attrName, code, e);
      return;
    }
    finally { delete evt.stopPropagation; }
    /* Inline-handler semantics: `return false` cancels the event. */
    if (result === false && evt) {
      if (evt.preventDefault) evt.preventDefault();
      stopRequested = true; evt.__actStopped = true;
    }
    if (stopRequested && evt.bubbles) {
      const stopper = ev => { if (ev === evt) ev.stopPropagation(); };
      el.addEventListener(evt.type, stopper);
      /* dispatch is synchronous, so by the next tick the event is over */
      setTimeout(() => el.removeEventListener(evt.type, stopper), 0);
    }
  }

  /* All types use capture: true — `error` and `focus` don't bubble.
     The walk from e.target upward fires handlers innermost-first, so a
     nested `data-on-click` on a child runs before the parent's, and
     `event.stopPropagation()` in the child prevents the parent's (tracked with
   e.__actStopped; see _fire for why it is not a real stopPropagation). */
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
    hideParent(el) {
      if (el && el.parentNode) el.parentNode.style.display = 'none';
    },
    /* Run something after a short delay, from a data-on-* attribute:
         ACT.later(120, APP_SWITCH, 'toAdmin')   -> APP_SWITCH.toAdmin()
         ACT.later(300, someFunction, arg)       -> someFunction(arg)      */
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