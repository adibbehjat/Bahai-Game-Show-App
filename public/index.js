'use strict';
(function () {
  var input = document.getElementById('room');
  if (input) {
    input.addEventListener('input', function () {
      var raw = input.value, pos = input.selectionStart == null ? raw.length : input.selectionStart;
      var before = window.PlayState && PlayState.cleanCode ? PlayState.cleanCode(raw.slice(0, pos)) : raw.slice(0, pos).toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '');
      var clean = window.PlayState && PlayState.cleanCode ? PlayState.cleanCode(raw) : raw.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '').slice(0, 4);
      input.value = clean;
      try { input.setSelectionRange(Math.min(before.length, clean.length), Math.min(before.length, clean.length)); } catch (e) { /* ignore */ }
    });
  }
  if (window.Flower) {
    try {
      var slot = document.getElementById('hero-art');
      Flower.decorate(document.getElementById('landing'));
    } catch (e) { /* art is decoration only */ }
  }
})();
