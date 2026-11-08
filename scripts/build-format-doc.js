#!/usr/bin/env node
'use strict';
// Regenerates docs/QUESTION-FORMAT.md and docs/question.schema.json from public/shared/schema.js.
const fs = require('node:fs');
const path = require('node:path');
const FG = require('../public/shared/format-guide.js');
const docs = path.join(__dirname, '..', 'docs');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'QUESTION-FORMAT.md'), FG.toMarkdown());
fs.writeFileSync(path.join(docs, 'question.schema.json'), JSON.stringify(FG.jsonSchema(), null, 2) + '\n');
console.log('Wrote docs/QUESTION-FORMAT.md and docs/question.schema.json');
