/* Pure scoring functions (CONTRACT section 3) - UMD: window.GameScoring in browsers, module.exports in Node.
   Depends on GameSchema (window.GameSchema / ./schema.js) for normalizeText and foldForCompare. No Node-only APIs.

   API:
     BASE                                   1000
     speedFactor(remainingMs, totalMs)      0.5 + 0.5 * remaining/total, clamped to [0.5, 1]
     levenshtein(a, b)                      edit distance over code points
     similarity(a, b)                       1 - levenshtein / max(len), in [0, 1]
     foldForSpell(s)                        lower-case, accents and apostrophes/hyphens/spaces/periods removed
     spellDistance(a, b)                    keyboard-aware weighted Damerau-Levenshtein (OSA): QWERTY-adjacent
                                            substitution 0.5, doubled-letter insert/delete 0.5, transposition 0.5
     spellHint(word)                        { hint: 'B _ _ _ \' _ ...', letters } hangman-style hint
     spellSimilarity(a, b)                  max(0, 1 - spellDistance / max(len)); empty -> 0 (inputs pre-folded)
     scoreAnswer(q, value, {remainingMs, totalMs, gentle})
                                            -> { correct, partial, fraction, points, matchPct? }
                                            gentle=true sets the speed factor to 1. `value` is not retained. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schema.js'));
  else root.GameScoring = factory(root.GameSchema);
}(typeof self !== 'undefined' ? self : this, function (GameSchema) {
  'use strict';

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

  // ---- Spelling: forgiving, keyboard-aware comparison ----
  const SEPARATORS = /['’ʻ‘`´\-‐-―\s.]/g;

  // Lower-case, strip accents, drop apostrophes/hyphens/spaces/periods. (GameSchema.foldForCompare is untouched;
  // it is used for duplicate detection.)
  function foldForSpell(str) {
    return GameSchema.normalizeText(String(str == null ? '' : str)).toLowerCase()
      .normalize('NFD').replace(/\p{M}/gu, '').replace(SEPARATORS, '');
  }

  // Hangman-style hint: first letter as written (diacritic kept), '_' for every later letter, separators
  // (apostrophes, hyphens, periods, spaces) kept, tokens joined by single spaces. Combining marks belong
  // to the previous letter. Returns { hint, letters }.
  function spellHint(word) {
    const chars = Array.from(GameSchema.normalizeText(String(word == null ? '' : word)).normalize('NFC'));
    const tokens = [];
    let letters = 0;
    let revealed = false;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const isSep = c.replace(SEPARATORS, '') === '';
      if (!isSep && /\p{L}/u.test(c)) {
        let cluster = c;
        while (i + 1 < chars.length && /\p{M}/u.test(chars[i + 1])) { cluster += chars[i + 1]; i++; }
        letters++;
        if (!revealed) { tokens.push(cluster); revealed = true; } else tokens.push('_');
      } else if (/\p{M}/u.test(c) && tokens.length) {
        tokens[tokens.length - 1] += c;
      } else if (c === ' ') {
        // spaces are shown as a gap between words
        tokens.push(' ');
      } else {
        tokens.push(c);
      }
    }
    return { hint: tokens.join(' ').replace(/ {2,}/g, '   ').trim(), letters: letters };
  }

  // QWERTY neighbours (same row +-1 and the diagonal neighbours on adjacent rows).
  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const ADJ = (function () {
    const m = {};
    function link(a, b) { (m[a] = m[a] || {})[b] = true; (m[b] = m[b] || {})[a] = true; }
    ROWS.forEach(function (row, r) {
      for (let c = 0; c < row.length; c++) {
        if (c + 1 < row.length) link(row[c], row[c + 1]);
        if (r + 1 < ROWS.length) {
          link(row[c], ROWS[r + 1][c] || row[c]);
          if (ROWS[r + 1][c - 1]) link(row[c], ROWS[r + 1][c - 1]);
        }
      }
    });
    return m;
  }());
  // Note: ROWS[r+1][c] and [c-1] are the lower neighbours of row[c] (a stagger to the left); e.g. q:[w,a], m:[n,j,k].

  function subCost(a, b) {
    if (a === b) return 0;
    return ADJ[a] && ADJ[a][b] ? 0.5 : 1;
  }

  // Weighted Damerau-Levenshtein (optimal string alignment) over code points.
  function spellDistance(a, b) {
    const x = Array.from(a);
    const y = Array.from(b);
    const n = x.length;
    const m = y.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const delCost = (i) => ((i > 1 && x[i - 1] === x[i - 2]) || (i < n && x[i - 1] === x[i]) ? 0.5 : 1);
    const insCost = (j) => ((j > 1 && y[j - 1] === y[j - 2]) || (j < m && y[j - 1] === y[j]) ? 0.5 : 1);
    const d = [];
    for (let i = 0; i <= n; i++) { d.push(new Array(m + 1).fill(0)); }
    for (let i = 1; i <= n; i++) d[i][0] = d[i - 1][0] + delCost(i);
    for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + insCost(j);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let best = Math.min(
          d[i - 1][j] + delCost(i),
          d[i][j - 1] + insCost(j),
          d[i - 1][j - 1] + subCost(x[i - 1], y[j - 1])
        );
        if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1] && x[i - 1] !== x[i - 2]) {
          best = Math.min(best, d[i - 2][j - 2] + 0.5);
        }
        d[i][j] = best;
      }
    }
    return d[n][m];
  }

  // Inputs should already be folded with foldForSpell. Empty attempt -> 0.
  function spellSimilarity(a, b) {
    const la = Array.from(a).length;
    const lb = Array.from(b).length;
    if (la === 0 || lb === 0) return a === b && la === 0 && lb === 0 ? 0 : 0;
    if (a === b) return 1;
    return Math.max(0, 1 - spellDistance(a, b) / Math.max(la, lb));
  }

  function scoreSpell(q, attempt, speed) {
    const a = foldForSpell(attempt);
    let sim = 0;
    for (const target of [q.word, ...(q.accept || [])]) {
      sim = Math.max(sim, spellSimilarity(a, foldForSpell(target)));
    }
    // Bonus: exact including accents (case, apostrophes, hyphens, spaces and periods do not matter).
    const keepAccents = (str) => GameSchema.normalizeText(str).toLowerCase().replace(SEPARATORS, '');
    const exactWithDiacritics = a.length > 0 && keepAccents(attempt) === keepAccents(q.word);
    let points = BASE * Math.pow(sim, 1.5) * speed;
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

  return {
    BASE: BASE, speedFactor: speedFactor, levenshtein: levenshtein, similarity: similarity,
    foldForSpell: foldForSpell, spellHint: spellHint, spellDistance: spellDistance, spellSimilarity: spellSimilarity, scoreAnswer: scoreAnswer
  };
}));
