'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const auth = require('../lib/auth');
const { loadConfig } = require('../lib/config');
const { startServer, emitAck, hostLogin, createRoom, joinPlayer, sleep, PIN, SECRET, testConfig, selFor, nameFor, GameNames } = require('./helpers');

function get(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('production config fails closed', () => {
  const good = { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://quiz.example.org', SESSION_SECRET: 'ab'.repeat(32), ADMIN_PIN_HASH: auth.hashPinSync('123456', { N: 1024 }) };
  assert.doesNotThrow(() => loadConfig(good));
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /ADMIN_PIN_HASH.*SESSION_SECRET.*PUBLIC_ORIGIN|Invalid configuration/);
  assert.throws(() => loadConfig({}), /Invalid configuration/); // unset NODE_ENV is treated as production
  for (const k of ['PUBLIC_ORIGIN', 'SESSION_SECRET', 'ADMIN_PIN_HASH']) {
    const e = { ...good }; delete e[k];
    assert.throws(() => loadConfig(e), new RegExp(k));
    assert.throws(() => loadConfig({ ...good, [k]: '<placeholder>' }), new RegExp(k));
  }
  assert.throws(() => loadConfig({ ...good, SESSION_SECRET: 'abcd' }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...good, SESSION_SECRET: 'zz'.repeat(32) }), /SESSION_SECRET/);
  assert.throws(() => loadConfig({ ...good, ADMIN_PIN_HASH: 'plaintext' }), /ADMIN_PIN_HASH/);
  const c = loadConfig(good);
  assert.ok(Object.isFrozen(c));
  assert.equal(c.HOST, '127.0.0.1');
  const dev = loadConfig({ NODE_ENV: 'development' });
  assert.match(dev.DEV_PIN, /^\d{6}$/);
  assert.equal(dev.SESSION_SECRET.length, 64);
  assert.equal(loadConfig({ NODE_ENV: 'development', ADMIN_PIN_HASH: good.ADMIN_PIN_HASH }).DEV_PIN, null);
});

test('client code never uses unsafe DOM sinks; HTML has no inline script/style/handlers', () => {
  const pub = path.join(__dirname, '..', 'public');
  const bad = /innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\s*\(|new Function/;
  for (const f of fs.readdirSync(pub).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(pub, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!bad.test(src), `${f} uses an unsafe sink`);
  }
  for (const f of ['index.html', 'host.html', 'play.html']) {
    const html = fs.readFileSync(path.join(pub, f), 'utf8');
    assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), `${f} inline script`);
    assert.ok(!/<style/i.test(html), `${f} inline style`);
    assert.ok(!/\son[a-z]+\s*=/i.test(html), `${f} inline handler`);
    assert.ok(!/style\s*=/i.test(html), `${f} style attribute`);
    assert.ok(!/https?:\/\//i.test(html), `${f} external URL`);
  }
});

test('HTTP surface: CSP, routes, no listing, no write endpoints', async () => {
  const s = await startServer();
  try {
    for (const route of ['/', '/host', '/play']) {
      const r = await get(s.url + route);
      assert.equal(r.status, 200, route);
      const csp = r.headers['content-security-policy'];
      assert.match(csp, /default-src 'self'/);
      assert.match(csp, /script-src 'self'(;|$)/);
      assert.match(csp, /connect-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(r.headers['x-content-type-options'], 'nosniff');
      assert.equal(r.headers['x-frame-options'], 'DENY');
      assert.ok(!r.headers['x-powered-by']);
    }
    const kit = await get(s.url + '/kit');
    if (kit.status === 200) assert.match(kit.headers['content-security-policy'], /connect-src 'none'/);
    for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await get(s.url + '/host', { method: m });
      assert.equal(r.status, 404);
    }
    const nf = await get(s.url + '/nope');
    assert.equal(nf.status, 404);
    assert.equal(nf.body, 'Not found');
    assert.equal((await get(s.url + '/theme/')).status, 404);
    assert.equal((await get(s.url + '/../server.js')).status, 404);
    assert.equal((await get(s.url + '/%2e%2e/server.js')).status, 404);
    assert.equal((await get(s.url + '/.env')).status, 404);
    assert.equal((await get(s.url + '/package.json')).status, 404);
  } finally { await s.shutdown(); }
});

test('origin check: wrong Origin rejected, missing Origin rejected in production', async () => {
  const s = await startServer();
  try {
    await assert.rejects(s.connect({ extraHeaders: { origin: 'https://evil.example' } }));
    const ok = await s.connect({ extraHeaders: { origin: 'http://localhost:5000' } }); // dev: any localhost
    assert.ok(ok.connected);
  } finally { await s.shutdown(); }
  const prodCfg = loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://quiz.example.org', SESSION_SECRET: SECRET, ADMIN_PIN_HASH: auth.hashPinSync(PIN, { N: 1024 }) });
  const p = await startServer({ config: prodCfg });
  try {
    await assert.rejects(p.connect());
    await assert.rejects(p.connect({ extraHeaders: { origin: 'http://localhost:3719' } }));
    const ok = await p.connect({ extraHeaders: { origin: 'https://quiz.example.org' } });
    assert.ok(ok.connected);
  } finally { await p.shutdown(); }
});

test('join of nonexistent room fails and socket receives no room broadcasts', async () => {
  const s = await startServer();
  try {
    const p = await s.connect();
    const res = await emitAck(p, 'player:join', { code: 'ABCDEF', ...selFor(3) });
    assert.deepEqual(res, { ok: false, error: 'Game not found' });
    const host = await hostLogin(s);
    const room = await createRoom(host);
    await joinPlayer(s, room.code, 4);
    await emitAck(host, 'host:start', {});
    await sleep(200);
    assert.equal(p.rec.all.length, 0);
    // a bad selection for the real code joins nothing
    assert.equal(await emitAck(p, 'player:join', { code: room.code, adj: 99, flower: 0, badge: { kind: 'number', value: 1 } }, 250), null);
    await sleep(100);
    assert.equal(p.rec.all.length, 0);
  } finally { await s.shutdown(); }
});

test('unauthenticated and player sockets cannot use host:* events', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const anon = await s.connect();
    assert.equal(await emitAck(anon, 'host:packs', {}, 300), null);
    assert.equal(await emitAck(anon, 'host:create', { packId: 'fixture', count: 1, includeSpell: false }, 300), null);
    assert.equal(await emitAck(anon, 'host:resume', { hostToken: 'x.y' }, 300) && 0, 0);
    const { sock: p, res } = await joinPlayer(s, room.code, 2);
    assert.ok(res.ok);
    const before = host.rec.all.length;
    for (const ev of ['host:start', 'host:next', 'host:skip', 'host:end', 'host:extend']) {
      assert.equal(await emitAck(p, ev, {}, 200), null, ev);
    }
    assert.equal(await emitAck(p, 'host:kick', { playerId: res.playerId }, 200), null);
    assert.equal(await emitAck(p, 'host:packs', {}, 200), null);
    assert.equal(await emitAck(p, 'host:create', { packId: 'fixture', count: 1, includeSpell: false }, 200), null);
    await sleep(100);
    const newState = host.rec.all.slice(before).filter((e) => e.ev === 'room:state' && e.data.phase !== 'lobby');
    assert.equal(newState.length, 0);
    assert.equal(s.manager.getRoom(room.code).phase, 'lobby');
    assert.equal(s.manager.getRoom(room.code).players.size, 1);
    // a forged host token is rejected
    const forged = await emitAck(anon, 'host:resume', { hostToken: auth.issueHostToken('00'.repeat(32)).token });
    assert.equal(forged.ok, false);
    assert.equal(await emitAck(anon, 'host:packs', {}, 200), null);
  } finally { await s.shutdown(); }
});

test('player tokens are bound to their room; tampering fails', async () => {
  const s = await startServer();
  try {
    const hA = await hostLogin(s);
    const hB = await hostLogin(s);
    const rA = await createRoom(hA);
    const rB = await createRoom(hB);
    assert.notEqual(rA.code, rB.code);
    const a = await joinPlayer(s, rA.code, 10);
    const ok = await emitAck(await s.connect(), 'player:rejoin', { playerToken: a.res.playerToken });
    assert.equal(ok.state.code, rA.code);
    // rewrite the payload to room B (signature no longer matches)
    const [body, sig] = a.res.playerToken.split('.');
    const pay = JSON.parse(Buffer.from(body, 'base64url'));
    pay.room = rB.code;
    const forged = Buffer.from(JSON.stringify(pay)).toString('base64url') + '.' + sig;
    const sockB = await s.connect();
    assert.equal((await emitAck(sockB, 'player:rejoin', { playerToken: forged })).ok, false);
    // a token signed with room A's key is not valid under room B's key
    const roomA = s.manager.getRoom(rA.code);
    const roomB = s.manager.getRoom(rB.code);
    const keyOf = (r) => auth.deriveKey(s.config.SESSION_SECRET, `room:${r.code}:${r.nonce}`);
    assert.equal(auth.verifyPlayerToken(keyB(), a.res.playerToken, rB.code), null);
    function keyB() { return keyOf(roomB); }
    assert.ok(auth.verifyPlayerToken(keyOf(roomA), a.res.playerToken, rA.code));
    // once the room is destroyed the token is useless
    s.manager.destroy(rA.code);
    assert.equal((await emitAck(await s.connect(), 'player:rejoin', { playerToken: a.res.playerToken })).ok, false);
  } finally { await s.shutdown(); }
});

test('malformed, oversized and extra-key payloads are dropped', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const p = await s.connect();
    const dropped = async (ev, payload) => assert.equal(await emitAck(p, ev, payload, 250), null, `${ev} ${JSON.stringify(payload).slice(0, 40)}`);
    const ok = selFor(3);
    await dropped('player:join', { code: room.code, ...ok, name: 'Free Text' }); // free-text name key is rejected
    await dropped('player:join', { code: room.code, name: 'Free Text' });
    await dropped('player:join', { code: room.code, ...ok, extra: 1 });
    await dropped('player:join', { code: room.code, adj: ok.adj, flower: ok.flower });
    await dropped('player:join', { code: room.code, ...ok, adj: 32 });
    await dropped('player:join', { code: room.code, ...ok, adj: -1 });
    await dropped('player:join', { code: room.code, ...ok, flower: 1.5 });
    await dropped('player:join', { code: room.code, ...ok, flower: '1' });
    await dropped('player:join', { code: room.code, ...ok, badge: { kind: 'number', value: 20 } });
    await dropped('player:join', { code: room.code, ...ok, badge: { kind: 'number', value: -1 } });
    await dropped('player:join', { code: room.code, ...ok, badge: { kind: 'emoji', value: GameNames.EMOJIS.length } });
    await dropped('player:join', { code: room.code, ...ok, badge: { kind: 'text', value: 'hi' } });
    await dropped('player:join', { code: room.code, ...ok, badge: { kind: 'number', value: 1, extra: 1 } });
    await dropped('player:join', { code: 'short', ...ok });
    await dropped('player:join', 'string');
    await dropped('player:join', null);
    await dropped('player:join', [room.code, 'X']);
    await dropped('player:rejoin', { playerToken: 5 });
    await dropped('player:answer', { value: 1, extra: 1 });
    await dropped('not:an:event', {});
    await dropped('host:auth', { pin: PIN, extra: true });
    await dropped('host:auth', { pin: 123456 });
    await dropped('host:create', { packId: '../x', count: 1, includeSpell: false });
    await dropped('host:create', { packId: 'fixture', count: 1.5, includeSpell: false });
    await dropped('host:create', { packId: 'fixture', count: 99, includeSpell: false });
    assert.equal(s.manager.getRoom(room.code).players.size, 0);
    // oversized (>2048 bytes) frame closes the connection
    const big = await s.connect();
    const closed = new Promise((r) => big.once('disconnect', r));
    big.emit('player:join', { code: room.code, ...selFor(3), name: 'y'.repeat(5000) });
    await Promise.race([closed, sleep(2000).then(() => { throw new Error('not disconnected'); })]);
    assert.equal(s.manager.getRoom(room.code).players.size, 0);
    // answer payload types are checked against the question type
    const { sock: ps } = await joinPlayer(s, room.code, 3);
    await emitAck(host, 'host:start', {});
    const q = await ps.rec.wait('question:show');
    const wrong = q.type === 'single' ? 'one' : q.type === 'spell' ? 5 : q.type === 'truefalse' ? 1 : { a: 1 };
    assert.equal((await emitAck(ps, 'player:answer', { value: wrong })).ok, false);
    const oob = q.type === 'single' ? 99 : q.type === 'multi' ? [0, 0] : q.type === 'order' ? [0, 0, 0] : q.type === 'spell' ? 'x'.repeat(41) : 'nope';
    assert.equal((await emitAck(ps, 'player:answer', { value: oob })).ok, false);
  } finally { await s.shutdown(); }
});

test('names are composed server-side; duplicates get Name taken', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const { res } = await joinPlayer(s, room.code, 5);
    assert.equal(res.ok, true);
    assert.equal(res.name, nameFor(5));
    const st = await host.rec.wait('room:state', (x) => x.players.length === 1);
    assert.equal(st.players[0].name, nameFor(5));
    assert.deepEqual(st.players[0].badge, { kind: 'number', text: '1' });
    // same display (case-insensitive by construction) is taken; a different badge is fine
    const dup = await joinPlayer(s, room.code, 5);
    assert.deepEqual(dup.res, { ok: false, error: 'Name taken' });
    const p = await s.connect();
    const emoji = await emitAck(p, 'player:join', { code: room.code, ...selFor(5), badge: { kind: 'emoji', value: 0 } });
    assert.equal(emoji.ok, true);
    assert.equal(emoji.badge.text, GameNames.EMOJIS[0]);
    const st2 = await host.rec.wait('room:state', (x) => x.players.length === 2);
    assert.ok(st2.players.every((x) => x.name === nameFor(5)));
  } finally { await s.shutdown(); }
});

test('number badge 0 works end to end; 20 is rejected', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    const p = await s.connect();
    assert.equal(await emitAck(p, 'player:join', { code: room.code, ...selFor(40), badge: { kind: 'number', value: 20 } }, 250), null);
    const res = await emitAck(p, 'player:join', { code: room.code, ...selFor(40), badge: { kind: 'number', value: 0 } });
    assert.equal(res.ok, true);
    assert.deepEqual(res.badge, { kind: 'number', text: '0' });
    assert.equal(res.display, nameFor(40) + ' 0');
    const st = await host.rec.wait('room:state', (x) => x.players.length === 1);
    assert.deepEqual(st.players[0].badge, { kind: 'number', text: '0' });
  } finally { await s.shutdown(); }
});

test('Name taken does not count against the failed-join limit', async () => {
  const s = await startServer({ limits: { joinMax: 3, joinSocketMax: 50 } });
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    assert.equal((await joinPlayer(s, room.code, 1)).res.ok, true);
    for (let i = 0; i < 8; i++) assert.equal((await joinPlayer(s, room.code, 1)).res.error, 'Name taken');
    assert.equal((await joinPlayer(s, room.code, 2)).res.ok, true);
  } finally { await s.shutdown(); }
});

test('answers are absent from question:show payloads (player and host)', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 5);
    const { sock } = await joinPlayer(s, room.code, 3);
    await emitAck(host, 'host:start', {});
    for (let i = 0; i < 5; i++) {
      const pq = await sock.rec.wait('question:show', (x) => x.index === i);
      const hq = await host.rec.wait('question:show', (x) => x.index === i);
      for (const k of ['answer', 'word', 'accept', 'speakWord', 'explanation', 'source', 'clue']) assert.ok(!(k in pq), `player payload has ${k}`);
      assert.ok(!('answer' in hq) && !('word' in hq) && !('accept' in hq));
      assert.ok(!('speakWord' in hq));
      const v = pq.type === 'spell' ? 'a' : pq.type === 'single' ? 0 : pq.type === 'truefalse' ? true : pq.type === 'multi' ? [0] : [0, 1, 2];
      await emitAck(sock, 'player:answer', { value: v });
      await host.rec.wait('question:reveal');
      await emitAck(host, 'host:next', {});
      await emitAck(host, 'host:next', {});
    }
  } finally { await s.shutdown(); }
});

test('wrong PIN is rejected and rate limited per IP', async () => {
  const s = await startServer();
  try {
    const a = await s.connect({ extraHeaders: { 'x-forwarded-for': '203.0.113.7' } });
    for (let i = 0; i < 5; i++) {
      const r = await emitAck(a, 'host:auth', { pin: 'wrong' + i });
      assert.deepEqual(r, { ok: false, error: 'Incorrect PIN' });
    }
    const limited = await emitAck(a, 'host:auth', { pin: PIN });
    assert.equal(limited.ok, false);
    assert.match(limited.error, /Too many/);
    assert.ok(!('hostToken' in limited));
    // a different client IP is unaffected
    const b = await s.connect({ extraHeaders: { 'x-forwarded-for': '198.51.100.9' } });
    assert.equal((await emitAck(b, 'host:auth', { pin: PIN })).ok, true);
    // and an unauthenticated socket still has no host powers after failures
    assert.equal(await emitAck(a, 'host:packs', {}, 200), null);
  } finally { await s.shutdown(); }
});

test('only failed joins count against the per-IP limit', async () => {
  const s = await startServer({ config: testConfig({ MAX_PLAYERS_PER_ROOM: '60' }) });
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host);
    for (let i = 0; i < 40; i++) {
      const { res } = await joinPlayer(s, room.code, 20 + i);
      assert.equal(res.ok, true, 'join ' + i);
    }
    // 20 bad-code attempts are answered normally (5 sockets x 4), the 21st is blocked
    let bad = 0;
    for (let k = 0; k < 6 && bad < 21; k++) {
      const p = await s.connect();
      for (let j = 0; j < 4 && bad < 21; j++) {
        const r = await emitAck(p, 'player:join', { code: 'ABCDEF', ...selFor(3) });
        bad++;
        if (bad <= 20) assert.equal(r.error, 'Game not found');
        else assert.match(r.error, /Too many/);
      }
    }
    // the IP is now blocked even for a valid room
    const { res } = await joinPlayer(s, room.code, 90);
    assert.equal(res.ok, false);
  } finally { await s.shutdown(); }
});

test('join attempts are capped per socket', async () => {
  const s = await startServer();
  try {
    const p = await s.connect();
    for (let i = 0; i < 5; i++) assert.equal((await emitAck(p, 'player:join', { code: 'ABCDEF', ...selFor(3) })).error, 'Game not found');
    assert.match((await emitAck(p, 'player:join', { code: 'ABCDEF', ...selFor(3) })).error, /Too many/);
  } finally { await s.shutdown(); }
});

test('per-socket event flood disconnects the socket', async () => {
  const s = await startServer();
  try {
    const p = await s.connect();
    const closed = new Promise((r) => p.once('disconnect', r));
    for (let i = 0; i < 60; i++) p.emit('player:answer', { value: 1 });
    await Promise.race([closed, sleep(2000).then(() => { throw new Error('not disconnected'); })]);
  } finally { await s.shutdown(); }
});

test('answers twice / after reveal are rejected', async () => {
  const s = await startServer();
  try {
    const host = await hostLogin(s);
    const room = await createRoom(host, 'fixture', 1);
    const a = await joinPlayer(s, room.code, 5);
    const b = await joinPlayer(s, room.code, 6);
    await emitAck(host, 'host:start', {});
    const q = await a.sock.rec.wait('question:show');
    const v = q.type === 'spell' ? 'a' : q.type === 'single' ? 0 : q.type === 'truefalse' ? true : q.type === 'multi' ? [0] : [0, 1, 2];
    assert.equal((await emitAck(a.sock, 'player:answer', { value: v })).ok, true);
    assert.equal((await emitAck(a.sock, 'player:answer', { value: v })).ok, false);
    assert.equal((await emitAck(host, 'host:skip', {})).ok, true);
    assert.equal((await emitAck(b.sock, 'player:answer', { value: v })).ok, false);
    const r = await b.sock.rec.wait('you:result');
    assert.equal(r.answered, false);
    assert.equal(r.points, 0);
  } finally { await s.shutdown(); }
});
