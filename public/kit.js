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
  var STEP_COUNT = 5;
  var STEP_KEYS = {
    2: ['q', 'clue'],
    3: ['choices', 'items', 'answer', 'word', 'accept'],
    4: ['explanation', 'source', 'time', 'difficulty']
  };
  var KEY_NAMES = { q: 'The question', clue: 'The clue', word: 'The word', choices: 'Choices', items: 'Items', answer: 'The answer',
    accept: 'Alternate spellings', explanation: 'The explanation', source: 'The source', time: 'Time', difficulty: 'Difficulty' };

  var mq = window.matchMedia ? window.matchMedia('(max-width: 600px)') : { matches: false };
  function isPhone() { return !!mq.matches; }

  if (window.Flower && typeof window.Flower.decorate === 'function') {
    try { window.Flower.decorate(document.getElementById('kit-deco'), { drift: false }); } catch (e) { /* decoration is optional */ }
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
  var step = 1, maxStep = 1, attempted = false, touched = {}, editingIndex = null, drawerOpener = null;
  var counters = [], packCounters = [], errSlots = {};
  var lastLine = null, lastResult = { ok: false, errors: [] };
  var pendingFocus = null, pendingAcceptInput = null, statusTimer = null;
  var lines = loadLines();
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var MOD = IS_MAC ? '⌘' : 'Ctrl';

  function loadLines() {
    try {
      var a = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveLines() { try { localStorage.setItem(STORE_KEY, JSON.stringify(lines)); } catch (e) { /* ignore */ } }

  function freshState(type) {
    return { type: type || 'single', q: '', choices: ['', '', '', ''], single: 0, multi: [], tf: true, orderItems: ['', '', ''], perm: [],
      clue: '', word: '', accept: [], explanation: '', source: '', time: '', difficulty: '' };
  }
  function stateFromObject(o) {
    var n = freshState(o.type);
    n.explanation = o.explanation || ''; n.source = o.source || '';
    n.time = o.time !== undefined ? String(o.time) : ''; n.difficulty = o.difficulty || '';
    if (o.type === 'spell') { n.clue = o.clue || ''; n.word = o.word || ''; n.accept = (o.accept || []).slice(); }
    else {
      n.q = o.q || '';
      if (o.type === 'single') { n.choices = o.choices.slice(); n.single = o.answer; }
      else if (o.type === 'multi') { n.choices = o.choices.slice(); n.multi = o.answer.slice(); }
      else if (o.type === 'truefalse') n.tf = o.answer;
      else if (o.type === 'order') {
        // answer[k] = index in items of the item that belongs at position k
        n.orderItems = o.answer.map(function (idx) { return o.items[idx]; });
        n.perm = new Array(o.items.length);
        o.answer.forEach(function (idx, k) { n.perm[idx] = k; });
      }
    }
    return n;
  }
  function replaceState(n) { Object.keys(st).forEach(function (k) { delete st[k]; }); Object.keys(n).forEach(function (k) { st[k] = n[k]; }); }

  // ---------- order shuffle ----------
  function shufflePerm(n) {
    var p = [], i, j, t;
    for (i = 0; i < n; i++) p.push(i);
    function isIdentity() { return p.every(function (v, k) { return v === k; }); }
    var tries = 0;
    do {
      for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
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

  // ---------- errors: mapping and plain language ----------
  function errKey(m) {
    var s = m.toLowerCase();
    if (/^"type"/.test(s)) return 'type';
    if (/^"q"/.test(s)) return 'q';
    if (/^"clue"/.test(s)) return 'clue';
    if (/^"word"/.test(s)) return 'word';
    if (/^"accept"|^accepted spelling/.test(s)) return 'accept';
    if (/^"choices"|^choice \d/.test(s)) return 'choices';
    if (/^"items"|^item \d/.test(s)) return 'items';
    if (/^"answer"/.test(s)) return 'answer';
    if (/^"(explanation|source|time|difficulty)"/.test(s)) return s.slice(1, s.indexOf('"', 1));
    return 'other';
  }
  function friendly(m) {
    var specials = [
      [/^"answer" must contain at least one correct choice/, 'Tick at least one correct answer.'],
      [/^"answer" must be an integer index of the correct choice/, 'Mark the correct answer.'],
      [/^"answer" must be true or false/, 'Choose True or False.'],
      [/^"answer" must be a list of correct choice indices/, 'Tick at least one correct answer.']
    ];
    for (var i = 0; i < specials.length; i++) if (specials[i][0].test(m)) return specials[i][1];
    var out = m.replace(/^"(\w+)"/, function (_, k) { return KEY_NAMES[k] || k; })
      .replace(/ is required and must be text/, ' is needed')
      .replace(/ must not be empty/, ' can’t be empty');
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  // ---------- fields ----------
  function counter(input, max) {
    var c = h('span', { class: 'kit-counter', 'aria-hidden': 'true', hidden: '' });
    counters.push({ el: c, input: input, max: max });
    return c;
  }
  function refreshCounters() {
    counters.concat(packCounters).forEach(function (c) {
      var n = S.normalizeText(c.input.value).length;
      c.el.textContent = n + '/' + c.max;
      c.el.classList.toggle('is-over', n > c.max);
      c.el.hidden = n < c.max * 0.8;
    });
  }
  function errSlot(key, forInput) {
    var id = nextId('e');
    var el = h('p', { class: 'kit-error', id: id, 'data-err': key });
    el._input = forInput || null;
    if (forInput) forInput.setAttribute('aria-describedby', id);
    (errSlots[key] = errSlots[key] || []).push(el);
    return el;
  }
  function field(key, labelText, input, max, hint) {
    var id = nextId('f');
    input.id = id;
    var kids = [h('label', { class: 'label', for: id, text: labelText })];
    if (hint) kids.push(h('span', { class: 'kit-hint', text: hint }));
    kids.push(input);
    kids.push(h('div', { class: 'kit-below' }, [errSlot(key, input), max ? counter(input, max) : null]));
    return h('div', { class: 'kit-field', 'data-key': key }, kids);
  }
  function textInput(key, ph) {
    return h('input', { class: 'input', type: 'text', placeholder: ph || '', value: st[key], on: { input: function (e) { st[key] = e.target.value; update(); } } });
  }
  function areaInput(key, ph, rows) {
    return h('textarea', { class: 'input', rows: rows || 3, placeholder: ph || '', value: st[key], on: { input: function (e) { st[key] = e.target.value; update(); } } });
  }
  function iconBtn(text, label, onclick, disabled, extra) {
    var b = h('button', { type: 'button', class: 'btn btn--ghost kit-icon', text: text, 'aria-label': label, on: { click: onclick } });
    if (extra) Object.keys(extra).forEach(function (k) { b.setAttribute(k, extra[k]); });
    if (disabled) b.setAttribute('disabled', '');
    return b;
  }
  function addBtn(label, onclick, disabled) {
    var b = h('button', { type: 'button', class: 'btn btn--ghost kit-add', text: label, on: { click: onclick } });
    if (disabled) b.setAttribute('disabled', '');
    return b;
  }
  function toggle(multi, i, checked, onchange) {
    var inp = h('input', { type: multi ? 'checkbox' : 'radio', name: multi ? null : 'correct', class: 'visually-hidden',
      'aria-label': 'Choice ' + (i + 1) + ' is correct', checked: checked, on: { change: onchange } });
    return h('label', { class: 'kit-toggle' + (multi ? ' is-multi' : '') }, [inp, h('span', { class: 'kit-toggle__box', 'aria-hidden': 'true' })]);
  }
  function listWrap(key, hint) {
    var w = h('div', { class: 'kit-list-edit stack', 'data-key': key });
    if (hint) w.appendChild(h('p', { class: 'kit-hint', text: hint }));
    return w;
  }

  function choicesEditor(multi) {
    var wrap = listWrap('choices', multi ? 'Tick every correct answer.' : 'Tap the circle beside the correct answer.');
    wrap.insertBefore(h('span', { class: 'label', text: 'Choices (' + L.choicesMin + '–' + L.choicesMax + ')' }), wrap.firstChild);
    st.choices.forEach(function (val, i) {
      var input = h('input', { class: 'input', type: 'text', value: val, 'aria-label': 'Choice ' + (i + 1) + ' text', placeholder: 'Choice ' + (i + 1),
        on: { input: function (e) { st.choices[i] = e.target.value; update(); } } });
      var tg = multi
        ? toggle(true, i, st.multi.indexOf(i) !== -1, function (e) {
          var k = st.multi.indexOf(i);
          if (e.target.checked && k === -1) st.multi.push(i);
          if (!e.target.checked && k !== -1) st.multi.splice(k, 1);
          touched.answer = true; update();
        })
        : toggle(false, i, st.single === i, function () { st.single = i; touched.answer = true; update(); });
      wrap.appendChild(h('div', { class: 'kit-row' }, [
        tg,
        h('div', { class: 'kit-col' }, [input, counter(input, L.choice)]),
        iconBtn('✕', 'Remove choice ' + (i + 1), function () {
          st.choices.splice(i, 1);
          if (st.single === i) st.single = 0; else if (st.single > i) st.single--;
          st.multi = st.multi.filter(function (x) { return x !== i; }).map(function (x) { return x > i ? x - 1 : x; });
          pendingFocus = '[data-add="choice"]'; buildForm(); update();
        }, st.choices.length <= L.choicesMin)
      ]));
    });
    var add = addBtn('+ Add choice', function () { st.choices.push(''); buildForm(); update(); var ins = $('fields-a').querySelectorAll('.kit-row .input'); if (ins.length) ins[ins.length - 1].focus(); }, st.choices.length >= L.choicesMax);
    add.setAttribute('data-add', 'choice');
    wrap.appendChild(add);
    wrap.appendChild(errSlot('choices'));
    wrap.appendChild(errSlot('answer'));
    return wrap;
  }

  function moveItem(i, d) {
    var j = i + d, t = st.orderItems[i];
    st.orderItems[i] = st.orderItems[j]; st.orderItems[j] = t;
    st.perm = [];
    var n = st.orderItems.length;
    var want = d < 0 ? 'up' : 'down';
    if ((want === 'up' && j === 0) || (want === 'down' && j === n - 1)) want = want === 'up' ? 'down' : 'up';
    pendingFocus = '[data-move="' + want + '-' + j + '"]';
    buildForm(); update();
  }
  function itemsEditor() {
    var wrap = listWrap('items', 'Enter the items in the correct order, first to last. The kit shuffles them for players.');
    wrap.insertBefore(h('span', { class: 'label', text: 'Items (' + L.itemsMin + '–' + L.itemsMax + ')' }), wrap.firstChild);
    var n = st.orderItems.length;
    st.orderItems.forEach(function (val, i) {
      var input = h('input', { class: 'input', type: 'text', value: val, 'aria-label': 'Item ' + (i + 1) + ' text', placeholder: 'Item ' + (i + 1),
        on: { input: function (e) { st.orderItems[i] = e.target.value; update(); } } });
      wrap.appendChild(h('div', { class: 'kit-row kit-row--item' }, [
        h('span', { class: 'kit-num', 'aria-hidden': 'true', text: String(i + 1) }),
        h('div', { class: 'kit-col' }, [input, counter(input, L.item)]),
        h('div', { class: 'kit-ctl' }, [
          iconBtn('↑', 'Move item ' + (i + 1) + ' up', function () { moveItem(i, -1); }, i === 0, { 'data-move': 'up-' + i }),
          iconBtn('↓', 'Move item ' + (i + 1) + ' down', function () { moveItem(i, 1); }, i === n - 1, { 'data-move': 'down-' + i }),
          iconBtn('✕', 'Remove item ' + (i + 1), function () { st.orderItems.splice(i, 1); st.perm = []; pendingFocus = '[data-add="item"]'; buildForm(); update(); }, n <= L.itemsMin)
        ])
      ]));
    });
    var add = addBtn('+ Add item', function () { st.orderItems.push(''); st.perm = []; buildForm(); update(); var ins = $('fields-a').querySelectorAll('.kit-row .input'); if (ins.length) ins[ins.length - 1].focus(); }, n >= L.itemsMax);
    add.setAttribute('data-add', 'item');
    wrap.appendChild(add);
    wrap.appendChild(errSlot('items'));
    wrap.appendChild(errSlot('answer'));
    wrap.appendChild(h('div', { class: 'kit-shuffle stack' }, [
      h('span', { class: 'label', text: 'What players will see (shuffled)' }),
      h('ol', { id: 'order-preview', class: 'kit-meta' }),
      h('button', { type: 'button', class: 'btn btn--ghost kit-add', text: '↻ Reshuffle', on: { click: function () { st.perm = shufflePerm(st.orderItems.length); update(); } } })
    ]));
    return wrap;
  }

  function chipsEditor() {
    var wrap = listWrap('accept');
    wrap.insertBefore(h('span', { class: 'label', text: 'Accepted alternate spellings (optional, up to ' + L.acceptMax + ')' }), wrap.firstChild);
    var chips = h('ul', { class: 'kit-chips', 'aria-label': 'Alternate spellings' });
    var input = h('input', { class: 'input', type: 'text', placeholder: 'Add an alternate spelling', 'aria-label': 'New alternate spelling',
      autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done', on: {
        keydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); commitPending(); } },
        input: function () { refreshCounters(); }
      } });
    pendingAcceptInput = input;
    var addB = h('button', { type: 'button', class: 'btn kit-add-inline', text: 'Add', on: { click: function () { commitPending(); input.focus(); } } });
    function renderChips() {
      clear(chips);
      st.accept.forEach(function (a, i) {
        chips.appendChild(h('li', { class: 'kit-chip' }, [
          h('span', { text: a }),
          h('button', { type: 'button', class: 'kit-chip__x', text: '✕', 'aria-label': 'Remove ' + a, on: { click: function () { st.accept.splice(i, 1); renderChips(); update(); } } })
        ]));
      });
      var full = st.accept.length >= L.acceptMax;
      input.disabled = full; addB.disabled = full;
      if (full) input.setAttribute('placeholder', 'Maximum reached');
    }
    wrap._render = renderChips;
    wrap.appendChild(chips);
    wrap.appendChild(h('div', { class: 'kit-row' }, [h('div', { class: 'kit-col' }, [input, counter(input, L.accept)]), addB]));
    wrap.appendChild(errSlot('accept'));
    renderChips();
    wrap._commit = function () {
      var v = S.normalizeText(input.value);
      if (!v || st.accept.length >= L.acceptMax) return false;
      st.accept.push(v); input.value = ''; renderChips(); update(); return true;
    };
    return wrap;
  }
  var acceptEditor = null;
  function commitPending() { return acceptEditor && acceptEditor._commit ? acceptEditor._commit() : false; }

  function buildForm() {
    var fq = $('fields-q'), fa = $('fields-a'), fx = $('fields-x'), fe = $('fields-e');
    clear(fq); clear(fa); clear(fx); clear(fe);
    counters = []; errSlots = {}; acceptEditor = null; pendingAcceptInput = null;

    if (st.type === 'spell') {
      fq.appendChild(field('clue', 'Clue (shown on the big screen)', areaInput('clue', 'A short clue for the word', 3), L.clue));
      fa.appendChild(field('word', 'Word', h('input', { class: 'input', type: 'text', value: st.word, placeholder: 'e.g. chrysanthemum',
        autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', on: { input: function (e) { st.word = e.target.value; update(); } } }),
        L.word, 'Letters, spaces, hyphens and apostrophes. Accents are optional for players but earn a bonus.'));
      acceptEditor = chipsEditor();
      fa.appendChild(acceptEditor);
    } else {
      fq.appendChild(field('q', 'Question', areaInput('q', 'Type the question', 3), L.q));
      if (st.type === 'single' || st.type === 'multi') fa.appendChild(choicesEditor(st.type === 'multi'));
      else if (st.type === 'truefalse') {
        var group = h('div', { class: 'kit-tf', role: 'radiogroup', 'aria-label': 'Correct answer' });
        [[true, 'True'], [false, 'False']].forEach(function (p) {
          var id = nextId('tf');
          group.appendChild(h('label', { class: 'kit-tf__opt', for: id }, [
            h('input', { type: 'radio', name: 'tf', id: id, class: 'visually-hidden', checked: st.tf === p[0], on: { change: function () { st.tf = p[0]; update(); } } }),
            h('span', { class: 'kit-tf__box' }, [h('span', { class: 'kit-tf__mark', 'aria-hidden': 'true' }), h('span', { text: p[1] })])
          ]));
        });
        fa.appendChild(h('div', { class: 'stack' }, [h('span', { class: 'label', text: 'The statement is…' }), group]));
      } else fa.appendChild(itemsEditor());
    }

    var time = h('input', { class: 'input', type: 'number', min: L.timeMin, max: L.timeMax, step: 1, inputmode: 'numeric', value: st.time,
      placeholder: String(st.type === 'spell' ? L.spellTimeDefault : L.timeDefault),
      on: { input: function (e) { st.time = e.target.value; update(); } } });
    var diff = h('select', { class: 'input', on: { change: function (e) { st.difficulty = e.target.value; update(); } } },
      [['', '(none)']].concat(S.DIFFICULTIES.map(function (d) { return [d, d]; })).map(function (p) {
        return h('option', { value: p[0], text: p[1], selected: st.difficulty === p[0] });
      }));
    diff.value = st.difficulty;
    fe.appendChild(field('explanation', 'Explanation shown after the reveal', areaInput('explanation', '', 3), L.explanation));
    fe.appendChild(field('source', 'Source', textInput('source', 'e.g. book and page'), L.source));
    fx.appendChild(h('div', { class: 'kit-two' }, [
      field('time', 'Seconds (' + L.timeMin + '–' + L.timeMax + ')', time),
      field('difficulty', 'Difficulty', diff)
    ]));

    updateStepTitles();
    if (pendingFocus) {
      var t = document.querySelector(pendingFocus);
      pendingFocus = null;
      if (t && !t.disabled) t.focus();
    }
  }

  function setTitle(id, phone, desk) {
    var el = $(id);
    el.querySelector('.kit-t-phone').textContent = phone;
    el.querySelector('.kit-t-desk').textContent = desk;
  }
  function updateStepTitles() {
    var spell = st.type === 'spell';
    setTitle('t2', spell ? 'Write the clue' : 'Write the question', spell ? 'Clue' : 'Question');
    setTitle('t3', spell ? 'Set the word' : (st.type === 'order' ? 'Put the items in order' : 'Set the answers'), spell ? 'Word' : 'Answers');
  }
  var STEP_TITLES = [null, 'Choose a type', 'Write the question', 'Set the answers', 'Extras (optional)', 'Preview and copy'];
  function stepTitle(n) {
    if (n === 2 && st.type === 'spell') return 'Write the clue';
    if (n === 3) return st.type === 'spell' ? 'Set the word' : (st.type === 'order' ? 'Put the items in order' : 'Set the answers');
    return STEP_TITLES[n];
  }

  // ---------- type picker ----------
  function buildTypePicker() {
    var box = $('type-picker'); clear(box);
    S.TYPES.forEach(function (t) {
      box.appendChild(h('button', { type: 'button', class: 'btn kit-type-btn', 'data-type': t, 'aria-pressed': String(st.type === t),
        on: { click: function () {
          if (st.type !== t) { st.type = t; if (t === 'order') ensurePerm(); touched = {}; attempted = false; maxStep = Math.max(1, step); }
          buildTypePicker(); buildForm(); update();
        } } }, [
        h('span', { class: 'kit-type-btn__check', 'aria-hidden': 'true' }),
        h('span', { class: 'kit-type-btn__body' }, [
          h('span', { class: 'kit-type-btn__title', text: TYPE_INFO[t][0] }),
          h('span', { class: 'kit-type-btn__desc', text: TYPE_INFO[t][1] })
        ])
      ]));
    });
  }

  // ---------- preview ----------
  function isBlank(t) { return !S.normalizeText(t || ''); }
  function letter(i) { return String.fromCharCode(65 + i); }
  function choiceNode(text, i, correct) {
    var blank = isBlank(text);
    var cls = 'choice' + (correct ? ' is-correct' : '') + (blank ? ' is-placeholder' : '');
    return h('div', { class: cls, 'data-i': i }, [h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: blank ? 'Choice ' + letter(i) : text })]);
  }
  function itemNode(text, pos, i) {
    var blank = isBlank(text);
    return h('li', { class: 'order-item' + (blank ? ' is-placeholder' : ''), 'data-pos': pos, text: blank ? 'Item ' + letter(i) : text });
  }
  function renderPreview() {
    var show = $('show-answers').checked;
    var q = buildObject();
    var screen = $('preview-screen'), phone = $('preview-phone');
    clear(screen); clear(phone);
    var isSpell = q.type === 'spell';
    var rawPrompt = isSpell ? q.clue : q.q;
    var promptBlank = isBlank(rawPrompt);
    var secs = (q.time >= L.timeMin && q.time <= L.timeMax) ? q.time : (isSpell ? L.spellTimeDefault : L.timeDefault);
    screen.appendChild(h('p', { class: 'kit-meta', text: TYPE_INFO[q.type][0] + ' · ' + secs + 's' + (q.difficulty ? ' · ' + q.difficulty : '') }));
    screen.appendChild(h('p', { class: 'big-question' + (promptBlank ? ' is-placeholder' : ''), text: promptBlank ? (isSpell ? 'Your clue appears here' : 'Your question appears here') : rawPrompt }));
    phone.appendChild(h('p', { class: 'kit-meta', text: 'Question 1 · ' + secs + 's' }));
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
            h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: b ? 'True' : 'False' })]));
        });
        box.appendChild(g);
      });
    } else if (q.type === 'order') {
      var r = orderResult();
      var ol = h('ol', { class: 'order-list' });
      if (show) r.answer.forEach(function (idx, pos) { ol.appendChild(itemNode(r.items[idx], pos, idx)); });
      else r.items.forEach(function (it, pos) { ol.appendChild(itemNode(it, pos, pos)); });
      screen.appendChild(h('p', { class: 'kit-meta', text: show ? 'Correct order' : 'Shown shuffled' }));
      screen.appendChild(ol);
      var ol2 = h('ol', { class: 'order-list' });
      r.items.forEach(function (it, pos) { ol2.appendChild(itemNode(it, pos, pos)); });
      phone.appendChild(h('p', { class: 'kit-meta', text: 'Arrange in order' }));
      phone.appendChild(ol2);
    } else if (isSpell) {
      if (show) screen.appendChild(h('p', { class: 'kit-meta', text: 'Word: ' + (isBlank(q.word) ? 'your word' : q.word) + (q.accept ? ' (also accepts: ' + q.accept.join(', ') + ')' : '') }));
      phone.appendChild(h('input', { class: 'input spell-input', type: 'text', placeholder: 'Type your answer', 'aria-label': 'Spelling answer (preview)', disabled: '' }));
    }
    if (show && q.explanation) screen.appendChild(h('p', { class: 'kit-meta', text: 'Explanation: ' + q.explanation }));
    if (show && q.source) screen.appendChild(h('p', { class: 'kit-meta', text: 'Source: ' + q.source }));
    var op = $('order-preview');
    if (op) {
      clear(op);
      orderResult().items.forEach(function (it, i) { op.appendChild(h('li', { text: isBlank(it) ? 'Item ' + letter(i) : it })); });
    }
  }

  // ---------- errors display ----------
  function showErrors() {
    var errs = lastResult.ok ? [] : lastResult.errors;
    var byKey = {};
    errs.forEach(function (m) { var k = errKey(m); (byKey[k] = byKey[k] || []).push(friendly(m)); });
    Object.keys(errSlots).forEach(function (k) {
      var show = touched[k] || attempted;
      errSlots[k].forEach(function (slot) {
        clear(slot);
        var msgs = show && byKey[k] ? byKey[k] : [];
        msgs.forEach(function (m) { slot.appendChild(h('span', { text: m })); });
        if (slot._input) { if (msgs.length) slot._input.setAttribute('aria-invalid', 'true'); else slot._input.removeAttribute('aria-invalid'); }
        slot.closest('.kit-field, .kit-list-edit') && slot.closest('.kit-field, .kit-list-edit').classList.toggle('has-error', msgs.length > 0);
      });
    });
    var box = $('errors'); clear(box);
    if (lastResult.ok) box.appendChild(h('p', { class: 'kit-valid', text: '✓ Looks good. Ready to copy.' }));
    else if (attempted || Object.keys(touched).length) {
      box.appendChild(h('p', { class: 'kit-todo', text: 'Still to fix:' }));
      box.appendChild(h('ul', null, errs.map(function (e) { return h('li', { text: friendly(e) }); })));
    }
  }
  function focusFirstError() {
    var slots = document.querySelectorAll('.kit-step .kit-error');
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (s.firstChild && s.offsetParent !== null) {
        var wrap = s.closest('.kit-field, .kit-list-edit');
        var inp = s._input || (wrap && wrap.querySelector('input:not(.visually-hidden), textarea, select'));
        if (inp) { inp.focus(); if (inp.scrollIntoView) inp.scrollIntoView({ block: 'center' }); }
        return;
      }
    }
  }

  // ---------- update ----------
  function update() {
    refreshCounters();
    var res = S.validateQuestion(buildObject());
    lastResult = res;
    if (res.ok) { lastLine = JSON.stringify(res.value); $('out-line').value = lastLine; }
    else { lastLine = null; $('out-line').value = ''; }
    $('btn-copy').setAttribute('aria-disabled', String(!res.ok));
    $('btn-add').setAttribute('aria-disabled', String(!res.ok));
    showErrors();
    renderPreview();
    updateBar();
    updateStepper();
  }

  // ---------- steps ----------
  function stepErrors(n) {
    if (lastResult.ok) return [];
    var keys = STEP_KEYS[n] || [];
    return lastResult.errors.filter(function (m) { return keys.indexOf(errKey(m)) !== -1; });
  }
  function setStep(n, userNav) {
    step = Math.max(1, Math.min(STEP_COUNT, n));
    maxStep = Math.max(maxStep, step);
    document.body.setAttribute('data-step', String(step));
    if (userNav) { if (statusTimer) clearTimeout(statusTimer); $('status').textContent = ''; }
    updateBar(); updateStepper();
    if (userNav && isPhone()) {
      window.scrollTo(0, 0);
      var head = step === 5 ? $('h-preview') : $('t' + step);
      if (head) head.focus({ preventScroll: true });
    }
  }
  function goNext() {
    if (step >= STEP_COUNT) return;
    if (step === 3) commitPending();
    var errs = stepErrors(step);
    if (errs.length) {
      attempted = true;
      if (step === 4) $('extras').open = true;
      showErrors();
      focusFirstError();
      say('Please fix the highlighted field.');
      return;
    }
    if (step === 1) attempted = false;
    setStep(step + 1, true);
  }
  function goBack() { if (step > 1) setStep(step - 1, true); }

  function buildStepper() {
    var ol = $('step-dots'); clear(ol);
    for (var n = 1; n <= STEP_COUNT; n++) {
      (function (k) {
        ol.appendChild(h('li', null, [h('button', { type: 'button', class: 'kit-dot', 'data-n': k, on: { click: function () {
          if (k <= maxStep) { if (step === 3) commitPending(); setStep(k, true); }
        } } }, [h('span', { class: 'kit-dot__pip', 'aria-hidden': 'true' })])]));
      })(n);
    }
  }
  function updateStepper() {
    $('step-label').textContent = 'Step ' + step + ' of ' + STEP_COUNT;
    Array.prototype.forEach.call($('step-dots').querySelectorAll('.kit-dot'), function (b) {
      var k = Number(b.getAttribute('data-n'));
      b.setAttribute('aria-label', 'Step ' + k + ': ' + stepTitle(k));
      if (k === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.disabled = k > maxStep;
      b.classList.toggle('is-done', k < step || (k <= maxStep && k !== step));
    });
  }
  function updateBar() {
    $('bar-back').disabled = step === 1;
    var next = $('bar-next');
    if (step === STEP_COUNT) { next.textContent = 'Copy line'; next.disabled = false; }
    else { next.textContent = step === 4 ? 'Preview ›' : 'Next ›'; next.disabled = false; }
    $('bar-list').textContent = 'List (' + lines.length + ')';
  }

  // ---------- preview tabs ----------
  function setTab(name) {
    var phoneOn = name === 'phone';
    $('tab-phone').setAttribute('aria-selected', String(phoneOn));
    $('tab-screen').setAttribute('aria-selected', String(!phoneOn));
    $('tab-phone').tabIndex = phoneOn ? 0 : -1;
    $('tab-screen').tabIndex = phoneOn ? -1 : 0;
    $('panel-phone').classList.toggle('is-off', !phoneOn);
    $('panel-screen').classList.toggle('is-off', phoneOn);
  }

  // ---------- clipboard / download ----------
  function say(msg) {
    var el = $('status');
    el.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.textContent = ''; }, 3500);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = h('textarea', { 'aria-hidden': 'true', readonly: '', class: 'visually-hidden' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      var done = false;
      try { done = document.execCommand('copy'); } catch (e) { done = false; }
      document.body.removeChild(ta);
      say(done ? okMsg : 'Copy failed. Select the text and copy it manually.');
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
  var TAGS = { single: 'one', multi: 'multi', truefalse: 't/f', order: 'order', spell: 'spell' };
  function lineType(line) { try { return JSON.parse(line).type; } catch (e) { return ''; } }
  function summarize(line) {
    try { var o = JSON.parse(line); return o.q || o.clue || ''; } catch (e) { return line; }
  }
  function renderList() {
    var ol = $('session-list'); clear(ol);
    $('list-count').textContent = '(' + lines.length + ')';
    if (!lines.length) ol.appendChild(h('li', { class: 'muted kit-empty', text: 'Nothing saved yet. Build a question and choose “Add to my questions”.' }));
    lines.forEach(function (ln, i) {
      var active = editingIndex === i;
      ol.appendChild(h('li', { class: 'kit-list-item' + (active ? ' is-active' : '') }, [
        h('button', { type: 'button', class: 'kit-list-pick', 'aria-current': active ? 'true' : null, 'aria-label': 'Edit question ' + (i + 1) + ' (' + lineType(ln) + '): ' + summarize(ln),
          on: { click: function () { editLine(i); } } }, [h('span', { class: 'kit-list-n', text: String(i + 1) }), h('span', { class: 'kit-list-tag', text: TAGS[lineType(ln)] || '?' }), h('span', { class: 'kit-list-text', text: summarize(ln) })]),
        h('span', { class: 'kit-ctl kit-ctl--sm' }, [
          iconBtn('↑', 'Move question ' + (i + 1) + ' up', function () { move(i, -1); }, i === 0),
          iconBtn('↓', 'Move question ' + (i + 1) + ' down', function () { move(i, 1); }, i === lines.length - 1),
          iconBtn('✕', 'Remove question ' + (i + 1), function () {
            lines.splice(i, 1);
            if (editingIndex === i) editingIndex = null; else if (editingIndex !== null && editingIndex > i) editingIndex--;
            saveLines(); renderList(); updateAddLabel();
          })
        ])
      ]));
    });
    $('btn-copy-all').disabled = !lines.length;
    $('btn-download').disabled = !lines.length;
    $('btn-clear').disabled = !lines.length;
    updateBar();
  }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= lines.length) return;
    var t = lines[i]; lines[i] = lines[j]; lines[j] = t;
    if (editingIndex === i) editingIndex = j; else if (editingIndex === j) editingIndex = i;
    saveLines(); renderList();
  }
  function allText() { return lines.join('\n') + '\n'; }
  function updateAddLabel() { $('btn-add-label').textContent = editingIndex !== null ? 'Update question ' + (editingIndex + 1) : 'Add to my questions'; }

  function resetForm(keepType) {
    replaceState(freshState(keepType ? st.type : 'single'));
    touched = {}; attempted = false; maxStep = 1; editingIndex = null;
    if (st.type === 'order') ensurePerm();
    buildTypePicker(); buildForm(); update(); renderList(); updateAddLabel();
  }
  function editLine(i) {
    var o;
    try { o = JSON.parse(lines[i]); } catch (e) { return; }
    var v = S.validateQuestion(o);
    if (!v.ok) return;
    replaceState(stateFromObject(v.value));
    touched = {}; attempted = false; editingIndex = i;
    if (st.type === 'order') ensurePerm();
    buildTypePicker(); buildForm(); update(); renderList(); updateAddLabel();
    if (isPhone()) { closeSheet(); maxStep = 5; setStep(2, true); }
    else { var first = document.querySelector('#fields-q .input'); if (first) first.focus(); }
    say('Editing question ' + (i + 1) + '.');
  }
  function loadExamples() {
    S.EXAMPLES.forEach(function (e) { var v = S.validateQuestion(e); if (v.ok) lines.push(JSON.stringify(v.value)); });
    saveLines(); renderList();
    say('Added ' + S.EXAMPLES.length + ' example questions to your list.');
  }

  // ---------- actions ----------
  function requireValid() {
    if (lastLine) return true;
    attempted = true; showErrors(); focusFirstError();
    say('Please fix the highlighted fields first.');
    return false;
  }
  function doCopy() { if (requireValid()) copyText(lastLine, 'Line copied.'); }
  function doAdd() {
    if (!requireValid()) return;
    var msg;
    if (editingIndex !== null) { lines[editingIndex] = lastLine; msg = 'Updated question ' + (editingIndex + 1) + '.'; }
    else { lines.push(lastLine); msg = 'Added to your questions (' + lines.length + ').'; }
    saveLines();
    resetForm(true);
    say(msg);
    if (isPhone()) setStep(1, true);
    else { var first = document.querySelector('#fields-q .input'); if (first) first.focus(); }
  }

  function openSheet() {
    document.body.classList.add('sheet-open');
    $('bar-list').setAttribute('aria-expanded', 'true');
    $('sheet').setAttribute('role', 'dialog'); $('sheet').setAttribute('aria-modal', 'true');
    $('sheet').scrollTop = 0;
    $('h-list').focus({ preventScroll: true });
  }
  function closeSheet() {
    document.body.classList.remove('sheet-open');
    $('bar-list').setAttribute('aria-expanded', 'false');
    $('sheet').removeAttribute('role'); $('sheet').removeAttribute('aria-modal');
    $('bar-list').focus({ preventScroll: true });
  }

  // ---------- pack helper ----------
  var pk = { id: '', title: '', theme: 'default', reverent: false, description: '', oText: '', oSource: '', cText: '', cSource: '' };
  var packJson = null;
  function packField(label, key, max, area) {
    var input = h(area ? 'textarea' : 'input', { class: 'input', type: area ? null : 'text', rows: area ? 3 : null,
      on: { input: function (e) { pk[key] = e.target.value; updatePack(); } } });
    var id = nextId('p'); input.id = id;
    var below = [];
    if (max) { var c = h('span', { class: 'kit-counter', 'aria-hidden': 'true', hidden: '' }); packCounters.push({ el: c, input: input, max: max }); below.push(c); }
    return h('div', { class: 'kit-field' }, [h('label', { class: 'label', for: id, text: label }), input, below.length ? h('div', { class: 'kit-below' }, below) : null]);
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
      'Reverent (muted visuals, no confetti, spelling off by default)']));
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
      box.appendChild(h('p', { class: 'kit-valid', text: '✓ Valid pack.json.' }));
    } else {
      packJson = null; $('pack-out').value = '';
      box.appendChild(h('ul', null, r.errors.map(function (e) { return h('li', { text: friendly(e) }); })));
    }
    $('btn-pack-copy').disabled = !r.ok;
    $('btn-pack-download').disabled = !r.ok;
  }

  // ---------- wire up ----------
  $('q-form').addEventListener('submit', function (e) { e.preventDefault(); });
  $('q-form').addEventListener('focusout', function (e) {
    var w = e.target.closest ? e.target.closest('[data-key]') : null;
    if (w) { touched[w.getAttribute('data-key')] = true; showErrors(); }
  });
  $('btn-copy').addEventListener('click', doCopy);
  $('btn-add').addEventListener('click', doAdd);
  $('btn-copy-all').addEventListener('click', function () { if (lines.length) copyText(allText(), 'All ' + lines.length + ' lines copied.'); });
  $('btn-download').addEventListener('click', function () { if (lines.length) download('questions.jsonl', allText()); });
  $('btn-clear').addEventListener('click', function () {
    if (lines.length && window.confirm('Remove all ' + lines.length + ' saved lines from this browser?')) { lines = []; editingIndex = null; saveLines(); renderList(); updateAddLabel(); }
  });
  $('btn-pack-copy').addEventListener('click', function () { if (packJson) copyText(packJson, 'pack.json copied.'); });
  $('btn-pack-download').addEventListener('click', function () { if (packJson) download('pack.json', packJson); });
  $('show-answers').addEventListener('change', update);
  $('bar-back').addEventListener('click', goBack);
  $('bar-next').addEventListener('click', function () {
    if (step === STEP_COUNT) doCopy(); else goNext();
  });
  $('bar-list').addEventListener('click', function () { if (document.body.classList.contains('sheet-open')) closeSheet(); else openSheet(); });
  $('sheet-close').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) closeSheet(); });
  $('tab-phone').addEventListener('click', function () { setTab('phone'); });
  $('tab-screen').addEventListener('click', function () { setTab('screen'); });
  [$('tab-phone'), $('tab-screen')].forEach(function (b) {
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var to = b === $('tab-phone') ? 'screen' : 'phone'; setTab(to); $('tab-' + to).focus(); }
    });
  });

  // ---------- menu, drawer, guide ----------
  var menu = $('tmpl-menu');
  function closeMenu() { menu.open = false; }
  function menuItem(id, fn) { $(id).addEventListener('click', function () { closeMenu(); fn(); }); }
  menuItem('mi-template', function () { download('questions-template.jsonl', S.templateJsonl()); say('Downloaded questions-template.jsonl.'); });
  menuItem('mi-packtemplate', function () { download('pack.json', S.packTemplateJson()); say('Downloaded pack.json template.'); });
  menuItem('mi-load', loadExamples);
  menuItem('mi-packhelper', function () { openDrawer('pack'); });
  document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) closeMenu(); });
  $('btn-load-examples').addEventListener('click', loadExamples);
  $('btn-new').addEventListener('click', function () { resetForm(true); if (isPhone()) { closeSheet(); setStep(1, true); } });

  function inlineCode(parent, text) {
    text.split('`').forEach(function (seg, i) {
      if (!seg) return;
      parent.appendChild(i % 2 ? h('code', { text: seg }) : document.createTextNode(seg));
    });
    return parent;
  }
  function renderGuide() {
    var body = $('guide-body'); clear(body);
    if (!window.FormatGuide) { body.appendChild(h('p', { text: 'Format guide unavailable.' })); return; }
    window.FormatGuide.blocks().forEach(function (b) {
      if (b.k === 'h1') return;
      if (b.k === 'h2' || b.k === 'h3') body.appendChild(h(b.k === 'h2' ? 'h3' : 'h4', { text: b.t }));
      else if (b.k === 'p') body.appendChild(inlineCode(h('p'), b.t));
      else if (b.k === 'ul' || b.k === 'ol') body.appendChild(h(b.k, null, b.items.map(function (i) { return inlineCode(h('li'), i); })));
      else if (b.k === 'code') body.appendChild(h('pre', null, [h('code', { text: b.t })]));
      else if (b.k === 'table') {
        body.appendChild(h('div', { class: 'kit-table-wrap' }, [h('table', null, [
          h('thead', null, [h('tr', null, b.head.map(function (x) { return h('th', { text: x }); }))]),
          h('tbody', null, b.rows.map(function (r) { return h('tr', null, r.map(function (c) { return inlineCode(h('td'), c); })); }))
        ])]));
      }
    });
  }
  function setDTab(name) {
    var guide = name === 'guide';
    $('dtab-guide').setAttribute('aria-selected', String(guide)); $('dtab-pack').setAttribute('aria-selected', String(!guide));
    $('dtab-guide').tabIndex = guide ? 0 : -1; $('dtab-pack').tabIndex = guide ? -1 : 0;
    $('dpanel-guide').classList.toggle('is-off', !guide); $('dpanel-pack').classList.toggle('is-off', guide);
    $('drawer-title').textContent = guide ? 'Format guide' : 'pack.json helper';
  }
  function openDrawer(tab) {
    drawerOpener = document.activeElement;
    setDTab(tab);
    $('drawer').hidden = false; $('drawer-scrim').hidden = false;
    document.body.classList.add('drawer-open');
    $('drawer-title').focus({ preventScroll: true });
  }
  function closeDrawer() {
    $('drawer').hidden = true; $('drawer-scrim').hidden = true;
    document.body.classList.remove('drawer-open');
    if (drawerOpener && drawerOpener.focus) drawerOpener.focus({ preventScroll: true });
  }
  $('btn-guide').addEventListener('click', function () { openDrawer('guide'); });
  $('drawer-close').addEventListener('click', closeDrawer);
  $('drawer-scrim').addEventListener('click', closeDrawer);
  $('dtab-guide').addEventListener('click', function () { setDTab('guide'); });
  $('dtab-pack').addEventListener('click', function () { setDTab('pack'); });
  $('btn-guide-md').addEventListener('click', function () {
    if (window.FormatGuide) { download('QUESTION-FORMAT.md', window.FormatGuide.toMarkdown()); say('Downloaded QUESTION-FORMAT.md.'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!$('drawer').hidden) closeDrawer(); else if (menu.open) closeMenu(); }
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'Enter') { e.preventDefault(); doAdd(); }
    else if (mod && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); doCopy(); }
  });

  function syncExtras() { if (!isPhone()) $('extras-e').open = true; }
  if (mq.addEventListener) mq.addEventListener('change', syncExtras);
  document.querySelector('.kit-kbd--add').textContent = MOD + '+↵';
  document.querySelector('.kit-kbd--copy').textContent = MOD + '+⇧+C';

  ensurePerm();
  $('extras-e').open = !isPhone();
  $('extras').open = false;
  buildStepper();
  buildTypePicker();
  buildForm();
  buildPackForm();
  renderGuide();
  renderList();
  update();
  updatePack();
  updateAddLabel();
  setStep(1, false);
})();
