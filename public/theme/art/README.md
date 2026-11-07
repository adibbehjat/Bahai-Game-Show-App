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
| `blossom-gold`, `blossom-ivory`, `blossom-rose` (+ `@1x`) | **owner art** (batch 1; feathery style) |
| `blossom-coral`, `blossom-spring` (+ `@1x`) | **owner art** (batch 2; denser incurved style, more saturated; spring reads olive-yellow-green) |
| `spray-warm` (+ `@1x`) | **owner art** (batch 1), trimmed and anchored top-left so stems bleed off the corner; 224 colours |
| `spray-green` (+ `@1x`) | **owner art** (batch 2); already flush with the top-left edges (trim offset 0,0), only palette-reduced to 224 colours |
| `branch-warm` | **owner art** (batch 2), trimmed (413x143), scaled to the full 640 width and anchored on the left edge so the stem bleeds off; mirrored use checked |
| `bud-gold` | **owner art** (batch 2) |
| `bud-rose` | **owner art** (batch 2), recoloured: `-modulate 100,60,100 -fill '#D69C94' -colorize 28%` (was magenta-pink; now dusty rose to match `blossom-rose`) |
| `petal-gold`, `petal-ivory`, `petal-rose`, `petal-coral`, `petal-spring` (+ `@2x`) | **owner art** (batches 1 and 2) |
| `leaf-a`, `leaf-b`, `leaf-c` | **owner art** (batch 1); not yet placed on a screen (shown in `/styleguide`) |
| `paper.png` | **owner art, converted** (batch 2): the supplied RGB tile is opaque and near-flat, so its luminance is converted to a walnut `#6B4A32` alpha overlay (alpha at most about 4%). It layers over the eggshell background colour (token unchanged), is a soft cloudy fibre, and tiles without visible seams in a 3x3 test. It beat the procedural per-pixel grain (more visible, no repeat pattern). Original: `art-inbox/batch2/paper.png` |
| `blossom-plum`, `blossom-sage`, `petal-plum`, `petal-sage`, `bud-coral`, `bud-plum`, `spray-plum`, `branch-plum`, `branch-green`, `ornament-*`, `wash-*` | placeholder (procedural, `npm run build-art`) |
Where the art is used: `bud-*` is a single edge accent (top-right) on pages outside the host stage and phone; `branch-*` is the opposite-edge branch (welcome, lobby, podium); `leaf-*` are reserved.
Safeguard: owner-supplied files are listed in `OWNER-ART.json` (same folder). `npm run build-art` loads it, prints `skipped (owner art): <file>` and never writes those files, even with `--only=<name,...>`; only `--force-owner` overrides it. Add a filename to the manifest whenever owner art replaces a placeholder. `--only=blossom-coral,bud-gold` regenerates just those placeholders. (Backup of the original placeholders: `/tmp/art-placeholders-backup/`.)

Limits: each file under 400 KB, whole folder under 4 MB (quantise with `convert in.png -colors 224 PNG8:out.png`; keep the alpha channel).

## Replacing a file
1. Same filename, same pixel size, transparent background (PNG-32, or PNG-8 with alpha). Orientation rules in the table are part of the contract (petals up, sprays from top-left, branches from the left edge).
2. Hero blooms must stay legible at 100 px (the host band and the timer use them small) and at 768 px (podium).
3. Hard-refresh the browser. No code change is needed.
4. To add a colourway: supply `blossom-<name>.png`, `blossom-<name>@1x.png`, `petal-<name>.png`, `petal-<name>@2x.png`, add the name to `COLORWAYS` in `flower.js`, and map it in `THEME_ART`.
5. To start using a *planned* asset (buds, leaves, PNG ornaments), reference it from `flower.js` or the `--orn-*` tokens in `theme.css`.
6. `npm run build-art` regenerates the placeholders and overwrites same-named files, so keep your own art out of its reach (delete the matching entry in `scripts/build-art.js` or do not run it).
