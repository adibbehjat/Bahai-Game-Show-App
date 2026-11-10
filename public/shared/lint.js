/* Question "giveaway" heuristics for the review page - UMD: window.GameLint / module.exports. Pure; no DOM.
   lintQuestion(q) -> [{ code, message }]. These are hints for human reviewers, not errors. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameLint = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = ('about above after again against almost along also although always among another because before being below between ' +
    'both could during each either every first from further have having here itself later might more most much never only other ' +
    'ought over rather same several shall should since still such than that their theirs them then there these they this those ' +
    'through under until upon very was were what when where which while whom whose will with within without would your ' +
    'which whose select following these answer story called named known').split(' ');
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = true; });

  var ABSOLUTES = ['always', 'never', 'only', 'all', 'none', 'last', 'first', 'far more'];
  var SEQUENCE = ['first', 'then', 'later', 'finally', 'before', 'after'];

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[ʻʼ’‘'`´]/g, '');
  }
  function words(s) { return fold(s).match(/\p{L}+/gu) || []; }
  function distinctive(s) {
    var seen = {}, out = [];
    words(s).forEach(function (w) { if (w.length >= 5 && !STOPSET[w] && !seen[w]) { seen[w] = true; out.push(w); } });
    return out;
  }
  function len(s) { return Array.from(String(s)).length; }
  function avg(a) { return a.reduce(function (t, x) { return t + x; }, 0) / a.length; }
  function hasWord(text, w) { return new RegExp('(^|[^\\p{L}])' + w + '($|[^\\p{L}])', 'u').test(fold(text)); }

  function split(q) {
    var correct = [], wrong = [];
    var ans = q.type === 'single' ? [q.answer] : (Array.isArray(q.answer) ? q.answer : []);
    (q.choices || []).forEach(function (c, i) { (ans.indexOf(i) !== -1 ? correct : wrong).push(String(c)); });
    return { correct: correct, wrong: wrong };
  }

  function lintQuestion(q) {
    var out = [];
    function add(code, message) { out.push({ code: code, message: message }); }
    if (!q || typeof q !== 'object') return out;
    var t = q.type;

    if (t === 'single' || t === 'multi') {
      var s = split(q);
      var c = s.correct, w = s.wrong;
      if (c.length && w.length) {
        var cl = avg(c.map(len)), wl = avg(w.map(len));
        if (wl > 0 && cl >= 1.4 * wl) {
          add('long-correct', 'The correct choice' + (c.length > 1 ? 's are' : ' is') + ' much longer than the others (' + (cl / wl).toFixed(1) + 'x the average wrong choice).');
        }
        if (t === 'single') {
          [[/,/, 'a comma'], [/[()]/, 'a parenthesis'], [/\d/, 'a digit']].forEach(function (p) {
            if (p[0].test(c[0]) && !w.some(function (x) { return p[0].test(x); })) {
              add('only-' + p[1].replace('a ', ''), 'The correct choice is the only one with ' + p[1] + '.');
            }
          });
        }
        var stem = distinctive(q.q);
        if (stem.length) {
          var inWrong = {};
          w.forEach(function (x) { words(x).forEach(function (y) { inWrong[y] = true; }); });
          var shared = [];
          c.forEach(function (x) {
            var cw = {};
            words(x).forEach(function (y) { cw[y] = true; });
            stem.forEach(function (y) { if (cw[y] && !inWrong[y] && shared.indexOf(y) === -1) shared.push(y); });
          });
          if (shared.length) add('stem-overlap', 'The question and the correct choice share "' + shared.join('", "') + '", which no wrong choice uses.');
        }
        if (t === 'multi' && c.length >= 2) {
          var first = function (x) { return (fold(x).match(/\p{L}+/u) || [''])[0]; };
          var f0 = first(c[0]);
          if (f0 && c.every(function (x) { return first(x) === f0; }) && !w.some(function (x) { return first(x) === f0; })) {
            add('multi-prefix', 'Every correct choice starts with "' + f0 + '" and no wrong choice does.');
          }
        }
      }
    } else if (t === 'truefalse') {
      var found = ABSOLUTES.filter(function (a) { return hasWord(q.q, a.replace(' ', '\\s+')); });
      if (found.length) add('tf-absolute', 'Absolute wording (' + found.join(', ') + ') often signals a false statement.');
    } else if (t === 'order') {
      var hits = [];
      (q.items || []).forEach(function (it) {
        SEQUENCE.forEach(function (sw) { if (hasWord(it, sw) && hits.indexOf(sw) === -1) hits.push(sw); });
        (String(it).match(/(^|\D)(\d{3,4})(?!\d)/g) || []).forEach(function (m) {
          var y = m.replace(/\D/g, '');
          if (hits.indexOf(y) === -1) hits.push(y);
        });
      });
      if (hits.length) add('order-sequence', 'Items contain order clues (' + hits.join(', ') + ') that give the sequence away.');
    }
    return out;
  }

  return { lintQuestion: lintQuestion };
}));
