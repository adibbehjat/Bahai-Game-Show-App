'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPacks, listPacks } = require('../lib/packs.js');

function mk() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
  const w = (rel, txt) => { const p = path.join(d, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
  return { d, w };
}

test('loadPacks skips bad lines and bad packs', () => {
  const { d, w } = mk();
  w('good/pack.json', JSON.stringify({ id: 'good', title: 'Good' }));
  w('good/questions.jsonl', [
    '// comment', '', '{"type":"truefalse","q":"ok?","answer":true}', '{not json',
    '{"type":"single","q":"x","choices":["a","b"],"answer":5}', '{"type":"truefalse","q":"2?","answer":false,"zzz":1}',
    '{"type":"spell","clue":"c","word":"abc"}'].join('\n'));
  w('mismatch/pack.json', JSON.stringify({ id: 'other', title: 'X' }));
  w('mismatch/questions.jsonl', '');
  w('BadName/pack.json', JSON.stringify({ id: 'badname', title: 'X' }));
  w('nopack/questions.jsonl', '');
  w('_under/pack.json', JSON.stringify({ id: '_under', title: 'U' }));
  w('_under/questions.jsonl', '{"type":"truefalse","q":"q","answer":true}');
  fs.symlinkSync(path.join(d, 'good'), path.join(d, 'link'));
  const logs = [];
  const orig = console.warn; console.warn = (m) => logs.push(m);
  let packs;
  try { packs = loadPacks(d); } finally { console.warn = orig; }
  assert.deepStrictEqual([...packs.keys()].sort(), ['_under', 'good']);
  assert.strictEqual(packs.get('good').questions.length, 2);
  assert.ok(logs.some((l) => l.startsWith('good/questions.jsonl:5:')), logs.join('\n'));
  assert.ok(logs.some((l) => l.startsWith('good/questions.jsonl:6:')));
  assert.ok(logs.some((l) => l.startsWith('good/questions.jsonl:4:')));
  const list = listPacks(packs);
  const g = list.find((p) => p.id === 'good');
  assert.deepStrictEqual(g.counts, { total: 2, byType: { truefalse: 1, spell: 1 } });
  assert.strictEqual(g.reverent, false);
  fs.rmSync(d, { recursive: true, force: true });
});

test('loadPacks caps questions per pack', () => {
  const { d, w } = mk();
  w('big/pack.json', JSON.stringify({ id: 'big', title: 'Big' }));
  w('big/questions.jsonl', Array(600).fill('{"type":"truefalse","q":"q","answer":true}').join('\n'));
  const orig = console.warn; console.warn = () => {};
  let packs; try { packs = loadPacks(d); } finally { console.warn = orig; }
  assert.strictEqual(packs.get('big').questions.length, 500);
  fs.rmSync(d, { recursive: true, force: true });
});

test('bundled packs load cleanly', () => {
  const errs = [];
  const packs = loadPacks(path.join(__dirname, '..', 'questions'), { onError: (f, l, m) => errs.push(`${f}:${l}:${m}`) });
  assert.deepStrictEqual(errs, []);
  assert.ok(packs.has('_template') && packs.has('_reverent-test'));
});
