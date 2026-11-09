'use strict';
// The ONLY module that reads process.env.
require('dotenv').config();
const crypto = require('node:crypto');
const { hashPinSync, isValidHashFormat } = require('./auth');
const { parseTrustProxy } = require('./proxy');

function isPlaceholder(v) {
  return typeof v !== 'string' || v.trim() === '' || v.trim().startsWith('<');
}

function intVar(env, name, def, min, max, errors) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  if (!/^\d{1,9}$/.test(String(raw))) { errors.push(`${name} must be an integer`); return def; }
  const n = Number(raw);
  if (n < min || n > max) { errors.push(`${name} must be between ${min} and ${max}`); return def; }
  return n;
}

function loadConfig(env = process.env) {
  const errors = [];
  // Fail closed: anything other than development/test is treated as production.
  const isProd = !(env.NODE_ENV === 'development' || env.NODE_ENV === 'test');
  const PORT = intVar(env, 'PORT', 3719, 0, 65535, errors);
  const HOST = isPlaceholder(env.HOST) ? '127.0.0.1' : String(env.HOST).trim();
  if (!/^[0-9a-zA-Z.:\-]{1,100}$/.test(HOST)) errors.push('HOST is invalid');
  const MAX_ROOMS = intVar(env, 'MAX_ROOMS', 20, 1, 1000, errors);
  const MAX_PLAYERS_PER_ROOM = intVar(env, 'MAX_PLAYERS_PER_ROOM', 60, 1, 500, errors);

  let PUBLIC_ORIGIN = env.PUBLIC_ORIGIN;
  if (isPlaceholder(PUBLIC_ORIGIN)) {
    if (isProd) errors.push('PUBLIC_ORIGIN is required in production');
    PUBLIC_ORIGIN = `http://localhost:${PORT}`;
  } else {
    try {
      const u = new URL(PUBLIC_ORIGIN.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('proto');
      PUBLIC_ORIGIN = u.origin;
    } catch {
      errors.push('PUBLIC_ORIGIN must be a valid http(s) origin');
    }
  }

  let SESSION_SECRET = env.SESSION_SECRET;
  if (isPlaceholder(SESSION_SECRET)) {
    if (isProd) errors.push('SESSION_SECRET is required in production');
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  } else if (isProd && !/^[0-9a-fA-F]{64,}$/.test(SESSION_SECRET)) {
    errors.push('SESSION_SECRET must be at least 64 hex characters');
  } else if (!isProd && SESSION_SECRET.length < 16) {
    errors.push('SESSION_SECRET is too short');
  }

  let ADMIN_PIN_HASH = env.ADMIN_PIN_HASH;
  let DEV_PIN = null;
  if (isPlaceholder(ADMIN_PIN_HASH)) {
    if (isProd) {
      errors.push('ADMIN_PIN_HASH is required in production');
    } else {
      DEV_PIN = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      ADMIN_PIN_HASH = hashPinSync(DEV_PIN);
    }
  } else if (!isValidHashFormat(ADMIN_PIN_HASH)) {
    errors.push('ADMIN_PIN_HASH has an invalid format (run npm run hash-pin)');
  }

  const tp = parseTrustProxy(env.TRUST_PROXY);
  if (!tp.ok) errors.push(tp.error);
  const TRUST_PROXY = tp.ok ? tp.value : 'loopback';

  let SHOW_SAMPLE_PACKS = false;
  const sp = env.SHOW_SAMPLE_PACKS;
  if (sp !== undefined && String(sp).trim() !== '') {
    const v = String(sp).trim().toLowerCase();
    if (v === '1' || v === 'true') SHOW_SAMPLE_PACKS = true;
    else if (v === '0' || v === 'false') SHOW_SAMPLE_PACKS = false;
    else errors.push('SHOW_SAMPLE_PACKS must be 1, true, 0 or false');
  }

  const QUESTIONS_DIR = isPlaceholder(env.QUESTIONS_DIR) ? null : env.QUESTIONS_DIR;

  if (errors.length) {
    throw new Error('Invalid configuration: ' + errors.join('; '));
  }
  return Object.freeze({
    NODE_ENV: isProd ? 'production' : env.NODE_ENV,
    isProd, HOST, TRUST_PROXY, SHOW_SAMPLE_PACKS, PORT, PUBLIC_ORIGIN, ADMIN_PIN_HASH, SESSION_SECRET,
    MAX_ROOMS, MAX_PLAYERS_PER_ROOM, QUESTIONS_DIR, DEV_PIN,
  });
}

let cached = null;
function getConfig() {
  if (!cached) cached = loadConfig(process.env);
  return cached;
}

module.exports = { loadConfig, getConfig };
