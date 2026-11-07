'use strict';
// Prompts for a PIN twice (hidden input) and prints an ADMIN_PIN_HASH=... line.
const readline = require('node:readline');
const { hashPinSync } = require('../lib/auth');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const origWrite = rl._writeToOutput ? rl._writeToOutput.bind(rl) : null;
rl._writeToOutput = function (s) { if (!muted && origWrite) origWrite(s); };

const lines = [];
let waiter = null;
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
rl.on('close', () => { if (waiter) { const w = waiter; waiter = null; w(''); } });

function ask(prompt) {
  process.stdout.write(prompt);
  muted = true;
  return new Promise((resolve) => {
    const done = (l) => { muted = false; process.stdout.write('\n'); resolve(l); };
    if (lines.length) done(lines.shift()); else waiter = done;
  });
}

(async () => {
  const a = await ask('Admin PIN (min 6 characters): ');
  if (a.length < 6) { console.error('PIN must be at least 6 characters.'); process.exit(1); }
  const b = await ask('Repeat PIN: ');
  if (a !== b) { console.error('PINs do not match.'); process.exit(1); }
  rl.close();
  console.log('ADMIN_PIN_HASH=' + hashPinSync(a, { N: 32768 }));
  console.log('# Put the line above in .env (never commit .env).');
})();
