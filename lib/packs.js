'use strict';
// Loads question packs from disk. Synchronous, read-only.
const fs = require('node:fs');
const path = require('node:path');
const { validateQuestion, validatePack, LIMITS } = require('../public/shared/schema.js');

const MAX_FILE_BYTES = 1024 * 1024;
const FOLDER_RE = /^(?:[a-z0-9-]{1,40}|_[a-z0-9_-]{0,39})$/;

function lstatSafe(p) { try { return fs.lstatSync(p); } catch (_) { return null; } }

function readRegular(p, maxBytes) {
  const st = lstatSafe(p);
  if (!st || st.isSymbolicLink() || !st.isFile()) return { missing: !st, text: null, reason: st ? 'not a regular file' : 'missing' };
  if (st.size > maxBytes) return { text: null, reason: 'file too large (max ' + maxBytes + ' bytes)' };
  return { text: fs.readFileSync(p, 'utf8') };
}

/**
 * Loads one pack folder. Returns { meta, questions, errors:[{file,line,message}] } or null if the pack is unusable.
 */
function loadPack(dir, name, report) {
  const packFile = path.join(dir, 'pack.json');
  const pr = readRegular(packFile, MAX_FILE_BYTES);
  if (pr.text === null) { report(name + '/pack.json', 0, 'cannot read pack.json (' + pr.reason + ')'); return null; }
  let raw;
  try { raw = JSON.parse(pr.text.replace(/^﻿/, '')); }
  catch (e) { report(name + '/pack.json', 0, 'invalid JSON: ' + e.message); return null; }
  const pv = validatePack(raw);
  if (!pv.ok) { pv.errors.forEach((m) => report(name + '/pack.json', 0, m)); return null; }
  if (pv.value.id !== name) { report(name + '/pack.json', 0, 'pack id "' + pv.value.id + '" must equal folder name "' + name + '"'); return null; }

  const questions = [];
  const qr = readRegular(path.join(dir, 'questions.jsonl'), MAX_FILE_BYTES);
  if (qr.text === null) {
    report(name + '/questions.jsonl', 0, 'cannot read questions.jsonl (' + qr.reason + ')');
    return { meta: pv.value, questions };
  }
  const lines = qr.text.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    const where = name + '/questions.jsonl';
    if (questions.length >= LIMITS.maxQuestionsPerPack) {
      report(where, i + 1, 'too many questions (max ' + LIMITS.maxQuestionsPerPack + '); remaining lines ignored');
      break;
    }
    let obj;
    try { obj = JSON.parse(line); } catch (e) { report(where, i + 1, 'invalid JSON: ' + e.message); continue; }
    const v = validateQuestion(obj);
    if (!v.ok) { v.errors.forEach((m) => report(where, i + 1, m)); continue; }
    questions.push(v.value);
  }
  return { meta: pv.value, questions };
}

/**
 * loadPacks(dir) -> Map<packId, {meta, questions}>
 * opts.onError(file, line, message) overrides console.warn logging (used by the CLI).
 */
function loadPacks(dir = path.join(__dirname, '..', 'questions'), opts = {}) {
  const packs = new Map();
  const report = opts.onError || ((file, line, msg) => console.warn(line ? `${file}:${line}: ${msg}` : `${file}: ${msg}`));
  let entries;
  try { entries = fs.readdirSync(dir).sort(); } catch (e) { report(String(dir), 0, 'cannot read questions directory'); return packs; }
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = lstatSafe(full);
    if (!st || st.isSymbolicLink() || !st.isDirectory()) continue;
    if (!FOLDER_RE.test(name)) { report(name, 0, 'skipped: invalid pack folder name'); continue; }
    const pack = loadPack(full, name, report);
    if (pack) packs.set(name, pack);
  }
  return packs;
}

function listPacks(packs) {
  const out = [];
  for (const [id, p] of packs) {
    const byType = {};
    for (const q of p.questions) byType[q.type] = (byType[q.type] || 0) + 1;
    out.push({ id, title: p.meta.title, theme: p.meta.theme, reverent: !!p.meta.reverent,
      counts: { total: p.questions.length, byType } });
  }
  return out;
}

module.exports = { loadPacks, listPacks, loadPack };
