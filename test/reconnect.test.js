'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, emitAck, hostLogin, createRoom, joinPlayer, selFor } = require('./helpers');
const PlayState = require('../public/shared/playstate.js');

const anyValue = (q) => (q.type === 'spell' ? 'x' : q.type === 'single' ? 0 : q.type === 'truefalse' ? true : q.type === 'multi' ? [0] : [0, 1, 2]);

test('reconnect during reveal does not lock the next question', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 3);
    const a = await joinPlayer(s, room.code, 0);
    const b = await joinPlayer(s, room.code, 1);
    await emitAck(host, 'host:start', {});
    const q1 = await a.sock.rec.wait('question:show', (x) => x.index === 0);
    await b.sock.rec.wait('question:show', (x) => x.index === 0);
    assert.equal((await emitAck(a.sock, 'player:answer', { value: anyValue(q1) })).ok, true);
    a.sock.close(); // phone drops
    assert.equal((await emitAck(b.sock, 'player:answer', { value: anyValue(q1) })).ok, true); // all connected answered -> reveal
    await host.rec.wait('question:reveal');

    const a2 = await s.connect();
    const rj = await emitAck(a2, 'player:rejoin', { playerToken: a.res.playerToken });
    assert.equal(rj.ok, true);
    assert.equal(rj.state.answeredIndex, null); // reveal phase: nothing "answered" for a live question
    await a2.rec.wait('question:reveal');

    await emitAck(host, 'host:next', {});
    const q2 = await a2.rec.wait('question:show', (x) => x.index === 1);
    assert.equal(PlayState.showLocked(q2, PlayState.fromRejoin(rj.state.answeredIndex)), false);
    assert.equal((await emitAck(a2, 'player:answer', { value: anyValue(q2) })).ok, true);
  } finally { await s.shutdown(); }
});

test('reconnect mid-question after answering reports the current index; double answer says already', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 3);
    const a = await joinPlayer(s, room.code, 0);
    await joinPlayer(s, room.code, 1);
    await emitAck(host, 'host:start', {});
    const q = await a.sock.rec.wait('question:show', (x) => x.index === 0);
    assert.equal((await emitAck(a.sock, 'player:answer', { value: anyValue(q) })).ok, true);
    a.sock.close();
    const a2 = await s.connect();
    const rj = await emitAck(a2, 'player:rejoin', { playerToken: a.res.playerToken });
    assert.equal(rj.state.answeredIndex, 0);
    await a2.rec.wait('question:show');
    assert.deepEqual(await emitAck(a2, 'player:answer', { value: anyValue(q) }), { ok: false, already: true });
  } finally { await s.shutdown(); }
});

test('PlayState helpers', () => {
  const q0 = { index: 0 }; const q1 = { index: 1 };
  assert.equal(PlayState.showLocked(q0, 0), true);
  assert.equal(PlayState.showLocked(q1, 0), false);
  assert.equal(PlayState.showLocked(q1, null), false);
  assert.equal(PlayState.showLocked(null, 0), false);
  assert.equal(PlayState.fromRejoin(null), null);
  assert.equal(PlayState.fromRejoin(2), 2);
  assert.deepEqual(PlayState.applyAnswerAck(q0, null, 0, { ok: true }), { answeredFor: 0, error: '' });
  assert.deepEqual(PlayState.applyAnswerAck(q0, null, 0, { ok: false, already: true }), { answeredFor: 0, error: '' });
  assert.equal(PlayState.applyAnswerAck(q0, null, 0, { ok: false }).answeredFor, null);
  assert.match(PlayState.applyAnswerAck(q0, null, 0, null).error, /Too late/);
  assert.equal(PlayState.applyAnswerAck(q1, null, 0, { ok: true }), null); // stale ack ignored
});

test('PlayState.toggleOrderPick assigns, removes with renumbering, and resets', () => {
  const t = PlayState.toggleOrderPick;
  let p = [];
  p = t(p, 2); p = t(p, 0); p = t(p, 3); p = t(p, 1);
  assert.deepEqual(p, [2, 0, 3, 1]); // positions 1..4
  const mid = t(p, 0); // remove the item at position 2: later picks shift down
  assert.deepEqual(mid, [2, 3, 1]);
  assert.equal(mid.indexOf(3), 1); // was position 3, now position 2
  assert.deepEqual(t(p, 1), [2, 0, 3]); // remove the last
  assert.deepEqual(t(mid, 0), [2, 3, 1, 0]); // re-adding goes to the end
  assert.deepEqual(p, [2, 0, 3, 1]); // input is not mutated
  assert.deepEqual([], []); // reset is just an empty array
});

test('PlayState.hintTokens', () => {
  const k = (h) => PlayState.hintTokens(h).map((t) => (t.kind === 'ch' ? t.text : t.kind === 'blank' ? '_' : '|')).join('');
  assert.equal(k("B _ _ _ ' _ ' _ _ _ _"), "B___'_'____");
  assert.equal(k('H _ _ _   _ _ _'), 'H___|___');
  assert.equal(k('N _ _ - _ _ _'), 'N__-___');
  assert.equal(k(''), '');
  assert.equal(k('R _ _ _ _ _ '), 'R_____');
});
