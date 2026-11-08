'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PlayState = require('../public/shared/playstate.js');
const { startServer, emitAck, hostLogin, createRoom, selFor, testConfig, FIXTURES } = require('./helpers');
const { createRoomManager } = require('../lib/rooms');
const { loadPacks } = require('../lib/packs');

test('room codes are 4 characters from the unambiguous alphabet', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    assert.match(room.code, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.match(room.joinUrl, new RegExp(`/play\\?room=${room.code}$`));
  } finally { await s.shutdown(); }
});

test('server is strict: lower-case, padded, 3- and 5-character codes are rejected', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const p = await s.connect();
    assert.equal(await emitAck(p, 'player:join', { code: room.code.toLowerCase(), ...selFor(1) }, 250), null);
    assert.equal(await emitAck(p, 'player:join', { code: ` ${room.code} `, ...selFor(1) }, 250), null);
    assert.equal((await emitAck(p, 'player:join', { code: room.code, ...selFor(1) })).ok, true);
    const q = await s.connect();
    assert.equal(await emitAck(q, 'player:join', { code: room.code.slice(0, 3), ...selFor(2) }, 250), null);
    assert.equal(await emitAck(q, 'player:join', { code: room.code + 'A', ...selFor(2) }, 250), null);
    assert.equal(await emitAck(q, 'player:join', { code: 'AB1O', ...selFor(2) }, 250), null); // 0/1/O/I are not in the alphabet
    assert.equal(s.manager.getRoom(room.code).players.size, 1);
  } finally { await s.shutdown(); }
});

test('code collisions are retried; attempts are capped', () => {
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const hooks = { room() {}, host() {}, players() {}, player() {} };
  // Code draws (max 32) come from a queue; everything else (shuffle) returns 0.
  const queue = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
  const randInt = (lo, hi) => (hi === 32 ? queue.shift() : 0);
  const m = createRoomManager({ config: testConfig(), packs, emit: hooks, randInt });
  try {
    const a = m.createRoom('h1', { packId: 'fixture', count: 1, includeSpell: false });
    assert.equal(a.room.code, 'AAAA');
    const b = m.createRoom('h2', { packId: 'fixture', count: 1, includeSpell: false }); // first draw collides with AAAA
    assert.equal(b.ok, true);
    assert.equal(b.room.code, 'BBBB');
  } finally { m.shutdown(); }
  // A stuck RNG always collides: creation fails cleanly instead of looping forever.
  const m2 = createRoomManager({ config: testConfig(), packs, emit: hooks, randInt: () => 0 });
  try {
    assert.equal(m2.createRoom('h1', { packId: 'fixture', count: 1, includeSpell: false }).ok, true);
    assert.equal(m2.createRoom('h2', { packId: 'fixture', count: 1, includeSpell: false }).ok, false);
  } finally { m2.shutdown(); }
});

test('cleanCode uppercases, strips invalid characters and caps at 4', () => {
  assert.equal(PlayState.cleanCode('ab23'), 'AB23');
  assert.equal(PlayState.cleanCode('a-b 2.3'), 'AB23');
  assert.equal(PlayState.cleanCode('o0i1AB'), 'AB'); // O, 0, I, 1 are not in the alphabet
  assert.equal(PlayState.cleanCode('ABCDEFG'), 'ABCD');
  assert.equal(PlayState.cleanCode(''), '');
  assert.equal(PlayState.cleanCode(null), '');
  assert.match(PlayState.cleanCode('k7qm'), /^[A-HJ-NP-Z2-9]{4}$/);
});
