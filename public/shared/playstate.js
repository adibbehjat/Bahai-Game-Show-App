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

  return { isUpdate: isUpdate, showLocked: showLocked, applyAnswerAck: applyAnswerAck, fromRejoin: fromRejoin };
}));
