/*
 * flower.js - chrysanthemum art driven by the PNG set in /theme/art/ (UMD, window.Flower).
 * DOM-only: createElement / createElementNS / setAttribute. No innerHTML, no style attributes
 * (strict CSP; images are same-origin).
 *
 * API (CONTRACT section 5, unchanged):
 *   Flower.blossom({petals, layers, size, colors, seed}) -> <img class="blossom">
 *       Picks a hero blossom: opts.variant | opts.colors[0] (a colourway name) | opts.seed (varies) | the theme's hero.
 *   Flower.petalTimer(container, {durationMs, endsAt}) -> {stop()}
 *   Flower.burst(container, {count})
 *   Flower.decorate(rootEl) -> corner sprays + drifting petals
 * Replace any PNG in /theme/art/ (see art/README.md) and this file needs no change.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Flower = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var ART = '/theme/art/';
  var COLORWAYS = ['gold', 'rose', 'coral', 'plum', 'sage', 'ivory', 'spring'];
  var THEME_ART = {
    'default': { hero: 'gold', spray: 'warm' },
    'naw-ruz': { hero: 'spring', spray: 'green' },
    'ridvan': { hero: 'rose', spray: 'warm' },
    'birth-bab': { hero: 'coral', spray: 'warm' },
    'birth-bahaullah': { hero: 'gold', spray: 'warm' },
    'declaration-bab': { hero: 'plum', spray: 'plum' },
    'covenant': { hero: 'sage', spray: 'green' },
    'martyrdom-bab': { hero: 'ivory', spray: 'plum' },
    'ascension-bahaullah': { hero: 'ivory', spray: 'plum' },
    'ascension-abdulbaha': { hero: 'ivory', spray: 'plum' }
  };
  var BURST_MIX = ['gold', 'rose', 'coral', 'ivory'];

  function svgEl(name, attrs) {
    var el = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, String(attrs[k]));
    return el;
  }
  function round(n) { return Math.round(n * 100) / 100; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function jit(r, amt) { return (r() - 0.5) * 2 * amt; }

  function prefersReducedMotion() {
    return !!(typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function isReverent() {
    if (typeof document === 'undefined') return false;
    var el = document.querySelector('[data-reverent]');
    return !!(el && el.getAttribute('data-reverent') !== 'false');
  }
  function isQuiet() { return prefersReducedMotion() || isReverent(); }

  // ---------- art lookup ----------
  function themeArt() {
    var t = document.body && document.body.getAttribute('data-theme');
    return THEME_ART[t] || THEME_ART['default'];
  }
  function heroUrls(cw) { return { x1: ART + 'blossom-' + cw + '@1x.png', x2: ART + 'blossom-' + cw + '.png' }; }
  function sprayUrls(n) { return { x1: ART + 'spray-' + n + '@1x.png', x2: ART + 'spray-' + n + '.png' }; }
  function petalUrls(cw) { return { x1: ART + 'petal-' + cw + '.png', x2: ART + 'petal-' + cw + '@2x.png' }; }
  function urlsFor(kind, name) {
    return kind === 'hero' ? heroUrls(name) : kind === 'spray' ? sprayUrls(name) : petalUrls(name);
  }
  function themeName(kind) { var a = themeArt(); return kind === 'spray' ? a.spray : a.hero; }

  function setImgSrc(img, kind, name) {
    var u = urlsFor(kind, name);
    img.setAttribute('src', u.x1);
    img.setAttribute('srcset', u.x1 + ' 1x, ' + u.x2 + ' 2x');
  }
  function artImg(kind, fixedName, cls) {
    var img = document.createElement('img');
    img.setAttribute('alt', '');
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute('decoding', 'async');
    img.setAttribute('draggable', 'false');
    if (cls) img.className = cls;
    img.setAttribute('data-art', kind);
    if (fixedName) img.setAttribute('data-art-name', fixedName);
    setImgSrc(img, kind, fixedName || themeName(kind));
    return img;
  }

  // Re-skin theme-following art when body[data-theme] changes.
  var observing = false;
  function refreshTheme() {
    var nodes = document.querySelectorAll('[data-art]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.getAttribute('data-art-name')) continue;
      var kind = n.getAttribute('data-art');
      if (n.namespaceURI === NS) n.setAttribute('href', urlsFor(kind, themeName(kind)).x2);
      else setImgSrc(n, kind, themeName(kind));
    }
  }
  function observeTheme() {
    if (observing || typeof MutationObserver === 'undefined' || !document.body) return;
    observing = true;
    new MutationObserver(refreshTheme).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ---------- blossom ----------
  function blossom(opts) {
    opts = opts || {};
    var size = opts.size || 120;
    var name = null;
    if (opts.variant && COLORWAYS.indexOf(opts.variant) >= 0) name = opts.variant;
    else if (opts.colors && opts.colors.length && COLORWAYS.indexOf(opts.colors[0]) >= 0) name = opts.colors[0];
    else if (opts.seed != null) name = COLORWAYS[Math.abs(Math.floor(opts.seed)) % COLORWAYS.length];
    var img = artImg('hero', name, 'blossom');
    img.setAttribute('width', size);
    img.setAttribute('height', size);
    observeTheme();
    return img;
  }

  // ---------- petal timer ----------
  /**
   * container should have class "timer". A ring of petal sprites around a hero blossom; the petals
   * fall and fade one by one as time runs out. endsAt is Date.now()-style client-clock epoch ms.
   */
  function petalTimer(container, opts) {
    opts = opts || {};
    var now = Date.now();
    var endsAt = typeof opts.endsAt === 'number' ? opts.endsAt : now + (opts.durationMs || 20000);
    var duration = opts.durationMs || Math.max(1, endsAt - now);
    while (container.firstChild) container.removeChild(container.firstChild);
    var reduced = prefersReducedMotion();
    observeTheme();

    var ta = themeArt();
    var svg = svgEl('svg', { 'class': 'timer__svg', viewBox: '-100 -100 200 200', width: '100%', height: '100%', 'aria-hidden': 'true', focusable: 'false' });
    var N = 16, R0 = 30, SZ = 72, rr = rng(99);
    var order = [], dirs = [];
    var petalHref = petalUrls(ta.hero).x2;
    var ringG = svgEl('g');
    for (var i = 0; i < N; i++) {
      var ang = i * (360 / N) + jit(rr, 3);
      var im = svgEl('image', {
        'data-art': 'petal', href: petalHref, x: -SZ / 2, y: round(-SZ * 122 / 128), width: SZ, height: SZ,
        preserveAspectRatio: 'xMidYMid meet'
      });
      var g = svgEl('g');
      g.appendChild(im);
      ringG.appendChild(g);
      order.push({ el: g, ang: ang });
    }
    // fall order: alternate sides so the flower thins evenly (deterministic shuffle)
    order.sort(function () { return rr() - 0.5; });
    order.forEach(function () { dirs.push({ dx: jit(rr, 14), dy: 26 + rr() * 22, rot: jit(rr, 80) }); });
    svg.appendChild(ringG);
    var hero = svgEl('image', { 'data-art': 'hero', href: heroUrls(ta.hero).x2, x: -46, y: -46, width: 92, height: 92 });
    svg.appendChild(hero);
    svg.appendChild(svgEl('circle', { 'class': 'timer__disc', cx: 0, cy: 0, r: 19 }));
    var secs = svgEl('text', { 'class': 'timer__seconds', x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 22 });
    secs.textContent = String(Math.ceil(Math.max(0, endsAt - now) / 1000));
    svg.appendChild(secs);
    container.setAttribute('role', 'timer');
    container.appendChild(svg);

    var fallWindow = Math.min(900 / duration, 1 / N);
    var raf = 0, stopped = false, lastSecs = -1;
    function place(i, p) {
      var o = order[i], d = dirs[i];
      o.el.setAttribute('transform', 'translate(' + round(d.dx * p) + ' ' + round(d.dy * p * p) + ') rotate(' + round(o.ang + d.rot * p) + ') translate(0 ' + -R0 + ')');
      o.el.setAttribute('opacity', round(1 - p));
    }
    for (var k = 0; k < N; k++) place(k, 0);
    function frame() {
      if (stopped) return;
      var remaining = Math.max(0, endsAt - Date.now());
      var f = remaining / duration;
      var s = Math.ceil(remaining / 1000);
      if (s !== lastSecs) {
        lastSecs = s;
        secs.textContent = String(s);
        container.setAttribute('aria-label', s + (s === 1 ? ' second left' : ' seconds left'));
      }
      for (var j = 0; j < N; j++) {
        var start = (N - 1 - j) / N + fallWindow;
        var p = reduced ? (f < start ? 1 : 0) : clamp((start - f) / fallWindow, 0, 1);
        place(j, p);
      }
      if (remaining > 0) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { stop: function () { stopped = true; if (raf) cancelAnimationFrame(raf); } };
  }

  // ---------- burst ----------
  /** Petal-sprite burst from the container's centre. No-op for reduced motion / reverent. */
  function burst(container, opts) {
    if (!container || isQuiet()) return;
    opts = opts || {};
    var count = clamp(parseInt(opts.count, 10) || 24, 1, 80);
    var rect = container.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    if (window.getComputedStyle(container).position === 'static') container.classList.add('burst-host');

    var holder = document.createElement('div');
    holder.className = 'burst-layer';
    holder.setAttribute('aria-hidden', 'true');
    var layer = svgEl('svg', { viewBox: '0 0 ' + round(w) + ' ' + round(h), preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    holder.appendChild(layer);
    container.appendChild(holder);

    var mix = BURST_MIX.slice();
    var ta = themeArt().hero;
    if (mix.indexOf(ta) < 0) mix.push(ta);
    var r = rng((Date.now() & 0xffff) + 13);
    var cx = w / 2, cy = h / 2, spread = Math.max(w, h) * 0.55 + 120, items = [];
    for (var i = 0; i < count; i++) {
      var sz = 36 + r() * 36;
      var g = svgEl('g');
      g.appendChild(svgEl('image', { href: petalUrls(mix[i % mix.length]).x1, x: round(-sz / 2), y: round(-sz * 0.95), width: round(sz), height: round(sz) }));
      layer.appendChild(g);
      var a = -Math.PI / 2 + jit(r, Math.PI * 0.95);
      items.push({ g: g, vx: Math.cos(a), vy: Math.sin(a), dist: spread * (0.35 + r() * 0.65), spin: jit(r, 540), rot0: r() * 360, delay: r() * 120 });
    }
    var T = 1900, t0 = performance.now();
    function step(t) {
      var el = t - t0, alive = false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var p = clamp((el - it.delay) / T, 0, 1);
        if (p < 1) alive = true;
        var e = 1 - Math.pow(1 - p, 3);
        it.g.setAttribute('transform', 'translate(' + round(cx + it.vx * it.dist * e) + ' ' + round(cy + it.vy * it.dist * e + 170 * p * p) + ') rotate(' + round(it.rot0 + it.spin * p) + ')');
        it.g.setAttribute('opacity', round(p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4));
      }
      if (alive) requestAnimationFrame(step);
      else if (holder.parentNode) holder.parentNode.removeChild(holder);
    }
    requestAnimationFrame(step);
  }

  // ---------- decorate ----------
  /** Corner sprays + drifting petal sprites. Idempotent. */
  function decorate(rootEl, opts) {
    if (!rootEl || rootEl.getAttribute('data-decorated') === 'true') return rootEl;
    opts = opts || {};
    rootEl.setAttribute('data-decorated', 'true');
    observeTheme();
    // Decoration lives on its own clipped, click-through layer, so the root never gets overflow:hidden
    // (body/html must stay scrollable). On <body>/<html> the layer is fixed to the viewport.
    var isPage = rootEl === document.body || rootEl === document.documentElement;
    if (!isPage) rootEl.classList.add('has-flourish');
    var layer = document.createElement('div');
    layer.className = 'decor-layer' + (isPage ? ' decor-layer--fixed' : '');
    layer.setAttribute('aria-hidden', 'true');
    ['tl', 'tr', 'bl', 'br'].forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'flourish flourish--' + c;
      d.setAttribute('aria-hidden', 'true');
      d.appendChild(artImg('spray', null, 'flourish__img'));
      layer.appendChild(d);
    });
    if (opts.drift !== false) {
      for (var n = 1; n <= 6; n++) {
        var p = document.createElement('div');
        p.className = 'drift drift--' + n;
        p.setAttribute('aria-hidden', 'true');
        p.appendChild(artImg('petal', COLORWAYS[(n * 2) % COLORWAYS.length], null));
        layer.appendChild(p);
      }
    }
    rootEl.insertBefore(layer, rootEl.firstChild);
    return rootEl;
  }

  return { blossom: blossom, petalTimer: petalTimer, burst: burst, decorate: decorate, isQuiet: isQuiet, themeArt: themeArt };
});
