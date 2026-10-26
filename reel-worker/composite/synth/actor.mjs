// Synthetic green-screen "squad" for testing the composite (no real people are available before 26 Oct).
// THIS IS NOT REAL FOOTAGE. It is a 2.5D mannequin render with the problems real booth footage has:
//   uneven, wrinkled backdrop; green spill on edges and on a white tee; a yellow top (breaks naive keys);
//   hair-like fringe (hundreds of thin semi-transparent strands); motion blur (2 sub-frames, 1/60 shutter);
//   lens softness, phone sharpening halos, sensor noise and 4:2:0 H.264 at a phone bitrate (applied in ffmpeg).
// It also writes the ground-truth matte (<name>-gt.mp4) so the key can be scored against the truth.
//
// Variants: good (booth set up as in the README) and bad (wrinkles, hot spot, subject 0.5 m from the backdrop:
// shadows and heavy spill, warm tungsten mixed in, 1 stop under) for the calibration check.
//
// Run: node reel-worker/composite/synth/actor.mjs --out <dir> [--shots s1,s2,s3,cal] [--variant good|bad] [--seconds 7.2] [--threads 4]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawn } from 'node:child_process';

export const AW = 1920, AH = 1080, AFPS = 30;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function hash(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; }
// tiled noise texture (fast lookups for cloth grain)
const NT = 256, NTEX = new Float32Array(NT * NT);
for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) NTEX[y * NT + x] = vnoise(x / 8, y / 8, 5) * 0.6 + vnoise(x / 2, y / 2, 9) * 0.4;
const ntex = (x, y) => NTEX[((y | 0) & (NT - 1)) * NT + ((x | 0) & (NT - 1))];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the people
const SKIN = [[0.30, 0.17, 0.11], [0.40, 0.24, 0.155], [0.22, 0.12, 0.075]];
const CLOTH = [
  { c: [0.022, 0.022, 0.027], tex: 0.25 }, // black hoodie
  { c: [0.62, 0.62, 0.60], tex: 0.08 },    // white tee: shows spill
  { c: [0.58, 0.40, 0.05], tex: 0.12 },    // mustard top: a naive (G - avg) key eats this
];
const HAIR = [0.018, 0.013, 0.010];
const KEY = norm([-0.45, -0.55, 0.7]), FILL = norm([0.6, -0.05, 0.8]);
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

/** strands of a head, in head-local units (head rx=1, ry=1.4), made once per person */
export function makeStrandsExport(seed, n) { return makeStrands(seed, n); }
function makeStrands(seed, n = 300) {
  const R = rng(seed), out = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * (0.02 + 0.96 * R()); // along the upper outline of the hair mass
    out.push({ a, r0: 0.9 + R() * 0.1, len: 0.1 + R() * 0.28, bend: (R() - 0.5) * 0.6, wid: 0.7 + R() * 1.0, op: 0.3 + R() * 0.5, ph: R() * 6.28 });
  }
  return out;
}

/** pose of person k in shot at time t -> geometry in pixels */
function pose(shot, k, t, variant) {
  const base = [560, 960, 1360][k];
  let x = base, sy = 440, s = 1, lean = 0, tilt = 0, armL = 0.15, armR = -0.15, foreL = 0.2, foreR = -0.2, glasses = false, mouth = 0.1, look = 0, phone = false;
  const ph = k * 1.7;
  const breathe = Math.sin(t * 1.6 + ph) * 3;
  if (shot === 's1') { // huddle: lean in and down over the phone in the middle one's hands
    const inT = smooth(0.2, 1.6, t);
    lean = (k - 1) * -0.10 * inT; tilt = (k - 1) * -0.12 * inT + Math.sin(t * 0.9 + ph) * 0.03;
    x = base + (1 - k) * 70 * inT; sy = 440 + 55 * inT + breathe;
    armL = 0.3; armR = -0.3; foreL = -1.45; foreR = 1.45; phone = k === 1; look = 0.25 * inT;
    if (t > 5.2 && k === 0) look = 0.25 - smooth(5.2, 5.6, t) * 0.5; // one looks up at the camera
  } else if (shot === 's2') { // slow walk towards camera, sunglasses on
    const order = [0.93, 1.0, 0.95][k];
    s = order * (1 + 0.035 * t);
    const step = t * Math.PI * 1.6 + ph * 0.3;
    sy = 470 - Math.abs(Math.sin(step)) * 14 * s + (1 - order) * 260 - t * 6;
    x = 960 + (base - 960) * (1.06 + 0.02 * t);
    tilt = Math.sin(step) * 0.035; lean = Math.sin(step) * 0.02;
    armL = 0.12 + Math.sin(step) * 0.22; armR = -0.12 + Math.sin(step) * 0.22; foreL = armL + 0.25; foreR = armR - 0.25;
    glasses = true; mouth = 0.05;
  } else if (shot === 's3') { // "Zenith!": arms up, jump
    const up = smooth(0.5 + k * 0.12, 1.1 + k * 0.12, t);
    const jump = Math.max(0, Math.sin((t - 0.9) * 5.2 + ph)) * 40 * up;
    sy = 450 - jump; tilt = Math.sin(t * 2.6 + ph) * 0.06 * up;
    armL = mix(0.15, 2.65 + Math.sin(t * 6 + ph) * 0.12, up); armR = mix(-0.15, -2.65 - Math.sin(t * 6 + ph) * 0.12, up);
    foreL = armL + mix(0.2, -0.35, up); foreR = armR - mix(0.2, -0.35, up);
    mouth = mix(0.1, 0.9 * (0.6 + 0.4 * Math.abs(Math.sin(t * 4 + ph))), up);
  } else { // 'cal': stand on the marks, small natural motion (calibration clip)
    sy = 440 + breathe; tilt = Math.sin(t * 0.7 + ph) * 0.03; armL = 0.12; armR = -0.12; foreL = 0.25; foreR = -0.25;
  }
  if (variant === 'bad') { sy += 0; }
  return { x, sy, s, lean, tilt, armL, armR, foreL, foreR, glasses, mouth, look, phone };
}

// ---------------------------------------------------------------- raster with ground-truth alpha
class Layer {
  constructor() { this.c = new Float32Array(AW * AH * 3); this.a = new Float32Array(AW * AH); this.n = new Float32Array(AW * AH); }
  // paint with coverage `cov` (0..1) colour col, edge factor e (0 inside .. 1 at silhouette) kept for spill
  put(i, cov, r, g, b, e) {
    const j = i * 3, k = 1 - cov;
    this.c[j] = this.c[j] * k + r * cov; this.c[j + 1] = this.c[j + 1] * k + g * cov; this.c[j + 2] = this.c[j + 2] * k + b * cov;
    this.a[i] = this.a[i] * k + cov; this.n[i] = this.n[i] * k + e * cov;
  }
}
function shade(nx, ny, nz, alb, gloss = 0) {
  const k = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]), f = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
  const l = 0.1 + k * 1.05 + f * 0.32;
  const spec = gloss ? Math.pow(clamp(nz * 0.75 + k * 0.25), 24) * gloss : 0;
  return [alb[0] * l + spec, alb[1] * l + spec, alb[2] * l + spec];
}
/** Capsule a->b radius r0->r1, shaded as a cylinder. */
function capsule(L, ax, ay, bx, by, r0, r1, alb, tex = 0, seed = 1) {
  const pad = Math.max(r0, r1) + 2;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad)), x1 = Math.min(AW - 1, Math.ceil(Math.max(ax, bx) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad)), y1 = Math.min(AH - 1, Math.ceil(Math.max(ay, by) + pad));
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, len = Math.sqrt(L2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2);
    const cx = ax + dx * t, cy = ay + dy * t, r = mix(r0, r1, t);
    const ex = px - cx, ey = py - cy, d = Math.hypot(ex, ey);
    const cov = clamp(r - d + 0.5);
    if (cov <= 0) continue;
    const q = clamp(d / r), nz = Math.sqrt(1 - q * q);
    const nx = (ex / (d || 1)) * q, ny = (ey / (d || 1)) * q;
    let a = alb;
    if (tex) { const n = ntex(px * 0.6 + seed * 37, py * 0.6); const m = 1 - tex + tex * 2 * n; a = [alb[0] * m, alb[1] * m, alb[2] * m]; }
    const s = shade(nx, ny, nz, a);
    L.put(y * AW + x, cov, s[0], s[1], s[2], 1 - nz);
  }
}
/** Ellipse (rotated), shaded as an ellipsoid; fn(lx,ly) may tint (face features). */
function ellipsoid(L, cx, cy, rx, ry, rot, alb, fn = null, gloss = 0) {
  const R = Math.max(rx, ry) + 2, c = Math.cos(rot), s = Math.sin(rot);
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(AH - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(AW - 1, Math.ceil(cx + R)); x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    const lx = (px * c + py * s) / rx, ly = (-px * s + py * c) / ry;
    const q = Math.hypot(lx, ly), sd = (q - 1) * Math.min(rx, ry);
    const cov = clamp(0.5 - sd);
    if (cov <= 0) continue;
    const qq = clamp(q), nz = Math.sqrt(1 - qq * qq);
    let a = alb;
    if (fn) { a = fn(lx, ly, a); if (!a) continue; }
    const sh = shade(lx * 0.9, ly * 0.9, nz, a, gloss);
    L.put(y * AW + x, cov, sh[0], sh[1], sh[2], 1 - nz);
  }
}
/** Thin semi-transparent stroke (a hair strand). */
function strand(L, pts, wid, op, col) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - 2)), x1 = Math.min(AW - 1, Math.ceil(Math.max(ax, bx) + 2));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 2)), y1 = Math.min(AH - 1, Math.ceil(Math.max(ay, by) + 2));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const w = wid * (1 - k / pts.length * 0.6), o = op * (1 - k / pts.length * 0.5);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = clamp(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2);
      const d = Math.hypot(x + 0.5 - ax - dx * t, y + 0.5 - ay - dy * t);
      const cov = clamp(w / 2 - d + 0.5) * o;
      if (cov <= 0.01) continue;
      const i = y * AW + x;
      if (L.a[i] > 0.98 && L.n[i] < 0.5) continue; // inside the hair mass already
      L.put(i, cov, col[0], col[1], col[2], 1);
    }
  }
}

function drawPerson(L, k, P, strands) {
  const s = P.s, sk = SKIN[k], cl = CLOTH[k];
  const X = (lx, ly) => P.x + (lx * Math.cos(P.lean) - ly * Math.sin(P.lean)) * s;
  const Y = (lx, ly) => P.sy + (lx * Math.sin(P.lean) + ly * Math.cos(P.lean)) * s;
  // torso + shoulders
  capsule(L, X(-140, 40), Y(-140, 40), X(140, 40), Y(140, 40), 92 * s, 92 * s, cl.c, cl.tex, 10 + k);
  capsule(L, X(0, 120), Y(0, 120), X(0, 900), Y(0, 900), 205 * s, 225 * s, cl.c, cl.tex, 10 + k);
  // neck
  capsule(L, X(0, -95), Y(0, -95), X(0, 20), Y(0, 20), 40 * s, 44 * s, sk.map((c) => c * 0.8));
  // head + face
  const hx = X(0, -205) + P.look * 0 , hy = Y(0, -205), rx = 84 * s, ry = 112 * s, rot = P.tilt + P.lean;
  const fx = P.look * -0.15; // face features shift when looking down
  ellipsoid(L, X(-86, -200), Y(-86, -200), 16 * s, 28 * s, rot, sk.map((c) => c * 0.9)); // ears
  ellipsoid(L, X(86, -200), Y(86, -200), 16 * s, 28 * s, rot, sk.map((c) => c * 0.9));
  ellipsoid(L, hx, hy, rx, ry, rot, sk, (lx, ly, a) => {
    const fy = ly - P.look * 0.18;
    let m = 1;
    const eye = Math.min(Math.hypot((lx + 0.36) / 0.13, (fy + 0.1) / 0.06), Math.hypot((lx - 0.36) / 0.13, (fy + 0.1) / 0.06));
    if (eye < 1) m = 0.25;
    const brow = Math.min(Math.hypot((lx + 0.36) / 0.2, (fy + 0.27) / 0.035), Math.hypot((lx - 0.36) / 0.2, (fy + 0.27) / 0.035));
    if (brow < 1) return HAIR;
    if (Math.abs(lx - fx) < 0.06 && fy > -0.05 && fy < 0.3) m *= 0.8; // nose shadow
    const mo = Math.hypot(lx / 0.25, (fy - 0.52) / (0.03 + 0.1 * P.mouth));
    if (mo < 1) return [0.08, 0.02, 0.02];
    if (P.glasses && (Math.hypot((lx + 0.36) / 0.3, (fy + 0.1) / 0.17) < 1 || Math.hypot((lx - 0.36) / 0.3, (fy + 0.1) / 0.17) < 1 || (Math.abs(fy + 0.14) < 0.03 && Math.abs(lx) < 0.12))) return [0.012, 0.012, 0.016];
    return a.map((c) => c * m);
  }, P.glasses ? 0.05 : 0.02);
  // hair mass (top/back of the head) + strands
  ellipsoid(L, X(0, -262), Y(0, -262), 92 * s, 70 * s, rot, HAIR, (lx, ly) => (ly < 0.55 ? HAIR : null), 0.004);
  const c = Math.cos(rot), sn = Math.sin(rot), mx = X(0, -262), my = Y(0, -262), mrx = 92 * s, mry = 70 * s;
  for (const st of strands) {
    const pts = [];
    const ux = Math.cos(st.a), uy = Math.sin(st.a); // outward direction at the root (mass-local)
    for (let j = 0; j <= 3; j++) {
      const u = j / 3, r = st.r0 + st.len * u;
      const lx = ux * r + st.bend * u * u * 0.3, ly = uy * r + u * u * st.len * 0.9 + Math.sin(u * 3 + st.ph) * 0.015; // gravity pulls the tips down
      const px = lx * mrx, py = ly * mry;
      pts.push([mx + px * c - py * sn, my + px * sn + py * c]);
    }
    strand(L, pts, st.wid * s, st.op, HAIR);
  }
  // arms (upper arm from the shoulder, forearm from the elbow)
  for (const side of [-1, 1]) {
    // angles from straight down, positive = outward on that side (armR/foreR are stored mirrored)
    const ang = side < 0 ? P.armL : -P.armR, fang = side < 0 ? P.foreL : -P.foreR;
    const sx = X(side * 175, 70), sy = Y(side * 175, 70);
    const ex = sx + side * Math.sin(ang) * 300 * s, ey = sy + Math.cos(ang) * 300 * s;
    const wx = ex + side * Math.sin(fang) * 260 * s, wy = ey + Math.cos(fang) * 260 * s;
    capsule(L, sx, sy, ex, ey, 58 * s, 48 * s, cl.c, cl.tex, 20 + k);
    capsule(L, ex, ey, wx, wy, 46 * s, 36 * s, k === 1 ? sk : cl.c, k === 1 ? 0 : cl.tex, 30 + k);
    ellipsoid(L, wx + side * Math.sin(fang) * 30 * s, wy + Math.cos(fang) * 30 * s, 40 * s, 50 * s, -side * fang, sk);
  }
  if (P.phone) { // phone held at the chest, screen glowing
    const px = X(0, 300), py = Y(0, 300);
    ellipsoid(L, px, py, 70 * s, 38 * s, 0, [0.01, 0.01, 0.012], (lx, ly) => (Math.abs(lx) < 0.85 && Math.abs(ly) < 0.7 ? [0.35, 0.55, 0.7] : [0.01, 0.01, 0.012]), 0.1);
  }
}

// ---------------------------------------------------------------- backdrop + spill
function backdrop(variant) {
  const B = new Float32Array(AW * AH * 3);
  const bad = variant === 'bad';
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    const u = x / AW, v = y / AH;
    const vig = 1 - 0.22 * ((u - 0.5) ** 2 * 2.2 + (v - 0.45) ** 2 * 2.4);
    const folds = 1 + (bad ? 0.16 : 0.035) * Math.sin(u * 23 + Math.sin(v * 3) * 1.5) * (0.6 + 0.4 * vnoise(u * 6, v * 2, 3)) + (bad ? 0.07 : 0.015) * (vnoise(u * 40, v * 9, 4) - 0.5);
    const hot = bad ? 1 + 0.45 * Math.exp(-((u - 0.72) ** 2 + (v - 0.3) ** 2) / 0.02) : 1;
    const side = bad ? 1 - 0.3 * u : 1;
    const g = 0.40 * vig * folds * hot * side;
    const i = (y * AW + x) * 3;
    B[i] = 0.055 * vig * folds * (bad ? 1.6 : 1); B[i + 1] = g; B[i + 2] = 0.10 * vig * folds * (bad ? 0.75 : 1);
  }
  return B;
}

/** One frame (motion blurred over 2 sub-frames). Returns { rgb: Buffer, gt: Buffer } */
export function renderFrame(shot, variant, i, strandsAll) {
  const subs = shot === 's3' ? [-0.25 / AFPS, 0.25 / AFPS] : [0];
  const acc = new Float32Array(AW * AH * 3), accA = new Float32Array(AW * AH), accN = new Float32Array(AW * AH);
  for (const dt of subs) {
    const L = new Layer();
    const t = i / AFPS + dt;
    const order = shot === 's2' ? [0, 2, 1] : [0, 1, 2];
    for (const k of order) drawPerson(L, k, pose(shot, k, t, variant), strandsAll[k]);
    for (let j = 0; j < acc.length; j++) acc[j] += L.c[j] / subs.length;
    for (let j = 0; j < accA.length; j++) { accA[j] += L.a[j] / subs.length; accN[j] += L.n[j] / subs.length; }
  }
  const B = BACK[variant] || (BACK[variant] = backdrop(variant));
  const bad = variant === 'bad';
  const spillK = bad ? 0.33 : 0.11, spillFlat = bad ? 0.05 : 0.012, expo = bad ? 0.55 : 1.0;
  const warm = bad ? [1.25, 1.0, 0.72] : [1, 1, 1];
  const rgb = Buffer.allocUnsafe(AW * AH * 3), gt = Buffer.allocUnsafe(AW * AH);
  for (let p = 0; p < AW * AH; p++) {
    const a = accA[p], e = a > 0 ? accN[p] / a : 0, j = p * 3;
    // spill: green bounce on surfaces facing away from camera (edges) + a little everywhere
    const sp = (Math.pow(e, 1.6) * spillK + spillFlat) * a;
    let r = acc[j] * warm[0], g = acc[j + 1] * warm[1] + sp * B[j + 1] * 1.4, b = acc[j + 2] * warm[2] + sp * B[j + 2] * 0.3;
    // cast shadow on the backdrop when the squad stands too close (bad booth)
    let sh = 1;
    if (bad) { const xs = (p % AW) - 70, ys = ((p / AW) | 0) - 20; if (xs >= 0 && ys >= 0) sh = 1 - 0.45 * accA[ys * AW + xs]; }
    r += (1 - a) * B[j] * sh; g += (1 - a) * B[j + 1] * sh; b += (1 - a) * B[j + 2] * sh;
    rgb[j] = enc(r * expo); rgb[j + 1] = enc(g * expo); rgb[j + 2] = enc(b * expo);
    gt[p] = Math.round(clamp(a) * 255);
  }
  return { rgb, gt };
}
const BACK = {};
const GAMMA = new Uint8Array(4097); for (let k = 0; k <= 4096; k++) GAMMA[k] = Math.round(Math.pow(k / 4096, 1 / 2.2) * 255);
function enc(x) { return GAMMA[x <= 0 ? 0 : x >= 1 ? 4096 : (x * 4096) | 0]; }

// ---------------------------------------------------------------- driver
function ff(args) {
  const p = spawn(process.env.FFMPEG_PATH || FF_BIN, ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
  p.done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c} ${err}`)))));
  return p;
}
let FF_BIN = 'ffmpeg';

export async function makeClip({ outDir, shot, variant = 'good', seconds = 7.2, threads = 4, name }) {
  FF_BIN = (await import('../../src/ffmpeg.js')).FFMPEG;
  const frames = Math.round(seconds * AFPS);
  const base = path.join(outDir, name || `actor-${shot}-${variant}`);
  // phone-like camera: lens softness, sharpening halo, sensor noise; H.264 4:2:0 at ~16 Mbit/s (what a phone records at 1080p30)
  const cam = ff(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${AW}x${AH}`, '-r', String(AFPS), '-i', '-',
    '-vf', `gblur=sigma=0.7,unsharp=5:5:0.9:5:5:0,noise=c0s=${variant === 'bad' ? 14 : 7}:c0f=t:c1s=${variant === 'bad' ? 10 : 5}:c1f=t:c2s=${variant === 'bad' ? 10 : 5}:c2f=t`,
    '-c:v', 'libx264', '-preset', 'medium', '-b:v', '16M', '-maxrate', '16M', '-bufsize', '16M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', `${base}.mp4`]);
  const gt = ff(['-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${AW}x${AH}`, '-r', String(AFPS), '-i', '-', '-vf', 'gblur=sigma=0.7', '-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-pix_fmt', 'yuv420p', `${base}-gt.mp4`]);
  const here = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: threads }, (_, w) => new Worker(here, { workerData: { shot, variant, w, threads, frames } }));
  const pending = new Map(); let next = 0;
  await new Promise((resolve, reject) => {
    let doneW = 0;
    const flush = async () => {
      while (pending.has(next)) {
        const f = pending.get(next); pending.delete(next);
        if (!cam.stdin.write(Buffer.from(f.rgb))) await new Promise((r) => cam.stdin.once('drain', r));
        if (!gt.stdin.write(Buffer.from(f.gt))) await new Promise((r) => gt.stdin.once('drain', r));
        next++;
      }
      if (next === frames) resolve();
    };
    let chain = Promise.resolve();
    for (const wk of workers) {
      wk.on('message', (m) => { pending.set(m.i, m); chain = chain.then(flush); });
      wk.on('error', reject);
      wk.on('exit', () => { doneW++; });
    }
  });
  cam.stdin.end(); gt.stdin.end();
  await Promise.all([cam.done, gt.done]);
  workers.forEach((w) => w.terminate());
  return { file: `${base}.mp4`, gt: `${base}-gt.mp4`, frames };
}

if (!isMainThread && workerData) {
  const { shot, variant, w, threads, frames } = workerData;
  const strandsAll = [makeStrands(101), makeStrands(202), makeStrands(303)];
  for (let i = w; i < frames; i += threads) {
    const f = renderFrame(shot, variant, i, strandsAll);
    parentPort.postMessage({ i, rgb: f.rgb, gt: f.gt }, [f.rgb.buffer, f.gt.buffer].filter((b) => b.byteLength > 8192));
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const outDir = arg('out', '.');
  fs.mkdirSync(outDir, { recursive: true });
  const shots = arg('shots', 's1,s2,s3').split(',');
  const variant = arg('variant', 'good');
  const seconds = Number(arg('seconds', '7.2'));
  const threads = Number(arg('threads', '4'));
  for (const shot of shots) {
    const t0 = Date.now();
    const r = await makeClip({ outDir, shot, variant, seconds: shot === 'cal' ? Math.min(seconds, 5) : seconds, threads });
    console.log(JSON.stringify({ shot, variant, ms: Date.now() - t0, ...r }));
  }
}
