'use strict';
// Question pack review page. All dynamic content goes through textContent / createElement.
(function () {
  var TOKEN_KEY = 'hgs.hostToken'; // shared with /host so a signed-in host does not re-enter the PIN
  var NOTES_PREFIX = 'hgs.review.notes.';
  var URL_CAP = 7500;
  var PACK_ID_RE = /^(?:[a-z0-9-]{1,40}|_[a-z0-9_-]{0,39})$/;
  var SUFFIX = 'Holy Day Game Show';
  var LIMITS = GameSchema.LIMITS;
  var TYPE_LABEL = { single: 'Single choice', multi: 'Multi select', truefalse: 'True / false', order: 'Order', spell: 'Spelling' };
  var app = document.getElementById('app');
  var socket = io({ transports: ['websocket', 'polling'] });

  var S = {
    view: 'pin', error: '', note: '', packs: null, issuesUrl: '',
    note: '', hash: '', deepDone: false, authed: false,
    pack: null, // { id, meta, items:[{q, line, raw, lint}], errors:[{line,message}], local:bool }
    filter: { type: '', difficulty: '', lintOnly: false, search: '' },
  };
  var notes = {}; // line -> text for the open pack
  var noteTimer = null;

  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === false || v == null) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = [].concat(arguments[i]);
      for (var j = 0; j < kids.length; j++) {
        var c = kids[j];
        if (c == null || c === false) continue;
        e.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    }
    return e;
  }

  function emitAck(ev, payload) {
    return new Promise(function (resolve) {
      socket.timeout(8000).emit(ev, payload, function (err, res) { resolve(err ? null : res); });
    });
  }

  function show(children) { app.replaceChildren(h('div', { class: 'rv-screen' }, children)); }
  function showCenter(children) { app.replaceChildren(h('div', { class: 'rv-center' }, children)); }
  function flash(text) {
    var n = h('div', { class: 'rv-note-ok', role: 'status', text: text });
    document.body.append(n);
    setTimeout(function () { n.remove(); }, 2200);
  }
  function errBox() { return S.error ? h('div', { class: 'rv-err', role: 'alert', text: S.error }) : null; }

  // ---------- notes (localStorage) ----------
  function loadNotes(packId) {
    try { var raw = localStorage.getItem(NOTES_PREFIX + packId); notes = raw ? JSON.parse(raw) || {} : {}; } catch (e) { notes = {}; }
  }
  function saveNotes() {
    try {
      var packId = S.pack.id;
      var keys = Object.keys(notes).filter(function (k) { return notes[k]; });
      if (!keys.length) localStorage.removeItem(NOTES_PREFIX + packId);
      else { var o = {}; keys.forEach(function (k) { o[k] = notes[k]; }); localStorage.setItem(NOTES_PREFIX + packId, JSON.stringify(o)); }
    } catch (e) { /* storage unavailable */ }
  }

  // ---------- URL state (deep links) ----------
  var TYPES = ['single', 'multi', 'truefalse', 'order', 'spell'];
  var DIFFS = ['easy', 'medium', 'hard', 'none'];
  function blankFilter() { return { type: '', difficulty: '', lintOnly: false, search: '' }; }
  function parseLoc() {
    var sp = new URLSearchParams(location.search);
    var id = sp.get('pack');
    var f = blankFilter();
    var t = sp.get('type'), d = sp.get('difficulty');
    if (TYPES.indexOf(t) !== -1) f.type = t;
    if (DIFFS.indexOf(d) !== -1) f.difficulty = d;
    f.lintOnly = sp.get('lint') === '1';
    f.search = (sp.get('q') || '').slice(0, 100);
    var m = /^#q-(\d{1,6})$/.exec(location.hash);
    return { pack: id, local: sp.get('local'), filter: f, hash: m ? m[0] : '' };
  }
  function currentUrl() {
    if (S.view !== 'review' || !S.pack) return '/review';
    var sp = new URLSearchParams();
    if (S.pack.local) sp.set('local', S.pack.fileName || S.pack.id); else sp.set('pack', S.pack.id);
    var f = S.filter;
    if (f.type) sp.set('type', f.type);
    if (f.difficulty) sp.set('difficulty', f.difficulty);
    if (f.lintOnly) sp.set('lint', '1');
    if (f.search) sp.set('q', f.search);
    return '/review?' + sp.toString() + (S.hash || '');
  }
  function syncUrl(mode) {
    var url = currentUrl();
    try {
      if (mode === 'push') history.pushState(null, '', url);
      else if (mode === 'replace') history.replaceState(null, '', url);
    } catch (e) { /* ignore */ }
    document.title = S.view === 'review' && S.pack
      ? 'Review · ' + (S.pack.local ? (S.pack.fileName || S.pack.id) + ' (local)' : (S.pack.meta.title || S.pack.id)) + ' · ' + SUFFIX
      : 'Review questions · ' + SUFFIX;
  }
  function permalink(it) { return location.origin + '/review?pack=' + encodeURIComponent(S.pack.id) + '#q-' + it.line; }

  // ---------- pack model ----------
  function timeOf(q) { return q.time || (q.type === 'spell' ? LIMITS.spellTimeDefault : LIMITS.timeDefault); }
  function stemOf(q) { return q.type === 'spell' ? q.clue : q.q; }
  function addLint(it) {
    it.lint = it.q ? GameLint.lintQuestion(it.q) : [];
    return it;
  }
  function packFromServer(res) {
    var meta = res.pack.meta;
    return {
      id: meta.id, meta: meta, local: false, errors: [],
      items: res.pack.questions.map(function (q) {
        var line = q.line; var clean = Object.assign({}, q); delete clean.line;
        return addLint({ q: clean, line: line, raw: JSON.stringify(clean) });
      }),
    };
  }

  // Parses questions.jsonl text the same way the server does; collects per-line errors.
  function parseJsonl(text, items, errors) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf('//') === 0) continue;
      var obj;
      try { obj = JSON.parse(line); } catch (e) { errors.push({ line: i + 1, message: 'Invalid JSON: ' + e.message }); continue; }
      var v = GameSchema.validateQuestion(obj);
      if (!v.ok) { v.errors.forEach(function (m) { errors.push({ line: i + 1, message: m }); }); continue; }
      items.push(addLint({ q: v.value, line: i + 1, raw: line }));
    }
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (file.size > 1024 * 1024) { reject(new Error(file.name + ' is larger than 1 MB')); return; }
      var r = new FileReader();
      r.onload = function () { resolve({ name: file.name, text: String(r.result) }); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      r.readAsText(file);
    });
  }

  function openLocal(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    S.error = '';
    Promise.all(files.map(readFile)).then(function (read) {
      var meta = null, items = [], errors = [], sawQuestions = false, base = '';
      var fileName = read.map(function (f) { return f.name; }).sort(function (a, b) { return /\.jsonl$/i.test(b) - /\.jsonl$/i.test(a); })[0].slice(0, 80);
      read.forEach(function (f) {
        var lower = f.name.toLowerCase();
        if (lower.slice(-6) === '.jsonl') {
          sawQuestions = true; base = base || f.name.replace(/\.jsonl$/i, '');
          parseJsonl(f.text, items, errors);
        } else if (lower.slice(-5) === '.json') {
          var raw;
          try { raw = JSON.parse(f.text.replace(/^﻿/, '')); } catch (e) { errors.push({ line: 0, message: f.name + ': invalid JSON: ' + e.message }); return; }
          if (Array.isArray(raw)) {
            sawQuestions = true;
            raw.forEach(function (o, i) {
              var v = GameSchema.validateQuestion(o);
              if (!v.ok) v.errors.forEach(function (m) { errors.push({ line: i + 1, message: m }); });
              else items.push(addLint({ q: v.value, line: i + 1, raw: JSON.stringify(o) }));
            });
          } else {
            var pv = GameSchema.validatePack(raw);
            if (!pv.ok) pv.errors.forEach(function (m) { errors.push({ line: 0, message: f.name + ': ' + m }); });
            else meta = pv.value;
          }
        } else {
          errors.push({ line: 0, message: f.name + ': only .json and .jsonl files are supported' });
        }
      });
      if (!meta && !sawQuestions) { S.error = 'Choose a questions.jsonl (and optionally pack.json).'; if (errors.length) S.error += ' ' + errors[0].message; render(); return; }
      if (!meta) {
        var id = (base || 'local').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'local';
        meta = { id: id, title: base || 'Local file', theme: 'default', reverent: false };
      }
      items.sort(function (a, b) { return a.line - b.line; });
      openPack({ id: meta.id, meta: meta, local: true, fileName: fileName, items: items, errors: errors }, 'push');
    }).catch(function (e) { S.error = e.message || 'Could not read the file'; render(); });
  }

  function openPack(pack, mode, filter, hash) {
    S.pack = pack;
    S.filter = filter || blankFilter();
    S.hash = hash || '';
    S.note = '';
    S.view = 'review';
    loadNotes(pack.id);
    render();
    syncUrl(mode);
    if (S.hash) scrollToHash(); else window.scrollTo(0, 0);
  }
  function toPicker(mode) {
    if (S.pack) saveNotes();
    S.pack = null; S.view = 'picker'; S.hash = '';
    render();
    syncUrl(mode);
  }
  function scrollToHash() {
    var el = S.hash ? document.getElementById(S.hash.slice(1)) : null;
    if (!el) return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    // Fonts and images can shift the layout after first paint: settle the position again.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { el.scrollIntoView({ block: 'start', behavior: 'auto' }); });
    setTimeout(function () { el.scrollIntoView({ block: 'start', behavior: 'auto' }); }, 250);
    el.classList.add('is-target');
    setTimeout(function () { el.classList.remove('is-target'); }, reduce ? 3000 : 2400);
  }

  // ---------- feedback markdown ----------
  function fence(text) {
    var f = '```';
    while (text.indexOf(f) !== -1) f += '`';
    return f;
  }
  function describe(q) {
    var out = [];
    if (q.type === 'spell') {
      out.push('**Clue:** ' + q.clue, '', '**Word:** ' + q.word + (q.accept && q.accept.length ? ' (also accepted: ' + q.accept.join(', ') + ')' : ''));
    } else {
      out.push('> ' + q.q, '');
      if (q.type === 'truefalse') out.push('Answer: **' + (q.answer ? 'True' : 'False') + '**');
      else if (q.type === 'order') q.answer.forEach(function (idx, n) { out.push((n + 1) + '. ' + q.items[idx]); });
      else {
        var ans = q.type === 'single' ? [q.answer] : q.answer;
        q.choices.forEach(function (c, i) { out.push('- ' + (ans.indexOf(i) !== -1 ? '[x] **' + c + '** (correct)' : '[ ] ' + c)); });
      }
    }
    if (q.explanation) out.push('', '**Explanation:** ' + q.explanation);
    if (q.source) out.push('', '**Source:** ' + q.source);
    return out.join('\n');
  }
  function feedbackTitle(it) {
    var stem = String(stemOf(it.q) || '').replace(/\s+/g, ' ').trim();
    return '[' + S.pack.id + '] Q' + it.line + ': ' + (stem.length > 60 ? stem.slice(0, 60).trimEnd() + '…' : stem);
  }
  function feedbackBody(it, note, rawLimit) {
    var q = it.q;
    var parts = ['**Pack:** `' + S.pack.id + '`  ', '**Line:** ' + it.line + '  ', S.pack.local ? null : '**Review link:** ' + permalink(it) + '  ', '**Type:** ' + q.type + (q.difficulty ? '  \n**Difficulty:** ' + q.difficulty : ''), '',
      '### Reviewer note', '', note && note.trim() ? note.trim() : '_(no note)_', '', '### Question', '', describe(q)].filter(function (x) { return x !== null; });
    if (it.lint.length) parts.push('', '**Automatic warnings:** ' + it.lint.map(function (l) { return l.message; }).join(' '));
    var raw = it.raw;
    var truncated = false;
    if (rawLimit != null && raw.length > rawLimit) { raw = raw.slice(0, Math.max(0, rawLimit)); truncated = true; }
    var f = fence(raw);
    parts.push('', '### Raw JSON line', '', f + 'json', raw + (truncated ? ' …' : ''), f);
    if (truncated) parts.push('', '_(JSON truncated to keep the link short)_');
    return parts.join('\n');
  }
  function issueHref(it, note) {
    var base = S.issuesUrl + '/new?title=';
    var title = encodeURIComponent(feedbackTitle(it));
    function build(n, limit) { return base + title + '&body=' + encodeURIComponent(feedbackBody(it, n, limit)); }
    var url = build(note, null);
    if (url.length <= URL_CAP) return url;
    // Truncate the JSON block first (binary search on its length), then the note as a last resort.
    var n = note;
    for (var attempt = 0; attempt < 2; attempt++) {
      var lo = 0, hi = it.raw.length;
      if (build(n, 0).length <= URL_CAP) {
        while (lo < hi) { var mid = Math.ceil((lo + hi) / 2); if (build(n, mid).length <= URL_CAP) lo = mid; else hi = mid - 1; }
        return build(n, lo);
      }
      n = n.slice(0, Math.max(0, Math.floor(n.length / 2)));
      if (!n) break;
    }
    return build('', 0);
  }
  function copyText(text) {
    function fallback() {
      var ta = h('textarea', { class: 'visually-hidden', 'aria-hidden': 'true', tabindex: '-1' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  // ---------- views ----------
  function viewPin() {
    var input = h('input', { class: 'input', type: 'password', id: 'pin', autocomplete: 'off', maxlength: '128', 'aria-label': 'Host PIN' });
    function submit() {
      var pin = input.value;
      if (!pin) return;
      input.value = '';
      emitAck('host:auth', { pin: pin }).then(function (res) {
        if (res && res.ok) {
          sessionStorage.setItem(TOKEN_KEY, res.hostToken);
          S.error = ''; goPicker();
        } else { S.error = res && res.error ? res.error : 'Could not sign in'; render(); }
      });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    var art = null;
    try { art = window.Flower && Flower.blossom ? Flower.blossom({ size: 240, seed: 2 }) : null; } catch (e) { art = null; }
    showCenter([
      h('div', { class: 'rv-hero' }, art),
      h('h1', { class: 'rv-title', text: 'Review questions' }),
      h('p', { class: 'muted', text: 'Hosts only. Sign in with the host PIN to read the answers.' }),
      h('div', { class: 'form-open' },
        h('label', { class: 'label', for: 'pin', text: 'Host PIN' }), input,
        h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: submit, text: 'Continue' })),
      errBox(),
    ]);
    input.focus();
  }

  function goPicker() {
    S.authed = true;
    S.view = 'picker';
    var first = !S.deepDone;
    S.deepDone = true;
    var p = first ? parseLoc() : null;
    if (p && p.pack != null) { // deep link: open straight away after auth
      if (!S.packs) emitAck('host:packs', {}).then(function (res) { if (res && res.ok) S.packs = res.packs; });
      route(p, 'replace');
      return;
    }
    if (p && p.local != null) S.note = 'Local file reviews cannot be reopened from a link. Choose the file again below.';
    render();
    if (p) syncUrl('replace');
    emitAck('host:packs', {}).then(function (res) {
      if (res && res.ok) { S.packs = res.packs; if (S.view === 'picker') render(); }
    });
  }

  // Opens whatever the location describes. mode: 'replace' | 'push' | null (popstate: leave history alone).
  function route(p, mode) {
    if (p.pack != null) {
      if (!PACK_ID_RE.test(p.pack)) { packMissing(p.pack, mode); return; }
      loadServerPack(p.pack, mode, p.filter, p.hash);
    } else {
      S.note = p.local != null ? 'Local file reviews cannot be reopened from a link. Choose the file again below.' : '';
      toPicker(mode);
      if (!S.packs) emitAck('host:packs', {}).then(function (res) { if (res && res.ok) { S.packs = res.packs; if (S.view === 'picker') render(); } });
    }
  }
  function packMissing(id, mode) {
    S.note = 'Pack not found: ' + String(id).slice(0, 60);
    S.pack = null; S.view = 'picker'; S.hash = '';
    render();
    syncUrl(mode === 'push' ? 'push' : 'replace');
    if (!S.packs) emitAck('host:packs', {}).then(function (res) { if (res && res.ok) { S.packs = res.packs; if (S.view === 'picker') render(); } });
  }

  function loadServerPack(id, mode, filter, hash) {
    S.error = '';
    emitAck('host:review', { packId: id }).then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error === 'Pack not found') { packMissing(id, mode); return; }
        S.error = (res && res.error) || 'Could not load that pack'; S.view = 'picker'; render(); return;
      }
      S.issuesUrl = res.issuesUrl || '';
      openPack(packFromServer(res), mode, filter, hash);
    });
  }

  function viewPicker() {
    var fileInput = h('input', { class: 'rv-file', type: 'file', id: 'rv-file', accept: '.json,.jsonl,application/json', multiple: true, 'aria-label': 'Open local pack file' });
    fileInput.addEventListener('change', function () { openLocal(fileInput.files); fileInput.value = ''; });
    var list = h('div', { class: 'rv-packs' });
    if (!S.packs) list.append(h('p', { class: 'muted', text: 'Loading...' }));
    (S.packs || []).forEach(function (p) {
      var bt = Object.keys(p.counts.byType || {}).map(function (t) { return p.counts.byType[t] + ' ' + t; }).join(', ');
      list.append(h('button', { class: 'rv-pack', type: 'button', 'data-id': p.id, onclick: function () { loadServerPack(p.id, 'push'); } },
        h('strong', { text: p.title }),
        h('span', { class: 'muted', text: p.counts.total + ' questions' + (bt ? ' (' + bt + ')' : '') })));
    });
    if (S.packs && !S.packs.length) list.append(h('p', { class: 'muted', text: 'No question packs on the server yet. You can still open a local file below.' }));
    show([
      h('h1', { class: 'rv-title', text: 'Review questions' }),
      h('p', { class: 'muted', text: 'Read every question with its answer, spot possible giveaways, and report problems.' }),
      errBox(),
      S.note ? h('p', { class: 'rv-notice', role: 'status', text: S.note }) : null,
      list,
      h('div', { class: 'rv-local' },
        h('h2', { class: 'rv-title', text: 'Open a local file' }),
        h('p', { class: 'muted', text: 'Choose a questions.jsonl, and optionally its pack.json, from your computer. Nothing is uploaded; the files are read in this browser only.' }),
        fileInput,
        h('label', { class: 'btn', for: 'rv-file', text: 'Open local file…' })),
    ]);
  }

  function countBy(items, fn) {
    var o = {};
    items.forEach(function (it) { var k = fn(it); o[k] = (o[k] || 0) + 1; });
    return o;
  }

  function matches(it) {
    var f = S.filter, q = it.q;
    if (f.type && q.type !== f.type) return false;
    if (f.difficulty && (q.difficulty || 'none') !== f.difficulty) return false;
    if (f.lintOnly && !it.lint.length) return false;
    if (f.search) {
      var hay = JSON.stringify(q).toLowerCase() + ' q' + it.line;
      if (hay.indexOf(f.search.toLowerCase()) === -1) return false;
    }
    return true;
  }

  function buildCard(it) {
    var q = it.q;
    var kids = [];
    var meta = h('div', { class: 'rv-meta' },
      h('span', { class: 'rv-line', text: 'Line ' + it.line }),
      S.pack.local ? null : h('button', { class: 'rv-perma', type: 'button', title: 'Copy link to this question', 'aria-label': 'Copy link to line ' + it.line, text: '#', onclick: function () {
        copyText(permalink(it)).then(function (ok) { flash(ok ? 'Link copied' : 'Could not copy'); });
      } }),
      h('span', { class: 'rv-chip', text: TYPE_LABEL[q.type] || q.type }),
      q.difficulty ? h('span', { class: 'rv-chip', text: q.difficulty }) : null,
      h('span', { class: 'rv-chip', text: timeOf(q) + 's' + (q.time ? '' : ' (default)') }));
    kids.push(meta);
    kids.push(h('p', { class: 'rv-stem', text: stemOf(q) }));

    if (q.type === 'spell') {
      var sh = GameScoring.spellHint(q.word);
      kids.push(PlayState.buildSpellHint(document, sh.hint, sh.letters));
      kids.push(h('div', { class: 'rv-choice is-correct' }, h('span', { class: 'rv-mark', text: '✓', 'aria-hidden': 'true' }),
        h('span', null, h('span', { class: 'rv-lbl', text: 'Word' }), q.word),
        h('span', { class: 'rv-tag', text: 'Correct' })));
      if (q.accept && q.accept.length) kids.push(h('p', { class: 'rv-src' }, h('span', { class: 'rv-lbl', text: 'Also accepted' }), q.accept.join(', ')));
    } else if (q.type === 'truefalse') {
      kids.push(h('p', { class: 'rv-tf' }, h('span', { class: 'rv-lbl', text: 'Answer' }), (q.answer ? '✓ True' : '✓ False')));
    } else if (q.type === 'order') {
      kids.push(h('p', { class: 'rv-src', text: 'Items in the correct order:' }));
      kids.push(h('ol', { class: 'rv-items' }, q.answer.map(function (idx, n) {
        return h('li', { class: 'rv-choice is-correct' }, h('span', { class: 'rv-mark', text: String(n + 1) + '.' }), h('span', { text: q.items[idx] }));
      })));
    } else {
      var ans = q.type === 'single' ? [q.answer] : q.answer;
      kids.push(h('ul', { class: 'rv-choices' }, q.choices.map(function (c, i) {
        var ok = ans.indexOf(i) !== -1;
        return h('li', { class: 'rv-choice' + (ok ? ' is-correct' : '') },
          h('span', { class: 'rv-mark', text: ok ? '✓' : String.fromCharCode(65 + i), 'aria-hidden': ok ? 'true' : null }),
          h('span', { text: c }),
          ok ? h('span', { class: 'rv-tag', text: 'Correct' }) : null);
      })));
    }
    if (q.explanation) kids.push(h('p', { class: 'rv-expl' }, h('span', { class: 'rv-lbl', text: 'Explanation' }), q.explanation));
    if (q.source) kids.push(h('p', { class: 'rv-src' }, h('span', { class: 'rv-lbl', text: 'Source' }), q.source));
    if (it.lint.length) {
      kids.push(h('div', { class: 'rv-lint', role: 'list', 'aria-label': 'Possible giveaways' }, it.lint.map(function (l) {
        return h('span', { class: 'rv-badge', role: 'listitem', 'data-code': l.code, text: '⚠ Possible giveaway: ' + l.message });
      })));
    }

    var ta = h('textarea', { class: 'input', rows: '2', maxlength: '1000', placeholder: 'Note (optional): what is wrong, or what would be better?', 'aria-label': 'Note for line ' + it.line });
    ta.value = notes[it.line] || '';
    var report;
    function currentNote() { return ta.value; }
    function syncHref() { if (S.issuesUrl) report.setAttribute('href', issueHref(it, currentNote())); }
    ta.addEventListener('input', function () {
      notes[it.line] = ta.value;
      clearTimeout(noteTimer); noteTimer = setTimeout(saveNotes, 250);
      syncHref();
    });
    if (S.issuesUrl) {
      report = h('a', { class: 'btn btn--sm', href: '#', target: '_blank', rel: 'noopener noreferrer', text: 'Report issue' });
      syncHref();
    } else {
      report = h('button', { class: 'btn btn--sm', type: 'button', text: 'Copy feedback' });
      report.addEventListener('click', function () {
        copyText('# ' + feedbackTitle(it) + '\n\n' + feedbackBody(it, currentNote(), null)).then(function (ok) { flash(ok ? 'Feedback copied' : 'Could not copy'); });
      });
    }
    var clear = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Clear note', onclick: function () {
      ta.value = ''; delete notes[it.line]; saveNotes(); syncHref();
    } });
    kids.push(h('div', { class: 'rv-fb' }, ta, h('div', { class: 'rv-btns' }, report, clear)));

    return h('article', { class: 'rv-card' + (it.lint.length ? ' has-lint' : ''), id: 'q-' + it.line, 'data-line': String(it.line), 'aria-label': 'Question on line ' + it.line }, kids);
  }

  function copyAllNotes() {
    var lines = ['# Review notes: ' + S.pack.id, ''];
    var n = 0;
    S.pack.items.forEach(function (it) {
      var t = (notes[it.line] || '').trim();
      if (!t) return;
      n++;
      var stem = String(stemOf(it.q) || '').replace(/\s+/g, ' ').trim();
      lines.push('- **Q' + it.line + '** (' + it.q.type + '): ' + (stem.length > 80 ? stem.slice(0, 80) + '…' : stem), '  ' + t.replace(/\n/g, '\n  '), '');
    });
    if (!n) { flash('No notes yet'); return; }
    copyText(lines.join('\n')).then(function (ok) { flash(ok ? n + ' note' + (n === 1 ? '' : 's') + ' copied' : 'Could not copy'); });
  }

  function viewReview() {
    var P = S.pack, items = P.items;
    var byType = countBy(items, function (it) { return it.q.type; });
    var byDiff = countBy(items, function (it) { return it.q.difficulty || 'none'; });
    var lintCount = items.filter(function (it) { return it.lint.length; }).length;
    var list = h('div', { class: 'rv-list' });
    var tally = h('span', { class: 'rv-tally muted', 'aria-live': 'polite' });
    var clearBtn = h('button', { class: 'rv-link', type: 'button', text: 'Clear filters' });
    var radios = []; // {input, key, value}
    var search = h('input', { class: 'input', type: 'search', id: 'f-search', placeholder: 'Search questions…', autocomplete: 'off' });
    var lintBox = h('input', { type: 'checkbox', id: 'f-lint' });

    function active() { var f = S.filter; return !!(f.type || f.difficulty || f.lintOnly || f.search); }
    function syncControls() {
      radios.forEach(function (r) { r.input.checked = S.filter[r.key] === r.value; });
      lintBox.checked = S.filter.lintOnly;
      search.value = S.filter.search;
    }
    function renderList() {
      var shown = items.filter(matches);
      tally.textContent = 'Showing ' + shown.length + ' of ' + items.length;
      clearBtn.hidden = !active();
      list.replaceChildren.apply(list, shown.length ? shown.map(buildCard) : [h('div', { class: 'rv-empty', text: 'No questions match these filters.' })]);
    }
    function changed() { renderList(); syncUrl('replace'); }

    function group(title, key, options) {
      var rows = options.map(function (o) {
        var id = 'f-' + key + '-' + (o[0] || 'all');
        var input = h('input', { type: 'radio', name: 'f-' + key, id: id, value: o[0] });
        input.addEventListener('change', function () { if (input.checked) { S.filter[key] = o[0]; changed(); } });
        radios.push({ input: input, key: key, value: o[0] });
        return h('label', { class: 'rv-opt', for: id }, input, h('span', { class: 'rv-opt__name', text: o[1] }), h('span', { class: 'rv-opt__n', text: String(o[2]) }));
      });
      return h('fieldset', { class: 'rv-group' }, h('legend', { class: 'label', text: title }), rows);
    }
    var typeOpts = [['', 'All types', items.length]].concat(TYPES.filter(function (t) { return byType[t]; }).map(function (t) { return [t, TYPE_LABEL[t], byType[t]]; }));
    var diffOpts = [['', 'All difficulties', items.length]].concat(DIFFS.filter(function (d) { return byDiff[d]; }).map(function (d) { return [d, d === 'none' ? 'Unrated' : d.charAt(0).toUpperCase() + d.slice(1), byDiff[d]]; }));

    search.addEventListener('input', function () { S.filter.search = search.value.trim(); changed(); });
    lintBox.addEventListener('change', function () { S.filter.lintOnly = lintBox.checked; changed(); });
    clearBtn.addEventListener('click', function () { S.filter = blankFilter(); syncControls(); changed(); });

    var filters = h('div', { class: 'rv-filters', id: 'rv-filters' },
      h('div', { class: 'rv-group' }, h('label', { class: 'label', for: 'f-search', text: 'Search' }), search),
      group('Type', 'type', typeOpts),
      group('Difficulty', 'difficulty', diffOpts),
      h('div', { class: 'rv-group' },
        h('label', { class: 'rv-opt', for: 'f-lint' }, lintBox, h('span', { class: 'rv-opt__name', text: 'Only lint warnings' }), h('span', { class: 'rv-opt__n', text: String(lintCount) }))));
    var toggle = h('button', { class: 'btn btn--ghost btn--sm rv-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'rv-filters', text: 'Filters' });
    toggle.addEventListener('click', function () {
      var open = !filters.classList.contains('is-open');
      filters.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    var errBlock = null;
    if (P.errors.length) {
      errBlock = h('details', { class: 'rv-issues', open: true },
        h('summary', { text: P.errors.length + ' line' + (P.errors.length === 1 ? '' : 's') + ' could not be read' }),
        h('ul', null, P.errors.map(function (e) { return h('li', { text: (e.line ? 'Line ' + e.line + ': ' : '') + e.message }); })));
    }

    var rail = h('aside', { class: 'rv-rail', 'aria-label': 'Pack information and filters' },
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: function () { S.note = ''; toPicker('push'); }, text: '← All packs' }),
      h('header', { class: 'rv-head' },
        h('h1', { text: P.meta.title || P.id }),
        h('p', { class: 'muted rv-sub rv-packid', text: [P.local ? P.fileName || P.id : P.id, P.meta.theme ? 'theme: ' + P.meta.theme : '', P.meta.reverent ? 'reverent' : ''].filter(Boolean).join(' · ') }),
        P.meta.description ? h('p', { class: 'rv-desc', text: P.meta.description }) : null,
        h('p', { class: 'muted rv-sub', text: P.local ? 'Local file: not uploaded, and links to it cannot be shared.' : 'From the server.' })),
      toggle, filters);

    var main = h('main', { class: 'rv-main' },
      h('div', { class: 'rv-row rv-row--end' }, h('button', { class: 'btn btn--sm', type: 'button', onclick: copyAllNotes, text: 'Copy all notes' })),
      errBlock,
      h('div', { class: 'rv-countrow' }, clearBtn, tally),
      list);

    app.replaceChildren(h('div', { class: 'rv-screen rv-screen--wide' }, h('div', { class: 'rv-layout' }, rail, main)));
    syncControls();
    renderList();
  }

  function render() {
    document.body.setAttribute('data-theme', S.pack && S.pack.meta && S.view === 'review' ? S.pack.meta.theme || 'default' : 'default');
    if (S.view === 'pin') viewPin();
    else if (S.view === 'picker') viewPicker();
    else viewReview();
  }

  // ---------- boot ----------
  function boot() {
    var token = null;
    try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }
    if (!token) { render(); return; }
    emitAck('host:resume', { hostToken: token }).then(function (res) {
      if (!res || !res.ok) { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } S.view = 'pin'; render(); return; }
      goPicker();
    });
  }
  window.addEventListener('popstate', function () { if (S.authed) route(parseLoc(), null); });
  window.addEventListener('pagehide', function () { if (S.pack) saveNotes(); });
  function reauth() { // after a dropped connection the new socket is anonymous: resume with the stored token
    var token = null;
    try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }
    if (token) emitAck('host:resume', { hostToken: token });
  }
  var started = false;
  function start() { if (started) return; started = true; boot(); }
  socket.on('connect', function () { if (!started) start(); else if (S.view === 'pin') render(); else reauth(); });
  socket.on('connect_error', function () { S.error = 'Cannot reach the server'; if (S.view === 'pin') render(); });
})();
