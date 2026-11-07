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
    'Humble', 'Caring', 'Lively', 'Sunny', 'Earnest', 'Noble', 'Tender', 'Glowing',
    'Thankful', 'Peaceful', 'Golden', 'Sincere', 'Upbeat', 'Mindful', 'Valiant', 'Generous'
  ];

  var FLOWERS = [
    'Lily', 'Rose', 'Jasmine', 'Tulip', 'Daisy', 'Iris', 'Lotus', 'Orchid',
    'Peony', 'Poppy', 'Violet', 'Marigold', 'Dahlia', 'Aster', 'Camellia', 'Magnolia',
    'Lilac', 'Zinnia', 'Freesia', 'Gardenia', 'Hyacinth', 'Lavender', 'Sunflower', 'Bluebell',
    'Primrose', 'Clover', 'Daffodil', 'Hibiscus', 'Begonia', 'Azalea', 'Snowdrop', 'Chrysanthemum'
  ];

  // Single code points only (no ZWJ, no U+FE0F). Excluded on purpose: all faces/smileys, people,
  // hands and anything rude. Themes: flowers/plants, gentle animals, birds, fruit, sky, music/art,
  // lanterns, gems, books. Written as escapes so the exact code points are auditable.
  var EMOJI_CODES = [
    0x1F338, 0x1F339, 0x1F33A, 0x1F33B, 0x1F33C, 0x1F337, 0x1FAB7, 0x1F490, 0x1F33F, 0x1F340, 0x1F331, 0x1F332, 0x1F341,
    0x1F98B, 0x1F41D, 0x1F41E, 0x1F422, 0x1F407, 0x1F42C, 0x1F989, 0x1F426, 0x1F9A2, 0x1F99C, 0x1F411,
    0x1F34E, 0x1F350, 0x1F34A, 0x1F34B, 0x1F347, 0x1F353, 0x1F352,
    0x1F319, 0x2B50, 0x1F308, 0x1F31F,
    0x1F3B5, 0x1F3B6, 0x1F3A8, 0x1F3BB, 0x1F3BA,
    0x1F3EE, 0x1FA94, 0x1F48E, 0x1F4D6, 0x1F4DA
  ];
  var EMOJIS = EMOJI_CODES.map(function (c) { return String.fromCodePoint(c); });

  var NUMBER_MIN = 1;
  var NUMBER_MAX = 99;

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
