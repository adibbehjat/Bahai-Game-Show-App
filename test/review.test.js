'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../lib/config');
const { hashPinSync } = require('../lib/auth');
const { startServer, emitAck, PIN, SECRET, testConfig, hostLogin, createRoom, joinPlayer } = require('./helpers');

const origin = 'https://quiz.example.org';
const prodEnv = (extra = {}) => ({ NODE_ENV: 'production', PUBLIC_ORIGIN: origin, SESSION_SECRET: SECRET, ADMIN_PIN_HASH: hashPinSync(PIN, { N: 1024 }), ...extra });

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-review-'));
  for (const [id, title] of [['_template', 'Template'], ['real-pack', 'Real Pack']]) {
    fs.mkdirSync(path.join(dir, id));
    fs.writeFileSync(path.join(dir, id, 'pack.json'), JSON.stringify({ id, title, theme: 'default', reverent: false }));
    fs.writeFileSync(path.join(dir, id, 'questions.jsonl'),
      '// comment\n\n{"type":"truefalse","q":"First?","answer":true}\nnot json\n{"type":"single","q":"Pick","choices":["a","b"],"answer":1}\n');
  }
  return dir;
}

test('ISSUES_URL config validation', () => {
  const c = (v) => loadConfig({ NODE_ENV: 'test', ISSUES_URL: v });
  assert.equal(c(undefined).ISSUES_URL, '');
  assert.equal(c('').ISSUES_URL, '');
  assert.equal(c('https://github.com/o/r/issues').ISSUES_URL, 'https://github.com/o/r/issues');
  assert.equal(c('https://github.com/o/r/issues/').ISSUES_URL, 'https://github.com/o/r/issues');
  for (const bad of ['http://github.com/o/r/issues', 'https://github.com/o/r/issues?x=1', 'https://github.com/o/r/issues#a', 'javascript:alert(1)', 'github.com/o/r', 'https://u:p@github.com/x', 'https://']) {
    assert.throws(() => c(bad), /ISSUES_URL/, bad);
  }
});

test('host:review: rejected for unauthenticated sockets and players', async () => {
  const s = await startServer({ config: testConfig({ ISSUES_URL: 'https://github.com/o/r/issues' }), packsDir: makeDir() });
  try {
    const anon = await s.connect();
    assert.equal(await emitAck(anon, 'host:review', { packId: 'real-pack' }, 400), null);
    assert.equal(await emitAck(anon, 'host:packs', {}, 400), null);
    const host = await hostLogin(s);
    const c = await createRoom(host, 'real-pack', 1);
    const { sock: player, res } = await joinPlayer(s, c.code, 1);
    assert.equal(res.ok, true);
    // a joined player gets nothing, even for the host-only packs list
    assert.equal(await emitAck(player, 'host:packs', {}, 400), null);
    assert.equal(await emitAck(player, 'host:review', { packId: 'real-pack' }, 400), null);
  } finally { await s.shutdown(); }
});

test('host:review: authenticated host gets answers, line numbers, issuesUrl; strict validation', async () => {
  const s = await startServer({ config: testConfig({ ISSUES_URL: 'https://github.com/o/r/issues' }), packsDir: makeDir() });
  try {
    const host = await s.connect();
    const auth = await emitAck(host, 'host:auth', { pin: PIN });
    const res = await emitAck(host, 'host:review', { packId: 'real-pack' });
    assert.equal(res.ok, true);
    assert.equal(res.issuesUrl, 'https://github.com/o/r/issues');
    assert.equal(res.pack.meta.id, 'real-pack');
    assert.deepEqual(res.pack.questions.map((q) => q.line), [3, 5]);
    assert.equal(res.pack.questions[1].answer, 1);
    assert.equal((await emitAck(host, 'host:review', { packId: 'nope' })).ok, false);
    for (const bad of [{}, { packId: 'real-pack', x: 1 }, { packId: 5 }, { packId: '../etc' }, { packId: 'X'.repeat(50) }, null, 'real-pack']) {
      assert.equal(await emitAck(host, 'host:review', bad, 300), null);
    }
    // a second socket resuming with the issued token is also allowed
    const again = await s.connect();
    assert.equal((await emitAck(again, 'host:resume', { hostToken: auth.hostToken })).ok, true);
    assert.equal((await emitAck(again, 'host:review', { packId: 'real-pack' })).ok, true);
    // issuesUrl absent from other acks
    assert.ok(!JSON.stringify(await emitAck(host, 'host:packs', {})).includes('github'));
    assert.ok(!JSON.stringify(auth).includes('github'));
  } finally { await s.shutdown(); }
});

test('host:review: empty issuesUrl when unset; production hides sample packs', async () => {
  const s = await startServer({ config: loadConfig(prodEnv()), packsDir: makeDir(), extraHeaders: { origin } });
  try {
    const host = await s.connect();
    await emitAck(host, 'host:auth', { pin: PIN });
    const ok = await emitAck(host, 'host:review', { packId: 'real-pack' });
    assert.equal(ok.issuesUrl, '');
    assert.equal(await emitAck(host, 'host:review', { packId: '_template' }, 500).then((r) => r && r.ok), false);
  } finally { await s.shutdown(); }
  const s2 = await startServer({ config: loadConfig(prodEnv({ SHOW_SAMPLE_PACKS: '1' })), packsDir: makeDir(), extraHeaders: { origin } });
  try {
    const host = await s2.connect();
    await emitAck(host, 'host:auth', { pin: PIN });
    assert.equal((await emitAck(host, 'host:review', { packId: '_template' })).ok, true);
  } finally { await s2.shutdown(); }
});

test('GET /review serves the page with the same CSP as /host', async () => {
  const s = await startServer();
  try {
    const [r, h] = await Promise.all([fetch(s.url + '/review'), fetch(s.url + '/host')]);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /review\.js/);
    assert.equal(r.headers.get('content-security-policy'), h.headers.get('content-security-policy'));
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    const js = await fetch(s.url + '/shared/lint.js');
    assert.equal(js.status, 200);
  } finally { await s.shutdown(); }
});
