'use strict';
// Room state machine: lobby -> question -> reveal -> question -> ... -> reveal -> over.
// Transport-agnostic: server.js supplies `emit` hooks. All timers live here.
const crypto = require('node:crypto');
const auth = require('./auth');
const scoring = require('./scoring');
const { answerValue, CODE_ALPHABET } = require('./validate');

const IDLE_MS = 30 * 60 * 1000;
const OVER_TTL_MS = 10 * 60 * 1000;
const LOBBY_IDLE_MS = 5 * 60 * 1000;
const CLOSING_WARN_MS = 60 * 1000;
const SWEEP_MS = 5 * 1000;
const EXTEND_MS = 15000;
const MAX_EXTENDS = 3;

function shuffle(arr, randInt) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createRoomManager({ config, packs, emit, onDestroy = () => {}, onLog = () => {}, now = Date.now, randInt = crypto.randomInt }) {
  const rooms = new Map(); // code -> room
  const hostRooms = new Map(); // hid -> code

  function genCode() {
    for (let tries = 0; tries < 50; tries++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[randInt(0, CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    return null;
  }

  // Records activity. In the lobby the close time moves, so re-broadcast room:state (unless the caller does).
  function touch(room, quiet) {
    room.lastActivity = now();
    room.closingSent = false;
    if (!quiet && room.phase === 'lobby') broadcastState(room);
  }

  function roomKey(room) {
    return auth.deriveKey(config.SESSION_SECRET, `room:${room.code}:${room.nonce}`);
  }

  function ranked(room) {
    return Array.from(room.players.values())
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  }

  function publicState(room) {
    return {
      phase: room.phase,
      code: room.code,
      gentle: room.gentle,
      closesAt: room.phase === 'lobby' ? room.lastActivity + LOBBY_IDLE_MS : null,
      serverNow: now(),
      packTitle: room.pack.meta.title,
      theme: room.pack.meta.theme,
      reverent: !!room.pack.meta.reverent,
      players: Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name, badge: p.badge, score: p.score, connected: p.sockets > 0 })),
      qIndex: room.qIndex,
      qTotal: room.questions.length,
      // Extra (non-secret) fields beyond CONTRACT §2: opening/closing quotes.
      opening: room.pack.meta.opening || null,
      closing: room.pack.meta.closing || null,
    };
  }

  function broadcastState(room) { emit.room(room.code, 'room:state', publicState(room)); }

  function currentQ(room) { return room.questions[room.qIndex]; }

  function questionBase(room, q) {
    const out = {
      index: room.qIndex, total: room.questions.length, type: q.type,
      time: room.qTime, endsAt: room.endsAt, serverNow: now(),
    };
    if (q.choices) out.choices = q.choices.slice();
    if (q.items) out.items = q.items.slice();
    return out;
  }

  function hostQuestionPayload(room) {
    const q = currentQ(room);
    const out = questionBase(room, q);
    if (q.type === 'spell') { out.clue = q.clue; Object.assign(out, scoring.spellHint(q.word)); } else out.q = q.q;
    return out;
  }

  function playerQuestionPayload(room) {
    const q = currentQ(room);
    const out = questionBase(room, q);
    if (q.type === 'spell') Object.assign(out, scoring.spellHint(q.word));
    out.prompt = q.type === 'spell' ? 'Spell the word from the big screen. Close counts!' : q.q;
    return out;
  }

  function connectedCount(room) {
    let n = 0;
    for (const p of room.players.values()) if (p.sockets > 0) n++;
    return n;
  }

  function answeredCount(room) { return room.answers.size; }

  function progress(room) {
    emit.host(room.code, 'question:progress', { answered: answeredCount(room), total: connectedCount(room) });
  }

  function clearTimer(room) {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
  }

  function startQuestion(room) {
    const q = currentQ(room);
    room.phase = 'question';
    room.answers = new Map();
    room.results = new Map();
    room.lastReveal = null;
    room.qTime = q.time || (q.type === 'spell' ? 30 : 20);
    room.extendCount = 0;
    room.startedAt = now();
    room.endsAt = room.startedAt + room.qTime * 1000;
    clearTimer(room);
    room.timer = setTimeout(() => { try { reveal(room); } catch (_) { /* never leak */ } }, room.qTime * 1000 + 20);
    broadcastState(room);
    emit.host(room.code, 'question:show', hostQuestionPayload(room));
    emit.players(room.code, 'question:show', playerQuestionPayload(room));
    progress(room);
  }

  function revealAnswer(q) {
    if (q.type === 'spell') return q.word;
    return q.answer;
  }

  function reveal(room) {
    if (room.phase !== 'question') return;
    clearTimer(room);
    const q = currentQ(room);
    room.phase = 'reveal';
    let correct = 0;
    let sumPct = 0;
    let perfect = 0;
    for (const p of room.players.values()) {
      const r = room.answers.get(p.id);
      if (r) {
        p.score += r.points;
        if (r.correct) correct++;
        if (q.type === 'spell') { sumPct += r.matchPct; if (r.matchPct === 100) perfect++; }
      }
    }
    const submitted = room.answers.size;
    const stats = q.type === 'spell'
      ? { submitted, perfect, avgMatch: submitted ? Math.round(sumPct / submitted) : 0 }
      : { answered: submitted, correct };
    room.lastReveal = {
      answer: revealAnswer(q), explanation: q.explanation || '', source: q.source || '', stats,
    };
    broadcastState(room);
    emit.room(room.code, 'question:reveal', room.lastReveal);
    emitLeaderboard(room);
    for (const p of room.players.values()) emit.player(room.code, p.id, 'you:rank', rankOf(room, p.id));
    for (const p of room.players.values()) {
      const r = room.answers.get(p.id);
      const res = {
        answered: !!r, correct: !!(r && r.correct), partial: !!(r && r.partial),
        points: r ? r.points : 0, score: p.score,
      };
      if (q.type === 'spell' && r) res.matchPct = r.matchPct;
      room.results.set(p.id, res);
      emit.player(room.code, p.id, 'you:result', res);
    }
  }

  function rankOf(room, pid) {
    const me = room.players.get(pid);
    if (!me) return null;
    let higher = 0;
    for (const p of room.players.values()) if (p.score > me.score) higher++;
    return { rank: higher + 1, of: room.players.size, score: me.score };
  }

  function leaderboardPayload(room) {
    const list = ranked(room);
    const top = list.slice(0, 5).map((p) => ({ rank: rankOf(room, p.id).rank, name: p.name, badgeText: p.badge.text, score: p.score }));
    return { top, totalPlayers: room.players.size };
  }

  function emitLeaderboard(room) { emit.room(room.code, 'leaderboard', leaderboardPayload(room)); }

  function podium(room) {
    return { podium: ranked(room).slice(0, 3).map((p) => ({ name: p.name, badge: p.badge, score: p.score })) };
  }

  function finish(room) {
    clearTimer(room);
    room.phase = 'over';
    room.endedAt = now();
    broadcastState(room);
    emit.room(room.code, 'game:over', podium(room));
    onLog('room ended', room.code);
  }

  // ---- Public API ----
  function createRoom(hid, { packId, count, includeSpell, gentle }) {
    const pack = packs.get(packId);
    if (!pack) return { ok: false, error: 'Could not create game' };
    const existing = hostRooms.get(hid);
    if (existing) {
      const old = rooms.get(existing);
      if (old && old.phase !== 'over') emit.players(existing, 'room:closed', { reason: 'ended' });
      destroy(existing);
    }
    if (rooms.size >= config.MAX_ROOMS) return { ok: false, error: 'Server is busy' };
    const pool = pack.questions.filter((q) => !(q.type === 'spell' && pack.meta.reverent && !includeSpell));
    if (pool.length === 0) return { ok: false, error: 'Could not create game' };
    const questions = shuffle(pool, randInt).slice(0, count);
    const code = genCode();
    if (!code) return { ok: false, error: 'Server is busy' };
    const room = {
      code, nonce: crypto.randomBytes(16).toString('hex'), hid, pack, questions,
      gentle: gentle === undefined ? !!pack.meta.reverent : !!gentle, extendCount: 0,
      phase: 'lobby', qIndex: -1, players: new Map(), names: new Set(),
      answers: new Map(), results: new Map(), lastReveal: null,
      closingSent: false, timer: null, qTime: 0, startedAt: 0, endsAt: 0, lastActivity: now(), endedAt: 0, qr: null,
    };
    rooms.set(code, room);
    hostRooms.set(hid, code);
    onLog('room created', code);
    return { ok: true, room };
  }

  function getRoom(code) { return rooms.get(code) || null; }
  function getRoomByHid(hid) { const c = hostRooms.get(hid); return c ? rooms.get(c) || null : null; }

  function destroy(code) {
    const room = rooms.get(code);
    if (!room) return;
    clearTimer(room);
    rooms.delete(code);
    if (hostRooms.get(room.hid) === code) hostRooms.delete(room.hid);
    room.players.clear();
    onLog('room destroyed', code);
    onDestroy(code);
  }

  function joinPlayer(code, composed) {
    const room = rooms.get(code);
    if (!room || room.phase === 'over') return { ok: false, error: 'Game not found' };
    const key = composed.display.toLowerCase();
    if (room.names.has(key)) return { ok: false, error: 'Name taken' };
    if (room.players.size >= config.MAX_PLAYERS_PER_ROOM) return { ok: false, error: 'Could not join' };
    const name = composed.name;
    const badge = { kind: composed.badgeKind, text: composed.badgeText };
    const pid = crypto.randomBytes(8).toString('hex');
    const player = { id: pid, name, badge, display: composed.display, nameKey: key, score: 0, sockets: 0, joinedAt: now() };
    room.players.set(pid, player);
    room.names.add(key);
    touch(room);
    emitLeaderboard(room);
    const token = auth.issuePlayerToken(roomKey(room), { room: room.code, pid, now: now() });
    return { ok: true, room, player, token };
  }

  function rejoin(token) {
    const peek = auth.peekToken(token);
    if (!peek || typeof peek.room !== 'string') return null;
    const room = rooms.get(peek.room);
    if (!room || room.phase === 'over' && now() - room.endedAt > OVER_TTL_MS) return null;
    if (!room) return null;
    const p = auth.verifyPlayerToken(roomKey(room), token, room.code, now());
    if (!p) return null;
    const player = room.players.get(p.pid);
    if (!player) return null;
    touch(room);
    return { room, player };
  }

  function setConnected(room, pid, delta) {
    const p = room.players.get(pid);
    if (!p) return;
    p.sockets = Math.max(0, p.sockets + delta);
    touch(room, true);
    broadcastState(room);
    if (room.phase === 'question') {
      progress(room);
      maybeAutoReveal(room);
    }
  }

  function maybeAutoReveal(room) {
    const c = connectedCount(room);
    if (c > 0 && room.phase === 'question') {
      for (const p of room.players.values()) {
        if (p.sockets > 0 && !room.answers.has(p.id)) return;
      }
      reveal(room);
    }
  }

  function answer(room, pid, value) {
    if (room.phase !== 'question') return false;
    const p = room.players.get(pid);
    if (!p || room.answers.has(pid)) return false;
    const t = now();
    if (t >= room.endsAt) return false;
    const q = currentQ(room);
    const v = answerValue(q, value);
    if (v === undefined) return false;
    const r = scoring.scoreAnswer(q, v, { remainingMs: room.endsAt - t, totalMs: room.qTime * 1000, gentle: room.gentle });
    // Only the scored result is kept; the raw value (esp. spell text) is discarded here.
    const rec = { points: r.points, correct: r.correct, partial: r.partial };
    if (q.type === 'spell') rec.matchPct = r.matchPct;
    room.answers.set(pid, rec);
    touch(room);
    progress(room);
    maybeAutoReveal(room);
    return true;
  }

  function start(room) {
    if (room.phase !== 'lobby' || room.players.size < 1) return false;
    touch(room, true);
    room.qIndex = 0;
    startQuestion(room);
    return true;
  }

  function next(room) {
    touch(room);
    if (room.phase !== 'reveal') return false;
    if (room.qIndex + 1 >= room.questions.length) finish(room);
    else { room.qIndex += 1; startQuestion(room); }
    return true;
  }

  function extend(room) {
    if (room.phase !== 'question' || room.extendCount >= MAX_EXTENDS) return false;
    touch(room);
    room.extendCount += 1;
    room.endsAt += EXTEND_MS;
    room.qTime += EXTEND_MS / 1000;
    clearTimer(room);
    room.timer = setTimeout(() => { try { reveal(room); } catch (_) { /* never leak */ } }, Math.max(0, room.endsAt - now()) + 20);
    emit.host(room.code, 'question:show', hostQuestionPayload(room));
    emit.players(room.code, 'question:show', playerQuestionPayload(room));
    progress(room);
    return true;
  }

  function skip(room) {
    if (room.phase !== 'question') return false;
    touch(room);
    reveal(room);
    return true;
  }

  // Lobby/over: closes (destroys) the room and returns 'closed'. Question/reveal: finishes to the podium (true).
  function end(room) {
    if (room.phase === 'lobby' || room.phase === 'over') {
      closeRoom(room, 'ended');
      return 'closed';
    }
    touch(room, true);
    finish(room);
    return true;
  }

  function kick(room, pid) {
    const p = room.players.get(pid);
    if (!p) return false;
    room.players.delete(pid);
    room.names.delete(p.nameKey);
    room.answers.delete(pid);
    touch(room, true);
    broadcastState(room);
    emitLeaderboard(room);
    for (const q of room.players.values()) emit.player(room.code, q.id, 'you:rank', rankOf(room, q.id));
    if (room.phase === 'question') { progress(room); maybeAutoReveal(room); }
    return true;
  }

  // Events a (re)connecting socket needs to catch up. Returns [[event, payload], ...].
  function snapshot(room, role, pid) {
    const out = [['room:state', publicState(room)]];
    if (room.phase === 'question') {
      out.push(['question:show', role === 'host' ? hostQuestionPayload(room) : playerQuestionPayload(room)]);
      if (role === 'host') out.push(['question:progress', { answered: answeredCount(room), total: connectedCount(room) }]);
    } else if (room.phase === 'reveal' && room.lastReveal) {
      out.push(['question:reveal', room.lastReveal]);
      if (role === 'player' && room.results.has(pid)) out.push(['you:result', room.results.get(pid)]);
    } else if (room.phase === 'over') {
      out.push(['game:over', podium(room)]);
    }
    out.push(['leaderboard', leaderboardPayload(room)]);
    if (role === 'player' && rankOf(room, pid)) out.push(['you:rank', rankOf(room, pid)]);
    return out;
  }

  function hasAnswered(room, pid) { return room.answers.has(pid); }

  function closeRoom(room, reason) {
    emit.room(room.code, 'room:closed', { reason });
    destroy(room.code);
  }

  function sweep() {
    const t = now();
    for (const room of Array.from(rooms.values())) {
      if (room.phase === 'over') {
        if (t - room.endedAt > OVER_TTL_MS) closeRoom(room, 'ended');
      } else if (room.phase === 'lobby') {
        const idle = t - room.lastActivity;
        if (idle >= LOBBY_IDLE_MS) closeRoom(room, 'idle');
        else if (idle >= LOBBY_IDLE_MS - CLOSING_WARN_MS && !room.closingSent) {
          room.closingSent = true;
          emit.room(room.code, 'room:closing', { inSeconds: 60 });
        }
      } else if (t - room.lastActivity > IDLE_MS) {
        closeRoom(room, 'idle');
      }
    }
  }
  const sweepTimer = setInterval(sweep, SWEEP_MS);
  if (sweepTimer.unref) sweepTimer.unref();

  function shutdown() {
    clearInterval(sweepTimer);
    for (const code of Array.from(rooms.keys())) destroy(code);
  }

  return {
    createRoom, getRoom, getRoomByHid, destroy, joinPlayer, rejoin, setConnected, answer,
    start, next, skip, extend, end, kick, snapshot, hasAnswered, sweep, shutdown, touch,
    publicState, size: () => rooms.size,
  };
}

module.exports = { createRoomManager, IDLE_MS, LOBBY_IDLE_MS, OVER_TTL_MS };
