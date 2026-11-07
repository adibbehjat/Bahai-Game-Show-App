'use strict';
// Host / big-screen client. All dynamic content goes through textContent / createElement.
(function () {
  var TOKEN_KEY = 'hgs.hostToken';
  var app = document.getElementById('app');
  var socket = io({ transports: ['websocket', 'polling'] });

  var S = {
    authed: false, view: 'pin', error: '',
    packs: null, selectedPack: null,
    room: null, code: null, joinUrl: null, qr: null,
    q: null, progress: { answered: 0, total: 0 }, reveal: null, lb: null, burstFor: -1, extendsUsed: 0, podium: null,
    offset: 0,
  };
  var cleanups = [];
  var timerHandle = null;

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

  function setBody() {
    var r = S.room;
    document.body.setAttribute('data-theme', r && r.theme ? r.theme : 'default');
    document.body.setAttribute('data-reverent', r && r.reverent ? 'true' : 'false');
  }

  var THEME_LABELS = {
    'default': 'Holy Day Celebration', 'naw-ruz': 'Naw-Rúz', 'ridvan': 'Riḍván',
    'declaration-bab': 'Declaration of the Báb', 'ascension-bahaullah': 'Ascension of Bahá’u’lláh',
    'martyrdom-bab': 'Martyrdom of the Báb', 'birth-bab': 'Birth of the Báb', 'birth-bahaullah': 'Birth of Bahá’u’lláh',
    'covenant': 'Day of the Covenant', 'ascension-abdulbaha': 'Ascension of ‘Abdu’l-Bahá'
  };
  var MAX_EXTENDS = 3;
  var TYPE_LABELS = { single: 'Choose one', multi: 'Select all that apply', truefalse: 'True or false?', order: 'Put in order', spell: 'Spell it' };

  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function reverent() { return !!(S.room && S.room.reverent); }

  function blossomImg(size, seed) {
    if (!window.Flower || !Flower.blossom) return null;
    try { return Flower.blossom({ size: size, seed: seed }); } catch (e) { return null; }
  }

  // show(children, {stage:true}) swaps the whole view. Stage views are the 16:9 screen-share layout.
  function show(children, opts) {
    runCleanups();
    setBody();
    var screen = h('div', { class: 'screen ' + (opts && opts.stage ? 'stage-screen' : 'host-screen' + (opts && opts.center ? ' host-screen--center' : '')) }, children);
    app.replaceChildren(screen);
    if (window.Flower && Flower.decorate) { try { Flower.decorate(opts && opts.stage ? screen.querySelector('.stage') : screen); } catch (e) { /* ignore */ } }
    return screen;
  }

  function toast() {
    return S.error ? h('div', { class: 'toast toast--error', role: 'alert', text: S.error }) : null;
  }

  function quote(q, cls) {
    if (!q) return null;
    return h('blockquote', { class: 'quote' + (cls ? ' ' + cls : '') }, h('p', { text: q.text }), q.source ? h('span', { class: 'quote__source', text: q.source }) : null);
  }

  // ---------- 16:9 stage chrome ----------
  function joinHint(r) {
    var host = '';
    try { host = new URL(S.joinUrl).host; } catch (e) { host = S.joinUrl ? String(S.joinUrl).replace(/^https?:\/\//, '').replace(/[/?].*$/, '') : ''; }
    return h('div', { class: 'join-hint' },
      h('span', { text: 'Join at' }), h('span', { class: 'join-hint__host', text: host }),
      h('span', { text: '·' }), h('span', { text: 'code' }), h('span', { class: 'join-hint__code', text: r.code || S.code || '' }));
  }

  // opts: {pill, soft, controls:[nodes], lb:true, main: node(s) for the left column or full width}
  function stage(r, opts) {
    var brand = h('div', { class: 'band__brand' },
      h('div', { class: 'band__titles' },
        h('div', { class: 'band__title', text: r.packTitle || 'Holy Day Game Show' }),
        h('div', { class: 'band__sub', text: THEME_LABELS[r.theme] || THEME_LABELS['default'] })));
    var top = h('header', { class: 'band band--top' }, brand, opts.pill ? h('span', { class: 'pill' + (opts.soft ? ' pill--soft' : ''), text: opts.pill }) : null);
    var bottom = h('footer', { class: 'band band--bottom' }, joinHint(r), opts.note ? h('div', { class: 'band__note', text: opts.note }) : null, h('div', { class: 'band__controls' }, opts.controls || []));
    var main;
    if (opts.lb) {
      main = h('div', { class: 'stage__main stage__main--lb' }, h('div', { class: 'stage__col' }, opts.main), sidebar());
    } else {
      main = h('div', { class: 'stage__main' }, h('div', { class: 'stage__col' }, opts.main));
    }
    return h('div', { class: 'stage' + (opts.cls ? ' ' + opts.cls : '') }, top, main, bottom, toast());
  }

  // ---------- persistent leaderboard (top 5) with FLIP moves + score count-up ----------
  var LB = { el: null, list: null, foot: null, rows: {}, pending: null };
  function lbInit() {
    if (LB.el) return;
    LB.list = h('ol', { class: 'lb__list' });
    LB.foot = h('div', { class: 'lb__foot', 'aria-live': 'off' });
    var head = h('div', { class: 'lb__head' }, blossomImg(60, 3), h('span', { text: 'Top 5' }));
    LB.el = h('aside', { class: 'lb', 'aria-label': 'Top five players' }, head, LB.list, LB.foot);
  }
  function tweenScore(node, from, to, ms) {
    if (from === to || ms <= 0) { node.textContent = String(to); return; }
    var t0 = performance.now();
    function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1 && node.isConnected) requestAnimationFrame(step); else node.textContent = String(to);
    }
    requestAnimationFrame(step);
  }
  function lbFlush(animate) {
    lbInit();
    var data = LB.pending; LB.pending = null;
    if (!data) return;
    var top = data.top || [];
    var rev = reverent(), anim = animate && !reducedMotion();
    var dur = rev ? 1400 : 750;
    var before = {};
    Object.keys(LB.rows).forEach(function (k) { before[k] = LB.rows[k].el.getBoundingClientRect().top; });
    var seen = {};
    top.forEach(function (p, i) {
      var key = String(p.name);
      seen[key] = true;
      var row = LB.rows[key];
      var isNew = !row;
      if (isNew) {
        row = { el: h('li', { class: 'lb__row' }), rank: h('span', { class: 'lb__rank' }), badge: h('span', { class: 'lb__badge', 'aria-hidden': 'true' }),
          name: h('span', { class: 'lb__name' }), score: h('span', { class: 'lb__score' }), value: 0, isNew: true };
        row.el.append(row.rank, row.badge, row.name, row.score);
        LB.rows[key] = row;
      }
      row.rank.textContent = String(p.rank);
      row.badge.textContent = p.badgeText || '';
      row.name.textContent = p.name;
      row.el.className = 'lb__row lb__row--' + Math.min(p.rank, 4);
      var from = row.value;
      row.value = p.score;
      tweenScore(row.score, anim ? from : p.score, p.score, anim ? (rev ? 1400 : 900) : 0);
      LB.list.append(row.el);
    });
    Object.keys(LB.rows).forEach(function (k) {
      if (!seen[k]) { LB.rows[k].el.remove(); delete LB.rows[k]; }
    });
    var empty = LB.list.querySelector('.lb__empty');
    if (!top.length) {
      if (!empty) LB.list.append(h('li', { class: 'lb__empty', text: 'Scores appear after the first question.' }));
    } else if (empty) empty.remove();
    LB.foot.textContent = (data.totalPlayers || 0) + ((data.totalPlayers || 0) === 1 ? ' player' : ' players');
    if (anim && LB.el.isConnected) {
      top.forEach(function (p) {
        var row = LB.rows[String(p.name)];
        if (!row.el.animate) return;
        if (row.isNew) {
          row.isNew = false;
          row.el.animate(rev ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'cubic-bezier(0.3,0.7,0.3,1)', fill: 'both' });
        } else if (before[String(p.name)] != null) {
          var delta = before[String(p.name)] - row.el.getBoundingClientRect().top;
          if (Math.abs(delta) > 1) row.el.animate([{ transform: 'translateY(' + delta + 'px)' }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(0.3,0.7,0.3,1)' });
        }
      });
    } else {
      top.forEach(function (p) { LB.rows[String(p.name)].isNew = false; });
    }
  }
  function sidebar() {
    lbInit();
    if (!LB.pending && !LB.foot.textContent) LB.pending = S.lb || { top: [], totalPlayers: S.room ? S.room.players.length : 0 };
    if (LB.pending) lbFlush(false);
    return LB.el;
  }
  function onLeaderboard(data) {
    S.lb = data;
    LB.pending = data;
    lbInit();
    if (LB.el.isConnected) lbFlush(true);
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
          S.authed = true; S.error = ''; goPacks();
        } else {
          S.error = res && res.error ? res.error : 'Could not sign in';
          render();
        }
      });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    show([h('div', { class: 'stack host-center host-center--narrow' },
      h('div', { class: 'hero-art' }, blossomImg(240)),
      h('h1', { text: 'Host a game' }),
      h('div', { class: 'form-open' },
        h('label', { class: 'label', for: 'pin', text: 'Host PIN' }), input,
        h('button', { class: 'btn btn--primary btn--lg', type: 'button', onclick: submit, text: 'Continue' })),
      toast())], { center: true });
    input.focus();
  }

  function goPacks() {
    S.view = 'packs';
    render();
    emitAck('host:packs', {}).then(function (res) {
      if (res && res.ok) { S.packs = res.packs; render(); }
    });
  }

  function viewPacks() {
    var list = h('div', { class: 'pack-list' });
    var countInput = h('input', { class: 'input', type: 'number', id: 'count', min: '1', max: '30', value: '10' });
    var spellBox = h('input', { type: 'checkbox', id: 'spell' });
    var spellRow = h('label', { class: 'cluster', for: 'spell', hidden: true }, spellBox, h('span', { text: 'Include spelling questions' }));
    var gentleBox = h('input', { type: 'checkbox', id: 'gentle' });
    var gentleRow = h('div', { class: 'gentle-opt' },
      h('label', { class: 'cluster', for: 'gentle' }, gentleBox, h('span', { class: 'gentle-opt__title', text: 'Gentle scoring' })),
      h('p', { class: 'muted gentle-opt__help', text: 'Everyone earns the same for a correct answer, however quickly they tap. Recommended for reverent days and for mixed ages.' }));
    var createBtn = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: true, text: 'Create game' });

    function select(p) {
      if (S.selectedPack !== p.id) gentleBox.checked = !!p.reverent;
      S.selectedPack = p.id;
      var max = Math.min(30, p.counts.total);
      countInput.value = String(Math.min(Number(countInput.value) || 10, max) || 1);
      countInput.max = String(max);
      spellRow.hidden = !p.reverent;
      createBtn.disabled = p.counts.total < 1;
      Array.prototype.forEach.call(list.children, function (el) {
        el.classList.toggle('is-selected', el.getAttribute('data-id') === p.id);
      });
    }

    (S.packs || []).forEach(function (p) {
      var bt = Object.keys(p.counts.byType || {}).map(function (t) { return p.counts.byType[t] + ' ' + t; }).join(', ');
      var card = h('button', { class: 'card pack-card' + (S.selectedPack === p.id ? ' is-selected' : ''), type: 'button', 'data-id': p.id, onclick: function () { select(p); } },
        h('strong', { text: p.title }),
        p.reverent ? h('span', { class: 'pack-tag', text: 'Reverent' }) : null,
        h('span', { class: 'muted', text: p.counts.total + ' questions' + (bt ? ' (' + bt + ')' : '') }));
      list.append(card);
    });
    if (S.packs && !S.packs.length) list.append(h('p', { class: 'muted', text: 'No question packs found.' }));
    if (!S.packs) list.append(h('p', { class: 'muted', text: 'Loading...' }));

    createBtn.addEventListener('click', function () {
      var p = (S.packs || []).filter(function (x) { return x.id === S.selectedPack; })[0];
      if (!p) return;
      var count = Math.max(1, Math.min(30, Math.floor(Number(countInput.value) || 1)));
      createBtn.disabled = true;
      emitAck('host:create', { packId: p.id, count: count, includeSpell: !!(p.reverent && spellBox.checked), gentle: !!gentleBox.checked }).then(function (res) {
        if (res && res.ok) {
          S.code = res.code; S.joinUrl = res.joinUrl; S.qr = res.qrSvg; S.error = '';
        } else {
          S.error = (res && res.error) || 'Could not create game';
          createBtn.disabled = false; render();
        }
      });
    });

    show([h('div', { class: 'stack host-center' },
      h('div', { class: 'hero-art' }, blossomImg(160)),
      h('h1', { text: 'Choose a question pack' }), list,
      h('div', { class: 'pack-form' },
        h('label', { class: 'label', for: 'count', text: 'Number of questions' }), countInput, spellRow, gentleRow, createBtn),
      toast())]);
    if (S.selectedPack) {
      var cur = (S.packs || []).filter(function (x) { return x.id === S.selectedPack; })[0];
      if (cur) select(cur);
    }
  }

  function playerChips(room) {
    var wrap = h('div', { class: 'players-grid' });
    room.players.forEach(function (p) {
      var chip = h('span', { class: 'player-chip' + (p.connected ? '' : ' player-chip--disconnected') },
        p.badge && p.badge.text ? h('span', { class: 'chip-badge', 'aria-hidden': 'true', text: p.badge.text }) : null,
        h('span', { class: 'chip-name', text: p.name }));
      chip.append(h('button', { class: 'btn btn--ghost chip-kick', type: 'button', 'aria-label': 'Remove ' + p.name, title: 'Remove', text: '×',
        onclick: function () { emitAck('host:kick', { playerId: p.id }); } }));
      wrap.append(chip);
    });
    return wrap;
  }

  function howToCard(r) {
    var gentle = !!r.gentle;
    var items = [
      ['Join', 'Scan the QR code or enter the room code on your phone.'],
      ['Answer', 'Tap your answer. You can change it until time is up.'],
      ['Ordering', 'Tap the items in sequence. Tap Undo to start again.'],
      ['Spelling', 'Read the clue and type the word, then send it.'],
      ['Scoring', gentle ? 'Take your time. Every correct answer counts the same.' : 'Faster answers earn a little more.']
    ];
    var list = h('ul', { class: 'howto__list' });
    items.forEach(function (it) { list.append(h('li', null, h('strong', { text: it[0] }), h('span', { text: it[1] }))); });
    return h('section', { class: 'howto', 'aria-label': 'How to play' }, h('h2', { class: 'howto__title', text: 'How to play' }), list);
  }

  function viewLobby() {
    var r = S.room;
    var start = h('button', { class: 'btn btn--primary btn--lg', type: 'button', disabled: r.players.length < 1, text: 'Start game',
      onclick: function () { emitAck('host:start', {}); } });
    var hero = h('div', { class: 'lobby-hero' },
      h('div', { class: 'lobby-hero__label', text: 'Join with code' }),
      h('div', { class: 'ornament-rule', 'aria-hidden': 'true' }),
      h('div', { class: 'room-code', text: r.code }),
      h('div', { class: 'ornament-rule', 'aria-hidden': 'true' }));
    var qr = h('div', { class: 'qr-card' },
      h('div', { class: 'qr-frame' }, S.qr ? h('img', { src: S.qr, alt: 'QR code to join the game', width: '256', height: '256' }) : null),
      h('div', { class: 'qr-card__label', text: 'Scan to join' }));
    var n = r.players.length;
    var left = [
      hero,
      quote(r.opening, 'lobby-quote'),
      h('div', { class: 'players-head' }, h('span', { text: 'Players' }), h('span', { text: String(n) })),
      n ? playerChips(r) : h('p', { class: 'players-empty', text: r.reverent ? 'Welcome. We will begin when everyone has arrived.' : 'Waiting for players to join…' })
    ];
    var main = h('div', { class: 'lobby-grid' }, h('div', { class: 'stage__col' }, left), h('div', { class: 'stage__col lobby-side' }, qr, howToCard(r)));
    show([stage(r, { cls: 'stage--lobby', pill: 'Lobby', soft: true, main: main, controls: [start] })], { stage: true });
  }

  function totalMsFor(q) {
    var ms = q.endsAt - q.serverNow;
    return isFinite(ms) && ms > 0 ? ms : q.time * 1000;
  }
  function answeredText() {
    var p = S.progress;
    if (p.total > 0 && p.answered >= p.total) return reverent() ? 'All answers are in' : 'Everyone has answered ✿';
    return 'Answered ' + p.answered + '/' + p.total;
  }

  function timerBlock(endsLocal, totalMs) {
    var box = h('div', { class: 'timer' });
    var handle = null;
    setTimeout(function () {
      if (window.Flower && Flower.petalTimer && box.isConnected) {
        try { handle = Flower.petalTimer(box, { durationMs: totalMs, endsAt: endsLocal }); } catch (e) { handle = null; }
      }
    }, 0);
    cleanups.push(function () { if (handle && handle.stop) handle.stop(); });
    return box;
  }

  function choiceGrid(q, reveal) {
    var correct = reveal ? [].concat(reveal.answer) : [];
    if (q.type === 'truefalse') {
      var tf = h('div', { class: 'tf-grid' });
      [true, false].forEach(function (v, i) {
        var cls = 'choice';
        if (reveal) cls += reveal.answer === v ? ' is-correct' : ' is-wrong';
        tf.append(h('div', { class: cls, 'data-i': String(i) }, h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: v ? 'True' : 'False' })));
      });
      return tf;
    }
    var n = (q.choices || []).length;
    var grid = h('div', { class: 'choice-grid choice-grid--n' + n });
    (q.choices || []).forEach(function (c, i) {
      var cls = 'choice';
      if (reveal) cls += correct.indexOf(i) >= 0 ? ' is-correct' : ' is-wrong';
      grid.append(h('div', { class: cls, 'data-i': String(i) }, h('span', { class: 'choice__glyph', 'aria-hidden': 'true' }), h('span', { class: 'choice__text', text: c })));
    });
    return grid;
  }

  function orderList(q, reveal) {
    var list = h('ol', { class: 'order-list' });
    var seq = reveal ? reveal.answer : (q.items || []).map(function (_, i) { return i; });
    seq.forEach(function (idx, k) {
      list.append(h('li', { class: 'order-item' + (reveal ? ' is-correct' : ''), 'data-pos': reveal ? String(k + 1) : null }, h('span', { class: 'order-item__text', text: q.items[idx] })));
    });
    return list;
  }

  function viewQuestion() {
    var q = S.q, r = S.room;
    var endsLocal = q.endsAt - S.offset;
    var main = [];
    main.push(h('div', { class: 'q-meta' },
      h('span', { class: 'q-type', text: TYPE_LABELS[q.type] || 'Question' }),
      h('span', { class: 'answered', text: answeredText() })));
    if (q.type === 'spell') {
      main.push(h('div', { class: 'q-top' }, h('div', { class: 'big-question spell-clue', text: q.clue }), timerBlock(endsLocal, totalMsFor(q))));
      main.push(h('div', { class: 'q-body' },
        h('p', { class: 'spell-hint', text: 'Type the word on your phone.' }),
        h('div', { class: 'spell-hint spell-hint--soft', text: 'Spelling counts, and so do accents.' })));
    } else {
      main.push(h('div', { class: 'q-top' }, h('div', { class: 'big-question', text: q.q }), timerBlock(endsLocal, totalMsFor(q))));
      main.push(h('div', { class: 'q-body' }, q.type === 'order' ? orderList(q, null) : choiceGrid(q, null)));
    }
    var left = Math.max(0, MAX_EXTENDS - S.extendsUsed);
    var extend = h('button', { class: 'btn', type: 'button', disabled: left < 1, text: 'Extend +15s (' + left + ' left)', onclick: function () { emitAck('host:extend', {}); } });
    var skip = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Skip', onclick: function () { emitAck('host:skip', {}); } });
    show([stage(r, { pill: 'Question ' + (q.index + 1) + ' of ' + q.total, main: main, lb: true, controls: [extend, skip] })], { stage: true });
  }

  function answerLabel(q, rv) {
    if (q.type === 'spell') return String(rv.answer);
    if (q.type === 'truefalse') return rv.answer ? 'True' : 'False';
    if (q.type === 'single') return (q.choices || [])[rv.answer];
    if (q.type === 'multi') return [].concat(rv.answer).map(function (i) { return q.choices[i]; }).join(' · ');
    return '';
  }

  function viewReveal() {
    var q = S.q, rv = S.reveal, r = S.room;
    var main = [];
    var stats = q.type === 'spell'
      ? rv.stats.submitted + ' submitted · ' + rv.stats.perfect + ' perfect · avg match ' + rv.stats.avgMatch + '%'
      : rv.stats.correct + ' of ' + rv.stats.answered + ' correct';
    main.push(h('div', { class: 'q-meta' },
      h('span', { class: 'q-type', text: 'Answer' }),
      h('span', { class: 'pill pill--soft', text: stats })));
    if (q.type === 'spell') {
      main.push(h('div', { class: 'big-question spell-clue', text: q.clue }));
      main.push(h('div', { class: 'q-body' }, h('div', { class: 'spell-answer', text: rv.answer })));
    } else {
      main.push(h('div', { class: 'big-question', text: q.q }));
      main.push(h('div', { class: 'q-body' }, q.type === 'order' ? orderList(q, rv) : choiceGrid(q, rv)));
    }
    var detail = [];
    var label = answerLabel(q, rv);
    detail.push(h('div', { class: 'reveal-banner__label', text: q.type === 'order' ? 'The correct order' : 'Correct answer' }));
    if (label && q.type !== 'spell') detail.push(h('div', { class: 'reveal-banner__answer', text: label }));
    if (rv.explanation) detail.push(h('p', { class: 'explanation', text: rv.explanation }));
    if (rv.source) detail.push(h('div', { class: 'reveal-source', text: rv.source }));
    main.push(h('div', { class: 'reveal-banner' }, blossomImg(100, q.index + 2), h('div', null, detail)));
    var last = r.qIndex + 1 >= r.qTotal;
    var next = h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: last ? 'Finish' : 'Next question', onclick: function () { emitAck('host:next', {}); } });
    var end = h('button', { class: 'btn btn--ghost', type: 'button', text: 'End game', onclick: function () { emitAck('host:end', {}); } });
    var scr = show([stage(r, { cls: 'reveal-view', pill: 'Question ' + (q.index + 1) + ' of ' + q.total, main: main, lb: true, controls: [end, next], note: r.reverent ? 'A moment to reflect' : 'Take a breath, the next question is coming' })], { stage: true });
    if (S.burstFor !== q.index && rv.stats && rv.stats.correct > 0 && !r.reverent && window.Flower && Flower.burst) {
      S.burstFor = q.index;
      try { Flower.burst(scr.querySelector('.stage'), { count: 30 }); } catch (e) { /* ignore */ }
    }
  }

  function viewOver() {
    var r = S.room;
    var pod = S.podium ? S.podium.podium : [];
    var cols = [];
    [0, 1, 2].forEach(function (i) {
      if (!pod[i]) return;
      cols.push(h('div', { class: 'podium__col podium__col--' + (i + 1) },
        blossomImg(i === 0 ? 200 : 140, i * 2 + 1),
        h('div', { class: 'podium__step podium__step--' + (i + 1) }, h('span', { class: 'podium__name', text: pod[i].name }), h('span', { class: 'podium__score', text: String(pod[i].score) }))));
    });
    var again = h('button', { class: 'btn btn--primary btn--lg', type: 'button', text: 'New game', onclick: function () {
      S.room = null; S.code = null; S.q = null; S.reveal = null; S.podium = null; S.lb = null; LB.rows = {}; if (LB.list) LB.list.replaceChildren(); if (LB.foot) LB.foot.textContent = ''; goPacks();
    } });
    var main = [h('div', { class: 'over' },
      h('h1', { class: 'over__title', text: r.reverent ? 'Thank you for gathering with us' : 'Thank you all for playing' }),
      h('div', { class: 'ornament-rule', 'aria-hidden': 'true' }),
      h('div', { class: 'podium' }, cols),
      quote(r.closing))];
    var scr = show([stage(r, { cls: 'stage--over', pill: 'Final results', soft: true, main: main, controls: [again] })], { stage: true });
    if (!r.reverent && window.Flower && Flower.burst) { try { Flower.burst(scr.querySelector('.stage'), { count: 40 }); } catch (e) { /* ignore */ } }
  }

  function render() {
    if (!S.authed) { viewPin(); return; }
    var r = S.room;
    if (!r) { if (S.view === 'packs') viewPacks(); else viewPin(); return; }
    switch (r.phase) {
      case 'lobby': viewLobby(); break;
      case 'question':
        if (S.q && S.q.index === r.qIndex) viewQuestion();
        break;
      case 'reveal':
        if (S.q && S.reveal) viewReveal();
        break;
      case 'over': viewOver(); break;
      default: break;
    }
  }

  // ---------- socket ----------
  socket.on('room:state', function (st) {
    S.room = st; S.code = st.code; S.view = 'room';
    if (st.phase === 'question' || st.phase === 'lobby') S.reveal = null;
    render();
  });
  socket.on('question:show', function (q) {
    var sameQ = S.q && S.q.index === q.index && S.room && S.room.phase === 'question';
    if (sameQ && q.endsAt !== S.q.endsAt) S.extendsUsed++;       // re-emitted by host:extend: keep progress
    else if (!sameQ) { S.extendsUsed = 0; S.progress = { answered: 0, total: S.progress.total }; }
    S.q = q; S.reveal = null;
    S.offset = q.serverNow - Date.now();
    render();
  });
  socket.on('question:progress', function (p) {
    S.progress = p;
    if (S.room && S.room.phase === 'question' && S.q) {
      var el = document.querySelector('.answered');
      if (el) el.textContent = answeredText();
    }
  });
  socket.on('question:reveal', function (rv) { S.reveal = rv; render(); });
  socket.on('leaderboard', onLeaderboard);
  socket.on('game:over', function (g) { S.podium = g; render(); });

  function resume() {
    var token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { S.authed = false; render(); return; }
    emitAck('host:resume', { hostToken: token }).then(function (res) {
      if (!res || !res.ok) { sessionStorage.removeItem(TOKEN_KEY); S.authed = false; S.room = null; render(); return; }
      S.authed = true;
      if (res.room) { S.code = res.room.code; S.joinUrl = res.room.joinUrl; S.qr = res.room.qrSvg; }
      else if (!S.room) goPacks();
    });
  }
  socket.on('connect', resume);

  render();
})();
