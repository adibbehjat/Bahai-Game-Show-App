/* Style guide behaviour. DOM APIs only (no innerHTML), CSP-safe. */
(function () {
  'use strict';
  var THEMES = ['default', 'naw-ruz', 'ridvan', 'declaration-bab', 'ascension-bahaullah', 'martyrdom-bab',
    'birth-bab', 'birth-bahaullah', 'covenant', 'ascension-abdulbaha'];
  var COLORS = ['color-bg', 'color-surface', 'color-ink', 'color-ink-soft', 'color-accent', 'color-accent-2',
    'color-success', 'color-danger', 'color-primary', 'color-on-primary', 'color-border', 'color-border-strong',
    'choice-1', 'choice-2', 'choice-3', 'choice-4', 'choice-5', 'choice-6', 'petal-1', 'petal-2', 'petal-3', 'petal-core'];
  var PALETTE = ['parchment', 'ivory', 'walnut', 'soft-sepia', 'gold', 'olive', 'plum', 'terracotta', 'rose', 'sage'];
  var body = document.body;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function swatch(name) {
    var box = el('div', 'sg-sw');
    box.appendChild(el('div', 'sg-sw__chip sg-c-' + name));
    var meta = el('div', 'sg-sw__meta');
    meta.appendChild(el('code', null, '--' + name));
    var val = el('div', 'muted', '');
    val.setAttribute('data-token', name);
    meta.appendChild(val);
    box.appendChild(meta);
    return box;
  }
  function fillGrid(id, names) {
    var g = document.getElementById(id);
    names.forEach(function (n) { g.appendChild(swatch(n)); });
  }
  function refreshValues() {
    var cs = getComputedStyle(body);
    var nodes = document.querySelectorAll('[data-token]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = cs.getPropertyValue('--' + nodes[i].getAttribute('data-token')).trim();
    }
  }
  fillGrid('sg-color-grid', COLORS);
  fillGrid('sg-palette-grid', PALETTE);

  // theme switcher
  var sel = document.getElementById('sg-theme');
  THEMES.forEach(function (t) {
    var o = el('option', null, t); o.value = t; sel.appendChild(o);
  });
  var rev = document.getElementById('sg-reverent');
  function apply() {
    body.setAttribute('data-theme', sel.value);
    if (rev.checked) body.setAttribute('data-reverent', 'true'); else body.removeAttribute('data-reverent');
    setTimeout(refreshValues, 50);
  }
  sel.addEventListener('change', apply);
  rev.addEventListener('change', apply);
  var m = /[?&]theme=([a-z-]+)/.exec(location.search);
  if (m && THEMES.indexOf(m[1]) >= 0) sel.value = m[1];
  if (/[?&]reverent=1/.test(location.search)) rev.checked = true;

  // glyph keys on the choice tiles; blossoms
  document.getElementById('sg-hero-blossom').appendChild(Flower.blossom({ size: 160, variant: 'gold' }));
  var lobby = Flower.blossom({ size: 220, variant: 'plum' });
  lobby.classList.add('blossom--spin');
  document.getElementById('sg-lobby-blossom').appendChild(lobby);
  Flower.decorate(document.getElementById('sg-screen-demo'));

  // art gallery
  var CW = ['gold', 'rose', 'coral', 'plum', 'sage', 'ivory', 'spring'];
  function artImg(src, w, alt) { var i = document.createElement('img'); i.src = src; i.width = w; i.alt = alt; i.height = w; return i; }
  CW.forEach(function (c) {
    document.getElementById('sg-art-heroes').appendChild(artImg('/theme/art/blossom-' + c + '@1x.png', 150, c + ' blossom'));
    document.getElementById('sg-art-petals').appendChild(artImg('/theme/art/petal-' + c + '.png', 72, c + ' petal'));
  });
  ['warm', 'plum', 'green'].forEach(function (n) { document.getElementById('sg-art-sprays').appendChild(artImg('/theme/art/spray-' + n + '@1x.png', 220, n + ' spray')); });

  ['branch-warm', 'branch-plum', 'branch-green'].forEach(function (n) { var i = artImg('/theme/art/' + n + '.png', 220, n); i.height = 103; document.getElementById('sg-art-bits').appendChild(i); });
  ['bud-gold', 'bud-rose', 'bud-coral', 'bud-plum', 'leaf-a', 'leaf-b', 'leaf-c'].forEach(function (n) { document.getElementById('sg-art-bits').appendChild(artImg('/theme/art/' + n + '.png', 90, n)); });
  ['ornament-rule', 'ornament-flourish', 'ornament-corner'].forEach(function (n) { var i = artImg('/theme/art/' + n + '.png', n === 'ornament-corner' ? 60 : 200, n); i.height = n === 'ornament-rule' ? 20 : n === 'ornament-flourish' ? 66 : 60; document.getElementById('sg-art-bits').appendChild(i); });

  // placeholder QR pattern (visual only, not scannable)
  var qr = document.getElementById('sg-qr');
  var NS = 'http://www.w3.org/2000/svg';
  var seed = 11;
  for (var y = 0; y < 21; y++) for (var x = 0; x < 21; x++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var corner = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (corner ? (x % 14 % 6 === 0 || y % 14 % 6 === 0 || (x % 14 > 1 && x % 14 < 5 && y % 14 > 1 && y % 14 < 5)) : (seed >> 8) % 2 === 0) {
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1);
      r.setAttribute('fill', '#000');
      qr.appendChild(r);
    }
  }

  // timer + burst
  var timerEl = document.getElementById('sg-timer-demo');
  var handle = null;
  function startTimer() {
    if (handle) handle.stop();
    handle = Flower.petalTimer(timerEl, { durationMs: 15000, endsAt: Date.now() + 15000 });
  }
  document.getElementById('sg-timer-start').addEventListener('click', startTimer);
  startTimer();
  function doBurst() { Flower.burst(document.getElementById('sg-burst-stage'), { count: 28 }); }
  document.getElementById('sg-burst').addEventListener('click', doBurst);
  document.getElementById('sg-burst-top').addEventListener('click', doBurst);

  // toast
  document.getElementById('sg-toast-btn').addEventListener('click', function () {
    var t = el('div', 'toast', 'Answer received. Well done!');
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2500);
  });

  // choice tiles are selectable in the gallery
  var grid = document.getElementById('sg-choice-grid');
  grid.addEventListener('click', function (e) {
    var c = e.target.closest('.choice'); if (!c) return;
    var all = grid.querySelectorAll('.choice');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-selected');
    c.classList.add('is-selected');
  });

  apply();
})();
