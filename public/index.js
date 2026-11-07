'use strict';
(function () {
  var input = document.getElementById('room');
  if (input) {
    input.addEventListener('input', function () {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }
  if (window.Flower) {
    try {
      var slot = document.getElementById('hero-art');
      Flower.decorate(document.getElementById('landing'));
    } catch (e) { /* art is decoration only */ }
  }
})();
