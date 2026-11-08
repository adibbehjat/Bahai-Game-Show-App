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

// ---- examples, docs and JSON Schema ----
const fs = require('node:fs');
const path = require('node:path');
const FG = require('../public/shared/format-guide.js');
const DOCS = path.join(__dirname, '..', 'docs');

test('EXAMPLES all validate and cover every type at least twice', () => {
  assert.ok(Array.isArray(S.EXAMPLES));
  S.EXAMPLES.forEach((e) => ok(e));
  S.TYPES.forEach((t) => assert.ok(S.EXAMPLES.filter((e) => e.type === t).length >= 2, 'examples for ' + t));
  S.EXAMPLES.forEach((e) => assert.strictEqual(e.source, 'TEMPLATE — replace'));
  assert.ok(S.validatePack(S.PACK_EXAMPLE).ok);
  const tpl = S.templateJsonl().split('\n').filter(Boolean);
  assert.ok(tpl[0].startsWith('//'));
  assert.strictEqual(tpl.filter((l) => !l.startsWith('//')).length, S.EXAMPLES.length);
});

test('QUESTION-FORMAT.md limits match LIMITS and doc is up to date', () => {
  const md = fs.readFileSync(path.join(DOCS, 'QUESTION-FORMAT.md'), 'utf8');
  Object.keys(S.LIMITS).forEach((k) => {
    const m = md.match(new RegExp('\\|\\s*`' + k + '`\\s*\\|\\s*(\\d+)\\s*\\|'));
    assert.ok(m, 'doc row for limit ' + k);
    assert.strictEqual(Number(m[1]), S.LIMITS[k], 'doc value for ' + k);
  });
  assert.strictEqual(md, FG.toMarkdown(), 'run: node scripts/build-format-doc.js');
  S.EXAMPLES.forEach((e) => assert.ok(md.includes(JSON.stringify(e))));
});

// minimal JSON Schema subset validator (no dependencies)
function jv(schema, v) {
  if (schema.oneOf) return schema.oneOf.filter((s) => jv(s, v)).length === 1;
  if ('const' in schema && v !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(v)) return false;
  if (schema.type) {
    const t = schema.type;
    const okType = t === 'object' ? (v !== null && typeof v === 'object' && !Array.isArray(v))
      : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t;
    if (!okType) return false;
  }
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && v.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && v.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) return false;
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) return false;
    if (schema.maximum !== undefined && v > schema.maximum) return false;
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && v.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) return false;
    if (schema.items && !v.every((x) => jv(schema.items, x))) return false;
  }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    if (schema.required && !schema.required.every((k) => k in v)) return false;
    const props = schema.properties || {};
    if (schema.additionalProperties === false && !Object.keys(v).every((k) => k in props)) return false;
    if (!Object.keys(props).every((k) => !(k in v) || jv(props[k], v[k]))) return false;
  }
  return true;
}

test('question.schema.json accepts examples, rejects bad lines, and matches the generator', () => {
  const file = JSON.parse(fs.readFileSync(path.join(DOCS, 'question.schema.json'), 'utf8'));
  assert.deepStrictEqual(file, FG.jsonSchema());
  assert.strictEqual(file.$schema, 'https://json-schema.org/draft/2020-12/schema');
  S.EXAMPLES.forEach((e) => assert.ok(jv(file, e), JSON.stringify(e)));
  [
    { type: 'single', q: 'Q', choices: ['a', 'b'], answer: 6 },
    { type: 'single', q: 'Q', choices: ['a'], answer: 0 },
    { type: 'multi', q: 'Q', choices: ['a', 'b'], answer: [] },
    { type: 'truefalse', q: 'Q', answer: 'true' },
    { type: 'order', q: 'Q', items: ['a', 'b'], answer: [0, 1] },
    { type: 'spell', clue: 'c', word: 'abc123' },
    { type: 'spell', clue: 'c', word: 'abc', extra: 1 },
    { type: 'nope' }, { q: 'no type' }
  ].forEach((bad) => assert.ok(!jv(file, bad), JSON.stringify(bad)));
});
