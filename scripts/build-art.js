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
const COLORWAYS = {
  gold:   { light: '#F2D48A', mid: '#CF9A3A', deep: '#8F5E1A', edge: '#5E3A0E', rim: '#F6E2A6', fleck: '#FFF2B8' },
  rose:   { light: '#EBC3C0', mid: '#CE8A8E', deep: '#8E4A5C', edge: '#5A2A3A', rim: '#F2D4D0', fleck: '#FFE9B0' },
  coral:  { light: '#EDBCA6', mid: '#D98A6E', deep: '#9A4C3A', edge: '#62291F', rim: '#F4D2BE', fleck: '#FFE3A0' },
  plum:   { light: '#D4B4CC', mid: '#A878A0', deep: '#6A3F64', edge: '#3F2040', rim: '#E6CCE0', fleck: '#F4D68A' },
  sage:   { light: '#CFDDB6', mid: '#9FB583', deep: '#5F7B4A', edge: '#385030', rim: '#E1EBCB', fleck: '#FFF0B0' },
  ivory:  { light: '#F8F0DA', mid: '#E6D5B0', deep: '#B79B6A', edge: '#7A6038', rim: '#FFFBEA', fleck: '#F2C45A' },
  spring: { light: '#D6E9A2', mid: '#A9CC72', deep: '#5F9440', edge: '#385E28', rim: '#E6F2BC', fleck: '#FFE98A' },
};
const LEAF = { light: '#A9BE86', mid: '#6C8A52', deep: '#3E5B33', edge: '#26391F' };

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
    const base = mix(p.deep, p.edge, 0.2 + tint * 0.4), midc = mix(p.mid, p.deep, tint * 0.6), tip = mix(p.mid, p.light, 0.95 - tint * 0.4);
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
function lushPetalD(L, W, r) {
  const hw = W / 2, j = () => (r() - 0.5) * hw * 0.16, jl = 1 + (r() - 0.5) * 0.08, Ls = L * jl, tj = (r() - 0.5) * hw * 0.3;
  const p = (x, y) => `${f(x)} ${f(y)}`;
  return `M0 0 C${p(-hw * 0.45 + j(), -Ls * 0.12)} ${p(-hw * 1.05 + j(), -Ls * 0.42)} ${p(-hw * 1.0 + j(), -Ls * 0.78)} C${p(-hw * 0.95, -Ls * 0.97)} ${p(-hw * 0.5 + tj, -Ls * 1.03)} ${p(tj, -Ls * 1.03)} C${p(hw * 0.5 + tj, -Ls * 1.03)} ${p(hw * 0.95, -Ls * 0.97)} ${p(hw * 1.0 + j(), -Ls * 0.78)} C${p(hw * 1.05 + j(), -Ls * 0.42)} ${p(hw * 0.45 + j(), -Ls * 0.12)} 0 0Z`;
}
function lushPetal(c, cw, tint, L, W, r) {
  const p = COLORWAYS[cw], d = lushPetalD(L, W, r), g = petalGrad(c, cw, tint), sd = shadeGrad(c);
  const hw = W / 2;
  const tip = `M${f(-hw * 1.0)} ${f(-L * 0.78)} C${f(-hw * 0.95)} ${f(-L * 0.97)} ${f(-hw * 0.5)} ${f(-L * 1.02)} 0 ${f(-L * 1.02)} C${f(hw * 0.5)} ${f(-L * 1.02)} ${f(hw * 0.95)} ${f(-L * 0.97)} ${f(hw * 1.0)} ${f(-L * 0.78)}`;
  const hg = c.once(`hl-${cw}`, (id) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0.5" stop-color="${p.rim}" stop-opacity="0"/><stop offset="1" stop-color="${p.rim}" stop-opacity="0.75"/></linearGradient>`);
  let s = `<path d="${d}" fill="url(#${g})" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="${f(Math.max(1.6, L * 0.012))}" stroke-linejoin="round"/>`;
  s += `<path d="${d}" fill="url(#${sd})"/>`;
  s += `<path d="${d}" fill="url(#${hg})"/>`;
  s += `<path d="${tip}" fill="none" stroke="${p.rim}" stroke-opacity="0.22" stroke-width="${f(Math.max(1.2, L * 0.016))}" stroke-linecap="round" transform="translate(0 ${f(L * 0.03)}) scale(0.95 0.97)"/>`;
  s += `<path d="M${f(-hw * 0.7)} ${f(-L * 0.72)} Q0 ${f(-L * 0.84)} ${f(hw * 0.7)} ${f(-L * 0.72)}" fill="none" stroke="${p.edge}" stroke-opacity="0.2" stroke-width="${f(Math.max(1.5, L * 0.012))}" stroke-linecap="round"/>`;
  s += `<path d="M0 ${f(-L * 0.14)} Q${f(jx(r) * hw)} ${f(-L * 0.45)} 0 ${f(-L * 0.68)}" fill="none" stroke="${p.edge}" stroke-opacity="0.16" stroke-width="${f(Math.max(1.2, L * 0.01))}" stroke-linecap="round"/>`;
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
  s += `<circle r="${F.core * 2}" fill="${p.edge}"/>`; // hidden centre
  for (let li = 0; li < F.layers; li++) {
    const t = li / (F.layers - 1);                       // 0 outer .. 1 inner
    const k = Math.pow(1 - t, F.pw);
    const L0 = F.len1 + (F.len0 - F.len1) * k;
    const n = Math.max(5, Math.round(F.n1 + (F.n0 - F.n1) * Math.pow(1 - t, 0.8)));
    const step = 360 / n, off = (li * 137.5) % step + r() * 5;
    const pf = paintFilter(c, cw, seed + li * 7, 4 + (1 - t) * 4, 5 + (1 - t) * 5);
    let layer = '';
    for (let i = 0; i < n; i++) {
      const ang = off + i * step + (r() - 0.5) * step * 0.3;
      const L = L0 * (0.9 + r() * 0.2), W = Math.min(L * 0.8, Math.max(L * 0.2, F.wide * L / n)) * (0.85 + r() * 0.3);
      const tilt = 1 - t * 0.18; // inner petals foreshortened = curling toward the centre
      layer += `<g transform="rotate(${f(ang)}) scale(1 ${f(tilt * (0.97 + r() * 0.05))})">${lushPetal(c, cw, t * 0.85 + (li % 2 ? 0.08 : -0.04) + (r() - 0.5) * 0.3, L, W, r)}</g>`;
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
function save(name, png, quant) {
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

// ---------- paper texture tile (seamless) ----------
{
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs>
  <filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.44  0 0 0 0 0.27  0 0 0 0 0.09  0.24 0 0 0 0"/></filter>
  <filter id="b" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="9" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.60  0 0 0 0 0.42  0 0 0 0 0.20  0.2 0 0 0 0"/></filter></defs>
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
  <g filter="url(#w)"><circle cx="90" cy="70" r="260" fill="${a}" fill-opacity="0.34"/><circle cx="880" cy="470" r="280" fill="${b}" fill-opacity="0.3"/><circle cx="860" cy="60" r="190" fill="${cc}" fill-opacity="0.3"/><circle cx="120" cy="500" r="200" fill="${cc}" fill-opacity="0.28"/><ellipse cx="480" cy="270" rx="320" ry="170" fill="#FFF8E8" fill-opacity="0.35"/></g></svg>`;
  save(`wash-${name}.png`, render(svg, 480));
});

const total = written.reduce((s, [, n]) => s + n, 0);
written.forEach(([n, s]) => console.log(String(Math.round(s / 1024)).padStart(5) + ' KB  ' + n));
console.log('total ' + (total / 1048576).toFixed(2) + ' MB, ' + written.length + ' files');
