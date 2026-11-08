'use strict';
// Regression: show() runs the previous view's cleanups first, so a timer registered before show() is
// cleared immediately (the lobby countdown froze at 5:00). Timers must go through onMount().
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'host.js'), 'utf8');

function enclosingOnMount(idx) {
  const before = src.slice(0, idx);
  const m = before.lastIndexOf('onMount(function');
  if (m < 0) return false;
  // the onMount callback must still be open: count braces between its start and idx
  const seg = before.slice(m);
  const open = (seg.match(/\{/g) || []).length, close = (seg.match(/\}/g) || []).length;
  return open > close;
}

test('host.js timers and cleanups are registered inside onMount callbacks', () => {
  const re = /setInterval\(|cleanups\.push\(/g;
  let m, n = 0;
  while ((m = re.exec(src))) {
    n++;
    assert.ok(enclosingOnMount(m.index), 'unmounted timer/cleanup registration at offset ' + m.index);
  }
  assert.ok(n >= 3, 'expected the lobby, petal timer and dialog registrations');
});

test('show() runs cleanups before mount callbacks', () => {
  const body = src.slice(src.indexOf('function show('), src.indexOf('function toast'));
  assert.ok(body.indexOf('runCleanups()') < body.indexOf('pendingMount'));
});
