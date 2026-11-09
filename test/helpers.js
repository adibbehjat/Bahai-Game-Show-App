'use strict';
const path = require('node:path');
const { io: ioc } = require('socket.io-client');
const { loadConfig } = require('../lib/config');
const { hashPinSync } = require('../lib/auth');
const { loadPacks } = require('../lib/packs');
const { createServer } = require('../server');
const GameNames = require('../public/shared/names.js');

const PIN = '123456';
const FIXTURES = path.join(__dirname, 'fixtures', 'questions');
const SECRET = 'ab'.repeat(32);

function testConfig(extra = {}) {
  return loadConfig({
    NODE_ENV: 'test', PORT: '0', ADMIN_PIN_HASH: hashPinSync(PIN, { N: 1024 }),
    SESSION_SECRET: SECRET, PUBLIC_ORIGIN: 'http://localhost:3719', ...extra,
  });
}

async function startServer(opts = {}) {
  const config = opts.config || testConfig();
  const packs = loadPacks(opts.packsDir || FIXTURES, { onError: () => {} });
  const s = createServer(config, { packs, logger: () => {}, limits: opts.limits });
  const port = await s.listen(0, '127.0.0.1');
  s.url = `http://127.0.0.1:${port}`;
  s.config = config;
  const sockets = [];
  s.connect = async (extra = {}) => {
    const sock = ioc(s.url, { transports: ['websocket'], forceNew: true, reconnection: false, ...(opts.extraHeaders ? { extraHeaders: opts.extraHeaders } : {}), ...extra });
    await new Promise((res, rej) => { sock.once('connect', res); sock.once('connect_error', rej); });
    sock.rec = recorder(sock);
    sockets.push(sock);
    return sock;
  };
  const baseClose = s.close;
  s.shutdown = async () => { sockets.forEach((k) => k.close()); await baseClose(); };
  return s;
}

function emitAck(sock, ev, payload, ms = 3000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    sock.emit(ev, payload, (res) => { clearTimeout(t); resolve(res); });
  });
}

// Records every event; wait() consumes events of a name in order.
function recorder(sock) {
  const all = [];
  const consumed = new Map();
  sock.onAny((ev, data) => all.push({ ev, data }));
  return {
    all,
    async wait(ev, pred = () => true, ms = 4000) {
      const start = Date.now();
      for (;;) {
        for (let i = consumed.get(ev) || 0; i < all.length; i++) {
          if (all[i].ev === ev && pred(all[i].data)) { consumed.set(ev, i + 1); return all[i].data; }
        }
        if (Date.now() - start > ms) throw new Error('timeout waiting for ' + ev);
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    count(ev) { return all.filter((e) => e.ev === ev).length; },
  };
}

async function hostLogin(s) {
  const h = await s.connect();
  const res = await emitAck(h, 'host:auth', { pin: PIN });
  if (!res || !res.ok) throw new Error('host auth failed');
  h.token = res.hostToken;
  return h;
}

async function createRoom(h, packId = 'fixture', count = 5, includeSpell = false) {
  const res = await emitAck(h, 'host:create', { packId, count, includeSpell });
  if (!res || !res.ok) throw new Error('create failed');
  return res;
}

// Deterministic unique selection for test player i (numeric badge keeps display unique per i).
function selFor(i) {
  return { adj: i % 32, flower: Math.floor(i / 32) % 32, badge: { kind: 'number', value: 1 } };
}
function nameFor(i) { return GameNames.compose(selFor(i)).name; }

async function joinPlayer(s, code, i) {
  const p = await s.connect();
  const res = await emitAck(p, 'player:join', { code, ...selFor(i) });
  return { sock: p, res };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { PIN, SECRET, testConfig, startServer, emitAck, recorder, hostLogin, createRoom, joinPlayer, sleep, FIXTURES, selFor, nameFor, GameNames };
