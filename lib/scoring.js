'use strict';
// Pure scoring functions (CONTRACT §3).
const GameSchema = require('../public/shared/schema.js');

const BASE = 1000;

function speedFactor(remainingMs, totalMs) {
  if (!(totalMs > 0)) return 0.5;
  const r = Math.min(Math.max(remainingMs, 0), totalMs);
  return 0.5 + 0.5 * (r / totalMs);
}

function levenshtein(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;
  let prev = new Array(y.length + 1);
  for (let j = 0; j <= y.length; j++) prev[j] = j;
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[y.length];
}

function similarity(a, b) {
  if (a === b) return 1;
  const m = Math.max(Array.from(a).length, Array.from(b).length);
  if (m === 0) return 1;
  return Math.max(0, 1 - levenshtein(a, b) / m);
}

function scoreSingle(q, value, speed) {
  const ok = value === q.answer;
  return { correct: ok, partial: false, fraction: ok ? 1 : 0, points: ok ? Math.round(BASE * speed) : 0 };
}

function scoreMulti(q, value, speed) {
  const correctSet = new Set(q.answer);
  let right = 0;
  let wrong = 0;
  for (const v of value) (correctSet.has(v) ? right++ : wrong++);
  const fraction = Math.max(0, (right - wrong) / correctSet.size);
  const full = right === correctSet.size && wrong === 0;
  return { correct: full, partial: !full && fraction > 0, fraction, points: Math.round(BASE * fraction * speed) };
}

function scoreOrder(q, value, speed) {
  let hit = 0;
  for (let k = 0; k < q.answer.length; k++) if (value[k] === q.answer[k]) hit++;
  const fraction = hit / q.answer.length;
  const full = hit === q.answer.length;
  return { correct: full, partial: !full && fraction > 0, fraction, points: Math.round(BASE * fraction * speed) };
}

function scoreSpell(q, attempt, speed) {
  const fold = GameSchema.foldForCompare;
  const a = fold(attempt);
  let sim = 0;
  for (const target of [q.word, ...(q.accept || [])]) {
    sim = Math.max(sim, similarity(a, fold(target)));
  }
  const exactWithDiacritics =
    GameSchema.normalizeText(attempt).toLowerCase() === GameSchema.normalizeText(q.word).toLowerCase();
  let points = BASE * sim * sim * speed;
  if (exactWithDiacritics) points *= 1.1;
  const matchPct = Math.round(sim * 100);
  return { correct: sim === 1, partial: sim < 1 && sim > 0, fraction: sim, points: Math.round(points), matchPct };
}

// Returns { correct, partial, fraction, points, matchPct? }. Does not retain `value`.
function scoreAnswer(q, value, { remainingMs, totalMs, gentle = false }) {
  const speed = gentle ? 1 : speedFactor(remainingMs, totalMs);
  switch (q.type) {
    case 'single':
    case 'truefalse': return scoreSingle(q, value, speed);
    case 'multi': return scoreMulti(q, value, speed);
    case 'order': return scoreOrder(q, value, speed);
    case 'spell': return scoreSpell(q, value, speed);
    default: return { correct: false, partial: false, fraction: 0, points: 0 };
  }
}

module.exports = { BASE, speedFactor, levenshtein, similarity, scoreAnswer };
