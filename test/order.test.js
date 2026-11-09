'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoomManager } = require('../lib/rooms');
const { testConfig, selFor } = require('./helpers');
const { moveItem } = require('../public/shared/dragorder.js');
const names = require('../public/shared/names.js');

function mkOrder(n, answerPerm) {
  const letters = 'ABCDEFGHIJ'.split('').slice(0, n);
  // pack items are NOT in correct order; answer[k] = pack index of the item at correct position k
  const items = answerPerm.map((pi) => letters[pi]);
  const answer = letters.map((_, k) => items.indexOf(letters[k]));
  return { type: 'order', q: `Order ${n}?`, items, answer, time: 10 };
}
const QS = [mkOrder(3, [2, 0, 1]), mkOrder(4, [3, 1, 0, 2]), mkOrder(6, [0, 1, 2, 3, 4, 5]), mkOrder(2, [1, 0])];

function setup(opts = {}) {
  const ev = { host: [], players: [], player: [] };
  const emit = {
    room() {}, host: (c, e, d) => ev.host.push([e, d]), players: (c, e, d) => ev.players.push([e, d]),
    player: (c, p, e, d) => ev.player.push([e, d]),
  };
  const pack = { meta: { title: 'T', theme: 'default' }, questions: opts.questions || QS };
  const m = createRoomManager({ config: testConfig(), packs: { get: () => pack }, emit, ...(opts.mgr || {}) });
  const { room } = m.createRoom('h', { packId: 'x', count: 10, includeSpell: true });
  const { player } = m.joinPlayer(room.code, names.compose(selFor(1)));
  m.setConnected(room, player.id, +1);
  return { m, room, player, ev };
}
const last = (arr, name) => arr.filter((e) => e[0] === name).pop()[1];
const correctTexts = (q) => q.answer.map((i) => q.items[i]);

test('displayed order is never the correct order (3, 4, 6, 2 items; real RNG)', () => {
  for (let round = 0; round < 150; round++) {
    const { m, room, ev } = setup();
    try {
      m.start(room);
      for (let i = 0; i < QS.length; i++) {
        const q = room.questions[room.qIndex];
        const shown = last(ev.players, 'question:show').items;
        assert.equal(shown.length, q.items.length);
        assert.deepEqual([...shown].sort(), [...q.items].sort());
        assert.notDeepEqual(shown, correctTexts(q), `n=${q.items.length}`);
        assert.deepEqual(last(ev.host, 'question:show').items, shown);
        m.skip(room);
        m.next(room);
      }
    } finally { m.shutdown(); }
  }
});

test('never-correct holds even with a degenerate RNG (fallback rotation)', () => {
  for (const r of [() => 0, (lo, hi) => hi - 1]) {
    const { m, room, ev } = setup({ mgr: { randInt: (lo, hi) => (hi === undefined ? 0 : r(lo, hi)) } });
    try {
      m.start(room);
      for (let i = 0; i < QS.length; i++) {
        assert.notDeepEqual(last(ev.players, 'question:show').items, correctTexts(room.questions[room.qIndex]));
        m.skip(room); m.next(room);
      }
    } finally { m.shutdown(); }
  }
});

test('single order question: items stable across rejoin snapshot and host:extend', () => {
  const { m, room, player, ev } = setup({ questions: [mkOrder(6, [4, 2, 5, 0, 3, 1])] });
  try {
    m.start(room);
    const shown = last(ev.players, 'question:show').items;
    const snapP = m.snapshot(room, 'player', player.id).find((e) => e[0] === 'question:show')[1];
    const snapH = m.snapshot(room, 'host').find((e) => e[0] === 'question:show')[1];
    assert.deepEqual(snapP.items, shown);
    assert.deepEqual(snapH.items, shown);
    assert.equal(m.extend(room), true);
    assert.deepEqual(last(ev.players, 'question:show').items, shown);
    assert.deepEqual(last(ev.host, 'question:show').items, shown);
    assert.equal(JSON.stringify(last(ev.players, 'question:show')).includes('"answer"'), false);
  } finally { m.shutdown(); }
});

test('correct sequence in DISPLAY indices scores full; reveal answer is in display space', () => {
  for (let round = 0; round < 40; round++) {
    const { m, room, player, ev } = setup({ questions: [mkOrder(5, [3, 0, 4, 1, 2])] });
    try {
      m.start(room);
      const shown = last(ev.players, 'question:show').items;
      const q = room.questions[0];
      const seq = correctTexts(q).map((t) => shown.indexOf(t));
      assert.equal(m.answer(room, player.id, seq), true);
      const res = last(ev.player, 'you:result');
      assert.equal(res.correct, true);
      assert.ok(res.points >= 500);
      assert.deepEqual(room.lastReveal.answer, seq);
      assert.deepEqual(room.lastReveal.answer.map((d) => shown[d]), ['A', 'B', 'C', 'D', 'E']);
    } finally { m.shutdown(); }
  }
});

test('submitting pack-index order (wrong index space) does not score full', () => {
  let wrongSpaceFull = 0;
  for (let round = 0; round < 40; round++) {
    // Pack already lists items in correct order, so pack-space "correct" is [0..n-1]; the display is never that.
    const { m, room, player, ev } = setup({ questions: [mkOrder(5, [0, 1, 2, 3, 4])] });
    try {
      m.start(room);
      const q = room.questions[0];
      assert.deepEqual(q.answer, [0, 1, 2, 3, 4]);
      m.answer(room, player.id, q.answer.slice()); // pack-index submission in display space
      if (last(ev.player, 'you:result').correct) wrongSpaceFull++;
    } finally { m.shutdown(); }
  }
  assert.equal(wrongSpaceFull, 0);
});

test('invalid order submissions are still rejected', () => {
  const { m, room, player } = setup({ questions: [mkOrder(3, [2, 0, 1])] });
  try {
    m.start(room);
    for (const bad of [[0, 0, 1], [0, 1], [0, 1, 3], 'x', [0, 1, 2, 2], [0, 1, '2']]) assert.equal(m.answer(room, player.id, bad), false);
    assert.equal(m.answer(room, player.id, [0, 1, 2]), true);
  } finally { m.shutdown(); }
});

test('moveItem is pure and clamps', () => {
  const a = [0, 1, 2, 3];
  assert.deepEqual(moveItem(a, 3, 0), [3, 0, 1, 2]);
  assert.deepEqual(moveItem(a, 0, 2), [1, 2, 0, 3]);
  assert.deepEqual(moveItem(a, 1, 1), [0, 1, 2, 3]);
  assert.deepEqual(moveItem(a, 0, -5), [0, 1, 2, 3]);
  assert.deepEqual(moveItem(a, 2, 99), [0, 1, 3, 2]);
  assert.deepEqual(moveItem(a, 7, 0), [3, 0, 1, 2]);
  assert.deepEqual(moveItem([], 0, 1), []);
  assert.deepEqual(moveItem(['x'], 0, 0), ['x']);
  assert.deepEqual(a, [0, 1, 2, 3]);
  assert.notEqual(moveItem(a, 1, 1), a);
});
