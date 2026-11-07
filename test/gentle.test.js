'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, emitAck, hostLogin, createRoom, joinPlayer, testConfig, FIXTURES, selFor, GameNames } = require('./helpers');
const { createRoomManager } = require('../lib/rooms');
const { loadPacks } = require('../lib/packs');
const S = require('../lib/scoring');
const PlayState = require('../public/shared/playstate.js');

const anyValue = (q) => (q.type === 'spell' ? 'x' : q.type === 'single' ? 1 : q.type === 'truefalse' ? true : q.type === 'multi' ? [0, 2] : [2, 0, 1]);

const correctValue = (q) => (q.type === 'spell' ? q.word : q.answer);

test('gentle scoring ignores speed', () => {
  const q = { type: 'single', choices: ['a', 'b'], answer: 1 };
  assert.equal(S.scoreAnswer(q, 1, { remainingMs: 10000, totalMs: 10000, gentle: true }).points, 1000);
  assert.equal(S.scoreAnswer(q, 1, { remainingMs: 1, totalMs: 10000, gentle: true }).points, 1000);
  assert.equal(S.scoreAnswer(q, 1, { remainingMs: 1, totalMs: 10000 }).points, 500);
});

test('gentle room: same points regardless of answer time; defaults follow pack.reverent', () => {
  let t = 1000000;
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const m = createRoomManager({ config: testConfig(), packs, emit: { room() {}, host() {}, players() {}, player() {} }, now: () => t });
  try {
    assert.equal(m.createRoom('h0', { packId: 'fixture', count: 1, includeSpell: false }).room.gentle, false);
    assert.equal(m.createRoom('h1', { packId: 'reverent-fx', count: 1, includeSpell: false }).room.gentle, true);
    assert.equal(m.createRoom('h2', { packId: 'reverent-fx', count: 1, includeSpell: false, gentle: false }).room.gentle, false);
    const pts = [];
    for (const wait of [100, 9000]) {
      const { room } = m.createRoom('hg' + wait, { packId: 'fixture', count: 1, includeSpell: false, gentle: true });
      room.questions = [packs.get('fixture').questions.find((x) => x.type === 'single')]; // same question both runs
      const p = m.joinPlayer(room.code, GameNames.compose(selFor(1))).player;
      m.setConnected(room, p.id, +1);
      m.start(room);
      t += wait;
      assert.equal(m.answer(room, p.id, correctValue(room.questions[0])), true);
      pts.push(p.score); // last answer auto-reveals, which applies the score
      assert.equal(m.publicState(room).gentle, true);
    }
    assert.equal(pts[0], pts[1]);
    assert.equal(pts[0], 1000);
    assert.ok(pts[0] > 0);
  } finally { m.shutdown(); }
});

test('host:create validates optional gentle strictly', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const base = { packId: 'fixture', count: 1, includeSpell: false };
    assert.equal(await emitAck(host, 'host:create', { ...base, gentle: 'yes' }, 250), null);
    assert.equal(await emitAck(host, 'host:create', { ...base, gentle: true, x: 1 }, 250), null);
    const ok = await emitAck(host, 'host:create', { ...base, gentle: true });
    assert.equal(ok.ok, true);
    assert.equal((await host.rec.wait('room:state')).gentle, true);
  } finally { await s.shutdown(); }
});

test('host:extend adds 15s, capped at 3, preserves answers and locks', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 2);
    const a = await joinPlayer(s, room.code, 0);
    const b = await joinPlayer(s, room.code, 1);
    assert.equal((await emitAck(host, 'host:extend', {})).ok, false); // lobby
    await emitAck(host, 'host:start', {});
    const q0 = await a.sock.rec.wait('question:show', (x) => x.index === 0);
    const h0 = await host.rec.wait('question:show', (x) => x.index === 0);
    assert.equal((await emitAck(a.sock, 'player:answer', { value: anyValue(q0) })).ok, true);

    assert.equal((await emitAck(b.sock, 'host:extend', {}, 250)), null); // players cannot extend
    assert.equal((await emitAck(host, 'host:extend', {})).ok, true);
    const hq = await host.rec.wait('question:show', (x) => x.index === 0 && x.endsAt > h0.endsAt);
    const pq = await a.sock.rec.wait('question:show', (x) => x.index === 0 && x.endsAt > q0.endsAt);
    assert.equal(hq.endsAt - h0.endsAt, 15000);
    assert.equal(pq.endsAt - q0.endsAt, 15000);
    assert.equal(pq.time, q0.time + 15);
    assert.ok(pq.serverNow >= q0.serverNow);

    // answers survive: a is still locked, progress still counts them, b can still answer
    assert.deepEqual(await emitAck(a.sock, 'player:answer', { value: anyValue(q0) }), { ok: false, already: true });
    assert.equal(PlayState.showLocked(pq, 0), true); // client keeps the lock for the same index
    assert.equal(PlayState.isUpdate(q0, pq), true);
    const prog = host.rec.all.filter((e) => e.ev === 'question:progress').pop().data;
    assert.equal(prog.answered, 1);

    assert.equal((await emitAck(host, 'host:extend', {})).ok, true);
    assert.equal((await emitAck(host, 'host:extend', {})).ok, true);
    assert.equal((await emitAck(host, 'host:extend', {})).ok, false); // cap of 3
    assert.equal((await emitAck(b.sock, 'player:answer', { value: anyValue(q0) })).ok, true);
    await host.rec.wait('question:reveal');
    assert.equal((await emitAck(host, 'host:extend', {})).ok, false); // reveal phase

    // counter resets for the next question
    await emitAck(host, 'host:next', {});
    await host.rec.wait('question:show', (x) => x.index === 1);
    assert.equal((await emitAck(host, 'host:extend', {})).ok, true);
  } finally { await s.shutdown(); }
});

test('host:speak is no longer handled', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    await createRoom(host);
    assert.equal(await emitAck(host, 'host:speak', {}, 250), null);
  } finally { await s.shutdown(); }
});
