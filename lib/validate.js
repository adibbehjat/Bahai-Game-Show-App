'use strict';
// Strict, exact-key validators for every inbound socket event.
// Each returns a cleaned value object, or null when the payload is invalid.
const GameNames = require('../public/shared/names.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const PACK_ID_RE = /^(?:[a-z0-9-]{1,40}|_[a-z0-9_-]{0,39})$/;
const ID_RE = /^[a-f0-9]{8,32}$/;

function isPlain(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const proto = Object.getPrototypeOf(o);
  return proto === Object.prototype || proto === null;
}

function exactKeys(o, keys) {
  if (!isPlain(o)) return false;
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
}

function str(v, max) {
  return typeof v === 'string' && v.length <= max;
}

function len(s) {
  return Array.from(s).length;
}

const validators = {
  empty(o) { return exactKeys(o, []) ? {} : null; },
  hostAuth(o) { return exactKeys(o, ['pin']) && str(o.pin, 128) && o.pin.length > 0 ? { pin: o.pin } : null; },
  hostResume(o) { return exactKeys(o, ['hostToken']) && str(o.hostToken, 600) ? { hostToken: o.hostToken } : null; },
  hostReview(o) { return exactKeys(o, ['packId']) && str(o.packId, 40) && PACK_ID_RE.test(o.packId) ? { packId: o.packId } : null; },
  hostCreate(o) {
    if (!isPlain(o)) return null;
    const hasGentle = Object.prototype.hasOwnProperty.call(o, 'gentle');
    if (!exactKeys(o, hasGentle ? ['packId', 'count', 'includeSpell', 'gentle'] : ['packId', 'count', 'includeSpell'])) return null;
    if (!str(o.packId, 40) || !PACK_ID_RE.test(o.packId)) return null;
    if (!Number.isInteger(o.count) || o.count < 1 || o.count > 30) return null;
    if (typeof o.includeSpell !== 'boolean') return null;
    if (hasGentle && typeof o.gentle !== 'boolean') return null;
    return { packId: o.packId, count: o.count, includeSpell: o.includeSpell, gentle: hasGentle ? o.gentle : undefined };
  },
  hostKick(o) { return exactKeys(o, ['playerId']) && str(o.playerId, 32) && ID_RE.test(o.playerId) ? { playerId: o.playerId } : null; },
  playerJoin(o) {
    if (!exactKeys(o, ['code', 'adj', 'flower', 'badge'])) return null;
    if (!str(o.code, 12) || !exactKeys(o.badge, ['kind', 'value'])) return null;
    const code = o.code; // strict: no case folding or trimming server-side
    if (!CODE_RE.test(code)) return null;
    const composed = GameNames.compose({ adj: o.adj, flower: o.flower, badge: o.badge });
    if (!composed) return null;
    return { code, composed };
  },
  playerRejoin(o) { return exactKeys(o, ['playerToken']) && str(o.playerToken, 600) ? { playerToken: o.playerToken } : null; },
  playerAnswerEnvelope(o) { return exactKeys(o, ['value']) ? { value: o.value } : null; },
};

function isIntIn(v, lo, hi) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

// Checks an answer value against the question type. Returns the value to use, or undefined if invalid.
function answerValue(question, value) {
  switch (question.type) {
    case 'single': {
      const n = question.choices.length;
      return isIntIn(value, 0, n - 1) ? value : undefined;
    }
    case 'truefalse':
      return typeof value === 'boolean' ? value : undefined;
    case 'multi': {
      const n = question.choices.length;
      if (!Array.isArray(value) || value.length < 1 || value.length > n) return undefined;
      if (!value.every((v) => isIntIn(v, 0, n - 1))) return undefined;
      if (new Set(value).size !== value.length) return undefined;
      return value.slice();
    }
    case 'order': {
      const n = question.items.length;
      if (!Array.isArray(value) || value.length !== n) return undefined;
      if (!value.every((v) => isIntIn(v, 0, n - 1))) return undefined;
      if (new Set(value).size !== n) return undefined;
      return value.slice();
    }
    case 'spell':
      return typeof value === 'string' && len(value) <= 40 ? value : undefined;
    default:
      return undefined;
  }
}

module.exports = { validators, answerValue, CODE_ALPHABET, CODE_RE, isPlain, exactKeys };
