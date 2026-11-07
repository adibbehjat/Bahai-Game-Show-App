'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../public/shared/schema.js');

const ok = (o) => { const r = S.validateQuestion(o); assert.ok(r.ok, JSON.stringify(r.errors)); return r.value; };
const bad = (o, re) => { const r = S.validateQuestion(o); assert.strictEqual(r.ok, false); if (re) assert.match(r.errors.join('|'), re); };

test('single', () => {
  ok({ type: 'single', q: 'Q?', choices: ['a', 'b'], answer: 1 });
  bad({ type: 'single', q: 'Q?', choices: ['a', 'b'], answer: 2 }, /out of range/);
  bad({ type: 'single', q: 'Q?', choices: ['a'], answer: 0 });
  bad({ type: 'single', q: 'Q?', choices: ['a', 'A'], answer: 0 }, /duplicates/);
  bad({ type: 'single', q: 'Q?', choices: ['a', 'b'], answer: '1' });
  bad({ type: 'single', q: 'Q?', choices: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], answer: 0 });
  bad({ type: 'single', q: 'x'.repeat(281), choices: ['a', 'b'], answer: 0 }, /too long/);
});
test('multi', () => {
  ok({ type: 'multi', q: 'Q?', choices: ['a', 'b', 'c'], answer: [0, 2] });
  bad({ type: 'multi', q: 'Q?', choices: ['a', 'b'], answer: [] }, /at least one/);
  bad({ type: 'multi', q: 'Q?', choices: ['a', 'b'], answer: [0, 0] }, /more than once/);
  bad({ type: 'multi', q: 'Q?', choices: ['a', 'b'], answer: [5] }, /out of range/);
  bad({ type: 'multi', q: 'Q?', choices: ['a', 'b'], answer: 0 });
});
test('truefalse', () => {
  ok({ type: 'truefalse', q: 'Q?', answer: false });
  bad({ type: 'truefalse', q: 'Q?', answer: 'true' });
});
test('order', () => {
  ok({ type: 'order', q: 'Q?', items: ['a', 'b', 'c'], answer: [2, 0, 1] });
  bad({ type: 'order', q: 'Q?', items: ['a', 'b', 'c'], answer: [0, 0, 1] }, /permutation/);
  bad({ type: 'order', q: 'Q?', items: ['a', 'b', 'c'], answer: [0, 1] });
  bad({ type: 'order', q: 'Q?', items: ['a', 'b'], answer: [0, 1] });
  bad({ type: 'order', q: 'Q?', items: ['a', 'b', 'c'], answer: [0, 1, 3] });
});
test('spell', () => {
  const v = ok({ type: 'spell', clue: 'c', word: 'café', accept: ['cafè s'] });
  assert.strictEqual(v.word, 'café');
  ok({ type: 'spell', clue: 'c', word: "O'Neil-Smith" });
  bad({ type: 'spell', clue: 'c', word: 'abc123' }, /letters/);
  bad({ type: 'spell', clue: 'c', word: '' });
  bad({ type: 'spell', clue: 'c', word: 'abc', accept: ['a', 'b', 'c', 'd', 'e', 'f'] }, /too many/);
  bad({ type: 'spell', clue: 'c', word: 'abc', accept: ['ABC'] }, /duplicates/);
});
test('common fields and unknown keys', () => {
  const v = ok({ type: 'truefalse', q: '  Q \n ?  ', answer: true, time: 10, difficulty: 'hard', explanation: 'e', source: 's' });
  assert.strictEqual(v.q, 'Q ?');
  bad({ type: 'truefalse', q: 'Q', answer: true, extra: 1 }, /unknown field/);
  bad({ type: 'truefalse', q: 'Q', answer: true, choices: ['a'] }, /unknown field/);
  bad({ type: 'truefalse', q: 'Q', answer: true, time: 9 });
  bad({ type: 'truefalse', q: 'Q', answer: true, time: 20.5 });
  bad({ type: 'truefalse', q: 'Q', answer: true, difficulty: 'x' });
  bad({ type: 'nope' });
  bad(null); bad([]); bad('x');
  bad(JSON.parse('{"type":"truefalse","q":"Q","answer":true,"__proto__":1}'), /unknown field/);
});
test('packs', () => {
  assert.ok(S.validatePack({ id: 'a-b', title: 'T', theme: 'covenant' }).ok);
  assert.ok(S.validatePack({ id: '_t', title: 'T', opening: { text: 'x', source: 'y' } }).ok);
  assert.ok(!S.validatePack({ id: 'Bad', title: 'T' }).ok);
  assert.ok(!S.validatePack({ id: 'a', title: 'T', theme: 'zzz' }).ok);
  assert.ok(!S.validatePack({ id: 'a', title: 'T', foo: 1 }).ok);
  assert.ok(!S.validatePack({ id: 'a', title: 'T', opening: { text: 'x', bogus: 1 } }).ok);
});
test('normalize and fold', () => {
  assert.strictEqual(S.normalizeText(' a​b \t\n c '), 'ab c');
  assert.strictEqual(S.normalizeText('é'), 'é');
  assert.strictEqual(S.foldForCompare('Café'), 'cafe');
  assert.strictEqual(S.foldForCompare('Naïve'), 'naive');
  assert.strictEqual(S.foldForCompare('Bahá’í'), S.foldForCompare("BAHA'I"));
  assert.strictEqual(S.foldForCompare("Baʻa"), "ba'a");
});
