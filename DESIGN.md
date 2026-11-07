# Design system: Whimsical Chrysanthemum Sepia

Files: `public/theme/theme.css`, `public/theme/flower.js`, `public/theme/fonts/`, live gallery at `/styleguide`
(try `/styleguide?theme=ridvan&reverent=1`).

## Principles
1. **Warm paper, quiet joy.** Parchment ground, sepia ink, soft vignette and paper grain. Whimsical, never loud.
2. **Dignified.** Gentle bobbing and drifting petals only. No flashing, no neon, no strobing. Nothing moves faster than a slow breath.
3. **Never colour alone.** Every answer tile has a colour and a shape glyph; selection, correct and wrong each add a badge and an outline style.
4. **Phone first.** Tap targets are at least 56px (`--touch: 3.5rem`); answer tiles are at least 72px; inputs are at least 16px text (no iOS zoom).
5. **Tokens only.** Components use `var(--token)` only. A community reskins by editing tokens.
6. **Strict CSP.** No inline script/style/handlers. `flower.js` only uses `createElementNS` + `setAttribute`.

## Palette and contrast (WCAG 2.x, computed)
| Pair (text on background) | Ratio | Use |
|---|---|---|
| umber `#4A2E1A` on parchment `#F4E9D8` | 10.31 | body text (AAA) |
| umber on surface `#FBF5EA` | 11.40 | card text |
| ink-soft `#6B4A32` on parchment | 6.60 | muted text |
| parchment-light `#FBF5EA` on sepia `#704214` | 7.81 | `.btn--primary` (parchment `#F4E9D8` on sepia = 7.06) |
| umber on gold `#D9A441` | 5.50 | gold tiles, `is-you` rows |
| parchment-light on plum `#6E4E6B` | 6.6 (5.90 with `#F4E9D8`) | choice 1 |
| parchment-light on leaf `#566B3A` | >=4.91 | choice 2 |
| parchment-light on clay `#8A4A3F` | >=5.59 | choice 3 |
| parchment-light on dusk `#3F5F73` | >=5.65 | choice 6 |
| success `#4F6B2F` on parchment | 5.03 | text / `.locked-in` (5.57 w/ light text) |
| danger `#A23B2E` on parchment | 5.46 | text / toast-error (6.04 w/ light text) |
| `--color-border-strong` `#8C6A47` on surface | 4.53 | input and button borders (UI needs 3:1) |
| umber on rose `#C9776B` | 3.73 | **decoration only**, never text |
| umber on sage `#8A9A6B` | 4.08 | **decoration only**; tile uses darker leaf `#566B3A` |
| sepia `#704214` on sand `#D9BF9A` | 4.79 | ok |

Reverent: `#3B2A1E` on `#E6DACB` = 9.93, ink-soft `#5E4A3A` = 6.06, on-primary `#EFE6D9` on `#5E4A3A` = 6.75,
`#2E2016` on accent `#A58B6B` = 4.88. Themes (`#3F6B3A`, `#8A4A5A`, `#7A5210`, `#5B3F5A`, `#4E5E32` as primary with light text) all measure 5.2 to 8.4.

Rule: any text colour/background pairing you add must be >= 4.5:1 (>= 3:1 for large 24px+ text and UI borders). The one-liner used is the standard relative-luminance formula.

## Token reference (all on `:root`, overridden on `body[data-theme]`)
| Group | Tokens |
|---|---|
| Colour (required) | `--color-bg --color-surface --color-ink --color-ink-soft --color-accent --color-accent-2 --color-success --color-danger` |
| Colour (extra) | `--color-primary --color-on-primary --color-on-accent --color-border --color-border-strong --color-focus` |
| Palette (raw) | `--parchment --parchment-light --sepia --umber --sand --gold --rose --sage --plum` |
| Choices | `--choice-1..6` and `--choice-1-ink..6-ink` (text colour on tile), `--glyph-1..6` (mask-image SVGs: blossom, diamond, circle, triangle, square, star) |
| Blossoms | `--petal-1 --petal-2 --petal-3 --petal-core --petal-stroke --petal-fall` |
| Type | `--font-display --font-body --display-variation --fs-base --fs-small --fs-h1..h3 --fs-big-question --fs-room-code` |
| Space | `--space-1..--space-8` (0.25rem to 4.5rem) |
| Shape | `--radius-sm|md|lg --shadow-soft --touch` |
| Motion | `--dur-fast|med|slow --ease --motion-drift` |
| Atmosphere | `--paper-texture` (inline SVG feTurbulence), `--vignette`, `--flourish-opacity` |

## Components (markup)
```html
<main class="screen stack">                      <!-- full-viewport layer; Flower.decorate(el) adds flourishes -->
<div class="cluster"> ... </div>                 <!-- wrapping row -->
<div class="card">  /  <div class="card card--deckle stack">  /  <div class="card card--filled">   <!-- deckle: TRANSPARENT, sits on the backdrop; filled: visible sheet -->
<button class="btn">  .btn--primary  .btn--ghost  .btn--lg
<label class="label" for="n">Name</label><input class="input" id="n">
<input class="spell-input" autocapitalize="none" autocomplete="off" spellcheck="false">
<div class="room-code">K7M2QX</div>              <!-- big screen; clamp() 52px..160px -->
<div class="qr-frame"><img src="data:image/svg+xml;base64,..." alt="Join QR"></div>  <!-- always white behind QR -->
<span class="player-chip">Name</span>  <span class="player-chip player-chip--disconnected">
<p class="big-question">...</p>
```
**Choice tiles** (glyph is drawn by CSS from `data-i`; leave `.choice__glyph` empty, `aria-hidden`):
```html
<div class="choice-grid">
  <button type="button" class="choice" data-i="0">
    <span class="choice__glyph" aria-hidden="true"></span><span class="choice__text">Answer text</span>
  </button>   <!-- data-i 0..5; add .is-selected | .is-correct | .is-wrong | .is-locked -->
</div>
<div class="tf-grid"> <button class="choice" data-i="0">..True..</button> <button class="choice" data-i="1">..False..</button> </div>
```
**Order list** (put the visible 1-based number in `data-pos`; the badge shows it via CSS; same state classes apply):
```html
<ol class="order-list">
  <li class="order-item" data-pos="1"><span class="order-item__text">Item</span>
    <span class="order-item__controls"><button class="btn btn--ghost" aria-label="Move up">&uarr;</button>...</span></li>
</ol>
```
**Timer:** `<div class="timer"></div>` then `const h = Flower.petalTimer(el, {durationMs, endsAt}); ... h.stop()`.
`endsAt` must be client-clock epoch ms (`serverEndsAt - serverOffset`). It writes `role="timer"` and `aria-label`; the seconds are in the blossom's centre. Petals fall outer ring first, one by one. Size via `--timer-size` or `.timer--small`.
**Scoreboard:** `<ol class="scoreboard"><li class="scoreboard__row [is-you]"><span class="scoreboard__name"></span><span class="scoreboard__score"></span></li></ol>` (rank badge is a CSS counter).
**Podium:** `<div class="podium"><div class="podium__step podium__step--2"><span class="podium__name"></span><span class="podium__score"></span></div> ...--1 ...--3</div>` (visual order 2-1-3 is handled by CSS; the place number comes from CSS).
**Other:** `.toast` (add `role="status"`, remove after ~2.5s; `.toast--error`), `.locked-in`, `<blockquote class="quote">text<span class="quote__source">Source</span></blockquote>`, `.muted`, `.visually-hidden`, `.center`, `.bob`, `.blossom--spin`.

## Flower API (`window.Flower`)
- `blossom({size=120, variant, colors, seed})` returns an `<img class="blossom">` of a PNG hero. `variant` (or `colors[0]`) is a colourway name (`gold rose coral plum sage ivory spring`); `seed` picks one deterministically; otherwise it follows the theme. (`petals`/`layers` are accepted and ignored.)
- `petalTimer(container, {durationMs, endsAt}) -> {stop()}`; `burst(container, {count=24})`; `decorate(rootEl, {drift:true})` (idempotent); extras `petalPath`, `isQuiet()`.
- `burst` does nothing when `prefers-reduced-motion: reduce` or any element has `data-reverent` not equal to `"false"`.

## Motion rules
- Allowed: bob (5s), slow spin (90s), sway (14s), drifting petals (21 to 30s), settle on correct, fade-in for chips/rows.
- Never: flashing, shaking, anything over 3 Hz, full-screen colour flips, sound-dependent cues.
- `prefers-reduced-motion: reduce` turns off all CSS animation/transition and drifting/burst layers; the petal timer still shows time but petals vanish in steps instead of falling.
- `[data-reverent="true"]`: no drift, no burst, slower bob/spin (9s/240s), durations lengthened (`--dur-*` 300/600/1400ms), flourishes at 45% opacity.

## Reverent days: do and don't
Do: use muted umber (the martyrdom/ascension themes apply it automatically), show `.quote` openings and closings, leave pauses, keep text dignified, keep the timer (it is calm).
Don't: bursts or confetti, spelling games unless the host opts in, bright accent colours, jokes in microcopy, `.bob` on text, sound effects.
The three themes `martyrdom-bab`, `ascension-bahaullah`, `ascension-abdulbaha` share the reverent token block, so they look right with or without `data-reverent="true"`.

## Occasion themes
`default` sepia; `naw-ruz` spring green; `ridvan` rose; `birth-bab` and `birth-bahaullah` gold; `declaration-bab` dawn gold into plum; `covenant` sage and plum; `martyrdom-bab`, `ascension-bahaullah`, `ascension-abdulbaha` reverent umber. Apply with `<body data-theme="naw-ruz" data-reverent="false">`.

## How to create a new theme
1. Pick an id (it must also be added to `GameSchema.THEMES` in `public/shared/schema.js` and the pack's `theme` field).
2. Copy a block in section 12 of `theme.css`: `[data-theme="my-theme"] { ... }` (keep it before the reverent block in section 13 so `data-reverent` still wins).
3. Override only: `--color-bg --color-surface --color-accent --color-accent-2 --color-primary --color-border` and the `--petal-*` set. Optionally `--choice-*` if you need different tiles.
4. Keep `--color-ink` / `--color-ink-soft` unless the background changes a lot; recheck: ink on bg >= 4.5, on-primary on primary >= 4.5, ink on accent >= 4.5 (accent carries text on `.is-you` rows and gold tiles).
5. Add the id to the `THEMES` array in `public/styleguide.js`, open `/styleguide?theme=my-theme` and also tick Reverent to check it.
6. To make it reverent by default add its selector to the reverent block list in section 13 (and the `.drift` hide rule).
To reskin the whole product (new community), edit only section 1 (`:root`) tokens, fonts and the `--glyph-*` shapes.

## Fonts
Self-hosted OFL variable WOFF2 in `public/theme/fonts/` (from the `@fontsource-variable` npm packages):
`fraunces-latin[-ext]-full-normal.woff2` (axes SOFT, WONK, opsz, wght), `nunito-latin[-ext]-wght-normal.woff2`, plus `OFL-Fraunces.txt` and `OFL-Nunito.txt`. The `latin` files cover `ʻ ‘ ’ á í ú`; `latin-ext` covers `ḥ` (U+1E25) and other Baha'i transliteration letters. `unicode-range` makes the browser fetch only what it needs. Display text uses `font-variation-settings: "SOFT" 100, "WONK" 1` (token `--display-variation`).
Fallback stacks (`ui-serif, Georgia` and `system-ui`) apply automatically if a file is missing; diacritics still render in them.
To change fonts: drop WOFF2 files in the folder, edit the `@font-face` block (section 0) and `--font-display` / `--font-body`; include the OFL file. Without fonts: delete the `@font-face` rules and the stacks take over.


## Revision 2 and 3 additions

### Art is PNG now
The flowers are painterly PNG illustrations in `public/theme/art/` (README there lists filenames, sizes and how to replace them with hand-painted or AI art). They are rendered by `npm run build-art` (devDependency `@resvg/resvg-js`, optional ImageMagick quantiser) and committed, so production needs no build. `flower.js` keeps the same API and now uses images: `blossom()` returns an `<img class="blossom" srcset>`, `petalTimer()` builds an SVG ring of 16 petal-sprite `<image>`s around a hero blossom (they fall and fade one by one, driven by `endsAt`), `burst()` throws petal sprites, `decorate()` adds corner sprays and drifting petals on a dedicated `.decor-layer` (clipped, `pointer-events: none`; fixed to the viewport when the root is `<body>`). `decorate()` never sets `overflow: hidden` on the root, so pages always scroll. Artwork follows `body[data-theme]` live; reverent mode desaturates it by CSS filter and hides drift and bursts.
Token additions: `--paper-texture` (PNG tile) and `--wash` (per-theme background wash PNG).

### Seamless panels: do and don't
`.card--deckle` is **transparent** (no fill, border, shadow or clip-path): it only groups content directly on the page backdrop (login/PIN, join, name picker). Use `.card--filled` (or plain `.card`) when you need a visible sheet (pack cards, QR frame, how-to card).
- Do: put forms and headings straight onto the paper and wash.
- Don't: put a filled panel of a different colour on the backdrop for a login or join form; don't rely on a box to create contrast.
Contrast was measured against the darkest pixel of every theme's wash plus the paper tile (all ten themes, including the three reverent ones): ink text >= 7.08:1 and ink-soft text >= 4.53:1 (worst case `declaration-bab`), so body text and labels pass AA directly on the backdrop. Keep washes light: if you make a stronger wash, re-run the check.

### Host stage (screen sharing)
`/host` renders a 16:9 stage (`.stage`, a CSS container; sizes in `cqw/cqh`, letterboxed on other ratios). Persistent top band (pack title, occasion, question x of y), bottom band (`Join at <host> · code ABC123`, host controls), 3% safe margin on all edges, minimum text about 1.25% of stage width (16px at 1280x720), no thin weights. Lobby: hero room code + white QR frame, a compact "How to play" card (gentle mode changes the scoring line), player chips with badge. Question: type label, question, petal timer, 2x2 / 3x2 colour+glyph tiles, live top-5 sidebar (24% width, FLIP rank moves and score count-up via the Web Animations API; instant under reduced motion; slower and fade-only on reverent packs). Reveal: correct tile outlined with a check, banner with the answer and explanation, tasteful petal burst (never on reverent). Over: podium with hero blossoms. Controls: Extend +15s (max 3), Skip, Next, End.
Name picker classes (phones): `.name-card`, `.name-card__name`, `.name-card__badge`, `.shuffle-btn`, `.segmented` > `.segmented__opt` (alias `.segmented__btn`) with `aria-pressed`, `.badge-grid` > `.badge[aria-pressed]`, `.badge--number`; all targets >= 56px.

### Postcard language (Revision 3b)
Look: late-1800s chromolithograph postcard with Art Nouveau accents. Aged cream card stock (`--card-stock`, halftone grain, aged edge, embossed highlight), gilt ink (`--gilt`, `--gilt-soft`: decoration only, never text), gilt double rule, whiplash corner ornaments (`--orn-tl/tr/bl/br`), an Art Nouveau divider (`.ornament-rule`), a postage-stamp frame (`.stamp`, used for the host room code) and a faint postmark (`.postmark`). The QR frame stays white. Reverent mode swaps to a muted gilt and darker stock.
Devices are the card, chosen by orientation: phones/tablets in portrait get a portrait card (`body.page-play`, `/kit` under 820px: fixed card stock + frame pseudo-elements, `#app` scrolls inside the card, `.player-bar` is the card's bottom band), landscape gets the same card with tighter margins; the host `.stage` is a landscape card with a divided back (message left, `.lb` top-5 as the ruled address side, stamp at top right). Flowers are lush, dense chromolithograph chrysanthemums (`scripts/build-art.js`: staggered rings of cupped petals, tonal gradient, pale tip rim, thin contour, dome shading), with serrated veined leaves and buds in the sprays. Everything is original artwork generated by code.
