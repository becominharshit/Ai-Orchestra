// Key maths + colour match, shared by the render (composite.js) and the booth check (calibrate.js).
//
// The key is a colour-difference key (the classic "G minus max(R,B)"), not ffmpeg's chromakey:
//   d = G - max(R, B)            (8-bit, clamped at 0)
//   alpha = 1 - clip((d - lo) / (hi - lo))
// lo / hi come from the backdrop itself (measured on a few frames), so a darker or brighter screen still keys.
// Despill is the same d: G' = G - d = min(G, max(R, B)).
// In ffmpeg this is extractplanes + blend lighten/subtract + lut, all integer plane ops (fast on 2 vCPU),
// and this file computes the very same numbers in JS on small frames for the stats and the booth check.
import fs from 'node:fs';
import { ffmpegBuffer } from '../src/ffmpeg.js';

export const SW = 480, SH = 270; // analysis size (the booth frame is 1920x1080, 16:9)

/** Read n frames (rgb24, SW x SH) spread over [t0, t1] of a clip. */
export async function sampleFrames(file, { n = 4, t0 = 0.3, t1 = 4, w = SW, h = SH, crop = null } = {}) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? t0 : t0 + ((t1 - t0) * k) / (n - 1);
    const vf = [crop ? `crop=${crop}` : null, `scale=${w}:${h}:flags=area`, 'format=rgb24'].filter(Boolean).join(',');
    const b = await ffmpegBuffer(['-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-']);
    if (b.length === w * h * 3) out.push({ t, w, h, rgb: b });
  }
  return out;
}
/** Consecutive frames (for temporal edge noise). */
export async function sampleRun(file, { t = 1.5, frames = 6, w = SW, h = SH } = {}) {
  const b = await ffmpegBuffer(['-ss', t.toFixed(3), '-i', file, '-frames:v', String(frames), '-vf', `scale=${w}:${h}:flags=area,format=rgb24`, '-f', 'rawvideo', '-']);
  const fs3 = w * h * 3, out = [];
  for (let k = 0; k + fs3 <= b.length; k += fs3) out.push({ w, h, rgb: b.subarray(k, k + fs3) });
  return out;
}

export const diff = (r, g, b) => { const m = r > b ? r : b; return g > m ? g - m : 0; };

/** Measure the backdrop: d over clearly-green pixels -> key levels. */
export function keyLevels(frames) {
  const ds = [];
  for (const f of frames) {
    const p = f.rgb;
    for (let i = 0; i < p.length; i += 3 * 7) { const d = diff(p[i], p[i + 1], p[i + 2]); if (d > 25 && p[i + 1] > 40) ds.push(d); }
  }
  ds.sort((a, b) => a - b);
  if (ds.length < 500) return { ok: false, lo: 12, hi: 60, med: 0, p2: 0, n: ds.length };
  const q = (x) => ds[Math.min(ds.length - 1, Math.floor(x * ds.length))];
  const med = q(0.5), p2 = q(0.02);
  const hi = Math.max(18, Math.min(Math.round(p2 * 0.92), Math.round(med * 0.86)));
  const lo = Math.max(4, Math.round(Math.min(hi * 0.3, med * 0.12)));
  return { ok: true, lo, hi, med, p2, n: ds.length };
}

/** Alpha (0..1 Float32) for one rgb24 frame, same formula as the ffmpeg graph (without the edge blur). */
export function alphaOf(frame, { lo, hi }) {
  const { w, h, rgb } = frame, a = new Float32Array(w * h), k = 1 / (hi - lo);
  for (let p = 0, i = 0; p < w * h; p++, i += 3) {
    const d = diff(rgb[i], rgb[i + 1], rgb[i + 2]);
    const v = (d - lo) * k;
    a[p] = v <= 0 ? 1 : v >= 1 ? 0 : 1 - v;
  }
  return a;
}

/** 3x3 erosion of a binary mask, n times (Uint8Array). */
export function erode(mask, w, h, n = 1) {
  let a = mask;
  for (let it = 0; it < n; it++) {
    const b = new Uint8Array(a.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      b[i] = a[i] && a[i - 1] && a[i + 1] && a[i - w] && a[i + w] && a[i - w - 1] && a[i - w + 1] && a[i + w - 1] && a[i + w + 1] ? 1 : 0;
    }
    a = b;
  }
  return a;
}
export function dilate(mask, w, h, n = 1) {
  const inv = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const e = erode(inv, w, h, n); for (let i = 0; i < e.length; i++) e[i] = e[i] ? 0 : 1;
  // erode() leaves the 1 px border at 0 -> border becomes 1 after the inversion; clear it
  for (let x = 0; x < w; x++) { e[x] = mask[x]; e[(h - 1) * w + x] = mask[(h - 1) * w + x]; }
  for (let y = 0; y < h; y++) { e[y * w] = mask[y * w]; e[y * w + w - 1] = mask[y * w + w - 1]; }
  return e;
}

// BT.709 on gamma-encoded 0..1
const toYcc = (r, g, b) => { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [y, (b - y) / 1.8556, (r - y) / 1.5748]; };
const fromYcc = (y, cb, cr) => { const r = y + 1.5748 * cr, b = y + 1.8556 * cb; const g = (y - 0.2126 * r - 0.0722 * b) / 0.7152; return [r, g, b]; };

/** Foreground stats after despill: luma mean / std / p05 / p95 and mean chroma, over the solid (eroded) matte. */
export function fgStats(frames, levels) {
  let n = 0, sy = 0, syy = 0, scb = 0, scr = 0; const hist = new Uint32Array(256);
  for (const f of frames) {
    const a = alphaOf(f, levels), m = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) m[i] = a[i] > 0.98 ? 1 : 0;
    const core = erode(m, f.w, f.h, 2);
    for (let p = 0; p < core.length; p++) {
      if (!core[p]) continue;
      const i = p * 3; let r = f.rgb[i] / 255, g = f.rgb[i + 1] / 255; const b = f.rgb[i + 2] / 255;
      g = Math.min(g, Math.max(r, b)); // despill
      const [Y, cb, cr] = toYcc(r, g, b);
      n++; sy += Y; syy += Y * Y; scb += cb; scr += cr; hist[Math.min(255, Math.round(Y * 255))]++;
    }
  }
  if (!n) return { n: 0 };
  const mean = sy / n, std = Math.sqrt(Math.max(0, syy / n - mean * mean));
  const pct = (q) => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= q * n) return v / 255; } return 1; };
  return { n, mean, std, p05: pct(0.05), p50: pct(0.5), p95: pct(0.95), cb: scb / n, cr: scr / n, clipped: hist.slice(250).reduce((s, v) => s + v, 0) / n };
}

/**
 * Match LUT for the squad: move their luma and colour cast towards the plate's light (target from plates meta),
 * partially (strength), with clamps so a black hoodie or a bright tee does not get crushed or blown.
 */
export function matchTransform(stats, target, strength = 0.7) {
  if (!stats.n) return { gain: 1, off: 0, dcb: 0, dcr: 0, sat: 0.92 };
  const want = target.lum;
  // scale around the median so faces (mid tones) land on the plate's key level
  let gain = clampN((want / Math.max(0.05, stats.p50)), 0.7, 1.45);
  gain = 1 + (gain - 1) * strength;
  const off = 0;
  const dcb = (target.cb - stats.cb) * strength, dcr = (target.cr - stats.cr) * strength;
  return { gain, off, dcb: clampN(dcb, -0.04, 0.04), dcr: clampN(dcr, -0.04, 0.04), sat: 0.9, contrast: target.contrast || 1, pivot: stats.p50 * gain };
}
const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Write a 3D LUT (.cube, size N) from fn(r,g,b) -> [r,g,b] (0..1). */
export function writeCube(file, fn, N = 33, title = 'zenith') {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${N}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = fn(r / (N - 1), g / (N - 1), b / (N - 1));
    lines.push(o.map((v) => clampN(v, 0, 1).toFixed(5)).join(' '));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

/** The squad's match LUT from matchTransform(). */
export function matchCube(file, m) {
  writeCube(file, (r, g, b) => {
    let [y, cb, cr] = toYcc(r, g, b);
    y = y * m.gain;
    y = m.pivot + (y - m.pivot) * m.contrast;
    y = y < 0 ? 0 : y;
    y = y > 0.85 ? 0.85 + (1 - 0.85) * Math.tanh((y - 0.85) / 0.15) : y; // soft shoulder: no hard clipping on skin
    cb = cb * m.sat + m.dcb; cr = cr * m.sat + m.dcr;
    return fromYcc(y, cb, cr);
  }, 33, 'squad match');
}

/** Global Heist grade: filmic S-curve, teal shadows / warm highlights, a touch of desaturation. */
export function heistCube(file) {
  writeCube(file, (r, g, b) => {
    const s = (x) => { const k = 0.5 + (x - 0.5) * 1.12; return k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k) * 0.35 + k * 0.65; };
    let [y, cb, cr] = toYcc(s(r), s(g), s(b));
    const sh = 1 - Math.min(1, y / 0.45), hl = Math.max(0, (y - 0.55) / 0.45);
    cb = cb * 0.88 + 0.035 * sh - 0.02 * hl; cr = cr * 0.88 - 0.022 * sh + 0.025 * hl;
    y = 0.025 + y * 0.96; // lifted blacks, rolled-off whites (film print feel)
    return fromYcc(y, cb, cr);
  }, 33, 'zenith heist');
}

/** Lerp helpers exported for tests. */
export const _ycc = { toYcc, fromYcc };
