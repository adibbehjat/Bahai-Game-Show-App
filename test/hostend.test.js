'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, emitAck, hostLogin, createRoom, joinPlayer, sleep } = require('./helpers');

test('host:end in the lobby closes the room; players are told; host can re-create without the PIN', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const a = await joinPlayer(s, room.code, 0);
    const res = await emitAck(host, 'host:end', {});
    assert.deepEqual(res, { ok: true, closed: true });
    assert.deepEqual(await a.sock.rec.wait('room:closed'), { reason: 'ended' });
    assert.equal(s.manager.getRoom(room.code), null);
    assert.equal((await emitAck(await s.connect(), 'player:rejoin', { playerToken: a.res.playerToken })).ok, false);
    assert.deepEqual((await joinPlayer(s, room.code, 1)).res, { ok: false, error: 'Game not found' });
    // same socket, no re-auth
    const again = await emitAck(host, 'host:create', { packId: 'fixture', count: 1, includeSpell: false });
    assert.equal(again.ok, true);
    assert.notEqual(again.code, room.code);
    // the old room is unbound: a stray host:end acts on the NEW room only
    assert.ok(s.manager.getRoom(again.code));
  } finally { await s.shutdown(); }
});

test('host:end after closing, with no room, is ignored; resume after close lands without a room', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    await createRoom(host);
    await emitAck(host, 'host:end', {});
    assert.equal(await emitAck(host, 'host:end', {}, 250), null); // unbound
    const h2 = await s.connect();
    const rs = await emitAck(h2, 'host:resume', { hostToken: host.token });
    assert.equal(rs.ok, true);
    assert.equal(rs.room, undefined);
  } finally { await s.shutdown(); }
});

test('host:resume does not extend the lobby timer', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const before = s.manager.getRoom(room.code).lastActivity;
    const closes = s.manager.publicState(s.manager.getRoom(room.code)).closesAt;
    await sleep(30);
    const h2 = await s.connect();
    assert.equal((await emitAck(h2, 'host:resume', { hostToken: host.token })).ok, true);
    const st = await h2.rec.wait('room:state');
    assert.equal(s.manager.getRoom(room.code).lastActivity, before);
    assert.equal(st.closesAt, closes);
  } finally { await s.shutdown(); }
});

test('host:end mid-game still goes to over; in over it closes the room', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 2);
    const a = await joinPlayer(s, room.code, 0);
    await emitAck(host, 'host:start', {});
    await host.rec.wait('question:show');
    assert.deepEqual(await emitAck(host, 'host:end', {}), { ok: true, closed: false });
    await a.sock.rec.wait('game:over');
    assert.equal(s.manager.getRoom(room.code).phase, 'over');
    assert.deepEqual(await emitAck(host, 'host:end', {}), { ok: true, closed: true });
    assert.deepEqual(await a.sock.rec.wait('room:closed'), { reason: 'ended' });
    assert.equal(s.manager.getRoom(room.code), null);
  } finally { await s.shutdown(); }
});

test('host:end from a player socket does nothing', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const a = await joinPlayer(s, room.code, 0);
    assert.equal(await emitAck(a.sock, 'host:end', {}, 250), null);
    assert.ok(s.manager.getRoom(room.code));
    assert.equal(s.manager.getRoom(room.code).phase, 'lobby');
  } finally { await s.shutdown(); }
});
