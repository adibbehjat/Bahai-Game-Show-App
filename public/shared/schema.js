/* Question/pack schema — UMD: window.GameSchema in browsers, module.exports in Node. Zero deps. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameSchema = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var THEMES = ['default', 'naw-ruz', 'ridvan', 'declaration-bab', 'ascension-bahaullah',
    'martyrdom-bab', 'birth-bab', 'birth-bahaullah', 'covenant', 'ascension-abdulbaha'];
  var TYPES = ['single', 'multi', 'truefalse', 'order', 'spell'];
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var LIMITS = {
    q: 280, clue: 280, choice: 80, item: 80, word: 40, accept: 40, acceptMax: 5,
    choicesMin: 2, choicesMax: 6, itemsMin: 3, itemsMax: 6,
    explanation: 400, source: 160, timeMin: 10, timeMax: 60, timeDefault: 20, spellTimeDefault: 30,
    title: 80, description: 200, introText: 400, introSource: 120,
    maxQuestionsPerPack: 500
  };
  var WORD_RE = /^[\p{L}\p{M}'ʻ’\- ]+$/u;
  var PACK_ID_RE = /^(?:[a-z0-9-]{1,40}|_[a-z0-9_-]{0,39})$/;

  function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.normalize('NFC')
      .replace(/[\s ]+/g, ' ')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/ +/g, ' ')
      .trim();
  }

  function foldForCompare(s) {
    return normalizeText(s).toLowerCase().normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[’ʻ‘`´]/g, "'")
      .normalize('NFC');
  }

  function isObj(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function isInt(n) { return typeof n === 'number' && Number.isInteger(n); }

  function checkKeys(obj, allowed, errors, where) {
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) errors.push((where ? where + ': ' : '') + 'unknown field "' + k + '"');
    });
  }

  // Required string field. Returns normalized string or undefined (error pushed).
  function reqStr(obj, key, max, errors, label) {
    var v = obj[key];
    if (typeof v !== 'string') { errors.push('"' + key + '" is required and must be text'); return undefined; }
    var n = normalizeText(v);
    if (!n) { errors.push((label || '"' + key + '"') + ' must not be empty'); return undefined; }
    if (n.length > max) { errors.push((label || '"' + key + '"') + ' is too long (' + n.length + '/' + max + ')'); return undefined; }
    return n;
  }

  function optStr(obj, key, max, errors) {
    if (!(key in obj) || obj[key] === undefined) return undefined;
    var v = obj[key];
    if (typeof v !== 'string') { errors.push('"' + key + '" must be text'); return undefined; }
    var n = normalizeText(v);
    if (!n) return undefined;
    if (n.length > max) { errors.push('"' + key + '" is too long (' + n.length + '/' + max + ')'); return undefined; }
    return n;
  }

  // Array of strings (choices / items). Returns normalized array or undefined.
  function strList(obj, key, min, max, itemMax, errors, noun) {
    var arr = obj[key];
    if (!Array.isArray(arr)) { errors.push('"' + key + '" is required and must be a list'); return undefined; }
    if (arr.length < min || arr.length > max) {
      errors.push('"' + key + '" needs ' + min + '–' + max + ' entries (found ' + arr.length + ')');
      return undefined;
    }
    var out = [], seen = {}, bad = false;
    arr.forEach(function (c, i) {
      var label = noun + ' ' + (i + 1);
      if (typeof c !== 'string') { errors.push(label + ' must be text'); bad = true; return; }
      var n = normalizeText(c);
      if (!n) { errors.push(label + ' must not be empty'); bad = true; return; }
      if (n.length > itemMax) { errors.push(label + ' is too long (' + n.length + '/' + itemMax + ')'); bad = true; return; }
      var f = foldForCompare(n);
      if (seen[f]) { errors.push(label + ' duplicates ' + noun + ' ' + seen[f]); bad = true; return; }
      seen[f] = i + 1;
      out.push(n);
    });
    return bad ? undefined : out;
  }

  function checkWord(w, label, errors) {
    var n = normalizeText(w);
    if (!n) { errors.push(label + ' must not be empty'); return undefined; }
    if (n.length > LIMITS.word) { errors.push(label + ' is too long (' + n.length + '/' + LIMITS.word + ')'); return undefined; }
    if (!WORD_RE.test(n)) { errors.push(label + " may only contain letters, spaces, hyphens and apostrophes"); return undefined; }
    return n;
  }

  var COMMON = ['type', 'explanation', 'source', 'time', 'difficulty'];
  var FIELDS = {
    single: COMMON.concat(['q', 'choices', 'answer']),
    multi: COMMON.concat(['q', 'choices', 'answer']),
    truefalse: COMMON.concat(['q', 'answer']),
    order: COMMON.concat(['q', 'items', 'answer']),
    spell: COMMON.concat(['clue', 'word', 'accept'])
  };

  function validateQuestion(obj) {
    var errors = [];
    if (!isObj(obj)) return { ok: false, errors: ['Question must be a JSON object'] };
    var type = obj.type;
    if (typeof type !== 'string' || TYPES.indexOf(type) === -1) {
      return { ok: false, errors: ['"type" must be one of: ' + TYPES.join(', ')] };
    }
    checkKeys(obj, FIELDS[type], errors);
    var v = { type: type };

    if (type === 'spell') {
      v.clue = reqStr(obj, 'clue', LIMITS.clue, errors);
      var word = (typeof obj.word === 'string') ? checkWord(obj.word, '"word"', errors)
        : (errors.push('"word" is required and must be text'), undefined);
      v.word = word;
      if ('accept' in obj && obj.accept !== undefined) {
        if (!Array.isArray(obj.accept)) errors.push('"accept" must be a list');
        else if (obj.accept.length > LIMITS.acceptMax) errors.push('"accept" has too many entries (max ' + LIMITS.acceptMax + ')');
        else {
          var acc = [], seen = {};
          if (word) seen[foldForCompare(word)] = true;
          obj.accept.forEach(function (a, i) {
            var label = 'accepted spelling ' + (i + 1);
            if (typeof a !== 'string') { errors.push(label + ' must be text'); return; }
            var n = checkWord(a, label, errors);
            if (n === undefined) return;
            var f = foldForCompare(n);
            if (seen[f]) { errors.push(label + ' duplicates the word or another accepted spelling'); return; }
            seen[f] = true; acc.push(n);
          });
          if (acc.length) v.accept = acc;
        }
      }
    } else {
      v.q = reqStr(obj, 'q', LIMITS.q, errors);
      if (type === 'single' || type === 'multi') {
        var choices = strList(obj, 'choices', LIMITS.choicesMin, LIMITS.choicesMax, LIMITS.choice, errors, 'choice');
        v.choices = choices;
        var n = Array.isArray(obj.choices) ? obj.choices.length : 0;
        if (type === 'single') {
          if (!isInt(obj.answer)) errors.push('"answer" must be an integer index of the correct choice');
          else if (obj.answer < 0 || obj.answer >= n) errors.push('"answer" index ' + obj.answer + ' is out of range (0–' + (n - 1) + ')');
          else v.answer = obj.answer;
        } else {
          if (!Array.isArray(obj.answer)) errors.push('"answer" must be a list of correct choice indices');
          else if (obj.answer.length === 0) errors.push('"answer" must contain at least one correct choice');
          else {
            var ok = true, used = {};
            obj.answer.forEach(function (a) {
              if (!isInt(a)) { errors.push('"answer" entries must be integers'); ok = false; }
              else if (a < 0 || a >= n) { errors.push('"answer" index ' + a + ' is out of range (0–' + (n - 1) + ')'); ok = false; }
              else if (used[a]) { errors.push('"answer" contains index ' + a + ' more than once'); ok = false; }
              else used[a] = true;
            });
            if (ok) v.answer = obj.answer.slice();
          }
        }
      } else if (type === 'truefalse') {
        if (typeof obj.answer !== 'boolean') errors.push('"answer" must be true or false');
        else v.answer = obj.answer;
      } else if (type === 'order') {
        v.items = strList(obj, 'items', LIMITS.itemsMin, LIMITS.itemsMax, LIMITS.item, errors, 'item');
        var m = Array.isArray(obj.items) ? obj.items.length : 0;
        if (!Array.isArray(obj.answer)) errors.push('"answer" must be a list giving the correct order as item indices');
        else if (obj.answer.length !== m) errors.push('"answer" must list every item exactly once (' + m + ' entries, found ' + obj.answer.length + ')');
        else {
          var used2 = {}, ok2 = true;
          obj.answer.forEach(function (a) {
            if (!isInt(a) || a < 0 || a >= m) { errors.push('"answer" entries must be integers from 0 to ' + (m - 1)); ok2 = false; }
            else if (used2[a]) { errors.push('"answer" contains index ' + a + ' more than once (must be a permutation)'); ok2 = false; }
            else used2[a] = true;
          });
          if (ok2) v.answer = obj.answer.slice();
        }
      }
    }

    var ex = optStr(obj, 'explanation', LIMITS.explanation, errors);
    if (ex !== undefined) v.explanation = ex;
    var so = optStr(obj, 'source', LIMITS.source, errors);
    if (so !== undefined) v.source = so;
    if ('time' in obj && obj.time !== undefined) {
      if (!isInt(obj.time) || obj.time < LIMITS.timeMin || obj.time > LIMITS.timeMax) {
        errors.push('"time" must be a whole number of seconds from ' + LIMITS.timeMin + ' to ' + LIMITS.timeMax);
      } else v.time = obj.time;
    }
    if ('difficulty' in obj && obj.difficulty !== undefined) {
      if (DIFFICULTIES.indexOf(obj.difficulty) === -1) errors.push('"difficulty" must be easy, medium or hard');
      else v.difficulty = obj.difficulty;
    }

    if (errors.length) return { ok: false, errors: errors };
    Object.keys(v).forEach(function (k) { if (v[k] === undefined) delete v[k]; });
    return { ok: true, value: v };
  }

  function intro(obj, key, errors) {
    if (!(key in obj) || obj[key] === undefined) return undefined;
    var o = obj[key];
    if (!isObj(o)) { errors.push('"' + key + '" must be an object with "text" and "source"'); return undefined; }
    var sub = [];
    checkKeys(o, ['text', 'source'], sub, '"' + key + '"');
    var r = {};
    var t = reqStr(o, 'text', LIMITS.introText, sub, '"' + key + '.text"');
    if (t !== undefined) r.text = t;
    var s = optStr(o, 'source', LIMITS.introSource, sub);
    if (s !== undefined) r.source = s;
    sub.forEach(function (e) { errors.push(/^"/.test(e) && e.indexOf(key) === 1 ? e : '"' + key + '": ' + e); });
    return sub.length ? undefined : r;
  }

  function validatePack(obj) {
    var errors = [];
    if (!isObj(obj)) return { ok: false, errors: ['pack.json must be a JSON object'] };
    checkKeys(obj, ['id', 'title', 'theme', 'reverent', 'description', 'opening', 'closing'], errors);
    var v = {};
    if (typeof obj.id !== 'string' || !PACK_ID_RE.test(obj.id)) {
      errors.push('"id" must be 1–40 characters of a-z, 0-9 and "-" (or start with "_")');
    } else v.id = obj.id;
    v.title = reqStr(obj, 'title', LIMITS.title, errors);
    if (obj.theme === undefined) v.theme = 'default';
    else if (typeof obj.theme !== 'string' || THEMES.indexOf(obj.theme) === -1) errors.push('"theme" must be one of: ' + THEMES.join(', '));
    else v.theme = obj.theme;
    if (obj.reverent === undefined) v.reverent = false;
    else if (typeof obj.reverent !== 'boolean') errors.push('"reverent" must be true or false');
    else v.reverent = obj.reverent;
    var d = optStr(obj, 'description', LIMITS.description, errors);
    if (d !== undefined) v.description = d;
    var o = intro(obj, 'opening', errors); if (o) v.opening = o;
    var c = intro(obj, 'closing', errors); if (c) v.closing = c;
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, value: v };
  }

  return {
    THEMES: THEMES, TYPES: TYPES, LIMITS: LIMITS, DIFFICULTIES: DIFFICULTIES,
    validateQuestion: validateQuestion, validatePack: validatePack,
    normalizeText: normalizeText, foldForCompare: foldForCompare
  };
});
