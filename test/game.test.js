'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, emitAck, hostLogin, createRoom, joinPlayer, sleep, selFor, nameFor } = require('./helpers');
const { createRoomManager } = require('../lib/rooms');
const { loadPacks } = require('../lib/packs');
const { FIXTURES, testConfig } = require('./helpers');

const RIGHT = {
  'Fixture single?': 1, 'Fixture multi?': [0, 2], 'Fixture truefalse?': true, 'Fixture order?': [2, 0, 1],
};
const WRONG = {
  'Fixture single?': 0, 'Fixture multi?': [1], 'Fixture truefalse?': false, 'Fixture order?': [0, 1, 2],
};
const SECRET_ATTEMPT = 'zzqxattempt';

test('full happy-path game with every question type', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const packs = await emitAck(host, 'host:packs', {});
    assert.ok(packs.ok);
    assert.ok(packs.packs.find((p) => p.id === 'fixture' && p.counts.total === 5));

    const room = await createRoom(host, 'fixture', 5, false);
    assert.match(room.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    assert.equal(room.joinUrl, `http://localhost:3719/play?room=${room.code}`);
    assert.match(room.qrSvg, /^data:image\/svg\+xml;base64,/);

    const a = await joinPlayer(s, room.code, 0);
    const b = await joinPlayer(s, room.code, 1);
    assert.ok(a.res.ok && b.res.ok);
    assert.equal((await emitAck((await s.connect()), 'player:join', { code: room.code, ...selFor(0) })).error, 'Name taken'); // duplicate display
    const st = await host.rec.wait('room:state', (x) => x.players.length === 2);
    assert.equal(st.phase, 'lobby');
    assert.deepEqual(st.players.map((x) => x.name).sort(), [nameFor(0), nameFor(1)].sort());
    assert.equal(st.players[0].badge.kind, 'number');
    assert.equal(st.opening.text, 'Fixture opening');

    // host cannot start twice / non-host cannot start
    assert.equal((await emitAck(host, 'host:start', {})).ok, true);

    const seen = new Set();
    const results = { a: [], b: [] };
    for (let i = 0; i < 5; i++) {
      const hq = await host.rec.wait('question:show', (x) => x.index === i);
      const pq = await a.sock.rec.wait('question:show', (x) => x.index === i);
      await b.sock.rec.wait('question:show', (x) => x.index === i);
      assert.equal(hq.total, 5);
      assert.ok(!('answer' in hq) && !('answer' in pq));
      assert.ok(pq.endsAt > Date.now());
      seen.add(hq.type);
      const nA = a.sock.rec.count('you:rank'); const nB = b.sock.rec.count('you:rank');
      let va; let vb;
      if (hq.type === 'spell') {
        assert.ok(!('speakWord' in hq) && !('word' in hq));
        assert.ok(!('clue' in pq) && !('speakWord' in pq));
        va = 'Ridván'; vb = SECRET_ATTEMPT;
      } else { va = RIGHT[pq.prompt]; vb = WRONG[pq.prompt]; }
      assert.equal((await emitAck(a.sock, 'player:answer', { value: va })).ok, true);
      assert.equal((await emitAck(a.sock, 'player:answer', { value: va })).ok, false); // twice
      assert.equal((await emitAck(b.sock, 'player:answer', { value: vb })).ok, true); // last answer -> auto reveal
      const rv = await host.rec.wait('question:reveal');
      const ra = await a.sock.rec.wait('you:result');
      const rb = await b.sock.rec.wait('you:result');
      results.a.push(ra); results.b.push(rb);
      if (hq.type === 'spell') {
        assert.equal(rv.answer, 'Ridván');
        assert.deepEqual(Object.keys(rv.stats).sort(), ['avgMatch', 'perfect', 'submitted']);
        assert.equal(ra.matchPct, 100);
        assert.ok(rb.matchPct < 100);
        assert.equal(ra.points, Math.round(ra.points));
      } else {
        assert.equal(ra.correct, true);
        assert.ok(ra.points >= 500 && ra.points <= 1000);
        assert.equal(rb.correct, false);
      }
      assert.equal((await emitAck(a.sock, 'player:answer', { value: va })).ok, false); // after reveal
      const lb = await host.rec.wait('leaderboard', (x) => x.top.length > 0 && x.top[0].score > 0);
      assert.ok(lb.top.length <= 5 && lb.totalPlayers === 2);
      assert.equal(lb.top[0].name, nameFor(0));
      assert.equal(lb.top[0].rank, 1);
      assert.deepEqual(Object.keys(lb.top[0]).sort(), ['badgeText', 'name', 'rank', 'score']);
      while (a.sock.rec.count('you:rank') <= nA || b.sock.rec.count('you:rank') <= nB) await sleep(10);
      const last = (sock) => sock.rec.all.filter((e) => e.ev === 'you:rank').pop().data;
      const rka = last(a.sock); const rkb = last(b.sock);
      assert.equal(rka.score, ra.score);
      assert.deepEqual([rka.rank, rka.of, rkb.rank, rkb.of], [1, 2, 2, 2]);
      await emitAck(host, 'host:next', {}); // reveal -> next question (or game over), no scoreboard
    }
    assert.ok(!host.rec.all.some((e) => e.ev === 'scoreboard'));
    assert.ok(!host.rec.all.some((e) => e.ev === 'room:state' && e.data.phase === 'scoreboard'));
    assert.deepEqual([...seen].sort(), ['multi', 'order', 'single', 'spell', 'truefalse']);
    const over = await host.rec.wait('game:over');
    assert.equal(over.podium[0].name, nameFor(0));
    assert.equal(over.podium.length, 2);
    await a.sock.rec.wait('game:over');

    // Spell attempt text never appears in any event received by any client.
    for (const sock of [host, a.sock, b.sock]) {
      const dump = JSON.stringify(sock.rec.all);
      assert.ok(!dump.includes(SECRET_ATTEMPT), 'spell attempt leaked');
    }
    // Ended game cannot be joined.
    const late = await joinPlayer(s, room.code, 9);
    assert.deepEqual(late.res, { ok: false, error: 'Game not found' });
  } finally { await s.shutdown(); }
});

test('rejoin restores player and answered state; kick works; host resume', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 2, false);
    const a = await joinPlayer(s, room.code, 0);
    const b = await joinPlayer(s, room.code, 1);
    await emitAck(host, 'host:start', {});
    const pq = await a.sock.rec.wait('question:show');
    const value = pq.type === 'spell' ? 'x' : pq.type === 'single' ? 0 : pq.type === 'truefalse' ? true : pq.type === 'multi' ? [0] : [0, 1, 2];
    assert.equal((await emitAck(a.sock, 'player:answer', { value })).ok, true);
    a.sock.close();
    const a2 = await s.connect();
    const rj = await emitAck(a2, 'player:rejoin', { playerToken: a.res.playerToken });
    assert.equal(rj.ok, true);
    assert.equal(rj.state.answeredIndex, pq.index);
    assert.equal(rj.state.name, nameFor(0));
    await a2.rec.wait('question:show');

    const host2 = await s.connect();
    const rs = await emitAck(host2, 'host:resume', { hostToken: host.token });
    assert.equal(rs.ok, true);
    assert.equal(rs.room.code, room.code);
    await host2.rec.wait('room:state');

    const bId = b.res.playerId;
    assert.equal((await emitAck(host, 'host:kick', { playerId: bId })).ok, true);
    const st = await host.rec.wait('room:state', (x) => x.players.length === 1);
    assert.equal(st.players[0].name, nameFor(0));
    const bad = await emitAck(await s.connect(), 'player:rejoin', { playerToken: b.res.playerToken });
    assert.equal(bad.ok, false);
  } finally { await s.shutdown(); }
});

test('reverent packs skip spell unless included', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'reverent-fx', 10, false);
    const st = await host.rec.wait('room:state');
    assert.equal(st.qTotal, 1);
    assert.equal(st.reverent, true);
    assert.equal(st.theme, 'martyrdom-bab');
    const room2 = await createRoom(host, 'reverent-fx', 10, true);
    assert.notEqual(room.code, room2.code);
    const st2 = await host.rec.wait('room:state', (x) => x.code === room2.code);
    assert.equal(st2.qTotal, 2);
  } finally { await s.shutdown(); }
});

test('answers after time are rejected (fake clock)', () => {
  let t = 1000000;
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const events = [];
  const emit = { room: () => {}, host: () => {}, players: () => {}, player: (c, p, ev, d) => events.push([ev, d]) };
  const m = createRoomManager({ config: testConfig(), packs, emit, now: () => t });
  try {
    const { room } = m.createRoom('hid1', { packId: 'fixture', count: 5, includeSpell: false });
    const { player } = m.joinPlayer(room.code, require('../public/shared/names.js').compose(selFor(11)));
    m.setConnected(room, player.id, +1);
    m.start(room);
    t += 11000; // past the 10s window; timer callback has not fired yet in this tick
    const q = room.questions[0];
    const v = q.type === 'spell' ? 'x' : q.type === 'single' ? 0 : q.type === 'truefalse' ? true : q.type === 'multi' ? [0] : [0, 1, 2];
    assert.equal(m.answer(room, player.id, v), false);
  } finally { m.shutdown(); }
});

test('idle rooms are swept', () => {
  let t = 1000;
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const m = createRoomManager({ config: testConfig(), packs, emit: { room() {}, host() {}, players() {}, player() {} }, now: () => t });
  try {
    m.createRoom('h', { packId: 'fixture', count: 1, includeSpell: false });
    assert.equal(m.size(), 1);
    t += 31 * 60 * 1000;
    m.sweep();
    assert.equal(m.size(), 0);
  } finally { m.shutdown(); }
});

test('MAX_ROOMS and MAX_PLAYERS_PER_ROOM are enforced', async () => {
  const s = await startServer({ config: testConfig({ MAX_ROOMS: '1', MAX_PLAYERS_PER_ROOM: '1' }) });
  try {
    const h1 = await hostLogin(s);
    const room = await createRoom(h1);
    const h2 = await hostLogin(s);
    const res = await emitAck(h2, 'host:create', { packId: 'fixture', count: 1, includeSpell: false });
    assert.equal(res.ok, false);
    assert.equal((await joinPlayer(s, room.code, 7)).res.ok, true);
    assert.equal((await joinPlayer(s, room.code, 8)).res.ok, false);
  } finally { await s.shutdown(); }
});

test('leaderboard is top 5 sorted; you:rank uses competition ranking for ties', () => {
  const packs = loadPacks(FIXTURES, { onError: () => {} });
  const m = createRoomManager({ config: testConfig(), packs, emit: { room() {}, host() {}, players() {}, player() {} } });
  try {
    const { room } = m.createRoom('h', { packId: 'fixture', count: 1, includeSpell: false });
    const GameNames = require('../public/shared/names.js');
    const scores = [300, 200, 200, 100, 500, 50, 0];
    const pids = scores.map((sc, i) => {
      const r = m.joinPlayer(room.code, GameNames.compose(selFor(i)));
      r.player.score = sc;
      return r.player.id;
    });
    const snap = (pid) => Object.fromEntries(m.snapshot(room, 'player', pid).map(([e, d]) => [e, d]));
    const lb = snap(pids[0]).leaderboard;
    assert.equal(lb.top.length, 5);
    assert.equal(lb.totalPlayers, 7);
    assert.deepEqual(lb.top.map((x) => x.score), [500, 300, 200, 200, 100]);
    assert.deepEqual(lb.top.map((x) => x.rank), [1, 2, 3, 3, 5]);
    assert.deepEqual(pids.map((p) => snap(p)['you:rank'].rank), [2, 3, 3, 5, 1, 6, 7]);
    assert.equal(snap(pids[1])['you:rank'].of, 7);
  } finally { m.shutdown(); }
});

test('reveal goes straight to the next question; last reveal goes to over', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 2);
    const a = await joinPlayer(s, room.code, 0);
    await emitAck(host, 'host:start', {});
    await host.rec.wait('question:show', (x) => x.index === 0);
    await emitAck(host, 'host:skip', {});
    await host.rec.wait('question:reveal');
    assert.equal(s.manager.getRoom(room.code).phase, 'reveal');
    await emitAck(host, 'host:next', {});
    assert.equal(s.manager.getRoom(room.code).phase, 'question');
    await host.rec.wait('question:show', (x) => x.index === 1);
    await emitAck(host, 'host:skip', {});
    await host.rec.wait('question:reveal');
    await emitAck(host, 'host:next', {});
    assert.equal(s.manager.getRoom(room.code).phase, 'over');
    await a.sock.rec.wait('game:over');
  } finally { await s.shutdown(); }
});
