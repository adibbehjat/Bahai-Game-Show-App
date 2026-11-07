'use strict';
// Player (phone) client. All dynamic content goes through textContent / createElement.
(function () {
  var app = document.getElementById('app');
  var bar = document.getElementById('bar');
  var socket = io({ transports: ['websocket', 'polling'] });

  var urlCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  var P = {
    joined: false, code: urlCode || localStorage.getItem('hgs.lastRoom') || '', name: '', id: null, score: 0,
    room: null, q: null, answeredFor: null, result: null, reveal: null, rank: null, notice: '', badge: null, podium: null,
    offset: 0, error: '', busy: false,
  };
  var cleanups = [];

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

  function runCleanups() {
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
  }

  function show(children) {
    runCleanups();
    var r = P.room;
    document.body.setAttribute('data-theme', r && r.theme ? r.theme : 'default');
    document.body.setAttribute('data-reverent', r && r.reverent ? 'true' : 'false');
    app.replaceChildren(h('div', { class: 'screen play-screen' }, h('div', { class: 'stack play-center' }, children)));
    renderBar();
  }

  function renderBar() {
    if (!P.joined) { bar.hidden = true; return; }
    bar.hidden = false;
    var parts = [];
    if (P.badge) parts.push(h('span', { class: 'player-bar__badge', text: P.badge.text }));
    parts.push(h('span', { class: 'player-bar__name', text: P.name }));
    parts.push(h('span', { class: 'player-bar__score', text: String(P.score) + ' pts' }));
    if (P.rank) parts.push(h('span', { class: 'player-bar__rank', text: '#' + P.rank.rank + ' of ' + P.rank.of }));
    bar.replaceChildren.apply(bar, parts);
  }

  function toast() { return P.error ? h('div', { class: 'toast toast--error', role: 'alert', text: P.error }) : null; }

  // ---------- views ----------
  var sel = null;
  var badgeKind = 'emoji';

  function viewJoin() {
    if (!sel) sel = GameNames.random();
    badgeKind = sel.badge.kind;
    var code = h('input', { class: 'input', id: 'code', type: 'text', maxlength: '6', value: P.code, autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', placeholder: 'ABC234', 'aria-label': 'Room code' });
    code.addEventListener('input', function () { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); P.code = code.value; });

    var nameEl = h('div', { class: 'name-card__name', 'aria-live': 'polite' });
    var emojiBtns = GameNames.EMOJIS.map(function (e, i) {
      return h('button', { class: 'badge', type: 'button', 'aria-label': 'Badge ' + (i + 1), text: e, onclick: function () { sel.badge = { kind: 'emoji', value: i }; paint(); } });
    });
    var numBtns = [];
    for (var n = GameNames.NUMBER_MIN; n <= GameNames.NUMBER_MAX; n++) {
      (function (num) {
        numBtns.push(h('button', { class: 'badge badge--number', type: 'button', text: String(num), onclick: function () { sel.badge = { kind: 'number', value: num }; paint(); } }));
      })(n);
    }
    var emojiGrid = h('div', { class: 'badge-grid', role: 'group', 'aria-label': 'Choose an emoji' }, emojiBtns);
    var numGrid = h('div', { class: 'badge-grid badge-grid--numbers', role: 'group', 'aria-label': 'Choose a number' }, numBtns);
    var tabEmoji = h('button', { class: 'segmented__btn', type: 'button', text: 'Emoji', onclick: function () { sel.badge = { kind: 'emoji', value: 0 }; paint(); } });
    var tabNumber = h('button', { class: 'segmented__btn', type: 'button', text: 'Number', onclick: function () { sel.badge = { kind: 'number', value: 1 + Math.floor(Math.random() * 99) }; paint(); } });

    function paint() {
      var c = GameNames.compose(sel);
      nameEl.textContent = c ? c.display : '';
      var isEmoji = sel.badge.kind === 'emoji';
      emojiGrid.hidden = !isEmoji;
      numGrid.hidden = isEmoji;
      tabEmoji.classList.toggle('is-selected', isEmoji);
      tabNumber.classList.toggle('is-selected', !isEmoji);
      tabEmoji.setAttribute('aria-pressed', String(isEmoji));
      tabNumber.setAttribute('aria-pressed', String(!isEmoji));
      emojiBtns.forEach(function (b, i) { var on = isEmoji && sel.badge.value === i; b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', String(on)); });
      numBtns.forEach(function (b, i) { var on = !isEmoji && sel.badge.value === i + GameNames.NUMBER_MIN; b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', String(on)); });
    }

    var shuffle = h('button', { class: 'btn btn--ghost shuffle-btn', type: 'button', text: '\uD83D\uDD00 Shuffle', onclick: function () { sel = GameNames.random(); paint(); } });

    function submit() {
      var c = code.value.trim().toUpperCase();
      if (c.length !== 6 || P.busy) { if (c.length !== 6) { P.error = 'Game not found'; P.notice = ''; render(); } return; }
      P.busy = true;
      emitAck('player:join', { code: c, adj: sel.adj, flower: sel.flower, badge: { kind: sel.badge.kind, value: sel.badge.value } }).then(function (res) {
        P.busy = false;
        P.code = c;
        if (res && res.ok) {
          P.error = ''; P.notice = ''; P.name = res.name; P.badge = res.badge; P.id = res.playerId; P.joined = true; P.score = 0; P.rank = null;
          localStorage.setItem('hgs.player.' + c, res.playerToken);
          localStorage.setItem('hgs.lastRoom', c);
          render();
        } else if (res && res.error === 'Name taken') {
          sel = GameNames.random(); P.error = ''; P.notice = 'That name was just taken. Here is another one.';
          render();
        } else {
          P.error = res && res.error ? res.error : 'Could not join'; P.notice = '';
          render();
        }
      });
    }

    show([
      h('h1', { text: 'Join the game' }),
      h('div', { class: 'join-form stack' },
        h('label', { class: 'label', for: 'code', text: 'Room code' }), code,
        h('div', { class: 'name-card stack' },
          h('p', { class: 'label', text: 'Your name' }),
          nameEl, shuffle,
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Badge type' }, tabEmoji, tabNumber),
          emojiGrid, numGrid),
        h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Join', onclick: submit })),
      P.notice ? h('div', { class: 'toast', role: 'status', text: P.notice }) : null,
      toast(),
    ]);
    paint();
  }

  function viewWaiting(msg) {
    show([h('h1', { text: msg || 'You are in!' }), h('p', { class: 'muted', text: 'Watch the big screen. The game will start soon.' })]);
    if (window.Flower && Flower.blossom) {
      try { app.querySelector('.play-center').prepend(Flower.blossom({ petals: 8, layers: 2, size: 120 })); } catch (e) { /* ignore */ }
    }
  }

  function howtoKey() { return 'hgs.howto.' + P.code; }
  function howtoSeen() { try { return sessionStorage.getItem(howtoKey()) === '1'; } catch (e) { return true; } }

  function viewHowto() {
    var gentle = !!(P.room && P.room.gentle);
    var reverent = !!(P.room && P.room.reverent);
    var items = [
      'Tap an answer to lock it in.',
      'For ordering, tap the items in sequence. Use Undo if you change your mind.',
      'For spelling, type the word and press Submit.',
      gentle ? 'Take your time. Scores depend only on getting it right.' : 'Faster answers earn a little more.',
    ];
    show([
      h('h1', { text: reverent ? 'How we will play' : 'How to play' }),
      h('ul', { class: 'howto-list' }, items.map(function (t) { return h('li', { text: t }); })),
      h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Got it', onclick: function () {
        try { sessionStorage.setItem(howtoKey(), '1'); } catch (e) { /* ignore */ }
        render();
      } }),
    ]);
  }

  function viewLocked() {
    show([h('div', { class: 'locked-in', text: 'Locked in ✿' }), h('p', { class: 'muted', text: 'Take a breath. Waiting for everyone else.' })]);
  }

  function submit(value) {
    if (P.busy || !P.q || PlayState.showLocked(P.q, P.answeredFor)) return;
    var idx = P.q.index;
    P.busy = true;
    emitAck('player:answer', { value: value }).then(function (res) {
      P.busy = false;
      var out = PlayState.applyAnswerAck(P.q, P.answeredFor, idx, res);
      if (!out) return; // a different question is showing now
      P.answeredFor = out.answeredFor; P.error = out.error;
      render();
    });
  }

  function timerRow(q) {
    var endsLocal = q.endsAt - P.offset;
    var box = h('div', { class: 'timer' });
    var num = h('span', { class: 'countdown' });
    function tick() { num.textContent = String(Math.max(0, Math.ceil((endsLocal - Date.now()) / 1000))); }
    tick();
    var iv = setInterval(tick, 250);
    cleanups.push(function () { clearInterval(iv); });
    var handle = null;
    setTimeout(function () {
      if (window.Flower && Flower.petalTimer && box.isConnected) {
        try { handle = Flower.petalTimer(box, { durationMs: q.time * 1000, endsAt: endsLocal }); } catch (e) { handle = null; }
      }
    }, 0);
    cleanups.push(function () { if (handle && handle.stop) handle.stop(); });
    return h('div', { class: 'cluster timer-wrap' }, box, num);
  }

  function choiceButton(i, text, onclick) {
    return h('button', { class: 'choice', type: 'button', 'data-i': String(i), onclick: onclick },
      h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: text }));
  }

  var multiSel = [];
  var orderSel = [];
  var lastQIndex = -1;

  function viewQuestion() {
    var q = P.q;
    if (lastQIndex !== q.index) { lastQIndex = q.index; multiSel = []; orderSel = []; }
    var kids = [timerRow(q), h('p', { class: 'prompt', text: q.prompt })];

    if (q.type === 'single') {
      kids.push(h('div', { class: 'choice-grid' }, q.choices.map(function (c, i) { return choiceButton(i, c, function () { submit(i); }); })));
    } else if (q.type === 'truefalse') {
      kids.push(h('div', { class: 'tf-grid' },
        h('button', { class: 'choice', type: 'button', 'data-i': '0', onclick: function () { submit(true); } }, h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: 'True' })),
        h('button', { class: 'choice', type: 'button', 'data-i': '1', onclick: function () { submit(false); } }, h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: 'False' }))));
    } else if (q.type === 'multi') {
      var sub = h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Submit', disabled: multiSel.length === 0, onclick: function () { submit(multiSel.slice()); } });
      var grid = h('div', { class: 'choice-grid' }, q.choices.map(function (c, i) {
        var b = choiceButton(i, c, function () {
          var at = multiSel.indexOf(i);
          if (at >= 0) multiSel.splice(at, 1); else multiSel.push(i);
          b.classList.toggle('is-selected', at < 0);
          b.setAttribute('aria-pressed', String(at < 0));
          sub.disabled = multiSel.length === 0;
        });
        if (multiSel.indexOf(i) >= 0) b.classList.add('is-selected');
        b.setAttribute('aria-pressed', String(multiSel.indexOf(i) >= 0));
        return b;
      }));
      kids.push(h('p', { class: 'muted', text: 'Select all that apply.' }), grid, sub);
    } else if (q.type === 'order') {
      var undo = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Undo', onclick: function () { orderSel.pop(); paint(); } });
      var osub = h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Submit', onclick: function () { submit(orderSel.slice()); } });
      var list = h('ol', { class: 'order-list' });
      var itemEls = q.items.map(function (t, i) {
        var pick = function () { if (orderSel.indexOf(i) < 0) { orderSel.push(i); paint(); } };
        var li = h('li', { class: 'order-item', role: 'button', tabindex: '0', onclick: pick }, h('span', { class: 'order-item__text', text: t }));
        li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        return li;
      });
      itemEls.forEach(function (li) { list.append(li); });
      var paint = function () {
        itemEls.forEach(function (li, i) {
          var b = li;
          var pos = orderSel.indexOf(i);
          if (pos >= 0) { b.setAttribute('data-pos', String(pos + 1)); b.classList.add('is-selected'); }
          else { b.removeAttribute('data-pos'); b.classList.remove('is-selected'); }
        });
        undo.disabled = orderSel.length === 0;
        osub.disabled = orderSel.length !== q.items.length;
      };
      paint();
      kids.push(h('p', { class: 'muted', text: 'Tap the items in the correct order.' }), list, h('div', { class: 'cluster' }, undo, osub));
    } else if (q.type === 'spell') {
      var input = h('input', { class: 'input spell-input', type: 'text', maxlength: '40', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Type the word' });
      var go = function () {
        var v = input.value;
        input.value = '';
        if (v.trim()) submit(v);
      };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      kids.push(input, h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'Submit', onclick: go }));
    }
    kids.push(toast());
    show(kids);
  }

  function reverentNow() { return !!(P.room && P.room.reverent); }

  function viewResult() {
    var r = P.result;
    var q = P.q;
    var title; var lines = [];
    if (!r.answered) title = 'No answer this time';
    else if (q && q.type === 'spell') { title = r.matchPct === 100 ? 'Perfect!' : 'Nice try'; lines.push('You matched ' + r.matchPct + '%'); }
    else title = r.correct ? (reverentNow() ? 'Correct' : 'Correct!') : (r.partial ? 'Partly right' : 'Not this time');
    lines.push('+' + r.points + ' points');
    var kids = [h('h1', { text: title })];
    lines.forEach(function (l) { kids.push(h('p', { class: 'result-line', text: l })); });
    if (P.reveal && q && q.type === 'spell') kids.push(h('p', { class: 'muted', text: 'The word was: ' + P.reveal.answer }));
    kids.push(h('p', { class: 'muted', text: reverentNow() ? 'Please look to the big screen.' : 'Take a breath, the next question is coming.' }));
    show(kids);
    if (r.correct && window.Flower && Flower.burst) { try { Flower.burst(app, { count: 16 }); } catch (e) { /* ignore */ } }
  }

  function viewOver() {
    var pod = P.podium ? P.podium.podium : [];
    var list = h('ol', { class: 'scoreboard' }, pod.map(function (p, i) {
      return h('li', { class: 'scoreboard__row' }, h('span', { class: 'scoreboard__name', text: p.name }), h('span', { class: 'scoreboard__score', text: String(p.score) }));
    }));
    show([h('h1', { text: 'Thank you for playing' }), list, h('p', { class: 'result-line', text: 'Your score: ' + P.score })]);
  }

  function render() {
    if (!P.joined) { viewJoin(); return; }
    var r = P.room;
    if (!r) { viewWaiting('Joining...'); return; }
    switch (r.phase) {
      case 'lobby': if (howtoSeen()) viewWaiting(); else viewHowto(); break;
      case 'question':
        if (!P.q || P.q.index !== r.qIndex) { viewWaiting('Get ready...'); break; }
        if (PlayState.showLocked(P.q, P.answeredFor)) viewLocked(); else viewQuestion();
        break;
      case 'reveal':
        if (P.result) viewResult(); else viewWaiting('Time is up!');
        break;
      case 'over': viewOver(); break;
      default: viewWaiting();
    }
  }

  // ---------- socket ----------
  socket.on('room:state', function (st) {
    P.room = st;
    if (P.id) {
      var me = st.players.filter(function (p) { return p.id === P.id; })[0];
      if (me) P.score = me.score;
    }
    if (st.phase === 'lobby') { P.result = null; }
    render();
  });
  socket.on('question:show', function (q) {
    var update = PlayState.isUpdate(P.q, q); // same index = time extended; keep lock state and selections
    P.q = q;
    if (!update) { P.result = null; P.reveal = null; P.error = ''; }
    P.offset = q.serverNow - Date.now();
    render();
  });
  socket.on('question:reveal', function (rv) { P.reveal = rv; });
  socket.on('you:result', function (r) { P.result = r; P.score = r.score; render(); });
  socket.on('you:rank', function (r) { P.rank = r; renderBar(); });
  socket.on('game:over', function (g) { P.podium = g; render(); });

  function rejoin() {
    var token = P.code ? localStorage.getItem('hgs.player.' + P.code) : null;
    if (!token) { render(); return; }
    emitAck('player:rejoin', { playerToken: token }).then(function (res) {
      if (res && res.ok) {
        P.joined = true; P.name = res.state.name; P.badge = res.state.badge; P.id = res.state.id; P.score = res.state.score;
        P.code = res.state.code; P.answeredFor = PlayState.fromRejoin(res.state.answeredIndex);
        render();
      } else {
        localStorage.removeItem('hgs.player.' + P.code);
        P.joined = false; P.room = null;
        render();
      }
    });
  }
  // The server forgets the socket binding on any reconnect, so rejoin automatically.
  socket.on('connect', rejoin);

  render();
})();
