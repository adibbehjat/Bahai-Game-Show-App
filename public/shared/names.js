/* Generated player names - UMD: window.GameNames in browsers, module.exports in Node. Zero deps.
   Players never type a name: they pick indices into these lists and the server composes the name. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameNames = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ADJECTIVES = [
    'Kindful', 'Trusty', 'Hopeful', 'Joyous', 'Radiant', 'Gentle', 'Steadfast', 'Faithful',
    'Merry', 'Serene', 'Bright', 'Gracious', 'Loyal', 'Brave', 'Cheerful', 'Patient',
    'Humble', 'Caring', 'Lively', 'Sunny', 'Warm', 'Noble', 'Tender', 'Glowing',
    'Thankful', 'Peaceful', 'Golden', 'Sincere', 'Upbeat', 'Mindful', 'Wise', 'Generous'
  ];

  var FLOWERS = [
    'Rose', 'Lily', 'Daisy', 'Tulip', 'Iris', 'Lotus', 'Poppy', 'Violet',
    'Lilac', 'Aster', 'Clover', 'Daffodil', 'Sunflower', 'Bluebell', 'Primrose', 'Jasmine',
    'Marigold', 'Orchid', 'Peony', 'Snowdrop', 'Lavender', 'Buttercup', 'Pansy', 'Cosmos', 'Heather'
  ];

  // Single code points only (no ZWJ, no U+FE0F). Excluded on purpose: all faces/smileys, people,
  // hands and anything rude. Flowers only. Written as escapes so the exact code points are auditable.
  var EMOJI_CODES = [0x1F338, 0x1F339, 0x1F33A, 0x1F33B, 0x1F33C, 0x1F337, 0x1FAB7, 0x1F490, 0x1F4AE];
  var EMOJIS = EMOJI_CODES.map(function (c) { return String.fromCodePoint(c); });

  var NUMBER_MIN = 0;
  var NUMBER_MAX = 19;

  function isIdx(v, len) { return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < len; }

  function compose(sel) {
    if (!sel || typeof sel !== 'object' || !isIdx(sel.adj, ADJECTIVES.length) || !isIdx(sel.flower, FLOWERS.length)) return null;
    var b = sel.badge;
    if (!b || typeof b !== 'object') return null;
    var name = ADJECTIVES[sel.adj] + ' ' + FLOWERS[sel.flower];
    if (b.kind === 'emoji' && isIdx(b.value, EMOJIS.length)) {
      return { name: name, badgeKind: 'emoji', badgeText: EMOJIS[b.value], display: EMOJIS[b.value] + ' ' + name };
    }
    if (b.kind === 'number' && typeof b.value === 'number' && Number.isInteger(b.value) && b.value >= NUMBER_MIN && b.value <= NUMBER_MAX) {
      return { name: name, badgeKind: 'number', badgeText: String(b.value), display: name + ' ' + b.value };
    }
    return null;
  }

  function combinations() { return ADJECTIVES.length * FLOWERS.length; }

  function pick(rng, n) { return Math.min(n - 1, Math.floor(rng() * n)); }

  function random(rng) {
    rng = rng || Math.random;
    var useEmoji = rng() < 0.5;
    return {
      adj: pick(rng, ADJECTIVES.length),
      flower: pick(rng, FLOWERS.length),
      badge: useEmoji
        ? { kind: 'emoji', value: pick(rng, EMOJIS.length) }
        : { kind: 'number', value: NUMBER_MIN + pick(rng, NUMBER_MAX - NUMBER_MIN + 1) }
    };
  }

  return {
    ADJECTIVES: ADJECTIVES, FLOWERS: FLOWERS, EMOJIS: EMOJIS,
    NUMBER_MIN: NUMBER_MIN, NUMBER_MAX: NUMBER_MAX,
    combinations: combinations, compose: compose, random: random
  };
}));
