/* Drag-to-reorder list - UMD: window.DragOrder / module.exports (moveItem only in Node).
   DOM APIs only; no innerHTML. Used by the phone (play.js) and the kit's Try-it.

   Markup contract (the caller builds it, so it controls the look):
     <ol|ul|div listEl>
       <li data-i="0" tabindex="0">                      <- one per item; data-i is the item's stable id (int)
         <span class="order-grip">..</span>              <- drag handle (opts.handleSelector); whole card if omitted
         <span data-role="pos"></span>                   <- optional: textContent is set to 1..n live (data-pos is always set on the item)
         <button data-dir="up">, <button data-dir="down"> <- optional: wired, disabled at the ends
       </li>
     </ol>

   makeSortable(listEl, { onChange(orderArray), itemSelector, handleSelector, idAttr, reducedMotion })
     -> { getOrder(), setOrder(arr), destroy() }  (getOrder is the data-i ids in the current visual order). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DragOrder = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var win = typeof window !== 'undefined' ? window : {};

  // Pure: returns a new array with the element at `from` moved to index `to` (indices clamped).
  function moveItem(list, from, to) {
    var out = Array.prototype.slice.call(list);
    if (!out.length) return out;
    var f = Math.max(0, Math.min(out.length - 1, Math.trunc(Number(from)) || 0));
    var t = Math.max(0, Math.min(out.length - 1, Math.trunc(Number(to)) || 0));
    if (f === t) return out;
    var item = out.splice(f, 1)[0];
    out.splice(t, 0, item);
    return out;
  }

  function makeSortable(listEl, opts) {
    opts = opts || {};
    var itemSelector = opts.itemSelector || ':scope > *';
    var handleSelector = opts.handleSelector || null;
    var idAttr = opts.idAttr || 'data-i';
    var reduced = !!opts.reducedMotion;
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : function () {};

    function items() { return Array.prototype.slice.call(listEl.querySelectorAll(itemSelector)); }
    function idOf(el) { return Number(el.getAttribute(idAttr)); }
    function getOrder() { return items().map(idOf); }
    var initial = getOrder();

    // Touch scrolling stays alive everywhere except on the grab handle (or the card, if there is no handle).
    function setTouchAction() {
      items().forEach(function (el) {
        var target = handleSelector ? el.querySelector(handleSelector) : el;
        if (target) target.style.touchAction = 'none';
      });
    }

    function refresh() {
      var els = items();
      els.forEach(function (el, k) {
        el.setAttribute('data-pos', String(k + 1)); // themes can show it via attr(data-pos)
        var pos = el.querySelector('[data-role="pos"]');
        if (pos) pos.textContent = String(k + 1);
        el.setAttribute('aria-posinset', String(k + 1));
        el.setAttribute('aria-setsize', String(els.length));
        var up = el.querySelector('[data-dir="up"]');
        var down = el.querySelector('[data-dir="down"]');
        if (up) up.disabled = k === 0;
        if (down) down.disabled = k === els.length - 1;
      });
    }

    // FLIP: animate siblings from their old to new positions after a DOM reorder.
    function flip(before, skip) {
      if (reduced) return;
      items().forEach(function (el) {
        if (el === skip || !before.has(el)) return;
        var dy = before.get(el) - el.getBoundingClientRect().top;
        if (!dy) return;
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + dy + 'px)';
        el.getBoundingClientRect(); // force layout
        el.style.transition = 'transform 160ms ease';
        el.style.transform = '';
        var done = function () { el.style.transition = ''; el.removeEventListener('transitionend', done); };
        el.addEventListener('transitionend', done);
      });
    }
    function tops() {
      var m = new Map();
      items().forEach(function (el) { m.set(el, el.getBoundingClientRect().top); });
      return m;
    }

    function place(el, index) { // index among all items
      var els = items();
      var cur = els.indexOf(el);
      if (cur === index) return false;
      var others = els.filter(function (x) { return x !== el; });
      var ref = others[index] || null;
      listEl.insertBefore(el, ref);
      return true;
    }

    function setOrder(arr) {
      var byId = new Map();
      items().forEach(function (el) { byId.set(idOf(el), el); });
      var before = tops();
      arr.forEach(function (id) { var el = byId.get(Number(id)); if (el) listEl.appendChild(el); });
      refresh();
      flip(before, null);
    }

    function commit(el, focusSel) {
      refresh();
      if (focusSel === true && el && el.focus) el.focus();
      else if (focusSel) { var f = el.querySelector(focusSel); if (f && !f.disabled) f.focus(); else el.focus(); }
      onChange(getOrder());
    }

    function moveBy(el, delta, focusSel) {
      var els = items();
      var from = els.indexOf(el);
      var to = from + delta;
      if (from < 0 || to < 0 || to >= els.length) return;
      var before = tops();
      place(el, to);
      flip(before, null);
      commit(el, focusSel);
    }

    // ---- buttons and keyboard ----
    function onClick(e) {
      var btn = e.target.closest ? e.target.closest('[data-dir]') : null;
      if (!btn || !listEl.contains(btn) || btn.disabled) return;
      var el = btn.closest(itemSelector);
      if (!el) return;
      moveBy(el, btn.getAttribute('data-dir') === 'up' ? -1 : 1, '[data-dir="' + btn.getAttribute('data-dir') + '"]');
    }
    function onKey(e) {
      if (drag) return;
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      var el = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!el || !listEl.contains(el)) return;
      e.preventDefault();
      moveBy(el, e.key === 'ArrowUp' ? -1 : 1, true);
    }

    // ---- pointer drag ----
    var drag = null; // { el, pointerId, grab, startOrder, clientY, raf }

    function layoutDragged() {
      var el = drag.el;
      el.style.transform = '';
      var natural = el.getBoundingClientRect();
      el.style.transform = 'translateY(' + (drag.clientY - drag.grab - natural.top) + 'px)';
    }

    function update() {
      if (!drag) return;
      var el = drag.el;
      el.style.transform = '';
      var r = el.getBoundingClientRect();
      var center = drag.clientY - drag.grab + r.height / 2;
      var others = items().filter(function (x) { return x !== el; });
      var idx = 0;
      others.forEach(function (x) {
        var b = x.getBoundingClientRect();
        if (b.top + b.height / 2 < center) idx++;
      });
      var before = tops();
      if (place(el, idx)) { flip(before, el); refresh(); }
      layoutDragged();
    }

    function autoScroll() {
      if (!drag) return;
      var edge = 70;
      var vh = win.innerHeight || document.documentElement.clientHeight;
      var dy = 0;
      if (drag.clientY < edge) dy = -Math.ceil((edge - Math.max(0, drag.clientY)) / 4);
      else if (drag.clientY > vh - edge) dy = Math.ceil((drag.clientY - (vh - edge)) / 4);
      if (dy) {
        var y0 = win.scrollY;
        win.scrollBy(0, dy);
        if (win.scrollY !== y0) update();
      }
      drag.raf = win.requestAnimationFrame(autoScroll);
    }

    function onDown(e) {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var el = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!el || !listEl.contains(el)) return;
      if (e.target.closest('[data-dir]')) return;
      if (handleSelector && !e.target.closest(handleSelector)) return;
      e.preventDefault();
      var rect = el.getBoundingClientRect();
      drag = { el: el, pointerId: e.pointerId, grab: e.clientY - rect.top, startOrder: getOrder(), clientY: e.clientY, raf: 0 };
      try { listEl.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      el.classList.add('is-dragging');
      document.addEventListener('keydown', docKey);
      listEl.classList.add('is-sorting');
      el.style.transition = 'none';
      el.style.position = 'relative';
      el.style.zIndex = '5';
      el.style.pointerEvents = 'none';
      layoutDragged();
      drag.raf = win.requestAnimationFrame(autoScroll);
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      e.preventDefault();
      drag.clientY = e.clientY;
      update();
    }
    function endDrag(commitIt) {
      if (!drag) return;
      var d = drag;
      drag = null;
      document.removeEventListener('keydown', docKey);
      win.cancelAnimationFrame(d.raf);
      try { listEl.releasePointerCapture(d.pointerId); } catch (err) { /* already released */ }
      var el = d.el;
      el.classList.remove('is-dragging');
      listEl.classList.remove('is-sorting');
      el.style.pointerEvents = '';
      el.style.zIndex = '';
      el.style.position = '';
      if (!reduced) {
        el.style.transition = 'transform 140ms ease';
        el.style.transform = '';
        var done = function () { el.style.transition = ''; el.removeEventListener('transitionend', done); };
        el.addEventListener('transitionend', done);
      } else { el.style.transition = ''; el.style.transform = ''; }
      refresh();
      if (commitIt) {
        var now = getOrder();
        if (now.join() !== d.startOrder.join()) onChange(now);
      }
    }
    function cancelDrag() {
      if (!drag) return;
      var start = drag.startOrder;
      endDrag(false);
      var changed = getOrder().join() !== start.join();
      if (changed) { setOrder(start); onChange(getOrder()); }
    }
    function docKey(e) { if (drag && e.key === 'Escape') { e.preventDefault(); cancelDrag(); } }
    function onUp(e) { if (drag && e.pointerId === drag.pointerId) endDrag(true); }
    function onCancel(e) { if (drag && e.pointerId === drag.pointerId) cancelDrag(); }
    function onSelectStart(e) { if (drag) e.preventDefault(); }

    listEl.addEventListener('pointerdown', onDown);
    listEl.addEventListener('pointermove', onMove);
    listEl.addEventListener('pointerup', onUp);
    listEl.addEventListener('pointercancel', onCancel);
    listEl.addEventListener('click', onClick);
    listEl.addEventListener('keydown', onKey);
    listEl.addEventListener('selectstart', onSelectStart);
    setTouchAction();
    refresh();

    function destroy() {
      if (drag) endDrag(false);
      listEl.removeEventListener('pointerdown', onDown);
      listEl.removeEventListener('pointermove', onMove);
      listEl.removeEventListener('pointerup', onUp);
      listEl.removeEventListener('pointercancel', onCancel);
      listEl.removeEventListener('click', onClick);
      listEl.removeEventListener('keydown', onKey);
      listEl.removeEventListener('selectstart', onSelectStart);
    }

    return { getOrder: getOrder, setOrder: function (arr) { setOrder(arr); }, destroy: destroy, initialOrder: initial.slice() };
  }

  return { moveItem: moveItem, makeSortable: makeSortable };
}));
