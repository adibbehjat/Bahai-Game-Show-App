# Art set: filename contract

This is the stable interface between the artwork and the code. **Keep filenames, pixel sizes and transparency exactly as listed** and the app picks new art up with no code change. The PNGs currently in this folder are **procedural placeholders** (rendered by `npm run build-art`, `scripts/build-art.js`, dev only) and are meant to be replaced by hand-painted or generated art. Production never needs resvg or ImageMagick.

## Art direction (summary of `docs/DESIGN-BRIEF.md` plus the Eggshell addendum)
- Early-1900s illustrated greeting postcard, hand-painted chromolithograph feel: **fine ink outlines, softly layered pigment, natural petal irregularity, slight lithographic imperfection**. No glossy digital gradients, no photorealism, no clip-art repeats, no heavy distressing.
- Signature subject: **chrysanthemums**, dense and full-bodied (many cupped, overlapping petals curling toward a hidden centre), seen from above for the hero blooms.
- Palette: muted champagne, golden yellow, dusty rose (plus peach-rose and mauve), **sage-green foliage** (olive stems). Keep saturation restrained; the page behind is eggshell white `#F9F6EE`, so art must read on a very light ground.
- Composition is asymmetric along the screen edge. Backgrounds are always transparent PNG (no paper, no vignette, no text baked in) except `wash-*` and `paper.png`.

## Colourways
`gold` golden yellow, `rose` dusty rose, `coral` soft peach-rose, `plum` muted mauve, `sage` sage green, `ivory` champagne, `spring` fresh sage-green (Naw-Ruz). Theme mapping lives in `THEME_ART` at the top of `public/theme/flower.js` (hero colourway plus which spray/branch set).

## File table
"Used by" says what loads the file today. Rows marked *planned* are asset types the design calls for but no screen references yet (safe to supply now).

| Filename | Purpose | Pixels | Transparent | Colourway | Used by |
|---|---|---|---|---|---|
| `blossom-<cw>.png` (7: gold, rose, coral, plum, sage, ivory, spring) | Hero chrysanthemum, top view, centred, about 88% of canvas, no hard crop. Lobby, timer centre, podium, accent blossom | 768x768 (@2x) | yes | one per colourway | `flower.js` `blossom()` (`srcset` 2x), `petalTimer()` |
| `blossom-<cw>@1x.png` (7) | Same art, @1x | 384x384 | yes | same | `srcset` 1x |
| `spray-warm.png`, `spray-plum.png`, `spray-green.png` | **Large corner cluster**: blooms, buds, leaves growing out of the TOP-LEFT corner of the canvas (stems leave through the left and top edges); nothing cut on the right/bottom. CSS mirrors it for other corners | 800x800 | yes | warm = golden yellow, dusty rose, peach; plum = mauve, rose, champagne; green = sage-green, champagne, gold | `flower.js` `decorate()` (kind `spray`) |
| `spray-<set>@1x.png` (3) | Same, @1x | 400x400 | yes | same | `srcset` 1x |
| `branch-warm.png`, `branch-plum.png`, `branch-green.png` | **Smaller edge branch**: a slender stem entering from the LEFT edge with two small blooms, 4 to 5 leaves and a bud; CSS mirrors it for the right edge | 640x300 | yes | same three sets | `decorate()` (kind `branch`, used on welcome, lobby, podium, phone) |
| `petal-<cw>.png` (7) | Single detached petal sprite, cupped, pointing UP, base at bottom centre (about x=64, y=122 of 128). Timer ring, burst, drifting petals | 128x128 | yes | one per colourway | `petalTimer()`, `burst()`, `decorate()` drift |
| `petal-<cw>@2x.png` (7) | Same, @2x | 256x256 | yes | same | `srcset` 2x |
| `bud-gold.png`, `bud-rose.png`, `bud-coral.png`, `bud-plum.png` | Single round closed bud with serrated sepals, centred | 256x256 | yes | gold, rose, coral, plum | *planned* (styleguide only) |
| `leaf-a.png`, `leaf-b.png`, `leaf-c.png` | Single serrated, veined sage leaf, three different shapes (broad, medium, narrow), pointing UP, base at bottom centre | 256x256 | yes | sage foliage | *planned* (styleguide only) |
| `ornament-rule.png` | Delicate antique-gold divider: hairline with a small centre lozenge/flourish, symmetrical | 640x40 | yes | antique gold `#B4832A` | *planned* (CSS currently draws the same shape with an inline SVG token `--orn-divider`) |
| `ornament-flourish.png` | Small symmetrical gilt scroll flourish for under titles | 240x80 | yes | antique gold | *planned* |
| `ornament-corner.png` | Gilt Art Nouveau corner ornament for the TOP-LEFT corner (CSS flips it) | 128x128 | yes | antique gold | *planned* (CSS uses inline SVG tokens `--orn-tl`, `--orn-br`) |
| `paper.png` | Seamless, very faint paper grain tile; barely visible on eggshell | 256x256 | semi-transparent (alpha at most about 10%) | warm brown specks | `--paper-texture` in `theme.css` |
| `wash-default.png`, `wash-naw-ruz.png`, `wash-ridvan.png`, `wash-declaration-bab.png`, `wash-birth-bab.png`, `wash-birth-bahaullah.png`, `wash-covenant.png`, `wash-martyrdom-bab.png`, `wash-ascension-bahaullah.png`, `wash-ascension-abdulbaha.png` | Barely-there soft colour bloom in the corners, stretched to cover the page (alpha at most about 12%; text contrast is verified against it). One per theme id | 480x270 | semi-transparent | theme accent tints (default gold/rose, naw-ruz sage, ridvan rose, births champagne/gold, covenant sage/mauve, solemn greys) | `--wash` in `theme.css` |

## Status: owner art vs placeholder
| Asset | Status |
|---|---|
| `blossom-gold`, `blossom-ivory`, `blossom-rose` (+ `@1x`) | **owner art** (batch 1) |
| `spray-warm` (+ `@1x`) | **owner art** (batch 1), trimmed and anchored to the top-left of the canvas so the stems bleed off the corner (mirrors correctly for other corners); palette-reduced to 224 colours |
| `petal-gold`, `petal-ivory` (+ `@2x`) | **owner art** (batch 1) |
| `leaf-a`, `leaf-b`, `leaf-c` | **owner art** (batch 1); not yet placed in any screen (reserved for sprigs along edges), shown in `/styleguide` |
| `paper.png` | **processed**: the supplied tile was a perfectly flat 8%-alpha fill with no grain, so it is replaced by a seamless per-pixel grain (walnut `#6B4A32`, alpha 0 to 3.5%) that layers over the eggshell background colour. Original kept in `art-inbox/batch1/` |
| `blossom-coral/plum/sage/spring`, `petal-coral/plum/sage/rose/spring`, `spray-plum`, `spray-green`, `branch-*`, `bud-*`, `ornament-*`, `wash-*` | placeholder (procedural, `npm run build-art`) |
Note: running `npm run build-art` overwrites same-named files; do not run it without first protecting the owner art (backup of the original placeholders: `/tmp/art-placeholders-backup/`).

Limits: each file under 400 KB, whole folder under 4 MB (quantise with `convert in.png -colors 224 PNG8:out.png`; keep the alpha channel).

## Replacing a file
1. Same filename, same pixel size, transparent background (PNG-32, or PNG-8 with alpha). Orientation rules in the table are part of the contract (petals up, sprays from top-left, branches from the left edge).
2. Hero blooms must stay legible at 100 px (the host band and the timer use them small) and at 768 px (podium).
3. Hard-refresh the browser. No code change is needed.
4. To add a colourway: supply `blossom-<name>.png`, `blossom-<name>@1x.png`, `petal-<name>.png`, `petal-<name>@2x.png`, add the name to `COLORWAYS` in `flower.js`, and map it in `THEME_ART`.
5. To start using a *planned* asset (buds, leaves, PNG ornaments), reference it from `flower.js` or the `--orn-*` tokens in `theme.css`.
6. `npm run build-art` regenerates the placeholders and overwrites same-named files, so keep your own art out of its reach (delete the matching entry in `scripts/build-art.js` or do not run it).
