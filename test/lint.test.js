'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lintQuestion } = require('../public/shared/lint.js');

const codes = (q) => lintQuestion(q).map((x) => x.code);

test('lint: Birth of the Bab giveaway (long, comma-only correct choice among role-only distractors)', () => {
  const q = { type: 'single', q: 'Who raised the Báb after His father died?', choices: ['A merchant', 'A teacher', 'A neighbour', 'His maternal uncle, Ḥájí Mírzá Siyyid ʻAlí'], answer: 3 };
  const c = codes(q);
  assert.ok(c.includes('long-correct'));
  assert.ok(c.includes('only-comma'));
});

test('lint: balanced single question is clean', () => {
  assert.deepEqual(lintQuestion({ type: 'single', q: 'In which city was the Báb born?', choices: ['Tehran', 'Iṣfahán', 'Shíráz', 'Búshihr'], answer: 2 }), []);
});

test('lint: only digit / parenthesis', () => {
  assert.ok(codes({ type: 'single', q: 'Pick one', choices: ['Red', 'Blue', 'Green (a lot)'], answer: 2 }).includes('only-parenthesis'));
  assert.ok(codes({ type: 'single', q: 'Pick one', choices: ['Red', 'Blue', 'Green 5'], answer: 2 }).includes('only-digit'));
  assert.ok(!codes({ type: 'single', q: 'Pick one', choices: ['Red 1', 'Blue', 'Green 5'], answer: 2 }).includes('only-digit'));
});

test('lint: stem word shared with correct choice only', () => {
  const q = { type: 'single', q: 'Which merchant family raised Him?', choices: ['A merchant family', 'Teachers', 'Priests'], answer: 0 };
  assert.ok(codes(q).includes('stem-overlap'));
  const ok = { type: 'single', q: 'Which merchant family raised Him?', choices: ['A merchant family', 'Another merchant family', 'Priests'], answer: 0 };
  assert.ok(!codes(ok).includes('stem-overlap'));
  // stopwords never count
  assert.ok(!codes({ type: 'single', q: 'Which people were there?', choices: ['There', 'Here', 'Nowhere'], answer: 0 }).includes('stem-overlap'));
});

test('lint: true/false absolutes', () => {
  assert.ok(codes({ type: 'truefalse', q: 'The Báb always travelled alone.', answer: false }).includes('tf-absolute'));
  assert.ok(codes({ type: 'truefalse', q: 'He needed far more schooling.', answer: false }).includes('tf-absolute'));
  assert.deepEqual(codes({ type: 'truefalse', q: 'The Báb was born in Shíráz.', answer: true }), []);
  assert.deepEqual(codes({ type: 'truefalse', q: 'The Báb was a stallion trader.', answer: false }), []);
});

test('lint: order items with sequence words or years', () => {
  assert.ok(codes({ type: 'order', q: 'Order', items: ['Born in Shíráz', 'Later became a merchant', 'Declared His mission'], answer: [0, 1, 2] }).includes('order-sequence'));
  assert.ok(codes({ type: 'order', q: 'Order', items: ['Born 1819', 'Declaration 1844', 'Martyrdom 1850'], answer: [0, 1, 2] }).includes('order-sequence'));
  assert.deepEqual(codes({ type: 'order', q: 'Order', items: ['Birth', 'Marriage', 'Declaration'], answer: [0, 1, 2] }), []);
});

test('lint: multi with shared prefix pattern only on correct choices', () => {
  const q = { type: 'multi', q: 'Which describe the Báb?', choices: ['His title was the Gate', 'His mission was to herald a Manifestation', 'A famous general', 'Founder of a monastery'], answer: [0, 1] };
  assert.ok(codes(q).includes('multi-prefix'));
  const ok = { type: 'multi', q: 'Which describe the Báb?', choices: ['His title was the Gate', 'His mission was to herald', 'His army was large', 'Founder of a monastery'], answer: [0, 1] };
  assert.ok(!codes(ok).includes('multi-prefix'));
});

test('lint: tolerates junk input', () => {
  assert.deepEqual(lintQuestion(null), []);
  assert.deepEqual(lintQuestion({ type: 'spell', clue: 'x', word: 'Báb' }), []);
});
