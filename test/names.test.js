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
  assert.ok(N.ADJECTIVES.length >= 32 && N.FLOWERS.length >= 23);
  assert.ok(N.combinations() >= 600);
  assert.equal(N.combinations(), N.ADJECTIVES.length * N.FLOWERS.length);
  for (const list of [N.ADJECTIVES, N.FLOWERS]) {
    assert.equal(new Set(list.map((w) => w.toLowerCase())).size, list.length);
    for (const w of list) assert.match(w, /^[A-Z][a-z]+$/);
  }
  for (const w of N.FLOWERS) {
    assert.ok(w.length <= 9, w);
  }
  assert.equal(new Set([...N.ADJECTIVES, ...N.FLOWERS].map((w) => w.toLowerCase())).size, N.ADJECTIVES.length + N.FLOWERS.length);
});

test('emojis: single code point, unique, none in excluded ranges', () => {
  assert.equal(N.EMOJIS.length, 9);
  assert.equal(N.NUMBER_MIN, 0);
  assert.equal(N.NUMBER_MAX, 19);
  const FLOWER_CPS = [0x1F338, 0x1F339, 0x1F33A, 0x1F33B, 0x1F33C, 0x1F337, 0x1FAB7, 0x1F490, 0x1F4AE];
  assert.equal(new Set(N.EMOJIS).size, N.EMOJIS.length);
  for (const e of N.EMOJIS) {
    const cps = Array.from(e);
    assert.equal(cps.length, 1, e);
    const cp = e.codePointAt(0);
    assert.ok(FLOWER_CPS.includes(cp), 'not a flower: ' + e);
    assert.notEqual(cp, 0xFE0F);
    assert.notEqual(cp, 0x200D);
    for (const [lo, hi] of EXCLUDED) assert.ok(cp < lo || cp > hi, `U+${cp.toString(16)} is excluded`);
  }
});

test('compose and random', () => {
  assert.deepEqual(N.compose({ adj: 2, flower: 1, badge: { kind: 'number', value: 12 } }), { name: 'Hopeful Lily', badgeKind: 'number', badgeText: '12', display: 'Hopeful Lily 12' });
  assert.equal(N.compose({ adj: 0, flower: 0, badge: { kind: 'number', value: 0 } }).badgeText, '0'); // zero is valid
  const e = N.compose({ adj: 2, flower: 1, badge: { kind: 'emoji', value: 3 } });
  assert.equal(e.display, N.EMOJIS[3] + ' Hopeful Lily');
  assert.equal(N.compose({ adj: 0, flower: 0, badge: { kind: 'number', value: 20 } }), null);
  for (const bad of [null, {}, { adj: 99, flower: 0, badge: { kind: 'number', value: 1 } }, { adj: 0, flower: -1, badge: { kind: 'number', value: 1 } },
    { adj: 0, flower: 0, badge: { kind: 'number', value: -1 } }, { adj: 0, flower: 0, badge: { kind: 'number', value: 20 } },
    { adj: 0, flower: 0, badge: { kind: 'emoji', value: 999 } }, { adj: 0.5, flower: 0, badge: { kind: 'number', value: 1 } },
    { adj: 0, flower: 0, badge: { kind: 'text', value: 'x' } }]) assert.equal(N.compose(bad), null);
  for (let i = 0; i < 200; i++) assert.ok(N.compose(N.random()));
});
