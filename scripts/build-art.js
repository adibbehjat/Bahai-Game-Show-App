'use strict';
/*
 * build-art.js - renders the layered, painterly chrysanthemum illustrations to PNG.
 *   npm run build-art       (dev only: needs the @resvg/resvg-js devDependency)
 * The PNGs in public/theme/art/ are committed; production never runs this.
 * Everything is deterministic (seeded). Edit COLORWAYS / FORMS / SPRAYS / WASHES to restyle.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..', 'public', 'theme', 'art');
fs.mkdirSync(OUT, { recursive: true });

// ---------- colour helpers ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

// Faded, offset-printed (chromolithograph) palette. rim = the pale lip along a petal's tip.
const COLORWAYS = {   // champagne, golden yellow, dusty rose; muted, with sage foliage
  gold:   { light: '#F5E3A8', mid: '#E0B450', deep: '#A87A22', edge: '#5E4219', rim: '#F8EBC0', fleck: '#FFF2B8' },
  rose:   { light: '#F0D2CF', mid: '#D69A9E', deep: '#9A5868', edge: '#5E3340', rim: '#F5DEDA', fleck: '#FFE9B0' },
  coral:  { light: '#F2D6C4', mid: '#DDA088', deep: '#A8604A', edge: '#66392C', rim: '#F7E2D4', fleck: '#FFE3A0' },
  plum:   { light: '#DCC8D8', mid: '#B592AE', deep: '#7A5576', edge: '#46304A', rim: '#EAD8E6', fleck: '#F4D68A' },
  sage:   { light: '#D8E2C4', mid: '#A9BC90', deep: '#6A8456', edge: '#3E5434', rim: '#E6EED6', fleck: '#FFF0B0' },
  ivory:  { light: '#FBF3DE', mid: '#EBDCB6', deep: '#BDA06A', edge: '#7E6638', rim: '#FFFBEC', fleck: '#F2C45A' },   // champagne
  spring: { light: '#E0EBB8', mid: '#B6CE84', deep: '#6E9A4C', edge: '#3F6330', rim: '#EBF3CC', fleck: '#FFE98A' },
};
const LEAF = { light: '#BCCBA4', mid: '#8CA276', deep: '#5E7649', edge: '#34492C' };

// ---------- seeded random ----------
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => Math.round(n * 10) / 10;

// ---------- svg context: unique ids, shared defs ----------
function ctx() {
  const c = { defs: [], n: 0, cache: {} };
  c.id = (p) => `${p}${c.n++}`;
  c.once = (key, build) => { if (!c.cache[key]) { c.cache[key] = c.id('d'); c.defs.push(build(c.cache[key])); } return c.cache[key]; };
  return c;
}
function petalGrad(c, cw, tint) { // tint 0 = outer (lighter), 1 = inner (deeper)
  return c.once(`pg-${cw}-${tint}`, (id) => {
    const p = COLORWAYS[cw];
    const base = mix(p.mid, p.deep, 0.55 + tint * 0.3), midc = mix(p.mid, p.deep, tint * 0.35), tip = mix(p.mid, p.light, 0.7 - tint * 0.3);
    return `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${base}"/><stop offset="0.45" stop-color="${midc}"/><stop offset="1" stop-color="${tip}"/></linearGradient>`;
  });
}
function sheenGrad(c) {
  return c.once('sheen', (id) => `<radialGradient id="${id}" cx="0.5" cy="0.3" r="0.65"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
}
function shadeGrad(c) { // darkens the petal base (inner shading)
  return c.once('shade', (id) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0.3"><stop offset="0" stop-color="#2a1608" stop-opacity="0.42"/><stop offset="1" stop-color="#2a1608" stop-opacity="0"/></linearGradient>`);
}
function paintFilter(c, cw, seed, scale, shadow) { // wobbly edge + soft layer shadow
  return c.id('pf') && (() => {
    const id = c.id('pf');
    c.defs.push(`<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.011 0.017" numOctaves="2" seed="${seed}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feDropShadow in="d" dx="0" dy="${shadow * 0.5}" stdDeviation="${shadow}" flood-color="${COLORWAYS[cw].edge}" flood-opacity="0.38"/></filter>`);
    return id;
  })();
}

// ---------- petal geometry (points up, base at origin) ----------
function petalD(L, W, o, r) {
  const hw = W / 2, tr = hw * (o.tip || 0.55), jx = () => (r() - 0.5) * hw * 0.28, jl = () => 1 + (r() - 0.5) * 0.12;
  const bend = (o.bend || 0) * (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.8);
  const b = (t) => bend * L * t * t;
  const Ls = L * jl();
  const side = (s) => {
    const m = s; // -1 left, +1 right
    return [
      [m * (hw * 1.05 + jx()) + b(0.25), -Ls * 0.22],
      [m * (hw * (1 + (o.belly || 0.15)) + jx()) + b(0.7), -Ls * 0.7],
      [m * (tr * 0.95) + b(0.97), -Ls * 0.96],
    ];
  };
  const l = side(-1), rr = side(1), tx = b(1) + (r() - 0.5) * hw * 0.4;
  const p = (a) => `${f(a[0])} ${f(a[1])}`;
  return `M0 0 C${p(l[0])} ${p(l[1])} ${p(l[2])} Q${f(tx)} ${f(-Ls * 1.06)} ${p(rr[2])} C${p(rr[1])} ${p(rr[0])} 0 0Z`;
}
function petalSVG(c, cw, tint, L, W, o, r) {
  const d = petalD(L, W, o, r);
  const g = petalGrad(c, cw, tint), sh = sheenGrad(c), sd = shadeGrad(c), e = COLORWAYS[cw].edge;
  let s = `<path d="${d}" fill="url(#${g})" stroke="${e}" stroke-opacity="0.35" stroke-width="2.2"/>`;
  s += `<path d="${d}" fill="url(#${sd})"/><path d="${d}" fill="url(#${sh})"/>`;
  const veins = o.veins === undefined ? 3 : o.veins;
  for (let i = 0; i < veins; i++) {
    const off = (i - (veins - 1) / 2) * W * 0.17, bx = (r() - 0.5) * 6;
    s += `<path d="M${f(off * 0.2)} ${f(-L * 0.08)} Q${f(off * 0.8 + bx)} ${f(-L * 0.45)} ${f(off * 0.55)} ${f(-L * (0.68 + r() * 0.14))}" fill="none" stroke="${e}" stroke-opacity="${0.16 + r() * 0.12}" stroke-width="${f(1.4 + r())}" stroke-linecap="round"/>`;
  }
  return s;
}

// ---------- lush chrysanthemum: dozens of cupped, overlapping petals in many staggered rings ----------
const FORMS = {
  pompon:   { layers: 15, n0: 34, n1: 9, len0: 420, len1: 55, pw: 1.1, wide: 6.8, core: 38 },
  incurved: { layers: 13, n0: 30, n1: 8, len0: 410, len1: 60, pw: 0.9, wide: 7.2, core: 34 },
  mophead:  { layers: 12, n0: 26, n1: 8, len0: 430, len1: 70, pw: 1.25, wide: 7.6, core: 40 },
  reflex:   { layers: 13, n0: 28, n1: 9, len0: 425, len1: 60, pw: 1.05, wide: 7.0, core: 36 },
  bud:      { layers: 7, n0: 14, n1: 5, len0: 230, len1: 40, pw: 0.9, wide: 8, core: 20 },
};
// cupped strap petal pointing up from (0,0): narrow base, broad rounded tip
function lushPetalD(L, W, r, shape) {
  shape = shape || 0;                                   // 0 round .. 1 pointed
  const hw = W / 2, j = () => (r() - 0.5) * hw * 0.2, jl = 1 + (r() - 0.5) * 0.1, Ls = L * jl, tj = (r() - 0.5) * hw * 0.34;
  const tx = 0.5 - 0.3 * shape, ty = 1.03 + 0.09 * shape;
  const p = (x, y) => `${f(x)} ${f(y)}`;
  return `M0 0 C${p(-hw * 0.45 + j(), -Ls * 0.12)} ${p(-hw * 1.05 + j(), -Ls * 0.42)} ${p(-hw * 1.0 + j(), -Ls * 0.78)} C${p(-hw * 0.95, -Ls * 0.97)} ${p(-hw * tx + tj, -Ls * ty)} ${p(tj, -Ls * ty)} C${p(hw * tx + tj, -Ls * ty)} ${p(hw * 0.95, -Ls * 0.97)} ${p(hw * 1.0 + j(), -Ls * 0.78)} C${p(hw * 1.05 + j(), -Ls * 0.42)} ${p(hw * 0.45 + j(), -Ls * 0.12)} 0 0Z`;
}
// Litho-style petal: flat-ish pigment with a soft base wash, a thin ink outline, and a slight colour misregistration.
function lushPetal(c, cw, tint, L, W, r, shape) {
  const p = COLORWAYS[cw], d = lushPetalD(L, W, r, shape), q = Math.round(Math.max(0, Math.min(1, tint)) * 6) / 6, sd = shadeGrad(c);
  const g = petalGrad(c, cw, q);
  const hg = c.once(`hl-${cw}`, (id) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0.55" stop-color="${p.rim}" stop-opacity="0"/><stop offset="1" stop-color="${p.rim}" stop-opacity="0.38"/></linearGradient>`);
  const off = L * 0.008 + 0.8, ink = f(Math.max(1.1, L * 0.007));
  let s = `<path d="${d}" fill="url(#${g})" transform="translate(${f(off)} ${f(off * 0.7)})"/>`;       // pigment layer, nudged
  s += `<path d="${d}" fill="url(#${sd})" transform="translate(${f(off)} ${f(off * 0.7)})" opacity="0.8"/>`;
  s += `<path d="${d}" fill="url(#${hg})" transform="translate(${f(off)} ${f(off * 0.7)})"/>`;
  s += `<path d="${d}" fill="none" stroke="${p.edge}" stroke-opacity="0.78" stroke-width="${ink}" stroke-linejoin="round" stroke-linecap="round"/>`; // fine ink line
  s += `<path d="M0 ${f(-L * 0.12)} Q${f(jx(r) * W)} ${f(-L * 0.45)} ${f(jx(r) * W * 0.5)} ${f(-L * (0.6 + r() * 0.12))}" fill="none" stroke="${p.edge}" stroke-opacity="0.28" stroke-width="${f(Math.max(0.9, L * 0.006))}" stroke-linecap="round"/>`;
  return s;
}
function jx(r) { return (r() - 0.5) * 0.3; }

// returns an SVG fragment in a 1000-unit space centred at 0,0 (radius ~430)
function blossomBody(c, cw, form, seed, opts) {
  opts = opts || {};
  const F = FORMS[form], r = rng(seed), p = COLORWAYS[cw];
  let s = '';
  if (opts.bloom) { // optional faint ink bleed behind, like an offset-print misregistration
    const wc = c.id('wc');
    c.defs.push(`<filter id="${wc}" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.008" numOctaves="3" seed="${seed + 3}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="120" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="26"/></filter>`);
    s += `<g filter="url(#${wc})"><circle r="${f(F.len0 * 0.95)}" fill="${p.mid}" fill-opacity="0.35"/></g>`;
  }
  const shape = r() * 0.8, wv = 0.85 + r() * 0.3;
  s += `<circle r="${F.core * 2}" fill="${p.edge}"/>`; // hidden centre
  for (let li = 0; li < F.layers; li++) {
    const t = li / (F.layers - 1);                       // 0 outer .. 1 inner
    const k = Math.pow(1 - t, F.pw);
    const L0 = F.len1 + (F.len0 - F.len1) * k;
    const n = Math.max(5, Math.round(F.n1 + (F.n0 - F.n1) * Math.pow(1 - t, 0.8)) + Math.round((r() - 0.5) * 4));
    const step = 360 / n, off = (li * 137.5) % step + r() * 5;
    const pf = paintFilter(c, cw, seed + li * 7, 4 + (1 - t) * 4, 5 + (1 - t) * 5);
    let layer = '';
    for (let i = 0; i < n; i++) {
      const ang = off + i * step + (r() - 0.5) * step * 0.3;
      const L = L0 * (0.85 + r() * 0.18), W = Math.min(L * 0.8, Math.max(L * 0.2, F.wide * L / n)) * (0.78 + r() * 0.44) * wv * (li % 3 === 0 ? 1.1 : 1);
      const tilt = 1 - t * 0.18; // inner petals foreshortened = curling toward the centre
      layer += `<g transform="rotate(${f(ang)}) scale(1 ${f(tilt * (0.97 + r() * 0.05))})">${lushPetal(c, cw, t * 0.85 + (li % 2 ? 0.08 : -0.04) + (r() - 0.5) * 0.4, L, W, r, shape * (0.5 + r()))}</g>`;
    }
    s += `<g filter="url(#${pf})">${layer}</g>`;
  }
  // dome shading: darker toward the rim, lighter at the crown
  const dm = c.once(`dome-${cw}`, (id) => `<radialGradient id="${id}"><stop offset="0.5" stop-color="${p.edge}" stop-opacity="0"/><stop offset="1" stop-color="${p.edge}" stop-opacity="0.22"/></radialGradient>`);
  s += `<circle r="${f(F.len0 * 1.2)}" fill="url(#${dm})"/>`;
  const hl = c.once(`crown-${cw}`, (id) => `<radialGradient id="${id}" cx="0.42" cy="0.38"><stop offset="0" stop-color="${p.rim}" stop-opacity="0.35"/><stop offset="0.7" stop-color="${p.rim}" stop-opacity="0"/></radialGradient>`);
  s += `<circle r="${f(F.len0 * 0.8)}" fill="url(#${hl})"/>`;
  return s;
}
// full serrated leaf with veins
function leafBody(c, L, W, seed) {
  const r = rng(seed), hw = W / 2, bend = (r() - 0.5) * W * 0.4;
  const g = c.once('leafg', (id) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${LEAF.deep}"/><stop offset="0.55" stop-color="${LEAF.mid}"/><stop offset="1" stop-color="${LEAF.light}"/></linearGradient>`);
  const N = 14, left = [], right = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.85), tooth = (k % 2 ? 1.1 : 0.9), x0 = bend * t * t;
    left.push([x0 - hw * prof * tooth, -L * t]);
    right.push([x0 + hw * prof * (k % 2 ? 0.9 : 1.1), -L * t]);
  }
  const pts = left.concat(right.reverse()).map((q) => `${f(q[0])} ${f(q[1])}`);
  const d = 'M' + pts.join(' L') + 'Z';
  let s = `<path d="${d}" fill="url(#${g})" stroke="${LEAF.edge}" stroke-opacity="0.65" stroke-width="2.4" stroke-linejoin="round"/>`;
  s += `<path d="M0 0 Q${f(bend * 0.5)} ${f(-L * 0.5)} ${f(bend)} ${f(-L * 0.97)}" fill="none" stroke="${LEAF.edge}" stroke-opacity="0.55" stroke-width="3.2" stroke-linecap="round"/>`;
  for (let i = 1; i <= 7; i++) {
    const t = i / 8.5, y = -L * t, x0 = bend * t * t, w = hw * Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.85;
    s += `<path d="M${f(x0)} ${f(y)} Q${f(x0 - w * 0.5)} ${f(y - L * 0.04)} ${f(x0 - w)} ${f(y - L * 0.1)} M${f(x0)} ${f(y)} Q${f(x0 + w * 0.5)} ${f(y - L * 0.04)} ${f(x0 + w)} ${f(y - L * 0.1)}" fill="none" stroke="${LEAF.edge}" stroke-opacity="0.3" stroke-width="2" stroke-linecap="round"/>`;
  }
  return s;
}
function budBody(c, cw, seed) { // round closed bud with serrated sepals
  let s = '';
  for (let i = 0; i < 5; i++) s += `<g transform="rotate(${f(i * 72 + 20)})">${leafBody(c, 150, 70, seed + i)}</g>`;
  s += `<g transform="scale(0.62)">${blossomBody(c, cw, 'bud', seed, { noBloom: true })}</g>`;
  return s;
}

// ---------- document wrapper ----------
function doc(c, w, h, vb, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}"><defs>${c.defs.join('')}</defs>${body}</svg>`;
}
function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: undefined }).render().asPng();
}
const written = [];
const { execFileSync } = require('node:child_process');
// Palette-quantise (PNG8 + alpha) with ImageMagick to keep files small. Falls back to raw output.
function shrink(png, colors) {
  try {
    return execFileSync('convert', ['png:-', '-strip', '-colors', String(colors || 256), '-define', 'png:compression-level=9', 'PNG8:-'], { input: png, maxBuffer: 1 << 28 });
  } catch (e) { return png; }
}
// Owner-supplied art is listed in public/theme/art/OWNER-ART.json and is never overwritten
// (even with --only) unless --force-owner is passed. --only=a.png,b.png limits what is written.
const OWNER = (() => { try { return new Set(JSON.parse(fs.readFileSync(path.join(OUT, 'OWNER-ART.json'), 'utf8')).files || []); } catch (e) { return new Set(); } })();
const ARGS = process.argv.slice(2);
const FORCE_OWNER = ARGS.includes('--force-owner');
const ONLY = (() => { const a = ARGS.find((x) => x.startsWith('--only=')); return a ? new Set(a.slice(7).split(',').map((x) => (x.endsWith('.png') ? x : x + '.png')).filter(Boolean)) : null; })();
function save(name, png, quant) {
  if (ONLY && !ONLY.has(name)) return;
  if (OWNER.has(name) && !FORCE_OWNER) { console.log('skipped (owner art): ' + name); return; }
  if (quant) png = shrink(png, quant);
  { fs.writeFileSync(path.join(OUT, name), png); written.push([name, png.length]); } }

// ---------- assets ----------
const HEROES = [
  ['gold', 'pompon', 11], ['rose', 'mophead', 23], ['coral', 'pompon', 37], ['plum', 'mophead', 41],
  ['sage', 'incurved', 53], ['ivory', 'incurved', 67], ['spring', 'reflex', 79],
];
for (const [cw, form, seed] of HEROES) {
  const c = ctx();
  const body = blossomBody(c, cw, form, seed);
  const svg = doc(c, 768, 768, '-500 -500 1000 1000', body);
  save(`blossom-${cw}.png`, render(svg, 768), 224);
  save(`blossom-${cw}@1x.png`, render(svg, 384), 224);
}

// petal sprites: base at bottom centre of a 128 canvas, pointing up
const PETALS = [['gold', 'pompon'], ['rose', 'reflex'], ['coral', 'daisy'], ['plum', 'anemone'], ['sage', 'incurved'], ['ivory', 'quill'], ['spring', 'reflex']];
PETALS.forEach(([cw], i) => {
  const c = ctx(), r = rng(100 + i);
  const pf = paintFilter(c, cw, 5 + i, 2, 1.5);
  const body = `<g transform="translate(64 122)"><g filter="url(#${pf})">${lushPetal(c, cw, 0.2, 112, 62, r)}</g></g>`;
  const svg = doc(c, 128, 128, '0 0 128 128', body);
  save(`petal-${cw}.png`, render(svg, 128), 128);
  save(`petal-${cw}@2x.png`, render(svg, 256), 192);
});

// corner sprays (origin = top-left corner of the art)
const SPRAYS = {
  warm:  { blooms: [['gold', 'pompon'], ['coral', 'pompon'], ['rose', 'mophead'], ['gold', 'incurved']], bud: 'rose' },
  plum:  { blooms: [['plum', 'mophead'], ['rose', 'incurved'], ['ivory', 'incurved'], ['plum', 'pompon']], bud: 'ivory' },
  green: { blooms: [['spring', 'reflex'], ['ivory', 'incurved'], ['sage', 'incurved'], ['gold', 'pompon']], bud: 'spring' },
};
Object.keys(SPRAYS).forEach((name, si) => {
  const c = ctx(), r = rng(300 + si * 19), S = SPRAYS[name];
  let back = '', mid = '', front = '';
  const stem = (d, w) => `<path d="${d}" fill="none" stroke="${LEAF.edge}" stroke-opacity="0.85" stroke-width="${w}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${LEAF.mid}" stroke-width="${w * 0.45}" stroke-linecap="round" transform="translate(-1 -1)"/>`;
  [['M-20 -20 C260 40 520 60 760 200', 10], ['M-20 -20 C40 260 60 520 200 760', 10], ['M-20 -20 C200 250 330 330 560 560', 9]].forEach(([d, w]) => { back += stem(d, w); });
  const leafAt = (x, y, ang, L, sd) => `<g transform="translate(${x} ${y}) rotate(${ang})">${leafBody(c, L, L * 0.5, sd)}</g>`;
  [[150, 25, 40, 250], [330, 50, 30, 270], [520, 70, 15, 220], [640, 140, 8, 210], [80, 160, -125, 250], [60, 330, -130, 270], [70, 520, -150, 220], [140, 640, -170, 210],
   [300, 250, 80, 230], [250, 300, 10, 230], [420, 420, 70, 210], [450, 400, 0, 200], [720, 190, 40, 190], [190, 720, -140, 190]].forEach(([x, y, a, L], i) => { back += leafAt(x, y, a, L, 500 + i + si * 20); });
  [[S.blooms[0], 230, 230, 0.58], [S.blooms[1], 610, 165, 0.34], [S.blooms[2], 165, 610, 0.34], [S.blooms[3], 410, 410, 0.3]].forEach(([[cw, form], x, y, sc], i) => {
    mid += `<g transform="translate(${x} ${y}) rotate(${f(r() * 360)}) scale(${sc})">${blossomBody(c, cw, form, 700 + i * 13 + si * 5, { noBloom: i > 0 })}</g>`;
  });
  [[790, 215, 0.42, 20], [215, 790, 0.42, 110], [600, 610, 0.38, 45], [330, 150, 0.3, 80], [150, 330, 0.3, 10]].forEach(([x, y, sc, a], i) => {
    front += `<g transform="translate(${x} ${y}) rotate(${a}) scale(${sc})">${budBody(c, S.bud, 900 + i + si)}</g>`;
  });
  const svg = doc(c, 900, 900, '0 0 900 900', back + mid + front);
  save(`spray-${name}.png`, render(svg, 800), 224);
  save(`spray-${name}@1x.png`, render(svg, 400), 224);
});

// ---------- single leaves (pointing up, base bottom-centre of a 256 canvas) ----------
[['a', 11], ['b', 12], ['c', 13]].forEach(([n, sd], i) => {
  const c = ctx();
  const body = `<g transform="translate(128 246) rotate(${[0, -8, 6][i]})">${leafBody(c, 230, [118, 90, 74][i], sd)}</g>`;
  save(`leaf-${n}.png`, render(doc(c, 256, 256, '0 0 256 256', body), 256), 128);
});
// ---------- buds ----------
['gold', 'rose', 'coral', 'plum'].forEach((cw, i) => {
  const c = ctx();
  save(`bud-${cw}.png`, render(doc(c, 256, 256, '-210 -210 420 420', `<g>${budBody(c, cw, 40 + i)}</g>`), 256), 128);
});
// ---------- edge branches (emerge from the LEFT edge, reach right; CSS rotates/mirrors them) ----------
const BRANCHES = { warm: [['gold', 'pompon'], ['rose', 'incurved'], 'rose'], plum: [['plum', 'mophead'], ['ivory', 'incurved'], 'ivory'], green: [['spring', 'reflex'], ['ivory', 'incurved'], 'spring'] };
Object.keys(BRANCHES).forEach((name, si) => {
  const c = ctx(), [b1, b2, bud] = BRANCHES[name];
  let back = '', mid = '', front = '';
  const d = 'M-20 160 C160 120 330 190 560 120';
  back += `<path d="${d}" fill="none" stroke="${LEAF.edge}" stroke-opacity="0.85" stroke-width="7" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${LEAF.mid}" stroke-width="3" stroke-linecap="round"/>`;
  [[90, 150, -70, 130], [200, 150, 60, 150], [300, 170, -80, 140], [400, 150, 55, 130], [470, 135, -60, 110]].forEach(([x, y, a, L], k) => { back += `<g transform="translate(${x} ${y}) rotate(${a})">${leafBody(c, L, L * 0.5, 600 + k + si * 9)}</g>`; });
  mid += `<g transform="translate(330 200) rotate(${si * 40}) scale(0.24)">${blossomBody(c, b1[0], b1[1], 800 + si, {})}</g>`;
  mid += `<g transform="translate(150 105) rotate(20) scale(0.16)">${blossomBody(c, b2[0], b2[1], 820 + si, {})}</g>`;
  front += `<g transform="translate(570 110) rotate(-20) scale(0.3)">${budBody(c, bud, 860 + si)}</g>`;
  save(`branch-${name}.png`, render(doc(c, 640, 300, '0 0 640 300', back + mid + front), 640), 160);
});
// ---------- gilt ornaments: delicate rules and flourishes (line art, antique gold ink) ----------
{
  const g = '#B4832A';
  const cornerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64" fill="none" stroke="${g}" stroke-width="1.4" stroke-linecap="round"><path d="M4 4H34M4 4V34"/><path d="M10 10C28 10 38 18 36 30 34 37 25 38 23 31 21 25 28 21 31 25"/><path d="M10 10C10 28 18 38 30 36 37 34 38 25 31 23 25 21 21 28 25 31"/><circle cx="10" cy="10" r="2.4" fill="${g}"/><circle cx="44" cy="6" r="1.5" fill="${g}"/><circle cx="6" cy="44" r="1.5" fill="${g}"/></svg>`;
  save('ornament-corner.png', new Resvg(cornerSvg).render().asPng(), 32);
  const ruleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="40" viewBox="0 0 320 20" fill="none" stroke="${g}" stroke-width="1" stroke-linecap="round"><path d="M0 10H128M192 10H320"/><path d="M134 10C140 10 142 3 148 4 153 5 152 10 148 11M186 10C180 10 178 3 172 4 167 5 168 10 172 11"/><path d="M160 2L168 10L160 18L152 10Z" fill="${g}"/><circle cx="126" cy="10" r="1.4" fill="${g}"/><circle cx="194" cy="10" r="1.4" fill="${g}"/></svg>`;
  save('ornament-rule.png', new Resvg(ruleSvg).render().asPng(), 32);
  const flSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 120 40" fill="none" stroke="${g}" stroke-width="1.2" stroke-linecap="round"><path d="M4 20C20 20 26 6 40 8 52 10 50 24 40 24 32 24 32 14 40 14M116 20C100 20 94 6 80 8 68 10 70 24 80 24 88 24 88 14 80 14"/><path d="M60 10L66 20L60 30L54 20Z" fill="${g}"/></svg>`;
  save('ornament-flourish.png', new Resvg(flSvg).render().asPng(), 32);
}

// ---------- paper texture tile (seamless) ----------
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs>
  <filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.44  0 0 0 0 0.27  0 0 0 0 0.09  0.12 0 0 0 0"/></filter>
  <filter id="b" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.60  0 0 0 0 0.42  0 0 0 0 0.20  0.09 0 0 0 0"/></filter></defs>
  <rect width="256" height="256" filter="url(#b)" opacity="0.5"/><rect width="256" height="256" filter="url(#g)" opacity="0.6"/></svg>`;
  save('paper.png', render(svg, 256));
}

// ---------- background washes per occasion theme (soft, mostly transparent) ----------
const WASHES = {
  default: ['#E9B84A', '#E68C97', '#ABC089'],
  'naw-ruz': ['#B8DA6C', '#F3F9C6', '#E68C97'],
  ridvan: ['#E68C97', '#FCDCD8', '#F2A57A'],
  'declaration-bab': ['#F2B77A', '#A87CAA', '#FCDCD8'],
  'ascension-bahaullah': ['#B8A58C', '#A89AA8', '#D5C4AE'],
  'martyrdom-bab': ['#B3A08A', '#A8988C', '#D2C2AC'],
  'birth-bab': ['#F28B6A', '#EBB947', '#FCDCD8'],
  'birth-bahaullah': ['#EBB947', '#FCEAB0', '#F28B6A'],
  covenant: ['#ABC089', '#A87CAA', '#E6EDCD'],
  'ascension-abdulbaha': ['#B8A58C', '#9AA38C', '#D5C4AE'],
};
Object.keys(WASHES).forEach((name, i) => {
  const [a, b, cc] = WASHES[name];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs>
  <filter id="w" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.006" numOctaves="3" seed="${20 + i}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="160" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="55"/></filter></defs>
  <g filter="url(#w)"><circle cx="90" cy="70" r="260" fill="${a}" fill-opacity="0.12"/><circle cx="880" cy="470" r="280" fill="${b}" fill-opacity="0.1"/><circle cx="860" cy="60" r="190" fill="${cc}" fill-opacity="0.1"/><circle cx="120" cy="500" r="200" fill="${cc}" fill-opacity="0.09"/><ellipse cx="480" cy="270" rx="320" ry="170" fill="#FFFFFF" fill-opacity="0.25"/></g></svg>`;
  save(`wash-${name}.png`, render(svg, 480));
});

const total = written.reduce((s, [, n]) => s + n, 0);
written.forEach(([n, s]) => console.log(String(Math.round(s / 1024)).padStart(5) + ' KB  ' + n));
console.log('total ' + (total / 1048576).toFixed(2) + ' MB, ' + written.length + ' files');
