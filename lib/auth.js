'use strict';
// scrypt PIN hashing + HMAC-signed tokens. No process.env access here.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 32;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function maxmemFor(N, r) {
  return 128 * N * r * 2 + 1024 * 1024;
}

function hashPinSync(pin, params = {}) {
  const { N, r, p } = { ...DEFAULT_PARAMS, ...params };
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pin), salt, KEYLEN, { N, r, p, maxmem: maxmemFor(N, r) });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${h.toString('base64')}`;
}

async function hashPin(pin, params = {}) {
  const { N, r, p } = { ...DEFAULT_PARAMS, ...params };
  const salt = crypto.randomBytes(16);
  const h = await scryptAsync(String(pin), salt, KEYLEN, { N, r, p, maxmem: maxmemFor(N, r) });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${h.toString('base64')}`;
}

function parseHash(str) {
  if (typeof str !== 'string' || str.length > 400) return null;
  const parts = str.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 1024 || N > 1 << 20 || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > 32) return null;
  if (!Number.isInteger(p) || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

function isValidHashFormat(str) {
  return parseHash(str) !== null;
}

async function verifyPin(pin, stored) {
  const parsed = parseHash(stored);
  if (!parsed || typeof pin !== 'string') return false;
  try {
    const { N, r, p, salt, hash } = parsed;
    const got = await scryptAsync(pin, salt, hash.length, { N, r, p, maxmem: maxmemFor(N, r) });
    return got.length === hash.length && crypto.timingSafeEqual(got, hash);
  } catch {
    return false;
  }
}

// ---- Tokens: base64url(JSON payload) + '.' + base64url(HMAC-SHA256) ----
function deriveKey(secret, label) {
  return crypto.createHmac('sha256', String(secret)).update(String(label)).digest();
}

function signToken(payload, key) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function decode(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  return parts;
}

// Decode WITHOUT verifying (only used to find which key to verify with).
function peekToken(token) {
  const parts = decode(token);
  if (!parts) return null;
  try {
    const obj = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

function verifyToken(token, key, now = Date.now()) {
  const parts = decode(token);
  if (!parts) return null;
  const expected = crypto.createHmac('sha256', key).update(parts[0]).digest();
  const given = Buffer.from(parts[1], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const payload = peekToken(token);
  if (!payload || typeof payload.exp !== 'number' || payload.exp <= now) return null;
  return payload;
}

function issueHostToken(secret, { hid, now = Date.now(), ttlMs = TOKEN_TTL_MS } = {}) {
  const id = hid || crypto.randomBytes(12).toString('hex');
  return { token: signToken({ t: 'h', hid: id, iat: now, exp: now + ttlMs }, deriveKey(secret, 'host')), hid: id };
}

function verifyHostToken(secret, token, now = Date.now()) {
  const p = verifyToken(token, deriveKey(secret, 'host'), now);
  return p && p.t === 'h' && typeof p.hid === 'string' ? p : null;
}

function issuePlayerToken(roomKey, { room, pid, now = Date.now(), ttlMs = TOKEN_TTL_MS }) {
  return signToken({ t: 'p', room, pid, iat: now, exp: now + ttlMs }, roomKey);
}

function verifyPlayerToken(roomKey, token, room, now = Date.now()) {
  const p = verifyToken(token, roomKey, now);
  return p && p.t === 'p' && p.room === room && typeof p.pid === 'string' ? p : null;
}

module.exports = {
  hashPin, hashPinSync, verifyPin, isValidHashFormat, parseHash,
  deriveKey, signToken, verifyToken, peekToken,
  issueHostToken, verifyHostToken, issuePlayerToken, verifyPlayerToken,
  TOKEN_TTL_MS,
};
