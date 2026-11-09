'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/scoring');

const full = { remainingMs: 10000, totalMs: 10000 };
const half = { remainingMs: 5000, totalMs: 10000 };
const none = { remainingMs: 0, totalMs: 10000 };

test('speed factor', () => {
  assert.equal(S.speedFactor(10000, 10000), 1);
  assert.equal(S.speedFactor(5000, 10000), 0.75);
  assert.equal(S.speedFactor(0, 10000), 0.5);
  assert.equal(S.speedFactor(-5, 10000), 0.5);
  assert.equal(S.speedFactor(99999, 10000), 1);
});

test('levenshtein / similarity', () => {
  assert.equal(S.levenshtein('kitten', 'sitting'), 3);
  assert.equal(S.levenshtein('', 'abc'), 3);
  assert.equal(S.levenshtein('abc', 'abc'), 0);
  assert.equal(S.similarity('abc', 'abc'), 1);
  assert.equal(S.similarity('', ''), 1);
  assert.ok(Math.abs(S.similarity('ridvan', 'ridvon') - 5 / 6) < 1e-9);
});

test('single and truefalse', () => {
  const q = { type: 'single', choices: ['a', 'b'], answer: 1 };
  assert.equal(S.scoreAnswer(q, 1, full).points, 1000);
  assert.equal(S.scoreAnswer(q, 1, half).points, 750);
  assert.equal(S.scoreAnswer(q, 1, none).points, 500);
  assert.equal(S.scoreAnswer(q, 0, full).points, 0);
  const tf = { type: 'truefalse', answer: false };
  assert.equal(S.scoreAnswer(tf, false, full).points, 1000);
  assert.equal(S.scoreAnswer(tf, true, full).correct, false);
});

test('multi partial credit', () => {
  const q = { type: 'multi', choices: ['a', 'b', 'c', 'd'], answer: [0, 2] };
  assert.equal(S.scoreAnswer(q, [0, 2], full).points, 1000);
  assert.equal(S.scoreAnswer(q, [0, 2], full).correct, true);
  const part = S.scoreAnswer(q, [0], full);
  assert.equal(part.points, 500);
  assert.equal(part.partial, true);
  assert.equal(S.scoreAnswer(q, [0, 1], full).points, 0);
  assert.equal(S.scoreAnswer(q, [1, 3], full).points, 0);
  assert.equal(S.scoreAnswer(q, [0, 1, 3], full).points, 0);
  assert.equal(S.scoreAnswer(q, [0], half).points, 375);
});

test('order partial credit', () => {
  const q = { type: 'order', items: ['x', 'y', 'z', 'w'], answer: [2, 0, 1, 3] };
  assert.equal(S.scoreAnswer(q, [2, 0, 1, 3], full).points, 1000);
  const p = S.scoreAnswer(q, [2, 0, 3, 1], full);
  assert.equal(p.points, 500);
  assert.equal(p.partial, true);
  assert.equal(S.scoreAnswer(q, [0, 1, 3, 2], full).points, 0);
  assert.equal(S.scoreAnswer(q, [2, 0, 3, 1], half).points, 375);
});

test('spell similarity, diacritics bonus, accept list', () => {
  const q = { type: 'spell', clue: 'c', word: 'Ridván', accept: ['rizvan'] };
  const exact = S.scoreAnswer(q, 'Ridván', full);
  assert.equal(exact.points, 1100);
  assert.equal(exact.matchPct, 100);
  assert.equal(S.scoreAnswer(q, 'ridván', full).points, 1100);
  const noDia = S.scoreAnswer(q, 'ridvan', full);
  assert.equal(noDia.points, 1000);
  assert.equal(noDia.matchPct, 100);
  assert.equal(S.scoreAnswer(q, 'RIDVAN', half).points, 750);
  const near = S.scoreAnswer(q, 'ridvon', full); // o is not next to a on the keyboard: cost 1 of 6
  assert.equal(near.matchPct, 83);
  assert.equal(near.points, 761); // 1000 * (5/6)^1.5
  assert.equal(near.partial, true);
  assert.equal(S.scoreAnswer(q, 'rizvan', full).matchPct, 100);
  assert.equal(S.scoreAnswer(q, 'pppppp', full).points, 0);
  assert.equal(S.scoreAnswer(q, '', full).points, 0);
  assert.equal(S.scoreAnswer(q, ' . ', full).matchPct, 0);
});

test('spell: apostrophes, hyphens, spaces and case are forgiven; only accents earn the bonus', () => {
  const q = { type: 'spell', clue: 'c', word: "Bahá'u'lláh" };
  const plain = S.scoreAnswer(q, 'bahaullah', full);
  assert.equal(plain.correct, true);
  assert.equal(plain.matchPct, 100);
  assert.equal(plain.points, 1000); // no accent bonus
  assert.equal(S.scoreAnswer(q, "Bahá'u'lláh", full).points, 1100);
  assert.equal(S.scoreAnswer(q, 'baháulláh', full).points, 1100); // accents right, apostrophes omitted
  assert.equal(S.scoreAnswer(q, 'BAHAULLAH', full).points, plain.points);
  assert.equal(S.scoreAnswer(q, 'Baha u llah', full).matchPct, 100);
  const hy = { type: 'spell', clue: 'c', word: 'Naw-Rúz' };
  assert.equal(S.scoreAnswer(hy, 'nawruz', full).correct, true);
  assert.equal(S.scoreAnswer(hy, 'Naw Rúz', full).points, 1100);
});

test('spell distance is keyboard-aware', () => {
  const near = S.scoreAnswer({ type: 'spell', clue: 'c', word: 'Riḍván' }, 'Ridvsn', full); // a/s adjacent
  const far = S.scoreAnswer({ type: 'spell', clue: 'c', word: 'Riḍván' }, 'Ridvpn', full); // a/p far apart
  assert.ok(near.points > far.points);
  assert.ok(near.matchPct > far.matchPct);
  assert.equal(S.spellDistance('ridvan', 'ridvsn'), 0.5);
  assert.equal(S.spellDistance('ridvan', 'ridvpn'), 1);
  assert.equal(S.spellDistance('q', 'w'), 0.5); // q-w adjacent
  assert.equal(S.spellDistance('m', 'k'), 0.5); // m-k diagonal
  assert.equal(S.spellDistance('m', 'p'), 1);
  assert.equal(S.spellDistance('1', '2'), 1); // non-letters cost 1
});

test('spell: transposition and doubled letters are cheap', () => {
  assert.equal(S.spellDistance('bab', 'bba'), 0.5);
  assert.ok(S.spellDistance('bab', 'bba') < 2 * S.spellDistance('b', 'p'));
  assert.ok(S.spellDistance('bab', 'bba') < 2); // two plain substitutions
  assert.equal(S.spellDistance('ridvan', 'ridvvan'), 0.5); // extra doubled letter
  assert.equal(S.spellDistance('ridvvan', 'ridvan'), 0.5); // missing doubled letter
  assert.equal(S.spellDistance('ridvan', 'ridxvan'), 1); // ordinary extra letter
  const q = { type: 'spell', clue: 'c', word: 'Báb' };
  assert.ok(S.scoreAnswer(q, 'Bbá', full).points > S.scoreAnswer(q, 'Bxx', full).points);
  assert.equal(S.spellSimilarity('', 'abc'), 0);
  assert.equal(S.foldForSpell("Bahá’u'lláh-X. y"), 'bahaullahxy');
});

test('spell folds apostrophe variants', () => {
  const q = { type: 'spell', clue: 'c', word: "Bahá'u'lláh" };
  assert.equal(S.scoreAnswer(q, 'bahá’u’lláh', full).matchPct, 100);
});

test('browser build of scoring loads in a fake window and matches the Node build', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'public', 'shared');
  const ctx = {};
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ['schema.js', 'scoring.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  assert.equal(typeof ctx.GameScoring.scoreAnswer, 'function');
  const cases = [
    [{ type: 'single', choices: ['a', 'b'], answer: 1 }, 1],
    [{ type: 'truefalse', answer: false }, false],
    [{ type: 'multi', choices: ['a', 'b', 'c', 'd'], answer: [0, 2] }, [0, 1]],
    [{ type: 'order', items: ['x', 'y', 'z'], answer: [2, 0, 1] }, [2, 1, 0]],
    [{ type: 'spell', clue: 'c', word: 'Ridván', accept: ['rizvan'] }, 'ridvon'],
    [{ type: 'spell', clue: 'c', word: 'Ridván' }, 'Ridván'],
  ];
  for (const [q, v] of cases) {
    for (const opts of [full, half, none, { ...half, gentle: true }]) {
      assert.deepEqual(JSON.parse(JSON.stringify(ctx.GameScoring.scoreAnswer(q, v, opts))), S.scoreAnswer(q, v, opts));
    }
  }
  assert.equal(ctx.GameScoring.levenshtein('kitten', 'sitting'), 3);
  assert.equal(ctx.GameScoring.speedFactor(5000, 10000), 0.75);
});

test('spellHint', () => {
  assert.deepEqual(S.spellHint("Bahá'u'lláh"), { hint: "B _ _ _ ' _ ' _ _ _ _", letters: 9 });
  assert.deepEqual(S.spellHint('Ridván'), { hint: 'R _ _ _ _ _', letters: 6 });
  assert.deepEqual(S.spellHint('Naw-Rúz'), { hint: 'N _ _ - _ _ _', letters: 6 });
  assert.deepEqual(S.spellHint('Holy Day'), { hint: 'H _ _ _   _ _ _', letters: 7 });
  assert.deepEqual(S.spellHint('\u1E24aifa'), { hint: '\u1E24 _ _ _ _', letters: 5 }); // first letter keeps its mark
  assert.deepEqual(S.spellHint("'Akk\u00E1"), { hint: "' A _ _ _", letters: 4 }); // leading non-letter, first letter revealed
  assert.deepEqual(S.spellHint('A\u0301b'), { hint: '\u00C1 _', letters: 2 }); // combining marks stay with their letter (NFC)
});
