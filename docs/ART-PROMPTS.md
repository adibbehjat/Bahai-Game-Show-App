# Art prompt sheet

What to generate for the botanical artwork, and how. Filenames, sizes and slots come from `public/theme/art/README.md` (the source of truth). Art direction comes from `docs/DESIGN-BRIEF.md`, where the Eggshell Edition addendum wins on palette.

## 1. How to use this sheet

- **Tools.** ChatGPT (image generation), Midjourney, Gemini, Firefly or Ideogram all work. Pick one tool and stay with it for the whole set. ChatGPT and Gemini follow layout instructions (grids, spacing, "one corner") best. Midjourney gives the richest painterly look but needs retries for layout.
- **Size.** Generate at 2x the target size or larger. Square for blossoms, sprays, petals and buds. Wide for branches and rules. We downscale, never upscale.
- **Background.** Ask for a transparent background. Most tools can't do real transparency, so use the "flat white" line in each prompt: **plain flat pure-white (#FFFFFF) background, no shadow, no gradient**. We remove it afterwards. Avoid cream, grey or textured backgrounds. They are hard to cut out cleanly.
- **One consistent style.** Generate the first hero blossom (gold), pick the result you love, then use it as the reference image or style reference (Midjourney `--sref`, ChatGPT/Gemini "match the style of the attached image") for every later prompt. Keep the same tool, model and settings throughout. The set must look like one artist.
- **Variants.** Where a prompt asks for several items on one sheet, ask for a loose grid with generous empty space between items so we can crop them. If the tool crowds them, ask for fewer per image and generate twice.
- **Upload.** `scp *.png user@server:/var/www/game_show/art-inbox/`. The folder is gitignored. We resize, optimise and rename. Name files with the exact target filename where possible (e.g. `blossom-gold.png`), otherwise anything descriptive (`petals-rose-sheet.png`).
- **Rights.** Generate original images only. Do not prompt "in the style of" any named living artist, and do not upload or copy existing artwork as a reference. Style references should be your own earlier generations.

## 2. Master style block and negative prompt

Paste this at the start of every prompt. Prompts below call it **[STYLE]**.

```
Edwardian botanical greeting-postcard illustration, circa 1900-1920, hand-painted watercolour and chromolithograph look. Fine walnut-brown ink outlines, softly layered translucent pigments, natural petal irregularity, slight printing imperfection. Muted champagne, golden yellow, dusty rose and terracotta blooms with olive and sage-green foliage. Delicate, elegant, dignified. Not photorealistic, not cartoon, not glossy or 3D. No text, no borders, no frames, no cast shadows, no vignette, no sepia ageing, no yellowed or distressed paper.
```

**Background line** (add to the end of every prompt, pick one):
- Tools with transparency: `Transparent background.`
- Other tools: `Plain flat pure-white background (#FFFFFF), no shadow, no gradient, no texture, subject fully isolated.`

**Negative prompt** (Midjourney `--no`, Stable Diffusion style fields, etc.):

```
photograph, photorealistic, 3D render, cartoon, anime, vector clip-art, neon, glossy, gradient background, drop shadow, vignette, border, frame, text, letters, watermark, signature, sepia, aged paper, stains, distressed, cropped subject, blurry
```

## 3. Assets

Colourways: `gold` golden yellow, `rose` dusty rose, `coral` soft peach-rose or terracotta, `plum` muted mauve, `sage` pale sage-green, `ivory` champagne, `spring` fresh sage-green (Naw-Ruz). Foliage is always sage or olive.

Buds, leaves and ornaments are marked *planned* in the README (no screen uses them yet), so they are safe to supply but lower priority. Wash images (`wash-<theme>.png`) are not on this list. They are barely-there tints we generate in code.

### Summary table

| # | Asset | Target file(s) | Generate at | Final px (@2x / @1x) | Transp. | Colourway |
|---|---|---|---|---|---|---|
| A1-A7 | Hero chrysanthemum | `blossom-<cw>.png` (+`@1x`) | 1536x1536+ | 768 / 384 square | yes | gold, rose, coral, plum, sage, ivory, spring |
| B1 | Corner spray warm | `spray-warm.png` (+`@1x`) | 1600x1600+ | 800 / 400 square | yes | gold, rose, coral blooms |
| B2 | Corner spray plum | `spray-plum.png` (+`@1x`) | 1600x1600+ | 800 / 400 square | yes | mauve, rose and champagne blooms |
| B3 | Corner spray green | `spray-green.png` (+`@1x`) | 1600x1600+ | 800 / 400 square | yes | sage, champagne and gold blooms |
| C1-C3 | Edge branch | `branch-warm/plum/green.png` | 1280x600+ | 640x300 | yes | as sprays |
| D1-D7 | Petal sheet | `petal-<cw>.png` (+`@2x`) | 1536x1536 sheet | 128 / 256 square each | yes | all 7 |
| E1-E4 | Bud sheet | `bud-gold/rose/coral/plum.png` | 1536x1536 sheet | 256 square each | yes | gold, rose, coral, plum |
| F1 | Leaf sheet | `leaf-a/b/c.png` | 1536x1024 sheet | 256 square each | yes | sage |
| G1-G3 | Ornaments | `ornament-rule/flourish/corner.png` | 2x or larger | 640x40 / 240x80 / 128x128 | yes | antique gold |
| H1 | Paper tile | `paper.png` | 1024x1024 | 256 square | semi | eggshell |

31 assets, 29 prompts (the ornament prompts are optional, see G).

### A. Hero chrysanthemum blooms (7 prompts)

Used as the lobby logo, the timer centre, podium hero and band logo. Rendered small and large, so the silhouette must read clearly. **Composition for all seven:** one single bloom, centred, top-down or slight 3/4 view (the contract says top view), filling about 88% of a square canvas, completely isolated with clear margin on every side (no petal touching the edge), no stem, no leaves (or at most two tiny sepals underneath). Incurved "mophead" chrysanthemum: many cupped, overlapping, inward-curving petals in tight concentric layers, outer petals relaxing outward, with natural irregularity.

Shared template (substitute the COLOUR line):

> [STYLE] A single incurved mophead chrysanthemum bloom, seen from above, perfectly centred, filling about 88% of a square canvas with clear margin all round. Many cupped, overlapping petals in tight concentric layers curving inward toward a dense centre, outer petals loosening slightly, each petal with a fine walnut-brown ink outline and soft layered pigment. No stem, no leaves, nothing else in the image. COLOUR: ... [Background line]

| ID | File | COLOUR line |
|---|---|---|
| A1 | `blossom-gold.png` | Golden yellow petals, warm buttery centre, deeper amber at the heart, paler gold at the tips. **Generate this first and use it as the style reference for everything else.** |
| A2 | `blossom-rose.png` | Dusty rose petals, deeper rose toward the centre, pale blush tips. |
| A3 | `blossom-coral.png` | Soft peach-rose to muted terracotta petals, warm and gentle, not orange. |
| A4 | `blossom-plum.png` | Muted mauve petals, dusty plum at the heart, pale lilac-grey tips. Quiet, dignified. |
| A5 | `blossom-sage.png` | Pale sage-green petals with a slightly lighter, creamier tip, muted and cool. |
| A6 | `blossom-ivory.png` | Champagne-ivory petals with a faint warm gold heart. Needs a fine ink outline so it reads against an eggshell page. |
| A7 | `blossom-spring.png` | Fresh yet muted sage-green petals with a hint of pale yellow-green, light and new-leaf. |

Size: output 1536x1536 or larger. We make 768 and 384.

### B. Corner sprays (3 prompts)

Art origin is the **top-left corner**. The app mirrors the file to the other three corners, so it must look right flipped horizontally and vertically: no text, no one-way light source, no obvious "left-handed" details. Composition: an asymmetric cluster of two or three blooms of different sizes, a few buds, serrated leaves and curving stems, all growing out of the top-left corner of the canvas. The stems should be cut off by the top and left edges of the canvas (as if continuing off-screen). The mass of flowers hugs the corner and the cluster thins out and ends before the right and bottom edges. The bottom-right half of the canvas must stay empty (that is the screen's interior). Nothing may be cut by the right or bottom edge. Occupy about 60-70% of the diagonal. Not symmetric, not a wreath, not a border.

Shared template:

> [STYLE] An asymmetric botanical spray growing out of the TOP-LEFT corner of a square canvas: BLOOMS. Stems enter from the top and left edges (cut by those edges), curving gracefully inward. Blooms, buds and serrated sage leaves are clustered near the corner and thin out toward the centre. The lower-right half of the canvas is completely empty. Nothing touches the right or bottom edge. Natural, airy, generous negative space. [Background line]

| ID | File | BLOOMS |
|---|---|---|
| B1 | `spray-warm.png` | two large golden-yellow chrysanthemums, one dusty-rose chrysanthemum, three buds (gold, rose, peach), olive and sage leaves |
| B2 | `spray-plum.png` | two large muted-mauve chrysanthemums, one dusty-rose chrysanthemum, one champagne chrysanthemum, two buds (mauve, champagne), sage and grey-green leaves, a subdued palette |
| B3 | `spray-green.png` | two large sage-green chrysanthemums, one pale champagne chrysanthemum, one small golden-yellow chrysanthemum, buds in green and cream, plenty of sage leaves; a fresh, spring-like look |

Size: 1600x1600 or larger. We make 800 and 400. If the tool cuts the stems short inside the canvas, ask it to "extend the stems past the top and left edges".

### C. Edge branches (3 prompts)

Smaller companions placed on the left and right edges (the app mirrors the left-edge art to the right). Landscape 640x300 (generate 2:1 wide). The branch emerges from the **LEFT edge** of the canvas, mid-height, extending rightwards, ending before the right edge. Two small blooms, a bud, and four to five leaves on a gently curving stem. Slim and airy.

> [STYLE] A slim, gently curving flowering branch emerging from the LEFT edge of a wide 2:1 landscape canvas, extending right and ending well before the right edge: BLOOMS. A few serrated sage leaves along the stem, plenty of empty space above, below and to the right. Must look right when mirrored. [Background line]

| ID | File | BLOOMS |
|---|---|---|
| C1 | `branch-warm.png` | two small chrysanthemums (golden yellow and dusty rose), one rose bud |
| C2 | `branch-plum.png` | two small chrysanthemums (muted mauve and champagne), one mauve bud |
| C3 | `branch-green.png` | two small chrysanthemums (sage-green and champagne), one green bud |

### D. Petal sprites (7 prompts, one sheet per colourway)

One petal, rotated around the countdown ring, in bursts and drifting. Each petal sprite: **a single chrysanthemum petal, base at bottom centre (about x=64, y=122 of 128), pointing straight up**, slightly cupped, a gentle curve, a fine ink outline and a soft gradient from a deeper base to a paler tip. Final 128x128 (and 256 for @2x), petal fills about 85% of the height. Generate a sheet of 6 slightly different petals in a 3x2 grid with generous spacing, all upright, then we crop the best one.

> [STYLE] A sheet of six single chrysanthemum petals, each fully separate, arranged in a loose 3x2 grid with generous empty space between them. Every petal stands upright, base at the bottom, tip pointing straight up, slightly cupped with a gentle curve, small natural differences in shape and size. Fine walnut-brown ink outline, soft pigment deepening toward the base. COLOUR. [Background line]

| ID | File | COLOUR |
|---|---|---|
| D1 | `petal-gold.png` | golden yellow |
| D2 | `petal-rose.png` | dusty rose |
| D3 | `petal-coral.png` | soft peach-rose |
| D4 | `petal-plum.png` | muted mauve |
| D5 | `petal-sage.png` | pale sage-green |
| D6 | `petal-ivory.png` | champagne ivory (keep a clear outline) |
| D7 | `petal-spring.png` | fresh muted sage-green |

### E. Buds (4 prompts)

Single closed chrysanthemum bud with serrated sepals, upright, with a short stem stub at the bottom. Four variants per sheet (2x2).

> [STYLE] A sheet of four different single closed chrysanthemum buds, each fully separate in a loose 2x2 grid with generous space between. Each bud upright, a plump rounded bud with a hint of petal colour showing, cupped by serrated green sepals, with a short stem stub. COLOUR buds. [Background line]

| ID | File | COLOUR |
|---|---|---|
| E1 | `bud-gold.png` | golden yellow |
| E2 | `bud-rose.png` | dusty rose |
| E3 | `bud-coral.png` | soft peach-rose |
| E4 | `bud-plum.png` | muted mauve |

### F. Leaves (1 prompt)

Three files from one sheet: `leaf-a.png`, `leaf-b.png`, `leaf-c.png`. Single serrated, veined sage leaf, base (with a short stalk) at bottom centre, pointing up. Make a, b and c clearly different (a: broad, b: medium, c: narrow).

> [STYLE] A sheet of six single chrysanthemum leaves, fully separate in a loose 3x2 grid with generous space between. Each leaf upright with a short stalk at the bottom centre, serrated deeply-lobed edges, fine veining, sage and olive green with a lighter underside showing on some. Include two broad, two medium and two narrow shapes. [Background line]

### G. Ornaments (3 prompts, optional)

**Recommendation: skip these.** The app already draws equivalent rules and flourishes as inline SVG, which stay crisp at any size. AI-generated gold line-art is hard to keep thin, symmetrical and crisp at 40 px tall. Generate them only if you want an engraved look, and then use the high-resolution output as a reference only. We would trace or recreate them.

If you do generate them (antique gold, thin, delicate; keep the gold close to `#B4832A`, not bright yellow):

| ID | File | Final px | Prompt |
|---|---|---|---|
| G1 | `ornament-rule.png` | 640x40 | [STYLE] A thin horizontal decorative divider, symmetrical about a small central diamond, antique-gold engraved line ornament with tiny leaf curls tapering to fine points at both ends, extremely wide and short (16:1). Only gold line-work, no flowers. [Background line] |
| G2 | `ornament-flourish.png` | 240x80 | [STYLE] A small symmetrical calligraphic flourish, antique-gold engraved line ornament, a pair of mirrored scrolls meeting at a central point, thin and delicate, 3:1. [Background line] |
| G3 | `ornament-corner.png` | 128x128 | [STYLE] A small decorative corner ornament for the TOP-LEFT corner, antique-gold engraved fine line-work with a curl and leaf motif, square canvas, the corner anchored at the top-left. Must work when mirrored. [Background line] |

### H. Paper texture (1 prompt)

`paper.png`, 256x256, a seamless tile. Semi-transparent in the app, so very faint. AI tools rarely tile perfectly, so we will check the edges and fix them. Generate at 1024x1024.

> A seamless tileable texture of fine eggshell-white stationery paper, soft off-white (#F8F4EA), a very faint irregular fibre grain, extremely low contrast, perfectly even lighting, no stains, no creases, no fold lines, no yellowing, no vignette, no border, no objects, no text. Top-down flat view. Pattern must repeat without visible seams.

(The master style block is not needed here. Ask for "tileable" or "seamless" if the tool has the option, e.g. Midjourney `--tile`.)

## 4. Colourway and theme mapping

From `THEME_ART` in `public/theme/flower.js`.

| Theme | Hero | Spray / branch | Mood |
|---|---|---|---|
| `default` | gold | warm | festive |
| `naw-ruz` | spring | green | fresh |
| `ridvan` | rose | warm | festive |
| `birth-bab` | coral | warm | festive |
| `birth-bahaullah` | gold | warm | festive |
| `declaration-bab` | plum | plum | dawn gold into plum |
| `covenant` | sage | green | calm |
| `martyrdom-bab`, `ascension-bahaullah`, `ascension-abdulbaha` | ivory | plum | solemn: the app desaturates the florals further with a CSS filter, so ivory and plum art should already be muted |

**Strategy.** First generate the base colourways (gold, rose, ivory and the warm, plum and green sprays). Review them as a set. Then make the remaining colourways (coral, plum, sage, spring) as exact variants of the approved gold bloom: same prompt, same reference image, same composition, only the colour line changed (in ChatGPT/Gemini: "same image, recolour the petals to ..."). Do the same for buds and petals. Always reuse the approved bloom as the reference so the form stays identical.

## 5. Priority order

Upload in batches. Each batch is usable on its own.

1. **Minimum viable set** (the app already looks transformed): A1 `blossom-gold`, A6 `blossom-ivory` (or A2 rose), B1 `spray-warm`, D1 `petal-gold` (+ D6 `petal-ivory`), F1 leaves.
2. **Batch 2, default and festive themes:** A2 rose, A3 coral, B3 `spray-green`, A7 spring, D2, D3, D7, C1 `branch-warm`, E1 `bud-gold`, E2 `bud-rose`, H1 `paper`.
3. **Batch 3, remaining themes:** A4 plum, A5 sage, B2 `spray-plum`, D4, D5, C2, C3, E3, E4.
4. **Optional last:** G1-G3 ornaments (probably skipped, see G).

## 6. What happens after upload

An agent will remove white backgrounds where needed, crop sprites out of the sheets, resize to the contract sizes (@1x and @2x), optimise to the size budget (at most 400 KB per file, at most 4 MB in total), wire the files in, and screenshot every screen and theme for your approval. Anything that doesn't fit the style will be listed for re-generation.
