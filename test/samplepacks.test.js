'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../lib/config');
const { hashPinSync } = require('../lib/auth');
const { startServer, emitAck, PIN, SECRET } = require('./helpers');

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-packs-'));
  for (const [id, title] of [['_template', 'Template'], ['real-pack', 'Real Pack']]) {
    fs.mkdirSync(path.join(dir, id));
    fs.writeFileSync(path.join(dir, id, 'pack.json'), JSON.stringify({ id, title, theme: 'default', reverent: false }));
    fs.writeFileSync(path.join(dir, id, 'questions.jsonl'), '{"type":"truefalse","q":"Is this a test?","answer":true}\n');
  }
  return dir;
}

const origin = 'https://quiz.example.org';
const prodEnv = (extra = {}) => ({ NODE_ENV: 'production', PUBLIC_ORIGIN: origin, SESSION_SECRET: SECRET, ADMIN_PIN_HASH: hashPinSync(PIN, { N: 1024 }), ...extra });

async function hostFor(env) {
  const dir = makeDir();
  const s = await startServer({ config: loadConfig(env), packsDir: dir, extraHeaders: env.NODE_ENV === 'production' ? { origin } : undefined });
  const host = await s.connect();
  assert.equal((await emitAck(host, 'host:auth', { pin: PIN })).ok, true);
  return { s, host, dir };
}

const ids = async (host) => (await emitAck(host, 'host:packs', {})).packs.map((p) => p.id).sort();
const tryCreate = (host, packId) => emitAck(host, 'host:create', { packId, count: 1, includeSpell: false });

test('SHOW_SAMPLE_PACKS config parsing', () => {
  assert.equal(loadConfig(prodEnv()).SHOW_SAMPLE_PACKS, false);
  assert.equal(loadConfig(prodEnv({ SHOW_SAMPLE_PACKS: '1' })).SHOW_SAMPLE_PACKS, true);
  assert.equal(loadConfig(prodEnv({ SHOW_SAMPLE_PACKS: 'true' })).SHOW_SAMPLE_PACKS, true);
  assert.equal(loadConfig(prodEnv({ SHOW_SAMPLE_PACKS: '0' })).SHOW_SAMPLE_PACKS, false);
  assert.throws(() => loadConfig(prodEnv({ SHOW_SAMPLE_PACKS: 'yes please' })), /SHOW_SAMPLE_PACKS/);
});

test('production hides sample packs and refuses to start one', async () => {
  const { s, host } = await hostFor(prodEnv());
  try {
    assert.deepEqual(await ids(host), ['real-pack']);
    const bad = await tryCreate(host, '_template');
    assert.equal(bad.ok, false);
    assert.ok(!/template/i.test(JSON.stringify(bad)));
    assert.equal((await tryCreate(host, 'real-pack')).ok, true);
  } finally { await s.shutdown(); }
});

test('production with SHOW_SAMPLE_PACKS=1 lists both', async () => {
  const { s, host } = await hostFor(prodEnv({ SHOW_SAMPLE_PACKS: '1' }));
  try {
    assert.deepEqual(await ids(host), ['_template', 'real-pack']);
    assert.equal((await tryCreate(host, '_template')).ok, true);
  } finally { await s.shutdown(); }
});

test('development lists both', async () => {
  const { s, host } = await hostFor({ NODE_ENV: 'development', ADMIN_PIN_HASH: hashPinSync(PIN, { N: 1024 }), SESSION_SECRET: SECRET });
  try {
    assert.deepEqual(await ids(host), ['_template', 'real-pack']);
  } finally { await s.shutdown(); }
});
