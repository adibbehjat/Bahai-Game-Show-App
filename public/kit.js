/* Question Kit — entirely client-side. No network requests. DOM built with createElement/textContent only. */
(function () {
  'use strict';
  var S = window.GameSchema;
  var L = S.LIMITS;
  var GLYPHS = ['▲', '◆', '●', '■', '★', '✚'];
  var STORE_KEY = 'gameKit.sessionLines.v1';
  var TYPE_INFO = {
    single: ['Single choice', 'Players pick exactly one correct answer from 2–6 choices.'],
    multi: ['Multiple select', 'Players select all correct answers from 2–6 choices.'],
    truefalse: ['True / False', 'A statement that is either true or false.'],
    order: ['Put in order', 'Players arrange 3–6 items into the correct order.'],
    spell: ['Spelling challenge', 'A clue is shown on the big screen and players type the word.']
  };

  if (window.Flower && typeof window.Flower.decorate === 'function') {
    try { window.Flower.decorate(document.getElementById("kit-deco"), { drift: false }); } catch (e) { /* decoration is optional */ }
  }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, props, kids) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = true;
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  var uid = 0;
  function nextId(p) { uid += 1; return p + uid; }

  // ---------- state ----------
  var st = {
    type: 'single', q: '', choices: ['', '', '', ''], single: 0, multi: [],
    tf: true, orderItems: ['', '', ''], perm: [], clue: '', word: '', accept: [],
    explanation: '', source: '', time: '', difficulty: ''
  };
  var counters = [];
  var lastLine = null;
  var lines = loadLines();

  function loadLines() {
    try {
      var a = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveLines() { try { localStorage.setItem(STORE_KEY, JSON.stringify(lines)); } catch (e) { /* ignore */ } }

  // ---------- order shuffle ----------
  function shufflePerm(n) {
    var p = [], i, j, t;
    for (i = 0; i < n; i++) p.push(i);
    function isIdentity() { return p.every(function (v, k) { return v === k; }); }
    var tries = 0;
    do {
      for (i = n - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t;
      }
      tries++;
    } while (n > 1 && isIdentity() && tries < 50);
    return p;
  }
  function ensurePerm() {
    var n = st.orderItems.length;
    var okPerm = st.perm.length === n && st.perm.slice().sort(function (a, b) { return a - b; }).every(function (v, i) { return v === i; });
    if (!okPerm) st.perm = shufflePerm(n);
  }
  // display position j shows correct item perm[j]. items = perm.map(i => correct[i]); answer[perm[j]] = j
  function orderResult() {
    ensurePerm();
    var items = st.perm.map(function (i) { return st.orderItems[i]; });
    var answer = new Array(st.perm.length);
    st.perm.forEach(function (ci, j) { answer[ci] = j; });
    return { items: items, answer: answer };
  }

  // ---------- build candidate object ----------
  function buildObject() {
    var o = { type: st.type };
    if (st.type === 'spell') {
      o.clue = st.clue; o.word = st.word;
      var acc = st.accept.filter(function (a) { return S.normalizeText(a) !== ''; });
      if (acc.length) o.accept = acc;
    } else {
      o.q = st.q;
      if (st.type === 'single') { o.choices = st.choices.slice(); o.answer = st.single; }
      else if (st.type === 'multi') { o.choices = st.choices.slice(); o.answer = st.multi.slice().sort(function (a, b) { return a - b; }); }
      else if (st.type === 'truefalse') o.answer = st.tf;
      else { var r = orderResult(); o.items = r.items; o.answer = r.answer; }
    }
    if (S.normalizeText(st.explanation)) o.explanation = st.explanation;
    if (S.normalizeText(st.source)) o.source = st.source;
    if (st.time !== '') o.time = Number(st.time);
    if (st.difficulty) o.difficulty = st.difficulty;
    return o;
  }

  // ---------- form building ----------
  function counter(input, max) {
    var c = h('span', { class: 'kit-counter', 'aria-hidden': 'true' });
    counters.push({ el: c, input: input, max: max });
    return c;
  }
  var packCounters = [];
  function refreshCounters() {
    counters.concat(packCounters).forEach(function (c) {
      var n = S.normalizeText(c.input.value).length;
      c.el.textContent = n + '/' + c.max;
      c.el.classList.toggle('is-over', n > c.max);
    });
  }
  function field(labelText, input, max, hint) {
    var id = nextId('f');
    input.id = id;
    var kids = [h('label', { class: 'label', for: id, text: labelText }), input];
    if (hint) kids.push(h('span', { class: 'muted kit-meta', text: hint }));
    if (max) kids.push(counter(input, max));
    return h('div', { class: 'kit-field' }, kids);
  }
  function textInput(key, ph, max) {
    return h('input', { class: 'input', type: 'text', placeholder: ph || '', value: st[key], on: { input: function (e) { st[key] = e.target.value; update(); } } });
  }
  function areaInput(key, ph, rows) {
    return h('textarea', { class: 'input', rows: rows || 3, placeholder: ph || '', value: st[key], on: { input: function (e) { st[key] = e.target.value; update(); } } });
  }

  function listEditor(arr, opts) {
    // opts: min, max, noun, rowExtra(i)->node|null, onChange, maxLen, addLabel
    var wrap = h('div', { class: 'stack' });
    arr.forEach(function (val, i) {
      var id = nextId('l');
      var input = h('input', { class: 'input', id: id, type: 'text', value: val, 'aria-label': opts.noun + ' ' + (i + 1),
        placeholder: opts.noun + ' ' + (i + 1), on: { input: function (e) { arr[i] = e.target.value; update(); } } });
      var kids = [];
      var extra = opts.rowExtra ? opts.rowExtra(i) : null;
      if (extra) kids.push(extra);
      kids.push(input);
      kids.push(h('button', { type: 'button', class: 'btn btn--ghost btn--sm', 'aria-label': 'Remove ' + opts.noun + ' ' + (i + 1), text: '✕',
        disabled: arr.length <= opts.min ? true : false, on: { click: function () { opts.remove(i); } } }));
      var row = h('div', { class: 'kit-row' }, kids);
      if (arr.length <= opts.min) row.lastChild.setAttribute('disabled', '');
      else row.lastChild.removeAttribute('disabled');
      wrap.appendChild(row);
      wrap.appendChild(h('div', { class: 'kit-field' }, [counter(input, opts.maxLen)]));
    });
    var add = h('button', { type: 'button', class: 'btn btn--sm', text: opts.addLabel, on: { click: opts.add } });
    if (arr.length >= opts.max) add.setAttribute('disabled', '');
    wrap.appendChild(add);
    return wrap;
  }

  function buildForm() {
    var f = $('q-form');
    clear(f); counters = [];
    if (st.type === 'spell') {
      f.appendChild(field('Clue (shown on the big screen)', areaInput('clue', 'A short clue for the word', 2), L.clue));
      f.appendChild(field('Word', textInput('word', 'e.g. chrysanthemum'), L.word, 'Letters, spaces, hyphens and apostrophes only. Accents are optional for players but earn a bonus.'));
      f.appendChild(h('div', { class: 'stack' }, [
        h('span', { class: 'label', text: 'Accepted alternate spellings (optional, up to ' + L.acceptMax + ')' }),
        listEditor(st.accept, { min: 0, max: L.acceptMax, noun: 'Alternate', maxLen: L.accept, addLabel: 'Add alternate',
          add: function () { st.accept.push(''); buildForm(); update(); },
          remove: function (i) { st.accept.splice(i, 1); buildForm(); update(); } })
      ]));
    } else {
      f.appendChild(field('Question', areaInput('q', 'Type the question', 2), L.q));
      if (st.type === 'single' || st.type === 'multi') {
        var multi = st.type === 'multi';
        var n = st.choices.length;
        f.appendChild(h('div', { class: 'stack' }, [
          h('span', { class: 'label', text: 'Choices (' + L.choicesMin + '–' + L.choicesMax + ') — mark ' + (multi ? 'all correct ones' : 'the correct one') }),
          listEditor(st.choices, { min: L.choicesMin, max: L.choicesMax, noun: 'Choice', maxLen: L.choice, addLabel: 'Add choice',
            rowExtra: function (i) {
              if (multi) return h('input', { type: 'checkbox', 'aria-label': 'Choice ' + (i + 1) + ' is correct', checked: st.multi.indexOf(i) !== -1,
                on: { change: function (e) { var k = st.multi.indexOf(i); if (e.target.checked && k === -1) st.multi.push(i); if (!e.target.checked && k !== -1) st.multi.splice(k, 1); update(); } } });
              return h('input', { type: 'radio', name: 'correct', 'aria-label': 'Choice ' + (i + 1) + ' is correct', checked: st.single === i,
                on: { change: function () { st.single = i; update(); } } });
            },
            add: function () { st.choices.push(''); buildForm(); update(); },
            remove: function (i) {
              st.choices.splice(i, 1);
              if (st.single === i) st.single = 0; else if (st.single > i) st.single--;
              st.multi = st.multi.filter(function (x) { return x !== i; }).map(function (x) { return x > i ? x - 1 : x; });
              buildForm(); update();
            } })
        ]));
        void n;
      } else if (st.type === 'truefalse') {
        var group = h('div', { class: 'cluster', role: 'radiogroup', 'aria-label': 'Correct answer' });
        [[true, 'True'], [false, 'False']].forEach(function (p) {
          var id = nextId('tf');
          group.appendChild(h('label', { class: 'kit-inline', for: id }, [
            h('input', { type: 'radio', name: 'tf', id: id, checked: st.tf === p[0], on: { change: function () { st.tf = p[0]; update(); } } }), p[1]]));
        });
        f.appendChild(h('div', { class: 'stack' }, [h('span', { class: 'label', text: 'The statement is…' }), group]));
      } else if (st.type === 'order') {
        f.appendChild(h('div', { class: 'stack' }, [
          h('span', { class: 'label', text: 'Items — enter them IN THE CORRECT ORDER (' + L.itemsMin + '–' + L.itemsMax + ')' }),
          listEditor(st.orderItems, { min: L.itemsMin, max: L.itemsMax, noun: 'Item', maxLen: L.item, addLabel: 'Add item',
            add: function () { st.orderItems.push(''); st.perm = []; buildForm(); update(); },
            remove: function (i) { st.orderItems.splice(i, 1); st.perm = []; buildForm(); update(); } }),
          h('div', { class: 'stack' }, [
            h('span', { class: 'label', text: 'Shuffled display order (what players will see)' }),
            h('ol', { id: 'order-preview', class: 'kit-meta' }),
            h('button', { type: 'button', class: 'btn btn--sm', text: 'Reshuffle', on: { click: function () { st.perm = shufflePerm(st.orderItems.length); update(); } } })
          ])
        ]));
      }
    }
    var time = h('input', { class: 'input', type: 'number', min: L.timeMin, max: L.timeMax, step: 1, inputmode: 'numeric', value: st.time,
      placeholder: String(st.type === 'spell' ? L.spellTimeDefault : L.timeDefault),
      on: { input: function (e) { st.time = e.target.value; update(); } } });
    var diff = h('select', { class: 'input', on: { change: function (e) { st.difficulty = e.target.value; update(); } } },
      [['', '(none)']].concat(S.DIFFICULTIES.map(function (d) { return [d, d]; })).map(function (p) {
        return h('option', { value: p[0], text: p[1], selected: st.difficulty === p[0] });
      }));
    diff.value = st.difficulty;
    f.appendChild(field('Explanation shown after reveal (optional)', areaInput('explanation', '', 2), L.explanation));
    f.appendChild(field('Source (optional)', textInput('source', 'e.g. book and page'), L.source));
    f.appendChild(h('div', { class: 'kit-two' }, [
      field('Time in seconds (' + L.timeMin + '–' + L.timeMax + ', optional)', time),
      field('Difficulty (optional)', diff)
    ]));
  }

  function buildTypePicker() {
    var box = $('type-picker'); clear(box);
    S.TYPES.forEach(function (t) {
      box.appendChild(h('button', { type: 'button', class: 'btn kit-type-btn', 'data-type': t, 'aria-pressed': String(st.type === t), text: TYPE_INFO[t][0],
        on: { click: function () { st.type = t; if (t === 'order') ensurePerm(); buildTypePicker(); buildForm(); update(); } } }));
    });
    $('type-desc').textContent = TYPE_INFO[st.type][1];
  }

  // ---------- preview ----------
  function choiceNode(text, i, correct) {
    var cls = 'choice' + (correct ? ' is-correct' : '');
    return h('div', { class: cls, 'data-i': i }, [h('span', { class: 'choice__glyph', 'aria-hidden': 'true', text: GLYPHS[i] }), h('span', { class: 'choice__text', text: text || '…' })]);
  }
  function renderPreview(v) {
    var show = $('show-answers').checked;
    var q = v || buildObject();
    var screen = $('preview-screen'), phone = $('preview-phone');
    clear(screen); clear(phone);
    var isSpell = q.type === 'spell';
    var prompt = isSpell ? (q.clue || 'Clue…') : (q.q || 'Question…');
    var secs = q.time || (isSpell ? L.spellTimeDefault : L.timeDefault);
    screen.appendChild(h('p', { class: 'kit-meta', text: TYPE_INFO[q.type][0] + ' · ' + secs + 's' + (q.difficulty ? ' · ' + q.difficulty : '') }));
    screen.appendChild(h('p', { class: 'big-question', text: prompt }));
    phone.appendChild(h('p', { class: 'kit-meta', text: 'Your device' }));
    var chs = Array.isArray(q.choices) ? q.choices : null;
    function isCorrect(i) { return show && (q.type === 'single' ? q.answer === i : Array.isArray(q.answer) && q.answer.indexOf(i) !== -1); }
    if (chs) {
      var g1 = h('div', { class: 'choice-grid' }), g2 = h('div', { class: 'choice-grid' });
      chs.forEach(function (c, i) { g1.appendChild(choiceNode(c, i, isCorrect(i))); g2.appendChild(choiceNode(c, i, false)); });
      screen.appendChild(g1); phone.appendChild(g2);
      if (q.type === 'multi') phone.appendChild(h('p', { class: 'kit-meta', text: 'Select all that apply' }));
    } else if (q.type === 'truefalse') {
      [screen, phone].forEach(function (box, k) {
        var g = h('div', { class: 'tf-grid' });
        [true, false].forEach(function (b, i) {
          g.appendChild(h('div', { class: 'choice' + (k === 0 && show && q.answer === b ? ' is-correct' : ''), 'data-i': i }, [
            h('span', { class: 'choice__glyph', 'aria-hidden': 'true', text: GLYPHS[i] }), h('span', { class: 'choice__text', text: b ? 'True' : 'False' })]));
        });
        box.appendChild(g);
      });
    } else if (q.type === 'order') {
      var r = Array.isArray(q.items) ? q : orderResult();
      var items = r.items, ans = r.answer;
      var ol = h('ol', { class: 'order-list' });
      if (show) ans.forEach(function (idx, pos) { ol.appendChild(h('li', { class: 'order-item', 'data-pos': pos, text: items[idx] || '…' })); });
      else items.forEach(function (it, pos) { ol.appendChild(h('li', { class: 'order-item', 'data-pos': pos, text: it || '…' })); });
      screen.appendChild(h('p', { class: 'kit-meta', text: show ? 'Correct order:' : 'Shown shuffled:' }));
      screen.appendChild(ol);
      var ol2 = h('ol', { class: 'order-list' });
      items.forEach(function (it, pos) { ol2.appendChild(h('li', { class: 'order-item', 'data-pos': pos, text: it || '…' })); });
      phone.appendChild(ol2);
    } else if (isSpell) {
      if (show) screen.appendChild(h('p', { class: 'kit-meta', text: 'Word: ' + (q.word || '…') + (q.accept ? ' (also accepts: ' + q.accept.join(', ') + ')' : '') }));
      phone.appendChild(h('input', { class: 'input spell-input', type: 'text', placeholder: 'Type the word', 'aria-label': 'Spelling answer (preview)', disabled: '' }));
    }
    if (show && q.explanation) screen.appendChild(h('p', { class: 'kit-meta', text: 'Explanation: ' + q.explanation }));
    if (show && q.source) screen.appendChild(h('p', { class: 'kit-meta', text: 'Source: ' + q.source }));
    var op = $('order-preview');
    if (op) {
      clear(op);
      orderResult().items.forEach(function (it) { op.appendChild(h('li', { text: it || '…' })); });
    }
  }

  // ---------- update ----------
  function update() {
    refreshCounters();
    var obj = buildObject();
    var res = S.validateQuestion(obj);
    var errs = $('errors'); clear(errs);
    if (res.ok) {
      lastLine = JSON.stringify(res.value);
      $('out-line').value = lastLine;
      errs.appendChild(h('p', { class: 'kit-valid', text: 'Valid question.' }));
    } else {
      lastLine = null;
      $('out-line').value = '';
      errs.appendChild(h('ul', null, res.errors.map(function (e) { return h('li', { text: e }); })));
    }
    $('btn-copy').disabled = !res.ok;
    $('btn-add').disabled = !res.ok;
    renderPreview(res.ok ? res.value : null);
  }

  // ---------- clipboard / download ----------
  function say(msg) { $('status').textContent = msg; }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', readonly: '', class: 'visually-hidden' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(ta);
      say(done ? okMsg : 'Copy failed — select the text and copy it manually.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { say(okMsg); }, fallback);
    } else fallback();
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name, class: 'visually-hidden' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- session list ----------
  function summarize(line) {
    try {
      var o = JSON.parse(line);
      return '[' + o.type + '] ' + (o.q || o.clue || '');
    } catch (e) { return line; }
  }
  function renderList() {
    var ol = $('session-list'); clear(ol);
    $('list-count').textContent = '(' + lines.length + ')';
    lines.forEach(function (ln, i) {
      ol.appendChild(h('li', null, [
        h('span', { class: 'kit-list-text', text: summarize(ln) }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '↑', 'aria-label': 'Move up', disabled: i === 0 ? true : false,
          on: { click: function () { move(i, -1); } } }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: '↓', 'aria-label': 'Move down', disabled: i === lines.length - 1 ? true : false,
          on: { click: function () { move(i, 1); } } }),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Remove', 'aria-label': 'Remove question ' + (i + 1),
          on: { click: function () { lines.splice(i, 1); saveLines(); renderList(); } } })
      ]));
    });
    $('btn-copy-all').disabled = !lines.length;
    $('btn-download').disabled = !lines.length;
    $('btn-clear').disabled = !lines.length;
  }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= lines.length) return;
    var t = lines[i]; lines[i] = lines[j]; lines[j] = t; saveLines(); renderList();
  }
  function allText() { return lines.join('\n') + '\n'; }

  // ---------- pack helper ----------
  var pk = { id: '', title: '', theme: 'default', reverent: false, description: '', oText: '', oSource: '', cText: '', cSource: '' };
  var packJson = null;
  function packField(label, key, max, area) {
    var input = h(area ? 'textarea' : 'input', { class: 'input', type: area ? null : 'text', rows: area ? 2 : null,
      on: { input: function (e) { pk[key] = e.target.value; updatePack(); } } });
    var id = nextId('p'); input.id = id;
    var kids = [h('label', { class: 'label', for: id, text: label }), input];
    if (max) { var c = h('span', { class: 'kit-counter', 'aria-hidden': 'true' }); packCounters.push({ el: c, input: input, max: max }); kids.push(c); }
    return h('div', { class: 'kit-field' }, kids);
  }
  function buildPackForm() {
    var f = $('pack-form'); clear(f);
    f.appendChild(packField('Pack id (folder name; a-z, 0-9, "-")', 'id', 40));
    f.appendChild(packField('Title', 'title', L.title));
    var sel = h('select', { class: 'input', on: { change: function (e) { pk.theme = e.target.value; updatePack(); } } },
      S.THEMES.map(function (t) { return h('option', { value: t, text: t }); }));
    var sid = nextId('p'); sel.id = sid;
    f.appendChild(h('div', { class: 'kit-field' }, [h('label', { class: 'label', for: sid, text: 'Theme' }), sel]));
    var rid = nextId('p');
    f.appendChild(h('label', { class: 'kit-inline', for: rid }, [
      h('input', { type: 'checkbox', id: rid, on: { change: function (e) { pk.reverent = e.target.checked; updatePack(); } } }),
      'Reverent (muted visuals, no confetti, spelling questions off by default)']));
    f.appendChild(packField('Description (optional)', 'description', L.description, true));
    f.appendChild(packField('Opening text (optional)', 'oText', L.introText, true));
    f.appendChild(packField('Opening source', 'oSource', L.introSource));
    f.appendChild(packField('Closing text (optional)', 'cText', L.introText, true));
    f.appendChild(packField('Closing source', 'cSource', L.introSource));
  }
  function updatePack() {
    refreshCounters();
    var o = { id: pk.id, title: pk.title, theme: pk.theme, reverent: pk.reverent };
    if (S.normalizeText(pk.description)) o.description = pk.description;
    if (S.normalizeText(pk.oText)) { o.opening = { text: pk.oText }; if (S.normalizeText(pk.oSource)) o.opening.source = pk.oSource; }
    if (S.normalizeText(pk.cText)) { o.closing = { text: pk.cText }; if (S.normalizeText(pk.cSource)) o.closing.source = pk.cSource; }
    var r = S.validatePack(o);
    var box = $('pack-errors'); clear(box);
    if (r.ok) {
      packJson = JSON.stringify(r.value, null, 2) + '\n';
      $('pack-out').value = packJson;
      box.appendChild(h('p', { class: 'kit-valid', text: 'Valid pack.json.' }));
    } else {
      packJson = null; $('pack-out').value = '';
      box.appendChild(h('ul', null, r.errors.map(function (e) { return h('li', { text: e }); })));
    }
    $('btn-pack-copy').disabled = !r.ok;
    $('btn-pack-download').disabled = !r.ok;
  }

  // ---------- wire up ----------
  $('btn-copy').addEventListener('click', function () { if (lastLine) copyText(lastLine, 'Line copied.'); });
  $('btn-add').addEventListener('click', function () {
    if (!lastLine) return;
    lines.push(lastLine); saveLines(); renderList(); say('Added to session list (' + lines.length + ').');
  });
  $('btn-copy-all').addEventListener('click', function () { if (lines.length) copyText(allText(), 'All ' + lines.length + ' lines copied.'); });
  $('btn-download').addEventListener('click', function () { if (lines.length) download('questions.jsonl', allText()); });
  $('btn-clear').addEventListener('click', function () {
    if (lines.length && window.confirm('Remove all ' + lines.length + ' saved lines from this browser?')) { lines = []; saveLines(); renderList(); }
  });
  $('btn-pack-copy').addEventListener('click', function () { if (packJson) copyText(packJson, 'pack.json copied.'); });
  $('btn-pack-download').addEventListener('click', function () { if (packJson) download('pack.json', packJson); });
  $('show-answers').addEventListener('change', update);

  ensurePerm();
  buildTypePicker();
  buildForm();
  buildPackForm();
  renderList();
  update();
  updatePack();
})();
