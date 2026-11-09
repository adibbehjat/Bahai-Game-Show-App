/* Format guide model, generated from GameSchema. UMD: window.FormatGuide / module.exports.
   Used by the kit (side panel and .md download), scripts/build-format-doc.js and the tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./schema.js'));
  else root.FormatGuide = factory(root.GameSchema);
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';
  var L = S.LIMITS;

  var LIMIT_DOCS = [
    ['q', 'Maximum characters in a question (`q`)'],
    ['clue', 'Maximum characters in a spelling clue (`clue`)'],
    ['choice', 'Maximum characters in one choice'],
    ['item', 'Maximum characters in one order item'],
    ['word', 'Maximum characters in a spelling `word`'],
    ['accept', 'Maximum characters in one `accept` entry'],
    ['acceptMax', 'Maximum number of `accept` entries'],
    ['choicesMin', 'Minimum number of choices (single, multi)'],
    ['choicesMax', 'Maximum number of choices (single, multi)'],
    ['itemsMin', 'Minimum number of order items'],
    ['itemsMax', 'Maximum number of order items'],
    ['explanation', 'Maximum characters in `explanation`'],
    ['source', 'Maximum characters in `source`'],
    ['timeMin', 'Shortest `time`, in seconds'],
    ['timeMax', 'Longest `time`, in seconds'],
    ['timeDefault', 'Default `time` when omitted (all types except spell), in seconds'],
    ['spellTimeDefault', 'Default `time` for spell questions, in seconds'],
    ['title', 'Maximum characters in the pack `title`'],
    ['description', 'Maximum characters in the pack `description`'],
    ['introText', 'Maximum characters in `opening.text` or `closing.text`'],
    ['introSource', 'Maximum characters in `opening.source` or `closing.source`'],
    ['maxQuestionsPerPack', 'Maximum questions loaded per pack (extra lines are ignored)']
  ];

  var COMMON = [
    ['type', 'yes', 'One of `single`, `multi`, `truefalse`, `order`, `spell`.'],
    ['explanation', 'no', 'Shown after the answer is revealed. Up to ' + L.explanation + ' characters.'],
    ['source', 'no', 'Where the fact comes from. Up to ' + L.source + ' characters.'],
    ['time', 'no', 'Seconds to answer, a whole number from ' + L.timeMin + ' to ' + L.timeMax + '. Default ' + L.timeDefault + ' (' + L.spellTimeDefault + ' for spell).'],
    ['difficulty', 'no', '`easy`, `medium` or `hard`.']
  ];
  var FIELDS = {
    single: [
      ['q', 'yes', 'The question, up to ' + L.q + ' characters.'],
      ['choices', 'yes', L.choicesMin + ' to ' + L.choicesMax + ' choices, each up to ' + L.choice + ' characters, no duplicates (ignoring case and accents).'],
      ['answer', 'yes', 'Integer index (starting at 0) of the one correct choice.']
    ],
    multi: [
      ['q', 'yes', 'The question, up to ' + L.q + ' characters.'],
      ['choices', 'yes', L.choicesMin + ' to ' + L.choicesMax + ' choices, as for `single`.'],
      ['answer', 'yes', 'List of unique integer indexes of every correct choice. At least one.']
    ],
    truefalse: [
      ['q', 'yes', 'The statement, up to ' + L.q + ' characters.'],
      ['answer', 'yes', '`true` or `false` (a JSON boolean, not text).']
    ],
    order: [
      ['q', 'yes', 'The question, up to ' + L.q + ' characters.'],
      ['items', 'yes', L.itemsMin + ' to ' + L.itemsMax + ' items in the order players will SEE them (shuffled), each up to ' + L.item + ' characters.'],
      ['answer', 'yes', 'A permutation of the item indexes: `answer[k]` is the index in `items` of the item that belongs in position k.']
    ],
    spell: [
      ['clue', 'yes', 'The clue shown on the big screen, up to ' + L.clue + ' characters.'],
      ['word', 'yes', 'The word to spell, up to ' + L.word + ' characters: letters, spaces, hyphens and apostrophes only.'],
      ['accept', 'no', 'Up to ' + L.acceptMax + ' alternate spellings, same character rules as `word`.']
    ]
  };
  var TYPE_BLURB = {
    single: 'Players pick exactly one correct answer.',
    multi: 'Players select every correct answer. Partial credit is given for correct picks minus wrong picks.',
    truefalse: 'A statement that is either true or false.',
    order: 'Players arrange the items into the correct order. Credit is given per item in the right position.',
    spell: 'A clue is shown on the big screen, with the first letter and letter count as a hint, and players type the word. Close spellings still earn points.'
  };
  var TYPE_NAMES = { single: 'Single choice', multi: 'Multiple select', truefalse: 'True / False', order: 'Put in order', spell: 'Spelling challenge' };

  function blocks() {
    var b = [];
    function add(k, t, extra) { var o = { k: k }; if (t !== undefined) o.t = t; if (extra) Object.keys(extra).forEach(function (x) { o[x] = extra[x]; }); b.push(o); }
    add('h1', 'Question format guide');
    add('p', 'A question pack is a folder with a `pack.json` file and a `questions.jsonl` file. This guide lists every field, its limits, and the rules the validator enforces. It is generated from the same code the game uses, so the numbers are always current.');

    add('h2', 'Quick start');
    add('ol', undefined, { items: [
      'Write your lines in the Question Kit (it checks them live) or in any text editor.',
      'Paste them into `questions/<pack-id>/questions.jsonl`, one per line.',
      'Run `npm run validate-questions`. It prints every problem with its line number.',
      'Restart the server: `sudo systemctl restart game_show`.'
    ] });
    add('code', 'questions/\n  my-pack/\n    pack.json\n    questions.jsonl', { lang: '' });
    add('p', 'The folder name is the pack id. It must be lowercase letters, digits and hyphens (1 to 40 characters), or start with `_` for template packs. The `id` inside `pack.json` must equal the folder name.');

    add('h2', 'questions.jsonl rules');
    add('ul', undefined, { items: [
      'One JSON object per line. Blank lines and lines starting with `//` are ignored.',
      'Every line needs a `type`. Unknown fields cause the line to be rejected.',
      'All text is plain text. It is normalized (Unicode NFC, control and zero-width characters removed, whitespace collapsed, trimmed) and never treated as HTML.',
      'A pack loads at most ' + L.maxQuestionsPerPack + ' questions, and each file may be at most 1 MB.',
      'Bad lines are skipped with a logged message; the rest of the pack still loads.'
    ] });

    add('h2', 'Common fields');
    add('table', undefined, { head: ['Field', 'Required', 'Description'], rows: COMMON.map(function (r) { return ['`' + r[0] + '`', r[1], r[2]]; }) });

    add('h2', 'Question types');
    S.TYPES.forEach(function (t) {
      add('h3', TYPE_NAMES[t] + ' (`' + t + '`)');
      add('p', TYPE_BLURB[t]);
      add('table', undefined, { head: ['Field', 'Required', 'Description'], rows: FIELDS[t].map(function (r) { return ['`' + r[0] + '`', r[1], r[2]]; }) });
      var ex = S.EXAMPLES.filter(function (e) { return e.type === t; });
      add('code', ex.map(function (e) { return JSON.stringify(e); }).join('\n'), { lang: 'json' });
    });

    add('h2', 'Answer semantics');
    add('h3', 'Order answers: a worked example');
    add('p', 'For `order`, write `items` in the order players will see them (shuffled). Then `answer` lists, for each correct position, where that item sits in `items`.');
    add('code', '{"type":"order","q":"Put these days in order.","items":["Wednesday","Monday","Tuesday"],"answer":[1,2,0]}', { lang: 'json' });
    add('ul', undefined, { items: [
      'Position 0 (first) should be "Monday", which is `items[1]`, so `answer[0] = 1`.',
      'Position 1 should be "Tuesday", which is `items[2]`, so `answer[1] = 2`.',
      'Position 2 should be "Wednesday", which is `items[0]`, so `answer[2] = 0`.',
      'The answer must use every index from 0 to n-1 exactly once. The kit works this out for you: type the items in the correct order and it shuffles them and computes `answer`.'
    ] });
    add('h3', 'Multiple select');
    add('p', '`answer` is a list such as `[0, 2]`. Indexes must be unique and in range, and there must be at least one.');
    add('h3', 'Spelling: folding and accepted alternates');
    add('p', 'Spelling is forgiving. Answers are compared after folding: lowercase, accents removed, and apostrophes, hyphens, spaces and periods ignored, so "bahaullah" matches "Bahá\'u\'lláh". Close spellings still score: a slip to a neighbouring key, a doubled or missing double letter, or two swapped letters costs only half a point of distance. Accents are a small bonus (typing the exact accented form earns +10%), never a requirement.');
    add('p', 'Players see a hint before the reveal: the first letter and a blank for every other letter, with apostrophes, hyphens and spaces shown, plus the letter count (for example `B _ _ _ \' _ \' _ _ _ _`, 9 letters). The word itself is never sent early. Use `accept` for genuinely different spellings (for example "colour" and "color"); an entry that only differs by case or accents is rejected as a duplicate of `word`.');

    add('h2', 'Limits');
    add('p', 'These are the exact values enforced by the validator.');
    add('table', undefined, { head: ['Key', 'Value', 'Meaning'], rows: LIMIT_DOCS.map(function (r) { return ['`' + r[0] + '`', String(L[r[0]]), r[1]]; }) });

    add('h2', 'pack.json');
    add('table', undefined, { head: ['Field', 'Required', 'Description'], rows: [
      ['`id`', 'yes', 'Must equal the folder name.'],
      ['`title`', 'yes', 'Up to ' + L.title + ' characters.'],
      ['`theme`', 'no', 'One of the themes below. Default `default`.'],
      ['`reverent`', 'no', '`true` or `false` (default `false`). Muted visuals, no confetti, and spell questions are skipped unless the host turns them on.'],
      ['`description`', 'no', 'Up to ' + L.description + ' characters.'],
      ['`opening`', 'no', 'Object with `text` (required, up to ' + L.introText + ') and `source` (optional, up to ' + L.introSource + ').'],
      ['`closing`', 'no', 'Same shape as `opening`.']
    ] });
    add('code', JSON.stringify(S.PACK_EXAMPLE, null, 2), { lang: 'json' });
    add('p', 'Themes: ' + S.THEMES.map(function (t) { return '`' + t + '`'; }).join(', ') + '.');

    add('h2', 'Common mistakes');
    add('ul', undefined, { items: [
      'Using a 1-based index. Indexes start at 0: the first choice is 0.',
      'Writing `"answer": "true"` instead of `true`.',
      'Putting an order question\'s items in the correct order but forgetting that `answer` must then describe the shuffled order. Use the kit to avoid this.',
      'Duplicate choices that differ only by case or accents.',
      'Digits or punctuation in a spelling `word` (only letters, spaces, hyphens and apostrophes are allowed).',
      'Extra fields such as `hint` or `points`. Unknown fields reject the whole line.',
      'A pack.json `id` that does not match its folder name.',
      'A trailing comma or smart quotes (“ ”) around JSON keys. Use plain double quotes.'
    ] });

    add('h2', 'Validating');
    add('p', 'Run `npm run validate-questions` to check every pack, or `node scripts/validate-questions.js questions/my-pack` for one. It exits with a non-zero status if anything is wrong.');
    add('p', 'A machine-readable JSON Schema for a question line is in `docs/question.schema.json`.');
    return b;
  }

  function toMarkdown(bl) {
    bl = bl || blocks();
    var out = [];
    bl.forEach(function (x) {
      if (x.k === 'h1') out.push('# ' + x.t);
      else if (x.k === 'h2') out.push('## ' + x.t);
      else if (x.k === 'h3') out.push('### ' + x.t);
      else if (x.k === 'p') out.push(x.t);
      else if (x.k === 'ul') out.push(x.items.map(function (i) { return '- ' + i; }).join('\n'));
      else if (x.k === 'ol') out.push(x.items.map(function (i, n) { return (n + 1) + '. ' + i; }).join('\n'));
      else if (x.k === 'code') out.push('```' + (x.lang || '') + '\n' + x.t + '\n```');
      else if (x.k === 'table') {
        out.push('| ' + x.head.join(' | ') + ' |\n|' + x.head.map(function () { return '---'; }).join('|') + '|\n' +
          x.rows.map(function (r) { return '| ' + r.join(' | ') + ' |'; }).join('\n'));
      }
    });
    return out.join('\n\n') + '\n';
  }

  function jsonSchema() {
    function str(max) { return { type: 'string', minLength: 1, maxLength: max }; }
    var word = { type: 'string', minLength: 1, maxLength: L.word, pattern: "^[\\p{L}\\p{M}'ʻ’\\- ]+$" };
    var common = {
      explanation: { type: 'string', maxLength: L.explanation },
      source: { type: 'string', maxLength: L.source },
      time: { type: 'integer', minimum: L.timeMin, maximum: L.timeMax },
      difficulty: { enum: S.DIFFICULTIES }
    };
    function variant(type, required, props) {
      var p = { type: { const: type } };
      Object.keys(props).forEach(function (k) { p[k] = props[k]; });
      Object.keys(common).forEach(function (k) { p[k] = common[k]; });
      return { type: 'object', required: ['type'].concat(required), properties: p, additionalProperties: false };
    }
    function idx(max) { return { type: 'integer', minimum: 0, maximum: max - 1 }; }
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://example.invalid/question.schema.json',
      title: 'Question line (one line of questions.jsonl)',
      description: 'Generated by scripts/build-format-doc.js from public/shared/schema.js. Some rules (unique choices after folding, order answer being a permutation, whitespace normalization) are enforced only by the game validator.',
      oneOf: [
        variant('single', ['q', 'choices', 'answer'], { q: str(L.q), choices: { type: 'array', minItems: L.choicesMin, maxItems: L.choicesMax, uniqueItems: true, items: str(L.choice) }, answer: idx(L.choicesMax) }),
        variant('multi', ['q', 'choices', 'answer'], { q: str(L.q), choices: { type: 'array', minItems: L.choicesMin, maxItems: L.choicesMax, uniqueItems: true, items: str(L.choice) }, answer: { type: 'array', minItems: 1, maxItems: L.choicesMax, uniqueItems: true, items: idx(L.choicesMax) } }),
        variant('truefalse', ['q', 'answer'], { q: str(L.q), answer: { type: 'boolean' } }),
        variant('order', ['q', 'items', 'answer'], { q: str(L.q), items: { type: 'array', minItems: L.itemsMin, maxItems: L.itemsMax, uniqueItems: true, items: str(L.item) }, answer: { type: 'array', minItems: L.itemsMin, maxItems: L.itemsMax, uniqueItems: true, items: idx(L.itemsMax) } }),
        variant('spell', ['clue', 'word'], { clue: str(L.clue), word: word, accept: { type: 'array', maxItems: L.acceptMax, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: L.accept, pattern: word.pattern } } })
      ]
    };
  }

  return { blocks: blocks, toMarkdown: toMarkdown, jsonSchema: jsonSchema, LIMIT_DOCS: LIMIT_DOCS, TYPE_NAMES: TYPE_NAMES };
});
