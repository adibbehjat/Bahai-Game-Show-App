'use strict';
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const auth = require('./lib/auth');
const { createLimiter } = require('./lib/ratelimit');
const { validators } = require('./lib/validate');
const { createRoomManager } = require('./lib/rooms');
const { clientIp: pickClientIp } = require('./lib/proxy');
const { loadPacks, listPacks } = require('./lib/packs');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PAGES = { '/': 'index.html', '/host': 'host.html', '/play': 'play.html', '/kit': 'kit.html', '/styleguide': 'styleguide.html', '/review': 'review.html' };

const BASE_CSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
};

function isLocalOrigin(origin) {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
  } catch { return false; }
}

function createServer(config, opts = {}) {
  const log = opts.logger || ((...a) => console.log(...a));
  const packs = opts.packs || (config.QUESTIONS_DIR ? loadPacks(config.QUESTIONS_DIR) : loadPacks());
  // Sample packs (ids starting with "_") are hidden from hosts in production unless SHOW_SAMPLE_PACKS is set.
  const showSamples = !config.isProd || config.SHOW_SAMPLE_PACKS;
  const hostPacks = showSamples ? packs : new Map(Array.from(packs).filter(([id]) => !id.startsWith('_')));
  const limits = Object.assign({ authMax: 5, authWindowMs: 10 * 60 * 1000, joinMax: 20, joinWindowMs: 10 * 60 * 1000, joinSocketMax: 5, eventMax: 20 }, opts.limits);

  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');

  const mainCsp = helmet.contentSecurityPolicy({ useDefaults: false, directives: BASE_CSP });
  const kitCsp = helmet.contentSecurityPolicy({ useDefaults: false, directives: { ...BASE_CSP, 'connect-src': ["'none'"] } });
  app.use(helmet({ contentSecurityPolicy: false, frameguard: { action: 'deny' } }));
  app.use((req, res, next) => {
    const p = req.path;
    return (p === '/kit' || p === '/kit.html' ? kitCsp : mainCsp)(req, res, next);
  });

  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (req, res, next) => {
      res.sendFile(path.join(PUBLIC_DIR, file), { dotfiles: 'deny' }, (err) => { if (err) next(); });
    });
  }
  app.use(express.static(PUBLIC_DIR, { dotfiles: 'ignore', index: false, redirect: false, fallthrough: true }));
  app.use((req, res) => { res.status(404).type('text/plain').send('Not found'); });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => { res.status(err && err.status === 404 ? 404 : 500).type('text/plain').send(err && err.status === 404 ? 'Not found' : 'Error'); });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 2048,
    serveClient: true,
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      let ok;
      if (!origin) ok = !config.isProd;
      else ok = origin === config.PUBLIC_ORIGIN || (!config.isProd && isLocalOrigin(origin));
      cb(null, ok);
    },
  });

  const authLimiter = createLimiter({ windowMs: limits.authWindowMs, max: limits.authMax });
  const joinLimiter = createLimiter({ windowMs: limits.joinWindowMs, max: limits.joinMax });

  const manager = createRoomManager({
    config, packs: hostPacks,
    emit: {
      room: (code, ev, data) => io.to(`room:${code}`).emit(ev, data),
      host: (code, ev, data) => io.to(`host:${code}`).emit(ev, data),
      players: (code, ev, data) => io.to(`players:${code}`).emit(ev, data),
      player: (code, pid, ev, data) => io.to(`p:${code}:${pid}`).emit(ev, data),
    },
    onDestroy: (code) => {
      io.in(`room:${code}`).socketsLeave([`room:${code}`, `host:${code}`, `players:${code}`]);
    },
    onLog: (msg, code) => log(`[game] ${msg} ${code}`),
  });

  function ackFn(cb) { return (obj) => { if (typeof cb === 'function') { try { cb(obj); } catch (_) { /* ignore */ } } }; }

  function bindHost(socket, room) {
    socket.data.room = room.code;
    socket.join([`room:${room.code}`, `host:${room.code}`]);
  }

  function sendSnapshot(socket, room, role, pid) {
    for (const [ev, data] of manager.snapshot(room, role, pid)) socket.emit(ev, data);
  }

  async function makeQr(joinUrl) {
    const svg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }

  function roomInfo(room) {
    const joinUrl = `${config.PUBLIC_ORIGIN}/play?room=${room.code}`;
    return { joinUrl };
  }

  io.on('connection', (socket) => {
    socket.data = { isHost: false, hid: null, room: null, pid: null, dead: false, win: 0, n: 0 };
    const ip = pickClientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for'], config.TRUST_PROXY);

    socket.onAny(() => {
      const t = Date.now();
      const d = socket.data;
      if (t - d.win >= 1000) { d.win = t; d.n = 0; }
      d.n += 1;
      if (d.n > limits.eventMax) { d.dead = true; socket.disconnect(true); }
    });

    // Registers a handler: validates payload (silently drops invalid), catches all errors.
    function on(event, validator, handler, onInvalid) {
      socket.on(event, (payload, cb) => {
        const ack = ackFn(cb);
        try {
          if (socket.data.dead) return;
          const data = validators[validator](payload);
          if (!data) { if (onInvalid) onInvalid(); return; }
          const p = handler(data, ack);
          if (p && typeof p.catch === 'function') p.catch(() => ack({ ok: false, error: 'Something went wrong' }));
        } catch (_) {
          ack({ ok: false, error: 'Something went wrong' });
        }
      });
    }

    function hostRoom() {
      if (!socket.data.isHost || !socket.data.room) return null;
      const room = manager.getRoom(socket.data.room);
      if (!room || room.hid !== socket.data.hid) return null;
      return room;
    }

    // ---- host ----
    on('host:auth', 'hostAuth', async ({ pin }, ack) => {
      if (!authLimiter.hit(ip)) return ack({ ok: false, error: 'Too many attempts. Try again later.' });
      const ok = await auth.verifyPin(pin, config.ADMIN_PIN_HASH);
      if (!ok) return ack({ ok: false, error: 'Incorrect PIN' });
      const { token, hid } = auth.issueHostToken(config.SESSION_SECRET);
      socket.data.isHost = true;
      socket.data.hid = hid;
      ack({ ok: true, hostToken: token });
    });

    on('host:resume', 'hostResume', async ({ hostToken }, ack) => {
      const p = auth.verifyHostToken(config.SESSION_SECRET, hostToken);
      if (!p) return ack({ ok: false });
      socket.data.isHost = true;
      socket.data.hid = p.hid;
      const room = manager.getRoomByHid(p.hid);
      if (!room) return ack({ ok: true });
      bindHost(socket, room);
      // No touch(): a refresh is not activity and must not extend the lobby timer.
      const info = roomInfo(room);
      if (!room.qr) room.qr = await makeQr(info.joinUrl);
      ack({ ok: true, room: { code: room.code, joinUrl: info.joinUrl, qrSvg: room.qr } });
      sendSnapshot(socket, room, 'host');
    });

    on('host:packs', 'empty', (_d, ack) => {
      if (!socket.data.isHost) return;
      ack({ ok: true, packs: listPacks(hostPacks) });
    });

    // Question pack review (answers included): authenticated host sockets only; same visibility as host:packs.
    on('host:review', 'hostReview', ({ packId }, ack) => {
      if (!socket.data.isHost) return;
      const p = hostPacks.get(packId);
      if (!p) return ack({ ok: false, error: 'Pack not found' });
      const lines = p.lines || [];
      ack({
        ok: true,
        issuesUrl: config.ISSUES_URL || '',
        pack: { meta: p.meta, questions: p.questions.map((q, i) => Object.assign({}, q, { line: lines[i] || i + 1 })) },
      });
    });

    on('host:create', 'hostCreate', async (d, ack) => {
      if (!socket.data.isHost) return;
      const res = manager.createRoom(socket.data.hid, d);
      if (!res.ok) return ack({ ok: false, error: res.error });
      const room = res.room;
      const { joinUrl } = roomInfo(room);
      room.qr = await makeQr(joinUrl);
      bindHost(socket, room);
      ack({ ok: true, code: room.code, joinUrl, qrSvg: room.qr });
      sendSnapshot(socket, room, 'host');
    });

    const hostAction = (event, fn, validator = 'empty') => on(event, validator, (d, ack) => {
      const room = hostRoom();
      if (!room) return;
      const ok = fn(room, d);
      ack({ ok: ok !== false });
    });
    hostAction('host:start', (r) => manager.start(r));
    hostAction('host:next', (r) => manager.next(r));
    hostAction('host:skip', (r) => manager.skip(r));
    hostAction('host:extend', (r) => manager.extend(r));
    on('host:end', 'empty', (_d, ack) => {
      const room = hostRoom();
      if (!room) return;
      const closed = manager.end(room) === 'closed';
      if (closed) socket.data.room = null; // unbind; the host token stays valid for host:create
      ack({ ok: true, closed });
    });
    hostAction('host:kick', (r, d) => {
      const ok = manager.kick(r, d.playerId);
      if (ok) io.in(`p:${r.code}:${d.playerId}`).disconnectSockets(true);
      return ok;
    }, 'hostKick');

    // ---- player ----
    function bindPlayer(room, pid) {
      socket.data.room = room.code;
      socket.data.pid = pid;
      socket.join([`room:${room.code}`, `players:${room.code}`, `p:${room.code}:${pid}`]);
      manager.setConnected(room, pid, +1);
      socket.data.counted = true;
    }

    // Only FAILED joins (unknown/ended code, invalid payload) count against the per-IP limit,
    // so many players behind one NAT can join freely. Each socket also gets a few attempts.
    on('player:join', 'playerJoin', ({ code, composed }, ack) => {
      if (socket.data.room) return ack({ ok: false, error: 'Could not join' });
      socket.data.joinTries = (socket.data.joinTries || 0) + 1;
      if (socket.data.joinTries > limits.joinSocketMax || joinLimiter.isLimited(ip)) {
        return ack({ ok: false, error: 'Too many attempts. Try again later.' });
      }
      const room = manager.getRoom(code);
      if (!room || room.phase === 'over') {
        joinLimiter.hit(ip);
        return ack({ ok: false, error: 'Game not found' });
      }
      const res = manager.joinPlayer(code, composed);
      if (!res.ok) return ack({ ok: false, error: res.error });
      bindPlayer(res.room, res.player.id);
      ack({ ok: true, playerToken: res.token, playerId: res.player.id, name: res.player.name, badge: res.player.badge, display: res.player.display });
      sendSnapshot(socket, res.room, 'player', res.player.id);
    }, () => { joinLimiter.hit(ip); });

    on('player:rejoin', 'playerRejoin', ({ playerToken }, ack) => {
      if (socket.data.room) return ack({ ok: false });
      const res = manager.rejoin(playerToken);
      if (!res) return ack({ ok: false });
      const { room, player } = res;
      bindPlayer(room, player.id);
      ack({ ok: true, state: { code: room.code, id: player.id, name: player.name, badge: player.badge, display: player.display, score: player.score, answeredIndex: room.phase === 'question' && manager.hasAnswered(room, player.id) ? room.qIndex : null } });
      sendSnapshot(socket, room, 'player', player.id);
    });

    on('player:answer', 'playerAnswerEnvelope', ({ value }, ack) => {
      if (!socket.data.pid || !socket.data.room) return;
      const room = manager.getRoom(socket.data.room);
      if (!room) return;
      const ok = manager.answer(room, socket.data.pid, value);
      if (ok) return ack({ ok: true });
      const already = room.phase === 'question' && manager.hasAnswered(room, socket.data.pid);
      ack(already ? { ok: false, already: true } : { ok: false });
    });

    socket.on('disconnect', () => {
      try {
        const d = socket.data;
        if (d.counted && d.room && d.pid) {
          const room = manager.getRoom(d.room);
          if (room) manager.setConnected(room, d.pid, -1);
        }
      } catch (_) { /* ignore */ }
    });
  });

  function listen(port = config.PORT, host = config.HOST) {
    return new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => { httpServer.removeListener('error', reject); resolve(httpServer.address().port); });
    });
  }

  function close() {
    manager.shutdown();
    authLimiter.close();
    joinLimiter.close();
    return new Promise((resolve) => {
      io.close(() => resolve());
    });
  }

  return { app, httpServer, io, manager, listen, close, packs };
}

module.exports = { createServer };

if (require.main === module) {
  let config;
  try {
    config = require('./lib/config').getConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const s = createServer(config);
  s.listen().then((port) => {
    console.log(`Holy Day Game Show listening on http://${config.HOST}:${port} (${config.NODE_ENV}); ${s.packs.size} pack(s) loaded`);
    if (config.DEV_PIN) console.log(`Development admin PIN (shown once): ${config.DEV_PIN}`);
  }).catch((e) => { console.error('Failed to start:', e.code || 'error'); process.exit(1); });
  const stop = () => { s.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
