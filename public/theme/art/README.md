# Art set

All PNGs are committed. Production never needs resvg or ImageMagick. They are rendered by
`npm run build-art` (`scripts/build-art.js`, dev only: `@resvg/resvg-js` renders layered SVG
illustrations with gradients, inner shading, wobbly turbulence-displaced edges and a watercolour
bloom; ImageMagick `convert` palette-quantises the big files). Everything is seeded, so rebuilds are
identical. Total folder size is about 3.1 MB; the largest file is the paper tile (about 200 KB).

Colourways: `gold rose coral plum sage ivory spring` (spring = Naw-Ruz green).

| File | Size (px) | Use |
|---|---|---|
| `blossom-<colourway>.png` | 768x768, transparent | hero blossom @2x (lobby, timer centre, podium, band logo) |
| `blossom-<colourway>@1x.png` | 384x384, transparent | same, @1x (used through `srcset`) |
| `spray-warm.png`, `spray-plum.png`, `spray-green.png` | 800x800, transparent | corner flourish, art origin = top-left corner (CSS mirrors it to the other three corners) |
| `spray-<name>@1x.png` | 400x400 | @1x |
| `petal-<colourway>.png` | 128x128, transparent | single petal sprite for the timer ring, bursts and drifting petals; the petal base sits at bottom centre (x=64, y=122), pointing up |
| `petal-<colourway>@2x.png` | 256x256 | @2x |
| `paper.png` | 256x256, semi-transparent | seamless paper grain tile (`--paper-texture`) |
| `wash-<theme>.png` | 480x270 | soft background wash, stretched to cover (`--wash`), one per theme id: `default naw-ruz ridvan declaration-bab ascension-bahaullah martyrdom-bab birth-bab birth-bahaullah covenant ascension-abdulbaha` |

Which art which theme uses is the `THEME_ART` table at the top of `public/theme/flower.js`
(hero colourway and spray) and the `--wash` token per theme in `theme.css`:
default gold/warm, naw-ruz spring/green, ridvan rose/warm, birth-bab coral/warm, birth-bahaullah gold/warm,
declaration-bab plum/plum, covenant sage/green, martyrdom and both ascensions ivory/plum (also desaturated in reverent mode).

## Replacing a file with hand-painted or AI-generated art
1. Keep the **same filename, pixel size and transparent background** (PNG-32 or PNG-8 with alpha).
2. Hero blossoms: centred, about 88% of the canvas, no hard canvas-edge crop. Sprays: flowers growing out of the
   top-left corner, nothing cut by the right or bottom edge. Petals: one petal, base at bottom centre, pointing up,
   so the timer can rotate it around a ring.
3. Keep each file under 400 KB (quantise with `convert in.png -colors 256 PNG8:out.png`) and the folder under 4 MB.
4. Drop the file in, hard-refresh. No code change is needed. To add a colourway, add `blossom-<name>[@1x].png` and
   `petal-<name>[@2x].png`, then add the name to `COLORWAYS` in `flower.js` and map it in `THEME_ART`.
5. If you re-run `npm run build-art` it overwrites the generated files, so copy your replacements elsewhere first or remove the matching asset from `scripts/build-art.js`.
