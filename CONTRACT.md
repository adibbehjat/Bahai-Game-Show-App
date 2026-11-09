# Build Contract — Holy Day Game Show

This is the shared contract that every contributor (human or AI agent) must follow. If the code and this file disagree, this file wins until it is updated on purpose.

## Stack
- Node 24, CommonJS (`require`). Dependencies are limited to: `express`, `socket.io`, `helmet`, `dotenv`, `qrcode` (QR generated **server-side** as an SVG string or data URL, so no CDN is needed). Do not add other runtime dependencies without updating this file. Use `node:test` and `socket.io-client` (devDependency) for tests.
- The frontend is plain HTML, CSS and JS with **no build step, no CDN, no inline `<script>` or `<style>`, and no inline event handlers**. Everything is self-hosted under `public/`. Socket.IO's client is served by the server at `/socket.io/socket.io.js`.
- The server listens on `config.PORT` (default 3719).

## File ownership (one owner per file, to avoid collisions)
| Area | Owner | Files |
|---|---|---|
| Design system | design agent | `public/theme/**` (`theme.css`, `flower.js`, `fonts/`), `public/styleguide.html`, `public/styleguide.js`, `DESIGN.md` |
| Content and kit | content agent | `public/shared/schema.js`, `lib/packs.js`, `scripts/validate-questions.js`, `public/kit.html`, `public/kit.js`, `questions/**` |
| App | app agent | `server.js`, `package.json`, `lib/{config,auth,rooms,scoring,validate,ratelimit}.js`, `public/{index,host,play}.html`, `public/{index,host,play}.js`, `public/app.css` (layout only, built on theme tokens), `scripts/hash-pin.js`, `scripts/render-deploy.js`, `test/**` |
| Orchestrator | Opus | `.gitignore`, `.githooks/`, `.env.example`, `CONTRACT.md` |

Until the content agent's real modules exist, the app agent may write minimal stubs of `public/shared/schema.js` / `lib/packs.js` that follow the interfaces below. The content agent's versions replace them.

## 1. Question packs
```
questions/<pack-id>/pack.json
questions/<pack-id>/questions.jsonl     # one JSON object per line; blank lines and lines starting with // are ignored
```
- A `<pack-id>` must match `^[a-z0-9-]{1,40}$` or start with `_` (for example `_template`). Packs whose folder name starts with `_` are still loaded and listed. A folder name that doesn't match is skipped.

### pack.json
```json
{ "id": "naw-ruz", "title": "Naw-Rúz", "theme": "naw-ruz", "reverent": false,
  "description": "optional, ≤200 chars",
  "opening": { "text": "≤400 chars", "source": "≤120 chars" },
  "closing": { "text": "≤400 chars", "source": "≤120 chars" } }
```
- `theme` is one of: `default`, `naw-ruz`, `ridvan`, `declaration-bab`, `ascension-bahaullah`, `martyrdom-bab`, `birth-bab`, `birth-bahaullah`, `covenant`, `ascension-abdulbaha`.
- `reverent: true` means muted visuals, no confetti or petal-bursts, and `spell` questions are skipped unless the host explicitly turns them on.
- `opening` and `closing` are optional.

### Question lines (`type` is required)
| type | required fields | answer semantics |
|---|---|---|
| `single` | `q`, `choices` (2–6), `answer` (int index) | exactly one correct |
| `multi` | `q`, `choices` (2–6), `answer` (array of unique ints, at least 1) | select all that apply |
| `truefalse` | `q`, `answer` (boolean) | |
| `order` | `q`, `items` (3–6), `answer` (permutation of indices = correct order) | `answer[k]` is the index in `items` of the item that belongs in position k |
| `spell` | `clue`, `word`; optional `accept` (array, ≤5) | type the word |

Common optional fields: `explanation` (≤400), `source` (≤160), `time` (int seconds, 10–60, default 20; `spell` defaults to 30), `difficulty` (`easy` \| `medium` \| `hard`).

Length limits: `q` and `clue` ≤280; each choice or item ≤80; `word` and each `accept` entry ≤40, and they must match `^[\p{L}\p{M}'ʻ’\- ]+$`. Unknown keys mean the line is **rejected**. All strings are treated as plain text everywhere and are never rendered as HTML.

### `public/shared/schema.js` (UMD: `window.GameSchema` in the browser, `module.exports` in Node)
```js
GameSchema.THEMES            // array of allowed theme ids
GameSchema.TYPES             // ['single','multi','truefalse','order','spell']
GameSchema.LIMITS            // object of the limits above
GameSchema.validateQuestion(obj)  -> { ok: true, value } | { ok: false, errors: [string] }
GameSchema.validatePack(obj)      -> { ok: true, value } | { ok: false, errors: [string] }
GameSchema.normalizeText(s)       // NFC, strip control/zero-width chars, collapse whitespace, trim
GameSchema.foldForCompare(s)      // normalizeText + lowercase + strip diacritics + unify ' ’ ʻ → '
```

### `lib/packs.js`
```js
loadPacks(dir = path.join(__dirname,'..','questions')) -> Map<packId, { meta, questions: [..] }>
// Reads once, synchronously, at startup. Logs and skips invalid lines as "pack/file:line: error". Never writes.
listPacks(packs) -> [{ id, title, theme, reverent, counts: { total, byType } }]   // safe to send to the host
```

## 2. Socket.IO protocol
Every payload is a plain object and is validated server-side with exact keys and types. Anything invalid is dropped silently, with no error that leaks detail. Acks use the shape `{ ok: true, ... } | { ok: false, error: 'generic message' }`.

**Client to server, host** (allowed only on a socket that has passed `host:auth`; every event except `host:auth` and `host:resume` acts on the socket's bound room):
- `host:auth {pin}` → ack `{ok, hostToken}`. The token is HMAC-signed, has a 12-hour TTL, and isn't bound to a room yet.
- `host:resume {hostToken}` → ack `{ok, room?}`. Rebinds after a reload.
- `host:packs {}` → ack `{ok, packs: listPacks()}`
- `host:create {packId, count, includeSpell}` → ack `{ok, code, joinUrl, qrSvg}`. `count` is an int from 1 to 30. Creating a room binds the host token to that room.
- `host:start {}`, `host:next {}`, `host:skip {}`, `host:end {}`, `host:kick {playerId}`

**Client to server, player:**
- `player:join {code, name}` → ack `{ok, playerToken, playerId, name}` or `{ok:false, error:'Game not found'}`
- `player:rejoin {playerToken}` → ack `{ok, state}` or `{ok:false}`
- `player:answer {value}` → ack `{ok}`. `value` must match the current question type: an int for single, an int[] for multi, a boolean for truefalse, an int[] permutation for order, and a string of at most 40 characters for spell.

**Server to client** (broadcast only to `room:<code>` or a subset of it):
- `room:state {phase, code, packTitle, theme, reverent, players:[{id,name,score,connected}], qIndex, qTotal}`. `phase` is one of `lobby|question|reveal|scoreboard|over`.
- To the host and big screen, `question:show {index, total, type, q|clue, choices?, items?, time, endsAt}`. To players, `question:show {index, total, type, choices?, items?, time, endsAt, prompt}`. For spell, the host gets `clue` only (no audio; see Revision 3a), and players get `prompt` only. **Answers are never included.**
- `question:progress {answered, total}` (host only)
- `question:reveal {answer, explanation, source, stats}`. For spell, `answer` is the correct word and `stats` is `{submitted, perfect, avgMatch}`, **never anyone's attempt text**. Each player also receives a private `you:result {correct|partial, points, matchPct?}`.
- `scoreboard {top:[{name,score}], you?}`
- `game:over {podium:[{name,score}]}`

## 3. Scoring (implemented in `lib/scoring.js`, pure functions, unit-tested)
- Base is 1000 points. The speed factor is `0.5 + 0.5 * (remainingMs / totalMs)`, using server time.
- `single` / `truefalse`: base × speed if correct, otherwise 0.
- `multi`: fraction = max(0, (correct picks − wrong picks) / number of correct answers), then base × fraction × speed.
- `order`: fraction = (items in their correct position) / n, then base × fraction × speed.
- `spell`: compare `foldForCompare` of the attempt against `word` and each `accept` entry, and take the best similarity: `sim = 1 − levenshtein / max(len)`. An exact match after folding counts as sim = 1. Points are base × sim² × speed, plus a 10% bonus if the attempt matches `word` exactly *with* diacritics (`normalizeText` equality). `matchPct = round(sim × 100)`. **The attempt string is discarded right after scoring.** It's never stored, logged, or broadcast.

## 4. Security rules (non-negotiable)
- **Config:** only `lib/config.js` reads `process.env`, after `dotenv` loads. In production, startup fails if `ADMIN_PIN_HASH`, `SESSION_SECRET` (at least 64 hex characters), or `PUBLIC_ORIGIN` is missing or still holds a placeholder (starts with `<`). In dev with no values, it generates a random 6-digit PIN and secret and prints the PIN to stdout once. Never log secrets.
- **PIN hash format:** `scrypt$N$r$p$saltB64$hashB64`, compared with `crypto.timingSafeEqual`.
- **No uploads or write endpoints.** The only HTTP routes are static files and the pages `/`, `/host`, `/play`, `/kit`, `/styleguide`. Use `express.json` with a 1 KB limit, or don't use it at all. Set Socket.IO `maxHttpBufferSize: 2048`.
- **Origin:** Socket.IO `allowRequest` rejects any handshake whose Origin isn't `PUBLIC_ORIGIN` (in dev, any localhost origin is allowed). `app.set('trust proxy', 'loopback')`.
- **Headers:** helmet with CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`. The `/kit` page uses `connect-src 'none'`.
- **Rendering:** client code uses only `textContent` / `createElement` / `setAttribute` for dynamic data. Never use `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval`, or `new Function`. The server-generated QR SVG is inserted as an `<img src="data:image/svg+xml;base64,...">`.
- **Rooms:**
  - Room codes are 4 characters (see Revision 5) from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, generated with `crypto.randomInt`.
  - Only an authenticated host can create a room.
  - A join for an unknown or ended code returns `Game not found`, and the socket joins nothing.
  - Player tokens are HMAC-signed `{room, pid, iat}`, and each socket is bound server-side to exactly one room.
  - After a player joins, the room is never read from a payload again.
  - Rooms are destroyed 10 minutes after the game ends or after 30 minutes idle, and their tokens become invalid.
- **Rate limits (in-memory):**
  - `host:auth`: 5 attempts per IP per 10 minutes.
  - `player:join`: only *failed* joins count (unknown or ended code, invalid payload). After 20 failures per IP in 10 minutes, that IP is blocked for the rest of the window. Successful joins are never limited, because a whole community on one Wi-Fi shares one NAT IP. Each socket gets at most 5 join attempts.
  - All socket events: 20 per socket per second, and the socket is disconnected if it goes over.
  - `MAX_ROOMS` and `MAX_PLAYERS_PER_ROOM` are enforced.
- **Names:** `normalizeText`, 1–20 characters, at least one letter or number, unique within the room (case-insensitive). Otherwise the server returns a generic error.
- **Timing:** answers are accepted only while `phase === 'question'` and before `endsAt`, once per player per question.

## 5. Design contract
- `public/theme/theme.css` defines all tokens as CSS custom properties on `:root`, plus `[data-theme="<id>"]` overrides on `<body>`, plus `[data-reverent="true"]`.
- Required token names: `--color-bg`, `--color-surface`, `--color-ink`, `--color-ink-soft`, `--color-accent`, `--color-accent-2`, `--color-success`, `--color-danger`, `--choice-1..--choice-6` (each paired with a glyph), `--font-display`, `--font-body`, `--space-1..--space-8`, `--radius-sm|md|lg`, `--shadow-soft`, `--dur-fast|med|slow`.
- Required component classes (semantic; the app uses only these plus `app.css` layout):
  - `.screen` (a full-viewport page layer), `.stack`, `.cluster`, `.card`, `.card--deckle`
  - `.btn`, `.btn--primary`, `.btn--ghost`, `.btn--lg`
  - `.input`, `.label`
  - `.room-code`, `.qr-frame`
  - `.player-chip`, `.player-chip--disconnected`
  - `.choice-grid`, `.choice[data-i="0..5"]` with `.choice__glyph` and `.choice__text`, plus the states `.is-selected`, `.is-correct`, `.is-wrong`, `.is-locked`
  - `.order-list`, `.order-item[data-pos]`
  - `.tf-grid`
  - `.spell-input`
  - `.timer` (petal timer container; driven by `flower.js`)
  - `.scoreboard`, `.scoreboard__row`, `.podium`, `.podium__step--1|2|3`
  - `.toast`, `.locked-in`, `.quote`, `.quote__source`
  - `.big-question` (big-screen question text), `.muted`, `.visually-hidden`
- `public/theme/flower.js` (UMD as `window.Flower`) builds DOM/SVG nodes only (no innerHTML):
  - `Flower.blossom({petals, layers, size, colors}) -> SVGElement`
  - `Flower.petalTimer(container, {durationMs, endsAt}) -> {stop()}`
  - `Flower.burst(container, {count})` (a no-op when `prefers-reduced-motion` or `[data-reverent]` is set)
  - `Flower.decorate(rootEl)` (corner flourishes)
- Fonts are self-hosted WOFF2 in `public/theme/fonts/` and must be OFL-licensed. If they can't be downloaded, fall back to a system stack (`Georgia`/`ui-serif` for display, `system-ui` for body) and document how to add the fonts.
- All motion respects `prefers-reduced-motion: reduce`.

## 6. Placeholder content
Template questions are clearly fake (`"source": "TEMPLATE — replace"`) and exist only to exercise the formats. Real Holy Day content will be supplied by the project owner later.

---
## Revision 2 (2026-11-07): owner feedback round

### Ownership changes
| Area | Owner | Files |
|---|---|---|
| Presentation | design agent | adds `public/host.html`, `public/host.js` (DOM structure, layout and visuals only; socket and protocol logic must keep working unchanged), `public/app.css`, `public/index.html`, `public/index.js`, `public/theme/art/**`, `scripts/build-art.js` |
| Players and names | app agent | adds `public/shared/names.js`, `public/play.css` (play-page layout); keeps `public/play.*`, `server.js`, `lib/**`, `test/**` |

### Generated player names (no free-text names, ever)
`public/shared/names.js` is UMD (`window.GameNames` in the browser, `module.exports` in Node):
```js
GameNames.ADJECTIVES  // ≥30 positive, affirming single words, Capitalized ASCII (e.g. Kindful, Trusty, Hopeful, Joyous)
GameNames.FLOWERS     // ≥30 common flower names, Capitalized ASCII, single word (e.g. Lily, Jasmine, Marigold)
GameNames.EMOJIS      // curated allowlist, each a SINGLE code point (no ZWJ sequences, no U+FE0F variation selector)
GameNames.NUMBER_MIN = 1; GameNames.NUMBER_MAX = 99
GameNames.combinations() // ADJECTIVES.length * FLOWERS.length; must be ≥ 600 (target ≥ 900)
GameNames.compose({adj, flower, badge}) -> { name: "Hopeful Lily", badgeText: "🌻" | "42", display: "🌻 Hopeful Lily" | "Hopeful Lily 42" } | null
GameNames.random(rng = Math.random) -> {adj, flower, badge}
// badge = { kind: 'emoji', value: <index into EMOJIS> } | { kind: 'number', value: <int 1..99> }
```
**Emoji rules**, enforced by a unit test over every entry. No code point may fall in:
- U+1F600–U+1F64F (Emoticons block: every smiley and face)
- U+1F910–U+1F92F, U+1F970–U+1F97F, U+1F9D0–U+1F9DF (face emoji in Supplemental Symbols and Pictographs)
- U+263A, U+2639 (☺ ☹)
- U+1F466–U+1F487 or U+1F574–U+1F57A (people)
- U+1F595, U+1F346, U+1F351, U+1F4A6, U+1F4A9 (rude or innuendo)

Allowed themes: flowers and plants, gentle animals, birds, fruit, sky (sun, moon, star, rainbow), music and art, lanterns, gems, and books.

**Protocol change:** `player:join {code, adj, flower, badge}` takes **indices only**. The server validates them against `GameNames`, composes the display name itself, and never accepts a name string from a client. Uniqueness within a room is case-insensitive on `display`. If the display name is taken, the ack is `{ok:false, error:'Name taken'}` and the client offers another shuffle. Room state players gain `badge: {kind, text}`.

### Visual system revisions
- Flower art is a set of **PNG assets** in `public/theme/art/`, rendered from hand-authored layered SVG illustrations by `scripts/build-art.js` (devDependency `@resvg/resvg-js`). The PNGs are committed, so production needs no build. Filenames are a stable, documented interface, which lets a community swap in hand-painted or AI-generated PNGs without touching code. `flower.js` keeps its public API and uses the PNGs.
- The host view is designed for **screen sharing**: a 16:9 stage that's legible at 1280×720 shared video quality.
- Login and join screens are **seamless**: no card whose colour mismatches its backdrop.

### Leaderboard flow (owner request, Revision 2b)
- **No full-screen scoreboard between questions.** The phase cycle is `lobby → question → reveal → question → … → reveal → over`, and the `scoreboard` phase is removed. After the last reveal, `host:next` goes to `over` (the podium).
- **A live top-5 sidebar on the host.** The server emits `leaderboard {top:[{rank, name, badgeText, score}], totalPlayers}` (top 5 only) to the room after every reveal, on join and leave, and in the rejoin/resume snapshot. The host renders it as a persistent right-hand sidebar during the question and reveal phases (and in a compact form in the lobby if it fits).
- **Each player sees their own rank.** Each player privately receives `you:rank {rank, of, score}` after every reveal and on rejoin. Ties use competition ranking (1, 2, 2, 4). The phone footer shows `badge · name · score · #rank of N`.
- The `scoreboard` event is removed.

### Answer-lock state (bug fix, Revision 2c)
- Player "answered" state is keyed to a **question index**, never a bare boolean. `player:rejoin` acks `answeredIndex`: it equals `room.qIndex` only while `phase === 'question'` and this player has already answered the current question, and is `null` otherwise. The client shows "Locked in" only when `answeredFor === currentQuestion.index`. The decision logic lives in `public/shared/playstate.js` (owned by the app agent) and is unit-tested.

### Deployment and docs for other communities (Revision 2d)
- **Ownership:** a new deploy/docs agent owns `DEPLOY.md`, `README.md`, `CLAUDE.md`, `SECURITY.md`, `deploy/**` (templates), `scripts/render-deploy.js`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and `.github/workflows/**`. The app agent no longer edits these.
- **Docs are generic:** use `game.example.org` and placeholders. No owner-specific domain, paths, usernames or IPs appear in any committed file.
- **Supported paths:** a Linux VPS behind Apache, nginx or Caddy (systemd or pm2); Docker / Compose; a PaaS (Render, Fly.io or Railway, with WebSockets enabled); and local-network mode (a laptop on the venue Wi-Fi, no domain).
- **`TRUST_PROXY`** (owned by the app agent in `lib/config.js`/`server.js`) defaults to `loopback`. Docker and PaaS deployments may set it to a specific IP/CIDR list, or to `1` (one hop), so that per-IP rate limits see real client IPs.

### Onboarding and gentle pacing (Revision 3)
- **How to play:** the host lobby shows a compact "How to play" card covering joining, tapping answers, the ordering puzzle (tap in sequence, Undo), spelling, and "faster answers earn a little more" (or "take your time" in gentle mode). Before Q1, phones show a one-screen how-to with a "Got it" button that is local only (no server event).
- **Warm microcopy:** brief, dignified lines with no banter: "Everyone has answered ✿", "Thank you for playing", "Take a breath, the next question is coming", and on reverent packs, softer wording still.
- **Gentle scoring:** `host:create {packId, count, includeSpell, gentle}` takes a boolean `gentle`, which defaults to `true` when the pack is reverent and `false` otherwise. When it's on, the speed factor is 1, so scores depend only on correctness. `room:state` includes `gentle`.
- **Extend time:** `host:extend {}` is valid only in the `question` phase. It adds 15 seconds to `endsAt`, at most 3 times per question. The server re-emits `question:show` with the new `endsAt`, and must NOT clear existing answers. Clients update their timers.

### No audio (owner decision, Revision 3a)
- **No audio of any kind:** no speechSynthesis, sound effects, music or read-aloud. Remove `host:speak`, `speakWord` from the spell `question:show` payload, and any "Hear the word" UI. Spelling questions show the `clue` only.
- **No banter or trash talk.** Microcopy stays warm, brief and dignified.

### Simpler names and badges (owner request, Revision 4)
- **`GameNames.FLOWERS`:** simple, easy-to-pronounce, everyday flower names only (e.g. Rose, Lily, Daisy, Tulip, Iris, Lotus, Poppy, Violet, Lilac, Aster, Clover, Daffodil, Sunflower, Bluebell, Primrose, Jasmine, Marigold, Orchid, Peony, Snowdrop, Lavender, Buttercup, Pansy). Drop hard ones such as Chrysanthemum, Hyacinth, Freesia, Gardenia, Camellia and Zinnia. `combinations()` must stay **≥ 600**.
- **`GameNames.EMOJIS`:** flowers only, each a single code point with broad device support: 🌸 🌹 🌺 🌻 🌼 🌷 🪷 💐 💮. No 🥀 (wilted), and nothing that needs U+FE0F.
- **Numbers:** `NUMBER_MIN = 0` and `NUMBER_MAX = 19`.
- **Badges render everywhere a player is named:** lobby chips, the top-5 sidebar, the **podium** (`game:over` podium entries carry `badge: {kind, text}`), the phone footer, and the phone's final screen.

### Shorter room codes (owner request, Revision 5)
- Room codes are **4 characters** from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32⁴ ≈ 1.05M), generated with `crypto.randomInt`, and regenerated on collision with an active room. All other join protections are unchanged: the failed-join limit, per-socket caps, room TTLs and kick.
- **Uppercase only.** The server accepts exactly `/^[A-HJ-NP-Z2-9]{4}$/` with no case folding. Join inputs uppercase as the user types and drop characters outside the alphabet, so lower-case never appears. All examples and docs show uppercase codes.

### Lobby timeout (owner decision, Revision 6)
- **A room still in `lobby` closes after 5 minutes without activity** (`LOBBY_IDLE_MS = 5 * 60 * 1000`). "Activity" means any host action or any player join, rejoin or leave. Rooms in `question` or `reveal` keep the 30-minute idle rule, and `over` rooms keep the 10-minute rule.
- **Visible countdown.** In the lobby phase, `room:state` carries `closesAt` (server epoch ms; `null` outside the lobby) and `serverNow`. The host lobby shows a persistent countdown, e.g. "Room open · closes in 4:32 if the game doesn't start". Any activity resets it, and it turns into the warning style in the final minute.
- **The server warns before closing.** It emits `room:closing {inSeconds: 60}` to the room once, 60 seconds before the lobby timeout (reset if activity happens).
- **The server announces the close.** It emits `room:closed {reason: 'idle' | 'ended'}` to the room, then disconnects everyone from the room channel and invalidates its tokens. The host shows "This room closed after 5 minutes without activity", with a "Create a new room" button. Phones show "This game has closed" and return to the join screen.

### Try-it preview in the kit (owner request, Revision 7)
- **Shared scoring:** scoring logic moves to `public/shared/scoring.js` (UMD: `window.GameScoring` in the browser, `module.exports` in Node, depending only on `GameSchema`). `lib/scoring.js` becomes a thin re-export so the server and the tests are unchanged. The API stays the same: `scoreAnswer(q, value, {remainingMs, totalMs, gentle}) -> {correct, partial, points, matchPct?, ...}`, plus `levenshtein`/`similarity` and the speed factor.
- **Kit "Try it" mode:** the preview becomes interactive. The author answers the draft question exactly as a player would on the phone (tap, multi-select plus Submit, order tap-to-number with Undo, spell typing), then sees the phone result (correct, partial, points or match %) and the big-screen reveal (correct answer highlighted, explanation, source, aggregate spell stats with no attempt text). This runs entirely client-side with no network.

### Host can end a room at any time (owner request, Revision 8)
- **`host:end` works in every phase.** In the `lobby` it CLOSES the room: emit `room:closed {reason:'ended'}` to players, destroy the room, invalidate player tokens, and unbind the host's room (the host token stays valid, so the host can create a new room without the PIN). During `question`/`reveal` it keeps today's behaviour (finish → `over` podium). In `over` it closes the room the same way. The ack is `{ok:true, closed:true|false}`.
- **Resume after refresh.** `host:resume` binds to the host's live room as today. The host UI always offers a way out: the lobby has an "End room" control and the in-game controls keep "End game". Both ask for confirmation. After a close, the host lands on the pack picker with a brief notice ("Room closed").
- **Refreshing must not silently extend the lobby.** `host:resume` should NOT reset the lobby idle timer, because a refresh isn't activity.

### Forgiving spelling (owner request, Revision 9)
- **Comparison folding for spelling** (in scoring only; `GameSchema.foldForCompare` stays as is for duplicate detection): lower-case, strip diacritics, and REMOVE apostrophes/ʻ/’/hyphens/spaces/periods. So "bahaullah" matches "Bahá'u'lláh", and case never matters.
- **Distance is a keyboard-aware weighted Damerau–Levenshtein (optimal string alignment):**
  - substitution 1.0, or **0.5** if the two keys are adjacent on a QWERTY phone keyboard
  - insertion/deletion 1.0, or **0.5** when it doubles or undoubles the neighbouring letter ("Bahaulah" ↔ "Bahaullah")
  - adjacent transposition **0.5** ("Bbá" ↔ "Báb")
  - `similarity = max(0, 1 − distance / max(len))`
- **Points** = BASE × similarity^1.5 × speed (gentler than squared). **Accents are a bonus, not a requirement:** an exact match including diacritics gets +10%. `correct` = similarity 1 after folding. matchPct = round(similarity × 100).
- **Copy:** never say accents are required. Host: "Type the word on your phone. Close spellings still earn points; accents earn a small bonus." Phone prompt: "Spell the word from the big screen. Close counts!"

### Spelling hint, hangman style (owner request, Revision 9b)
- **The server computes `hint`** for every spell question and includes it in `question:show` for BOTH host and players. It shows the first letter as written (with its accent), an underscore for every other letter, and keeps non-letters visible (apostrophes, hyphens, spaces) so the word's shape is clear, e.g. `Bahá'u'lláh` → `B _ _ _ ' _ ' _ _ _ _`, `Riḍván` → `R _ _ _ _ _`. It also sends `letters` (the count of letters only, e.g. 9). These are the ONLY parts of the word ever sent before the reveal; `word` and `accept` are never sent early.
- **Display:** the host shows the hint large under the clue ("9 letters"). The phone shows the same hint above the input. The kit preview and Try-it show it too.

### Ordering puzzle interaction (owner request, Revision 10)
- **Tapping a numbered item un-assigns it.** The remaining picks close the gap and renumber (e.g. un-tapping #2 of 1-2-3 makes the old #3 become #2). Tapping an unnumbered item assigns the next number.
- **The Undo button is replaced** by a small "Reset" control at the TOP of the list, which clears all numbers. Submit stays at the bottom and is enabled only when every item is numbered.
- **All copy changes to match:** "Tap the items in order. Tap a numbered item to remove it." This applies to the phone how-to, the host how-to card, the kit preview and Try-it.

### Template packs hidden from hosts (owner request, Revision 11)
- Packs whose id starts with `_` (`_template`, `_reverent-test`) are **sample/test packs**. In production (`NODE_ENV=production`) they're excluded from `host:packs`, and `host:create` rejects them. In development and test they stay visible for local work, screenshots and the test suite. An optional env `SHOW_SAMPLE_PACKS=1` forces them visible in production, for demos.
- If no non-sample packs exist in production, the host pack picker shows a friendly empty state: "No question packs yet. Add one under questions/ (see /kit)".
