// Tiny float raster toolkit for the code-generated plates and the synthetic test actor.
// Images are linear-light RGB Float32Arrays (values may go above 1 before tone mapping).
// No dependencies, no downloads: everything here is maths.

export class Img {
  constructor(w, h, d) {
    this.w = w;
    this.h = h;
    this.d = d || new Float32Array(w * h * 3);
  }
  clone() { return new Img(this.w, this.h, new Float32Array(this.d)); }
  fill(r, g, b) { const d = this.d; for (let i = 0; i < d.length; i += 3) { d[i] = r; d[i + 1] = g; d[i + 2] = b; } return this; }
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------- noise ----------
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in 0..1. */
export function vnoise(x, y, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function fbm(x, y, seed = 1, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- blur (3 x box = near-gaussian), separable, O(n) ----------
function boxH(src, dst, w, h, r) {
  const n = 2 * r + 1, inv = 1 / n, W3 = w * 3;
  for (let y = 0; y < h; y++) {
    const row = y * W3;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + clampI(k, 0, w - 1) * 3 + c];
      for (let x = 0; x < w; x++) {
        dst[row + x * 3 + c] = acc * inv;
        const xa = x + r + 1, xr = x - r;
        acc += src[row + (xa < w ? xa : w - 1) * 3 + c] - src[row + (xr > 0 ? xr : 0) * 3 + c];
      }
    }
  }
}
function boxV(src, dst, w, h, r) {
  // row-major running sums (cache friendly)
  const n = 2 * r + 1, inv = 1 / n, W3 = w * 3;
  const acc = new Float64Array(W3);
  for (let k = -r; k <= r; k++) { const o = clampI(k, 0, h - 1) * W3; for (let j = 0; j < W3; j++) acc[j] += src[o + j]; }
  for (let y = 0; y < h; y++) {
    const o = y * W3, ya = (y + r + 1 < h ? y + r + 1 : h - 1) * W3, yr = (y - r > 0 ? y - r : 0) * W3;
    for (let j = 0; j < W3; j++) { dst[o + j] = acc[j] * inv; acc[j] += src[ya + j] - src[yr + j]; }
  }
}
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Gaussian-ish blur with sigma ~ r (px). rx/ry may differ (streaks). Returns a new image. */
export function blur(img, rx, ry = rx) {
  const { w, h } = img;
  let a = new Float32Array(img.d), b = new Float32Array(a.length);
  const bx = Math.max(0, Math.round(rx * 0.58)), by = Math.max(0, Math.round(ry * 0.58));
  for (let p = 0; p < 3; p++) {
    if (bx > 0) { boxH(a, b, w, h, bx); [a, b] = [b, a]; }
    if (by > 0) { boxV(a, b, w, h, by); [a, b] = [b, a]; }
  }
  return new Img(w, h, a);
}
/** Blur on a downscaled copy (fast for big radii), result at full size. */
export function blurFast(img, r, ry = r) {
  const f = Math.max(1, Math.floor(Math.min(r, ry) / 6));
  if (f === 1) return blur(img, r, ry);
  const s = downscale(img, f);
  return upscale(blur(s, r / f, ry / f), img.w, img.h);
}
export function downscale(img, f) {
  const w = Math.floor(img.w / f), h = Math.floor(img.h / f);
  const o = new Img(w, h);
  const k = 1 / (f * f);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const s = ((y * f + j) * img.w + x * f + i) * 3; r += img.d[s]; g += img.d[s + 1]; b += img.d[s + 2]; }
    const o3 = (y * w + x) * 3; o.d[o3] = r * k; o.d[o3 + 1] = g * k; o.d[o3 + 2] = b * k;
  }
  return o;
}
/** Bilinear sample (clamped). out = [r,g,b] */
export function sample(img, x, y, out) {
  const { w, h, d } = img;
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy;
  const i00 = (iy * w + ix) * 3, i10 = i00 + 3, i01 = i00 + w * 3, i11 = i01 + 3;
  for (let c = 0; c < 3; c++) {
    const a = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx;
    const b = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
    out[c] = a + (b - a) * fy;
  }
  return out;
}
export function upscale(img, W, H) {
  const o = new Img(W, H);
  const sx = (img.w) / W, sy = (img.h) / H, px = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    sample(img, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5, px);
    const i = (y * W + x) * 3; o.d[i] = px[0]; o.d[i + 1] = px[1]; o.d[i + 2] = px[2];
  }
  return o;
}

// ---------- combine ----------
export function addInto(dst, src, k = 1) { const a = dst.d, b = src.d; for (let i = 0; i < a.length; i++) a[i] += b[i] * k; return dst; }
export function scaleInto(dst, k) { const a = dst.d; for (let i = 0; i < a.length; i++) a[i] *= k; return dst; }
/** Keep only the part above `t` (soft knee) for bloom. */
export function brightPass(img, t, knee = 0.5) {
  const o = new Img(img.w, img.h); const s = img.d, d = o.d;
  for (let i = 0; i < s.length; i += 3) {
    const l = Math.max(s[i], s[i + 1], s[i + 2]);
    const k = smooth(t - knee, t + knee, l);
    d[i] = s[i] * k; d[i + 1] = s[i + 1] * k; d[i + 2] = s[i + 2] * k;
  }
  return o;
}
/** Multi-radius bloom added in place. */
export function bloom(img, { t = 0.9, radii = [6, 24, 70], gains = [0.35, 0.25, 0.2] } = {}) {
  const bp = brightPass(img, t);
  radii.forEach((r, i) => addInto(img, blurFast(bp, r), gains[i]));
  return img;
}

// ---------- drawing: soft shapes with analytic AA, additive or over ----------
/** Add a glowing line segment (core + falloff). color linear RGB, core px half-width, glow px. */
export function glowSegment(img, x0, y0, x1, y1, color, core = 1.5, glow = 18, gain = 1) {
  const { w, h, d } = img;
  const pad = glow * 3 + core + 2;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - pad)), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + pad));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - pad)), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + pad));
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2);
    const ex = x - (x0 + dx * t), ey = y - (y0 + dy * t);
    const dist = Math.sqrt(ex * ex + ey * ey);
    const c = clamp(core + 0.5 - dist) * 2.2 + Math.exp(-(dist * dist) / (2 * glow * glow)) * 0.55 + Math.exp(-dist / (glow * 2.2)) * 0.12;
    if (c < 0.002) continue;
    const i = (y * w + x) * 3;
    d[i] += color[0] * c * gain; d[i + 1] += color[1] * c * gain; d[i + 2] += color[2] * c * gain;
  }
}
/** Signed distance to a rounded box centred at (cx,cy). */
export function sdBox(px, py, cx, cy, hw, hh, r = 0) {
  const qx = Math.abs(px - cx) - hw + r, qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
/** Paint over with coverage from an SDF function inside a bbox. fn(x,y) -> [sd, r,g,b] or null. */
export function paintSDF(img, bbox, fn, mode = 'over') {
  const { w, d } = img;
  const [x0, y0, x1, y1] = bbox.map(Math.round);
  for (let y = Math.max(0, y0); y < Math.min(img.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    const r = fn(x + 0.5, y + 0.5);
    if (!r) continue;
    const a = clamp(0.5 - r[0]) * (r[4] ?? 1);
    if (a <= 0) continue;
    const i = (y * w + x) * 3;
    if (mode === 'add') { d[i] += r[1] * a; d[i + 1] += r[2] * a; d[i + 2] += r[3] * a; }
    else { d[i] += (r[1] - d[i]) * a; d[i + 1] += (r[2] - d[i + 1]) * a; d[i + 2] += (r[3] - d[i + 2]) * a; }
  }
}

// ---------- output ----------
/** Filmic tone map (ACES fit) + gamma 2.2 into an rgb24 Buffer, via a lookup table. Dither avoids banding in dark gradients. */
const TM_N = 16384, TM_MAX = 12;
let TM = null;
function tmTable() {
  if (TM) return TM;
  TM = new Float32Array(TM_N + 1);
  for (let i = 0; i <= TM_N; i++) {
    const x = (i / TM_N) * TM_MAX;
    const y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    TM[i] = Math.pow(clamp(y), 1 / 2.2) * 255;
  }
  return TM;
}
export function toRGB24(img, exposure = 1, seed = 7, buf) {
  const s = img.d, n = s.length, T = tmTable();
  const out = buf || Buffer.allocUnsafe(n);
  const k = (TM_N / TM_MAX) * exposure;
  let st = seed >>> 0;
  for (let i = 0; i < n; i++) {
    let f = s[i] * k;
    f = f <= 0 ? 0 : f >= TM_N ? TM_N : f;
    st = (st * 1664525 + 1013904223) >>> 0;
    const v = T[f | 0] + (st / 4294967296 - 0.5) * 1.2;
    out[i] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
  }
  return out;
}
/** Linear (no tone map) 0..1 -> rgb24 with gamma, for mask-like layers (multiply layers stay exact). */
export function toRGB24Linear(img, gamma = 1, buf) {
  const s = img.d, out = buf || Buffer.allocUnsafe(s.length);
  for (let i = 0; i < s.length; i++) out[i] = clampI(Math.round(Math.pow(clamp(s[i]), 1 / gamma) * 255), 0, 255);
  return out;
}
