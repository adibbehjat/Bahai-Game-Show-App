# Question format guide

A question pack is a folder with a `pack.json` file and a `questions.jsonl` file. This guide lists every field, its limits, and the rules the validator enforces. It is generated from the same code the game uses, so the numbers are always current.

## Quick start

1. Write your lines in the Question Kit (it checks them live) or in any text editor.
2. Paste them into `questions/<pack-id>/questions.jsonl`, one per line.
3. Run `npm run validate-questions`. It prints every problem with its line number.
4. Restart the server: `sudo systemctl restart game_show`.

```
questions/
  my-pack/
    pack.json
    questions.jsonl
```

The folder name is the pack id. It must be lowercase letters, digits and hyphens (1 to 40 characters), or start with `_` for template packs. The `id` inside `pack.json` must equal the folder name.

## questions.jsonl rules

- One JSON object per line. Blank lines and lines starting with `//` are ignored.
- Every line needs a `type`. Unknown fields cause the line to be rejected.
- All text is plain text. It is normalized (Unicode NFC, control and zero-width characters removed, whitespace collapsed, trimmed) and never treated as HTML.
- A pack loads at most 500 questions, and each file may be at most 1 MB.
- Bad lines are skipped with a logged message; the rest of the pack still loads.

## Common fields

| Field | Required | Description |
|---|---|---|
| `type` | yes | One of `single`, `multi`, `truefalse`, `order`, `spell`. |
| `explanation` | no | Shown after the answer is revealed. Up to 400 characters. |
| `source` | no | Where the fact comes from. Up to 160 characters. |
| `time` | no | Seconds to answer, a whole number from 10 to 60. Default 45 (45 for spell). |
| `difficulty` | no | `easy`, `medium` or `hard`. |

## Question types

### Single choice (`single`)

Players pick exactly one correct answer.

| Field | Required | Description |
|---|---|---|
| `q` | yes | The question, up to 280 characters. |
| `choices` | yes | 2 to 6 choices, each up to 80 characters, no duplicates (ignoring case and accents). |
| `answer` | yes | Integer index (starting at 0) of the one correct choice. |

```json
{"type":"single","q":"Template example: which of these is a color?","choices":["Red","Table","Run","Seven"],"answer":0,"explanation":"Template explanation: red is a color.","source":"TEMPLATE — replace","difficulty":"easy"}
{"type":"single","q":"Template example: which of these is a season?","choices":["Autumn","Monday","Pencil"],"answer":0,"explanation":"Template explanation: autumn is a season.","source":"TEMPLATE — replace","time":15}
```

### Multiple select (`multi`)

Players select every correct answer. Partial credit is given for correct picks minus wrong picks.

| Field | Required | Description |
|---|---|---|
| `q` | yes | The question, up to 280 characters. |
| `choices` | yes | 2 to 6 choices, as for `single`. |
| `answer` | yes | List of unique integer indexes of every correct choice. At least one. |

```json
{"type":"multi","q":"Template example: which of these are fruits? (select all)","choices":["Apple","Carrot","Pear","Rock"],"answer":[0,2],"explanation":"Template explanation: apple and pear are fruits.","source":"TEMPLATE — replace","difficulty":"medium"}
{"type":"multi","q":"Template example: which of these are even numbers? (select all)","choices":["2","3","4","6","9"],"answer":[0,2,3],"explanation":"Template explanation: 2, 4 and 6 are even.","source":"TEMPLATE — replace"}
```

### True / False (`truefalse`)

A statement that is either true or false.

| Field | Required | Description |
|---|---|---|
| `q` | yes | The statement, up to 280 characters. |
| `answer` | yes | `true` or `false` (a JSON boolean, not text). |

```json
{"type":"truefalse","q":"Template example: true or false, a week has ten days.","answer":false,"explanation":"Template explanation: a week has seven days.","source":"TEMPLATE — replace","difficulty":"easy"}
{"type":"truefalse","q":"Template example: true or false, the sun is a star.","answer":true,"explanation":"Template explanation: the sun is a star.","source":"TEMPLATE — replace","time":15}
```

### Put in order (`order`)

Players drag the cards into the correct order (or use the arrows) and press Submit. The game shuffles the cards and never shows the correct order first. Credit is given per item in the right position.

| Field | Required | Description |
|---|---|---|
| `q` | yes | The question, up to 280 characters. |
| `items` | yes | 3 to 6 items, each up to 80 characters. |
| `answer` | yes | A permutation of the item indexes: `answer[k]` is the index in `items` of the item that belongs in position k. |

```json
{"type":"order","q":"Template example: put these days of the week in order.","items":["Wednesday","Monday","Tuesday"],"answer":[1,2,0],"explanation":"Template explanation: Monday, Tuesday, Wednesday.","source":"TEMPLATE — replace"}
{"type":"order","q":"Template example: put these numbers in ascending order.","items":["Three","One","Four","Two"],"answer":[1,3,0,2],"explanation":"Template explanation: one, two, three, four.","source":"TEMPLATE — replace","time":30}
```

### Spelling challenge (`spell`)

A clue is shown on the big screen, with the first letter and letter count as a hint, and players type the word. Close spellings still earn points.

| Field | Required | Description |
|---|---|---|
| `clue` | yes | The clue shown on the big screen, up to 280 characters. |
| `word` | yes | The word to spell, up to 40 characters: letters, spaces, hyphens and apostrophes only. |
| `accept` | no | Up to 5 alternate spellings, same character rules as `word`. |

```json
{"type":"spell","clue":"Template example: a flower with many petals, often grown in autumn.","word":"chrysanthemum","accept":["chrysanthemums"],"explanation":"Template explanation: chrysanthemum.","source":"TEMPLATE — replace","difficulty":"hard"}
{"type":"spell","clue":"Template example: a flowering shrub with large clusters of blossoms.","word":"rhododendron","explanation":"Template explanation: rhododendron.","source":"TEMPLATE — replace"}
{"type":"spell","clue":"Template example: an informal eatery serving coffee (tests accent folding).","word":"café","explanation":"Template explanation: café, with an accent.","source":"TEMPLATE — replace","time":40}
```

## Answer semantics

### Order answers: a worked example

For `order`, `answer` lists, for each correct position, where that item sits in `items`. The order you write `items` in does not matter for fairness: the game shuffles the cards itself and never starts players in the correct order.

```json
{"type":"order","q":"Put these days in order.","items":["Wednesday","Monday","Tuesday"],"answer":[1,2,0]}
```

- Position 0 (first) should be "Monday", which is `items[1]`, so `answer[0] = 1`.
- Position 1 should be "Tuesday", which is `items[2]`, so `answer[1] = 2`.
- Position 2 should be "Wednesday", which is `items[0]`, so `answer[2] = 0`.
- The answer must use every index from 0 to n-1 exactly once. The kit works this out for you: type the items in the correct order and it shuffles them and computes `answer`.

### Multiple select

`answer` is a list such as `[0, 2]`. Indexes must be unique and in range, and there must be at least one.

### Spelling: folding and accepted alternates

Spelling is forgiving. Answers are compared after folding: lowercase, accents removed, and apostrophes, hyphens, spaces and periods ignored, so "bahaullah" matches "Bahá'u'lláh". Close spellings still score: a slip to a neighbouring key, a doubled or missing double letter, or two swapped letters costs only half a point of distance. Accents are a small bonus (typing the exact accented form earns +10%), never a requirement.

Players see a hint before the reveal: the first letter and a blank for every other letter, with apostrophes, hyphens and spaces shown, plus the letter count (for example `B _ _ _ ' _ ' _ _ _ _`, 9 letters). The word itself is never sent early. Use `accept` for genuinely different spellings (for example "colour" and "color"); an entry that only differs by case or accents is rejected as a duplicate of `word`.

## Limits

These are the exact values enforced by the validator.

| Key | Value | Meaning |
|---|---|---|
| `q` | 280 | Maximum characters in a question (`q`) |
| `clue` | 280 | Maximum characters in a spelling clue (`clue`) |
| `choice` | 80 | Maximum characters in one choice |
| `item` | 80 | Maximum characters in one order item |
| `word` | 40 | Maximum characters in a spelling `word` |
| `accept` | 40 | Maximum characters in one `accept` entry |
| `acceptMax` | 5 | Maximum number of `accept` entries |
| `choicesMin` | 2 | Minimum number of choices (single, multi) |
| `choicesMax` | 6 | Maximum number of choices (single, multi) |
| `itemsMin` | 3 | Minimum number of order items |
| `itemsMax` | 6 | Maximum number of order items |
| `explanation` | 400 | Maximum characters in `explanation` |
| `source` | 160 | Maximum characters in `source` |
| `timeMin` | 10 | Shortest `time`, in seconds |
| `timeMax` | 60 | Longest `time`, in seconds |
| `timeDefault` | 45 | Default `time` when omitted (all types except spell), in seconds |
| `spellTimeDefault` | 45 | Default `time` for spell questions, in seconds |
| `title` | 80 | Maximum characters in the pack `title` |
| `description` | 200 | Maximum characters in the pack `description` |
| `introText` | 400 | Maximum characters in `opening.text` or `closing.text` |
| `introSource` | 120 | Maximum characters in `opening.source` or `closing.source` |
| `maxQuestionsPerPack` | 500 | Maximum questions loaded per pack (extra lines are ignored) |

## pack.json

| Field | Required | Description |
|---|---|---|
| `id` | yes | Must equal the folder name. |
| `title` | yes | Up to 80 characters. |
| `theme` | no | One of the themes below. Default `default`. |
| `reverent` | no | `true` or `false` (default `false`). Muted visuals, no confetti, and spell questions are skipped unless the host turns them on. |
| `description` | no | Up to 200 characters. |
| `opening` | no | Object with `text` (required, up to 400) and `source` (optional, up to 120). |
| `closing` | no | Same shape as `opening`. |

```json
{
  "id": "my-pack",
  "title": "My Pack",
  "theme": "default",
  "reverent": false,
  "description": "Optional short description of the pack.",
  "opening": {
    "text": "TEMPLATE opening text: replace with a short welcome or quotation.",
    "source": "TEMPLATE — replace"
  },
  "closing": {
    "text": "TEMPLATE closing text: replace with a short closing thought.",
    "source": "TEMPLATE — replace"
  }
}
```

Themes: `default`, `naw-ruz`, `ridvan`, `declaration-bab`, `ascension-bahaullah`, `martyrdom-bab`, `birth-bab`, `birth-bahaullah`, `covenant`, `ascension-abdulbaha`.

## Common mistakes

- Using a 1-based index. Indexes start at 0: the first choice is 0.
- Writing `"answer": "true"` instead of `true`.
- Writing `items` in a different order than `answer` assumes. `answer[k]` is an index into `items` as written. Use the kit to avoid this.
- Duplicate choices that differ only by case or accents.
- Digits or punctuation in a spelling `word` (only letters, spaces, hyphens and apostrophes are allowed).
- Extra fields such as `hint` or `points`. Unknown fields reject the whole line.
- A pack.json `id` that does not match its folder name.
- A trailing comma or smart quotes (“ ”) around JSON keys. Use plain double quotes.

## Validating

Run `npm run validate-questions` to check every pack, or `node scripts/validate-questions.js questions/my-pack` for one. It exits with a non-zero status if anything is wrong.

A machine-readable JSON Schema for a question line is in `docs/question.schema.json`.
