'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../public/shared/names.js');

const EXCLUDED = [
  [0x1F600, 0x1F64F], [0x1F910, 0x1F92F], [0x1F970, 0x1F97F], [0x1F9D0, 0x1F9DF],
  [0x263A, 0x263A], [0x2639, 0x2639], [0x1F466, 0x1F487], [0x1F574, 0x1F57A],
  [0x1F595, 0x1F595], [0x1F346, 0x1F346], [0x1F351, 0x1F351], [0x1F4A6, 0x1F4A6], [0x1F4A9, 0x1F4A9],
];

test('word lists', () => {
  assert.ok(N.ADJECTIVES.length >= 32 && N.FLOWERS.length >= 32);
  assert.ok(N.combinations() >= 600);
  assert.equal(N.combinations(), N.ADJECTIVES.length * N.FLOWERS.length);
  for (const list of [N.ADJECTIVES, N.FLOWERS]) {
    assert.equal(new Set(list.map((w) => w.toLowerCase())).size, list.length);
    for (const w of list) assert.match(w, /^[A-Z][a-z]+$/);
  }
  assert.equal(new Set([...N.ADJECTIVES, ...N.FLOWERS].map((w) => w.toLowerCase())).size, N.ADJECTIVES.length + N.FLOWERS.length);
});

test('emojis: single code point, unique, none in excluded ranges', () => {
  assert.ok(N.EMOJIS.length >= 36 && N.EMOJIS.length <= 48);
  assert.equal(new Set(N.EMOJIS).size, N.EMOJIS.length);
  for (const e of N.EMOJIS) {
    const cps = Array.from(e);
    assert.equal(cps.length, 1, e);
    const cp = e.codePointAt(0);
    assert.notEqual(cp, 0xFE0F);
    assert.notEqual(cp, 0x200D);
    for (const [lo, hi] of EXCLUDED) assert.ok(cp < lo || cp > hi, `U+${cp.toString(16)} is excluded`);
  }
});

test('compose and random', () => {
  assert.deepEqual(N.compose({ adj: 2, flower: 0, badge: { kind: 'number', value: 42 } }), { name: 'Hopeful Lily', badgeKind: 'number', badgeText: '42', display: 'Hopeful Lily 42' });
  const e = N.compose({ adj: 2, flower: 0, badge: { kind: 'emoji', value: 3 } });
  assert.equal(e.display, N.EMOJIS[3] + ' Hopeful Lily');
  for (const bad of [null, {}, { adj: 99, flower: 0, badge: { kind: 'number', value: 1 } }, { adj: 0, flower: -1, badge: { kind: 'number', value: 1 } },
    { adj: 0, flower: 0, badge: { kind: 'number', value: 0 } }, { adj: 0, flower: 0, badge: { kind: 'number', value: 100 } },
    { adj: 0, flower: 0, badge: { kind: 'emoji', value: 999 } }, { adj: 0.5, flower: 0, badge: { kind: 'number', value: 1 } },
    { adj: 0, flower: 0, badge: { kind: 'text', value: 'x' } }]) assert.equal(N.compose(bad), null);
  for (let i = 0; i < 200; i++) assert.ok(N.compose(N.random()));
});
