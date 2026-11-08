'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { testConfig, FIXTURES, selFor, GameNames } = require('./helpers');
const { createRoomManager, LOBBY_IDLE_MS, OVER_TTL_MS, IDLE_MS } = require('../lib/rooms');
const { loadPacks } = require('../lib/packs');

const MIN = 60 * 1000;

function setup() {
  const clock = { t: 10 * MIN };
  const events = [];
  const emit = {
    room: (code, ev, d) => events.push({ code, ev, d }),
    host: () => {}, players: (code, ev, d) => events.push({ code, ev, d, players: true }), player: () => {},
  };
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const m = createRoomManager({ config: testConfig(), packs, emit, now: () => clock.t });
  const named = (ev) => events.filter((e) => e.ev === ev);
  const mk = (hid = 'h') => m.createRoom(hid, { packId: 'fixture', count: 2, includeSpell: false }).room;
  const join = (room, i) => m.joinPlayer(room.code, GameNames.compose(selFor(i)));
  return { clock, m, events, named, mk, join };
}

test('lobby: warning at 4:00, closed at 5:00 (idle)', () => {
  const { clock, m, named, mk } = setup();
  try {
    assert.equal(LOBBY_IDLE_MS, 5 * MIN);
    const room = mk();
    clock.t += 3.9 * MIN; m.sweep();
    assert.equal(named('room:closing').length, 0);
    clock.t += 0.1 * MIN; m.sweep(); // 4:00
    assert.deepEqual(named('room:closing').map((e) => e.d), [{ inSeconds: 60 }]);
    clock.t += 0.5 * MIN; m.sweep(); // 4:30: warned only once
    assert.equal(named('room:closing').length, 1);
    assert.equal(m.getRoom(room.code) !== null, true);
    clock.t += 0.5 * MIN; m.sweep(); // 5:00
    assert.deepEqual(named('room:closed').map((e) => e.d), [{ reason: 'idle' }]);
    assert.equal(m.getRoom(room.code), null);
  } finally { m.shutdown(); }
});

test('activity at 4:30 resets the warning and the timeout', () => {
  const { clock, m, named, mk, join } = setup();
  try {
    const room = mk();
    clock.t += 4.5 * MIN; m.sweep();
    assert.equal(named('room:closing').length, 1);
    join(room, 1); // activity
    clock.t += 0.6 * MIN; m.sweep(); // 5:06 since creation, 0:36 since activity
    assert.equal(named('room:closed').length, 0);
    assert.ok(m.getRoom(room.code));
    clock.t += 3.5 * MIN; m.sweep(); // 4:06 since activity: warns again
    assert.equal(named('room:closing').length, 2);
    clock.t += 1 * MIN; m.sweep();
    assert.equal(named('room:closed').length, 1);
    assert.equal(m.getRoom(room.code), null);
  } finally { m.shutdown(); }
});

test('a started game is not closed at 5 minutes; keeps the 30-minute idle rule', () => {
  const { clock, m, named, mk, join } = setup();
  try {
    const room = mk();
    const p = join(room, 1).player;
    m.setConnected(room, p.id, +1);
    assert.equal(m.start(room), true);
    clock.t += 6 * MIN; m.sweep();
    assert.ok(m.getRoom(room.code));
    assert.equal(named('room:closed').length, 0);
    assert.equal(named('room:closing').length, 0);
    clock.t += IDLE_MS; m.sweep();
    assert.deepEqual(named('room:closed').map((e) => e.d), [{ reason: 'idle' }]);
  } finally { m.shutdown(); }
});

test('over rooms close at 10 minutes with reason ended', () => {
  const { clock, m, named, mk, join } = setup();
  try {
    const room = mk();
    const p = join(room, 1).player;
    m.setConnected(room, p.id, +1);
    m.start(room);
    m.end(room); // mid-game: finishes to the podium
    assert.equal(room.phase, 'over');
    clock.t += OVER_TTL_MS - 1000; m.sweep();
    assert.ok(m.getRoom(room.code));
    clock.t += 2000; m.sweep();
    assert.deepEqual(named('room:closed').map((e) => e.d), [{ reason: 'ended' }]);
    assert.equal(m.getRoom(room.code), null);
  } finally { m.shutdown(); }
});

test('a player token for a closed room fails to rejoin', () => {
  const { clock, m, mk, join } = setup();
  try {
    const room = mk();
    const { token } = join(room, 1);
    assert.ok(m.rejoin(token));
    clock.t += 5 * MIN; m.sweep();
    assert.equal(m.getRoom(room.code), null);
    assert.equal(m.rejoin(token), null);
  } finally { m.shutdown(); }
});

test('room:state carries closesAt (lobby only) that moves forward on activity', () => {
  const { clock, m, named, mk, join } = setup();
  try {
    const room = mk();
    const lobbyState = () => m.publicState(room);
    assert.equal(lobbyState().closesAt, room.lastActivity + LOBBY_IDLE_MS);
    assert.equal(lobbyState().serverNow, clock.t);
    const first = lobbyState().closesAt;
    clock.t += 2 * MIN;
    const p = join(room, 1).player; // activity: re-broadcasts room:state with a later closesAt
    const states = named('room:state');
    assert.ok(states.length >= 1);
    assert.equal(states[states.length - 1].d.closesAt, clock.t + LOBBY_IDLE_MS);
    assert.ok(lobbyState().closesAt > first);
    m.setConnected(room, p.id, +1);
    m.start(room);
    assert.equal(m.publicState(room).closesAt, null);
    assert.equal(named('room:state').pop().d.closesAt, null);
  } finally { m.shutdown(); }
});
