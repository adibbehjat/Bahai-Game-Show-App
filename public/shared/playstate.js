/* Pure helpers for the player page's answered/locked state - UMD: window.PlayState / module.exports.
   The answered state is always tied to a question index, never a bare boolean. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlayState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Show "Locked in" only if the current question is the one this player answered.
  function showLocked(q, answeredFor) {
    return !!q && typeof answeredFor === 'number' && answeredFor === q.index;
  }

  // Applies an answer ack. `submittedIndex` is the question index captured at submit time.
  // Returns { answeredFor, error } (error is a string or ''), or null if the ack is stale and must be ignored.
  function applyAnswerAck(q, answeredFor, submittedIndex, res) {
    if (!q || q.index !== submittedIndex) return null; // question changed since submit
    if (res && (res.ok || res.already)) return { answeredFor: submittedIndex, error: '' };
    return { answeredFor: answeredFor, error: 'Too late, or already answered' };
  }

  // Value for answeredFor from a rejoin ack's answeredIndex.
  function fromRejoin(answeredIndex) {
    return typeof answeredIndex === 'number' ? answeredIndex : null;
  }

  // A question:show for the same index is an update (e.g. time extended), not a new question.
  function isUpdate(prevQ, nextQ) {
    return !!prevQ && !!nextQ && prevQ.index === nextQ.index;
  }

  // Room code typing helper: uppercase, drop characters outside the code alphabet, cap at 4.
  function cleanCode(raw) {
    return String(raw == null ? '' : raw).toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 4);
  }

  // Ordering puzzle: picks is the sequence of item indices in the order tapped (picks[k] is at position k+1).
  // Tapping an unnumbered item appends it; tapping a numbered item removes it and later picks shift down.
  // Returns a new array.
  function toggleOrderPick(picks, index) {
    var at = picks.indexOf(index);
    if (at < 0) return picks.concat(index);
    return picks.slice(0, at).concat(picks.slice(at + 1));
  }

  // Splits a spellHint string into tokens: {kind:'blank'} for '_', {kind:'gap'} for a word gap, {kind:'ch', text}.
  function hintTokens(hint) {
    var out = [];
    String(hint || '').split(' ').forEach(function (t) {
      if (t === '') { if (out.length && out[out.length - 1].kind !== 'gap') out.push({ kind: 'gap' }); return; }
      out.push(t === '_' ? { kind: 'blank' } : { kind: 'ch', text: t });
    });
    while (out.length && out[out.length - 1].kind === 'gap') out.pop();
    return out;
  }

  // Builds <div.spell-hint-block> with the pattern and the letter count using DOM APIs only.
  function buildSpellHint(doc, hint, letters) {
    var tokens = hintTokens(hint);
    var first = '';
    tokens.forEach(function (t) { if (!first && t.kind === 'ch' && /\p{L}/u.test(t.text)) first = t.text; });
    var pattern = doc.createElement('div');
    pattern.className = 'spell-hint-pattern';
    pattern.setAttribute('role', 'img');
    pattern.setAttribute('aria-label', (first ? 'Starts with ' + first + ', ' : '') + letters + ' letters');
    tokens.forEach(function (t) {
      var span = doc.createElement('span');
      if (t.kind === 'blank') { span.className = 'spell-hint-pattern__blank'; }
      else if (t.kind === 'gap') { span.className = 'spell-hint-pattern__gap'; }
      else { span.className = 'spell-hint-pattern__ch'; span.textContent = t.text; }
      span.setAttribute('aria-hidden', 'true');
      pattern.appendChild(span);
    });
    var count = doc.createElement('span');
    count.className = 'spell-hint-count';
    count.textContent = letters + ' letters';
    var block = doc.createElement('div');
    block.className = 'spell-hint-block';
    block.appendChild(pattern);
    block.appendChild(count);
    return block;
  }

  return { hintTokens: hintTokens, buildSpellHint: buildSpellHint, toggleOrderPick: toggleOrderPick, cleanCode: cleanCode, isUpdate: isUpdate, showLocked: showLocked, applyAnswerAck: applyAnswerAck, fromRejoin: fromRejoin };
}));
