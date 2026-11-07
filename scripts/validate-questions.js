#!/usr/bin/env node
'use strict';
// Usage: node scripts/validate-questions.js [path-to-questions-dir-or-single-pack-dir]
const fs = require('node:fs');
const path = require('node:path');
const { loadPacks, loadPack } = require('../lib/packs.js');

const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'questions'));
const errors = [];
const onError = (file, line, msg) => errors.push(line ? `${file}:${line}: ${msg}` : `${file}: ${msg}`);

let packs;
if (fs.existsSync(path.join(target, 'pack.json'))) {
  const name = path.basename(target);
  const p = loadPack(target, name, onError);
  packs = new Map(p ? [[name, p]] : []);
} else {
  packs = loadPacks(target, { onError });
}

for (const [id, p] of packs) {
  const by = {};
  for (const q of p.questions) by[q.type] = (by[q.type] || 0) + 1;
  const parts = Object.keys(by).map((t) => `${t}=${by[t]}`).join(' ');
  console.log(`${id}: ${p.questions.length} valid question(s) [${parts}]`);
}
if (!packs.size) console.log('No valid packs found.');
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log('OK');
