// Zenith Heist plates, made in code (placeholders: no downloads, no vendor, no people).
//
// For every storyboard shot this writes, into <out>/:
//   <shot>-bg.mp4      the plate behind the squad (1080x1920, 30 fps, animated: haze, lasers, flicker, dust)
//   <shot>-fgmul.mp4   foreground MULTIPLY layer (occluders: table edge, vault-door edge, crowd heads; vignette). white = no change
//   <shot>-fgadd.mp4   foreground ADD layer (lasers in front, hologram, light cones, dust, rim on the occluders)
//                      comp = (plate+squad) * fgmul + fgadd  == premultiplied "over", so no alpha video is needed
//   <shot>-light.png   light field for the squad layer (hardlight, 128 = neutral): where the plate's light falls on them
//   <shot>-shadow.png  where a contact shadow may land (white = receiver), for the squad's matte
//   meta.json          camera (focal, horizon), squad placement, colour targets for the match LUT, durations
//
// Camera model shared with the booth (README "Booth"): the squad is shot landscape 1920x1080 on a 2x lens from 2.7 m,
// centre-cropped to 1440x1080 and placed into the plate at scale 0.75 (1080x810, bottom-aligned). That makes the plate focal 2083 px
// and the horizon (camera height 1.35 m, level) y = 1515 px. Plates are rendered with that pinhole camera, so the
// squad's perspective and eye line match the room.
//
// Run: node reel-worker/composite/plates.js --out <dir> [--shots s1,s2,s3] [--seconds 7.2]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Img, clamp, mix, smooth, fbm, vnoise, rng, blur, blurFast, bloom, addInto, glowSegment, sdBox, paintSDF, toRGB24, toRGB24Linear } from './lib/raster.js';
import { encodeFrames, writePng } from './lib/encode.js';

export const PLATE_VERSION = 'p1';
export const W = 1080, H = 1920, FPS = 30;
export const F = 2083, CX = 540, CY = 1515;
// booth frame 1920x1080 -> centre 1440x1080 crop (people stay inside the floor marks) -> 1080x810, bottom-aligned
export const SQUAD = { crop: '1440:1080:240:0', scale: 0.75, x: 0, y: H - 810, w: 1080, h: 810 };
export const SHOT_S = { s1: 7.2, s2: 4.8, s3: 7.2 }; // storyboard lengths (12/8/12 beats at 100 bpm)

const proj = (x, y, z) => [CX + (x / z) * F, CY - (y / z) * F];
const TEAL = [0.35, 0.78, 1.0], AMBER = [1.0, 0.52, 0.16], RED = [1.0, 0.06, 0.04], GOLD = [1.0, 0.72, 0.32];

// ---------------------------------------------------------------- helpers
const HW = W / 2, HH = H / 2;
/** Add a half-res image into a full-res one (bilinear), dst += k * up(src). */
function addUp(dst, src, k = 1) {
  const d = dst.d, s = src.d, w = src.w, h = src.h;
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / 2 - 0.5)), iy = fy | 0, uy = fy - iy;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / 2 - 0.5)), ix = fx | 0, ux = fx - ix;
      const i00 = (iy * w + ix) * 3, i01 = i00 + w * 3, o = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const a = s[i00 + c] + (s[i00 + 3 + c] - s[i00 + c]) * ux, b = s[i01 + c] + (s[i01 + 3 + c] - s[i01 + c]) * ux;
        d[o + c] += (a + (b - a) * uy) * k;
      }
    }
  }
}
/** Expensive stills are cached as raw float files (CACHE dir), so a re-run only redoes the animation. */
let CACHE = null;
export function setCache(dir) { CACHE = dir; if (dir) fs.mkdirSync(dir, { recursive: true }); }
function cached(name, make) {
  const f = CACHE && path.join(CACHE, `${PLATE_VERSION}-${name}.f32`);
  if (f && fs.existsSync(f)) { const b = fs.readFileSync(f); return new Img(W, H, new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice()); }
  const img = make();
  if (f) fs.writeFileSync(f, Buffer.from(img.d.buffer));
  return img;
}
function forEachPixel(img, fn) {
  const { w, h, d } = img; const c = [0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    c[0] = c[1] = c[2] = 0;
    fn(x + 0.5, y + 0.5, c);
    const i = (y * w + x) * 3; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  return img;
}
function vignette(strength = 0.55, inner = 0.45, outer = 1.25) {
  const m = new Img(W, H);
  forEachPixel(m, (x, y, c) => {
    const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2) * 0.82;
    const v = 1 - strength * smooth(inner, outer, Math.hypot(nx, ny));
    c[0] = c[1] = c[2] = v;
  });
  return m;
}
/** Quarter-res drifting haze field (0..1), sampled bilinear at full res via hazeAt. */
function hazeField(t, seed, scale = 0.006, drift = [0.02, -0.035]) {
  const w = W / 4, h = H / 4, a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x * 4 * scale + drift[0] * t * 30 * scale * 40, Y = y * 4 * scale * 1.4 + drift[1] * t * 30 * scale * 40;
    a[y * w + x] = fbm(X, Y, seed, 3) * 0.7 + fbm(X * 2.7 + 9 - t * 0.05, Y * 2.7, seed + 5, 2) * 0.3;
  }
  return { w, h, a };
}
function hazeAt(f, x, y) {
  const fx = clamp(x / 4 - 0.5, 0, f.w - 1.001), fy = clamp(y / 4 - 0.5, 0, f.h - 1.001);
  const ix = fx | 0, iy = fy | 0, ux = fx - ix, uy = fy - iy, i = iy * f.w + ix;
  const a = f.a[i] + (f.a[i + 1] - f.a[i]) * ux, b = f.a[i + f.w] + (f.a[i + f.w + 1] - f.a[i + f.w]) * ux;
  return a + (b - a) * uy;
}
/** Add haze lit by a blurred light map: img += lightmap * haze * k */
function addHaze(img, light, field, k, floor = 0.35) {
  // computed at half res (the haze is soft anyway), then added bilinear
  const half = new Img(HW, HH), d = half.d, L = light.d;
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const hz = floor + (1 - floor) * smooth(0.25, 0.85, hazeAt(field, x * 2 + 1, y * 2 + 1));
    const i = (y * HW + x) * 3, j = ((y * 2 + 1) * W + x * 2 + 1) * 3;
    d[i] = L[j] * hz * k; d[i + 1] = L[j + 1] * hz * k; d[i + 2] = L[j + 2] * hz * k;
  }
  addUp(img, half);
}
/** Soft round dot (bokeh-ish) additive. */
function dot(img, x, y, r, col, gain) {
  const x0 = Math.max(0, Math.floor(x - r * 2.2)), x1 = Math.min(W - 1, Math.ceil(x + r * 2.2));
  const y0 = Math.max(0, Math.floor(y - r * 2.2)), y1 = Math.min(H - 1, Math.ceil(y + r * 2.2));
  const d = img.d;
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const q = Math.hypot(xx + 0.5 - x, yy + 0.5 - y) / r;
    const a = (q < 1 ? 0.85 + 0.15 * q * q : Math.exp(-(q - 1) * 4) * 0.9) * gain; // flat bokeh disc with a soft edge
    if (a < 0.003) continue;
    const i = (yy * W + xx) * 3; d[i] += col[0] * a; d[i + 1] += col[1] * a; d[i + 2] += col[2] * a;
  }
}
function dust(n, seed, box) {
  const R = rng(seed);
  return Array.from({ length: n }, () => ({
    x: mix(box.x[0], box.x[1], R()), y: mix(box.y[0], box.y[1], R()), z: mix(box.z[0], box.z[1], R()),
    vx: (R() - 0.5) * 0.05, vy: (R() - 0.3) * 0.06, ph: R() * 6.28, b: 0.4 + R() * 0.6,
  }));
}
function drawDust(img, motes, t, col, zMin, zMax, focusZ = 2.7) {
  for (const m of motes) {
    if (m.z < zMin || m.z >= zMax) continue;
    const x = m.x + m.vx * t + Math.sin(t * 0.7 + m.ph) * 0.03, y = m.y + m.vy * t + Math.cos(t * 0.5 + m.ph) * 0.02;
    const [sx, sy] = proj(x, y, m.z);
    if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
    const coc = 1.2 + Math.abs(1 / m.z - 1 / focusZ) * 55; // defocus circle
    const tw = 0.6 + 0.4 * Math.sin(t * 2.3 + m.ph * 3);
    dot(img, sx, sy, coc, col, (m.b * tw * 0.9) / (coc * 0.6 + 0.4));
  }
}
/** Laser beam between two 3D points, with a little haze scatter and an emitter dot at each end. */
function laser(img, a, b, gain = 1, core = 1.1, glow = 9) {
  const [x0, y0] = proj(...a), [x1, y1] = proj(...b);
  glowSegment(img, x0, y0, x1, y1, RED, core, glow, gain);
  glowSegment(img, x0, y0, x1, y1, [1, 0.35, 0.3], 0.35, 2.5, gain * 0.9); // hot core
  dot(img, x0, y0, 3, RED, 1.6 * gain); dot(img, x1, y1, 3, RED, 1.6 * gain);
}

// ---------------------------------------------------------------- shot 2: the vault hall (hero plate)
// Hall 6 m wide (x +-3), floor y=-1.35, ceiling y=+4.65, round vault door at z=16 (centre y=+1.85, r 2.3 / frame 2.7)
const HALL = { xw: 3, fy: -1.35, cy: 4.65, zb: 16, door: { y: 1.85, r: 2.3, R: 2.7 } };
const SPOTS = [[-1.4, 6.5], [1.4, 6.5], [-1.4, 10], [1.4, 10], [-1.4, 13.5], [1.4, 13.5]];

function hallSurface(ox, oy, oz, dx, dy, dz, refl, out) {
  // intersect walls / ceiling / back (and the floor unless refl)
  let t = 1e9, kind = 0;
  if (dy < 0 && !refl) { const tt = (HALL.fy - oy) / dy; if (tt > 0 && tt < t) { t = tt; kind = 1; } }
  if (dy > 0) { const tt = (HALL.cy - oy) / dy; if (tt > 0 && tt < t) { t = tt; kind = 2; } }
  if (dx !== 0) { const tt = ((dx > 0 ? HALL.xw : -HALL.xw) - ox) / dx; if (tt > 0 && tt < t) { t = tt; kind = 3; } }
  { const tt = (HALL.zb - oz) / dz; if (tt > 0 && tt < t) { t = tt; kind = 4; } }
  const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
  let r = 0, g = 0, b = 0;
  const amberNear = Math.exp(-(HALL.zb - pz) / 3.2); // warm spill from the door seam
  if (kind === 3) { // walls: vertical LED strips every 2 m, dark panels lit by them
    const dzs = ((((pz - 1) % 2) + 2) % 2) - 1;
    const fz = (pz * pz) / (HALL.xw * F) + 0.002;
    const v = py - HALL.fy;
    const strip = clamp((0.06 - Math.abs(dzs)) / fz + 0.5) * smooth(0.1, 0.2, v) * (1 - smooth(4.0, 4.15, v));
    const lit = 0.9 / (1 + (dzs / 0.45) ** 2) + 0.12;
    const seam = 1 - 0.5 * clamp(1 - Math.abs(((v % 1.2) + 1.2) % 1.2 - 0.6) * 0, 0, 1) * 0;
    const grime = 0.7 + 0.6 * fbm(pz * 0.8, v * 1.6, 3, 3);
    const hseam = clamp(1 - (Math.abs((((v + 0.6) % 1.2) + 1.2) % 1.2 - 0.6) - 0.585) / -0.02) ;
    const alb = 0.035 * grime * seam * (1 - 0.6 * (1 - hseam));
    r = alb * lit * TEAL[0] + strip * 3.2 * 0.75 + alb * amberNear * 6 * AMBER[0];
    g = alb * lit * TEAL[1] + strip * 3.2 * 0.93 + alb * amberNear * 6 * AMBER[1];
    b = alb * lit * TEAL[2] + strip * 3.2 * 1.0 + alb * amberNear * 6 * AMBER[2];
  } else if (kind === 2) { // ceiling: dark coffers, round downlights
    let e = 0;
    for (const [sx, sz] of SPOTS) { const q = Math.hypot(px - sx, pz - sz); e += clamp((0.2 - q) / (pz * pz / (HALL.cy * F) + 0.004) + 0.5); }
    const beam = Math.abs((((pz % 3) + 3) % 3) - 1.5) > 1.38 ? 0.35 : 1;
    const alb = 0.02 * beam * (0.7 + 0.6 * fbm(px * 0.7, pz * 0.7, 9, 3));
    r = alb * 0.5 + e * 6 * 1.0; g = alb * 0.7 + e * 6 * 0.86; b = alb * 0.9 + e * 6 * 0.7;
  } else if (kind === 1) { // floor: polished dark tiles, pools of light under the spots
    let pool = 0;
    for (const [sx, sz] of SPOTS) pool += Math.exp(-(((px - sx) ** 2) + ((pz - sz) ** 2) * 0.6) / 0.9);
    const tile = (Math.abs((((px + 0.5) % 1) + 1) % 1 - 0.5) > 0.485 || Math.abs((((pz) % 1) + 1) % 1 - 0.5) > 0.485) ? 0.45 : 1;
    const alb = 0.03 * tile * (0.75 + 0.5 * fbm(px * 1.3, pz * 1.3, 4, 3));
    r = alb * (0.3 + pool * 1.4 * 1.0 + amberNear * 5 * AMBER[0]);
    g = alb * (0.4 + pool * 1.4 * 0.88 + amberNear * 5 * AMBER[1]);
    b = alb * (0.5 + pool * 1.4 * 0.75 + amberNear * 5 * AMBER[2]);
  } else { // back wall + vault door
    const D = HALL.door, qx = px, qy = py - D.y, rr = Math.hypot(qx, qy), th = Math.atan2(qy, qx);
    const fp = pz / F * 1.0; // metres per pixel
    let alb = 0.03 * (0.7 + 0.6 * fbm(px * 0.9, py * 0.9, 12, 3)), em = [0, 0, 0];
    let lit = 0.25 + 0.75 * smooth(-1, 3, py); // spots above light the top
    if (rr < D.R + 0.02) {
      if (rr > D.r) { // frame ring with bolts
        alb = 0.07 * (0.8 + 0.4 * vnoise(th * 40, rr * 10, 5));
        const bolt = Math.hypot(rr - 2.5, (((th / (Math.PI * 2 / 24)) % 1 + 1) % 1 - 0.5) * (Math.PI * 2 / 24) * 2.5);
        if (bolt < 0.075) { alb = 0.22; lit *= 1.4; }
      } else { // door face: concentric grooves, brushed metal, hub wheel
        const groove = 0.75 + 0.25 * Math.sin(rr * 26) ** 8;
        alb = 0.09 * groove * (0.85 + 0.3 * vnoise(th * 60, rr * 3, 8));
        lit *= 0.8 + 0.4 * Math.max(0, Math.cos(th - 1.2));
        if (rr < 0.95) {
          alb = 0.13;
          const ringD = Math.abs(rr - 0.8);
          let wheel = ringD < 0.06 ? 1 : 0;
          for (let k = 0; k < 3; k++) { const a = th + k * Math.PI / 3 + 0.3; const s = Math.abs(Math.sin(a)) * rr; if (s < 0.05 && rr < 0.82) wheel = 1; }
          if (wheel) { alb = 0.3; lit *= 1.3; }
          if (rr < 0.16) alb = 0.25;
        }
      }
      const seam = Math.abs(rr - D.r);
      const sk = clamp((0.035 - seam) / fp + 0.5) * 7 + Math.exp(-seam / 0.06) * 0.8;
      em = [AMBER[0] * sk, AMBER[1] * sk, AMBER[2] * sk];
      const hubSeam = Math.abs(rr - 0.97); const hk = clamp((0.015 - hubSeam) / fp + 0.5) * 2.5;
      em[0] += AMBER[0] * hk; em[1] += AMBER[1] * hk; em[2] += AMBER[2] * hk;
    } else {
      // panels around the door, two red status lamps
      const pan = (Math.abs((((px) % 1.5) + 1.5) % 1.5 - 0.75) > 0.735) ? 0.5 : 1;
      alb *= pan;
      for (const sx of [-2.75, 2.75]) { const q = Math.hypot(px - sx, py - 0.5); const k = clamp((0.06 - q) / fp + 0.5) * 6 + Math.exp(-q / 0.12) * 0.3; em[0] += RED[0] * k; em[1] += RED[1] * k; em[2] += RED[2] * k; }
    }
    r = alb * lit * 1.05 + alb * 0.9 * AMBER[0] * Math.exp(-Math.abs(rr - D.r) / 0.5) * 3 + em[0];
    g = alb * lit * 1.0 + alb * 0.9 * AMBER[1] * Math.exp(-Math.abs(rr - D.r) / 0.5) * 3 + em[1];
    b = alb * lit * 0.95 + alb * 0.9 * AMBER[2] * Math.exp(-Math.abs(rr - D.r) / 0.5) * 3 + em[2];
  }
  out[0] = r; out[1] = g; out[2] = b; out[3] = t; out[4] = kind; out[5] = px; out[6] = py; out[7] = pz;
  return out;
}

function hallBase() {
  const img = new Img(W, H), refl = new Img(W, H);
  const s = new Float64Array(8), s2 = new Float64Array(8);
  const sig = 0.035, fog = [0.010, 0.018, 0.026];
  const { d } = img, rd = refl.d;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - CX) / F, dy = -(y + 0.5 - CY) / F, dz = 1;
    hallSurface(0, 0, 0, dx, dy, dz, false, s);
    let [r, g, b] = s; const t = s[3], kind = s[4];
    const i = (y * W + x) * 3;
    if (kind === 1) { // floor reflection
      const n = Math.hypot(dx, dy, dz), cos = Math.abs(dy) / n;
      const fr = 0.05 + 0.6 * (1 - cos) ** 5;
      hallSurface(s[5], s[6], s[7], dx, -dy, dz, true, s2);
      const fa = Math.exp(-sig * s2[3]);
      rd[i] = (s2[0] * fa + fog[0] * (1 - fa)) * fr; rd[i + 1] = (s2[1] * fa + fog[1] * (1 - fa)) * fr; rd[i + 2] = (s2[2] * fa + fog[2] * (1 - fa)) * fr;
    }
    // volumetric: march the spot cones and the door glow
    let vr = 0, vg = 0, vb = 0;
    const N = 28, tEnd = Math.min(t, 17);
    for (let k = 0; k < N; k++) {
      const tt = (k + 0.5) / N * tEnd, px = dx * tt, py = dy * tt, pz = tt;
      const den = 0.022 * (0.55 + 0.9 * fbm(px * 0.5, py * 0.4 + pz * 0.15, 21, 2));
      for (const [sx, sz] of SPOTS) {
        const h = HALL.cy - py; if (h < 0) continue;
        const rad = 0.18 + h * 0.2, q = Math.hypot(px - sx, pz - sz);
        if (q < rad) { const w = (1 - (q / rad) ** 2) * Math.exp(-h * 0.12) * 1.3; vr += w * den * 1.0; vg += w * den * 0.86; vb += w * den * 0.72; }
      }
      const dd = Math.hypot(px, py - HALL.door.y, (pz - HALL.zb) * 1.3);
      const gw = 2.2 / (1 + dd * dd * 0.5) * den;
      vr += gw * AMBER[0]; vg += gw * AMBER[1]; vb += gw * AMBER[2];
    }
    const step = tEnd / N;
    const fa = Math.exp(-sig * t);
    d[i] = r * fa + fog[0] * (1 - fa) + vr * step; d[i + 1] = g * fa + fog[1] * (1 - fa) + vg * step; d[i + 2] = b * fa + fog[2] * (1 - fa) + vb * step;
  }
  addInto(img, blur(refl, 2.5, 26)); // wet-floor streaks
  bloom(img, { t: 0.85, radii: [5, 22, 80], gains: [0.3, 0.22, 0.2] });
  return img;
}

const HALL_LASERS_BG = [ // [ [x,y,z], [x,y,z], phase ]
  [[-3, -0.9, 5.2], [3, 0.5, 5.2], 0], [[-3, 0.6, 5.6], [3, -0.7, 5.6], 1.3],
  [[-3, 1.6, 8.5], [3, 2.6, 8.5], 2.1], [[-3, 2.4, 8.8], [3, 1.1, 8.8], 0.6],
  [[-3, -0.2, 11], [3, -0.2, 11], 1.7], [[-3, 3.2, 12], [3, 3.6, 12], 2.9],
];
const HALL_LASERS_FG = [[[-1.7, -0.75, 1.75], [1.9, 0.12, 1.95], 0.4]];

function hallScene() {
  const base = cached('hall', hallBase);
  const light = blurFast(base, 70);
  const vig = vignette(0.6);
  const motes = dust(110, 77, { x: [-2.6, 2.6], y: [-1.2, 3.6], z: [1.6, 14] });
  return {
    id: 's2', name: 'vault hall walk', exposure: 1.15,
    frame(t) {
      const bg = base.clone();
      addHaze(bg, light, hazeField(t, 31), 0.55, 0.25);
      const seamPulse = 0.85 + 0.15 * Math.sin(t * 2.2);
      HALL_LASERS_BG.forEach(([a, b, ph], k) => {
        const sw = Math.sin(t * 0.55 + ph) * 0.25;
        const on = k === 5 ? (Math.sin(t * 3 + ph) > -0.2 ? 1 : 0.15) : 1;
        laser(bg, [a[0], a[1] + sw, a[2]], [b[0], b[1] - sw, b[2]], 0.85 * on * seamPulse, 0.9, 7 + 6 / a[2] * 10);
      });
      drawDust(bg, motes, t, [1.0, 0.9, 0.75], 2.9, 99);
      const add = new Img(W, H);
      HALL_LASERS_FG.forEach(([a, b, ph]) => { const sw = Math.sin(t * 0.4 + ph) * 0.12; laser(add, [a[0], a[1] + sw, a[2]], [b[0], b[1] + sw * 0.5, b[2]], 0.9, 1.6, 14); });
      drawDust(add, motes, t, [1.0, 0.9, 0.75], 0, 2.9);
      return { bg, add, mul: vig };
    },
    // squad light: cool top light from the spots, warm from the door behind (rim via light wrap), red kiss low
    light: { top: [150, 160, 170], mid: [126, 128, 132], low: [104, 104, 110], warmRim: 0.25 },
    target: { lum: 0.34, cb: 0.02, cr: -0.012, contrast: 1.05 }, shadow: null,
  };
}

// ---------------------------------------------------------------- shot 1: briefing room over a hologram table
// back wall z=5.5 with a monitor wall, lamp hanging just behind the squad (z=2.95) = backlight + cone through haze,
// table edge + hologram in front of them (fg), their shadow lands on the table top.
function screenContent(u, v, kind, k) { // u,v 0..1 inside a monitor -> emissive rgb
  const grid = (Math.abs(((u * 16) % 1) - 0.5) > 0.47 || Math.abs(((v * 10) % 1) - 0.5) > 0.46) ? 0.35 : 0.07;
  let c = [TEAL[0] * grid, TEAL[1] * grid, TEAL[2] * grid];
  const cx = u - 0.5, cy = (v - 0.5) * 0.6, r = Math.hypot(cx, cy);
  if (kind === 0) { // vault schematic
    const ring = Math.min(Math.abs(r - 0.22), Math.abs(r - 0.14), Math.abs(r - 0.05));
    if (ring < 0.006) c = [0.8, 1.2, 1.4];
    if (Math.abs(cx) < 0.004 || Math.abs(cy) < 0.004) c = [0.5, 0.8, 1.0];
  } else if (kind === 1) { // radar
    const ring = Math.abs(((r * 14) % 1) - 0.5) > 0.44 ? 0.5 : 0; c = [c[0] + ring * 0.3, c[1] + ring * 0.8, c[2] + ring * 0.9];
    if (r > 0.29) c = [0.03, 0.06, 0.08];
  } else if (kind === 2) { // bars + code lines
    const bar = Math.floor(u * 9); const hgt = 0.25 + 0.6 * vnoise(bar * 3.1, k, 4);
    if ((u * 9) % 1 < 0.7 && 1 - v < hgt * 0.55) c = [0.3, 0.9, 1.1];
    if (v < 0.4 && ((v * 22) % 1) < 0.45 && u < 0.2 + 0.7 * vnoise(Math.floor(v * 22), k + 2, 6)) c = [0.55, 0.9, 1.0];
  } else if (kind === 3) { // map with dots
    const land = fbm(u * 5 + k, v * 4, 14, 3) > 0.52 ? 0.45 : 0.08; c = [TEAL[0] * land * 0.7, TEAL[1] * land, TEAL[2] * land];
  } else { // red alert panel
    const stripe = ((u + v) * 12) % 1 < 0.5 ? 0.9 : 0.3; c = [RED[0] * stripe * 0.9, RED[1] * stripe + 0.05, RED[2] * stripe + 0.04];
  }
  return c;
}
const MON = { z: 5.5, w: 1.05, h: 0.62, cols: [-1.12, 0, 1.12], rows: [1.45, 0.76, 0.07] };
function briefBase() {
  const img = new Img(W, H);
  const lamp = [0, 1.25, 2.95];
  forEachPixel(img, (x, y, c) => {
    const dx = (x - CX) / F, dy = -(y - CY) / F;
    let t = MON.z, kind = 4;
    if (dy > 0) { const tt = 2.0 / dy; if (tt < t) { t = tt; kind = 2; } }
    if (dx !== 0) { const tt = 3.2 / Math.abs(dx); if (tt < t) { t = tt; kind = 3; } }
    const px = dx * t, py = dy * t, pz = t;
    const lampD = Math.hypot(px - lamp[0], py - lamp[1], pz - lamp[2]);
    const lampLit = 1.2 / (1 + lampD * lampD * 0.35);
    let alb = 0.03 * (0.7 + 0.6 * fbm(px * 1.1 + pz, py * 1.1, 2, 3)), e = [0, 0, 0];
    if (kind === 4) {
      for (let ci = 0; ci < 3; ci++) for (let ri = 0; ri < 3; ri++) {
        const mx = MON.cols[ci], my = MON.rows[ri];
        const u = (px - (mx - MON.w / 2)) / MON.w, v = 1 - (py - (my - MON.h / 2)) / MON.h;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const kd = [[0, 2, 1], [3, 4, 2], [2, 0, 3]][ri][ci];
          const bez = u < 0.025 || u > 0.975 || v < 0.04 || v > 0.96;
          if (bez) { alb = 0.02; } else { const sc = screenContent(u, v, kd, ci * 3 + ri); const scan = 0.85 + 0.15 * Math.sin(v * 300); const dim = kd === 4 ? 0.5 : 0.75; e = sc.map((q) => q * dim * scan); alb = 0; }
        }
        const dd = sdBox(px, py, mx, my, MON.w / 2, MON.h / 2);
        if (dd > 0 && dd < 0.25) { const k = Math.exp(-dd / 0.08) * 0.08; e = [e[0] + TEAL[0] * k, e[1] + TEAL[1] * k, e[2] + TEAL[2] * k]; }
      }
    } else if (kind === 2) {
      const beam = Math.abs(((px % 0.9) + 0.9) % 0.9 - 0.45) > 0.42 ? 0.4 : 1; alb *= beam * 0.7;
    } else {
      const strip = Math.abs(((pz % 1.6) + 1.6) % 1.6 - 0.8) < 0.03 && py < 1.6 ? 1 : 0; e = [TEAL[0] * strip * 1.2, TEAL[1] * strip * 1.2, TEAL[2] * strip * 1.2];
    }
    const cool = 0.25;
    c[0] = alb * (lampLit * AMBER[0] * 1.2 + cool * TEAL[0] * 0.4) + e[0];
    c[1] = alb * (lampLit * AMBER[1] * 1.2 + cool * TEAL[1] * 0.4) + e[1];
    c[2] = alb * (lampLit * AMBER[2] * 1.2 + cool * TEAL[2] * 0.4) + e[2];
  });
  // depth of field: the wall is 5.5 m, focus at 2.7 m
  const out = blur(img, 9);
  // lamp shade + bulb + cone behind the squad (sharp-ish: 2.95 m is near focus)
  const [lx, ly] = proj(...lamp);
  paintSDF(out, [lx - 260, 0, lx + 260, ly + 80], (x, y) => {
    if (y < ly - 120) return Math.abs(x - lx) < 4 ? [Math.abs(x - lx) - 3, 0.01, 0.01, 0.012] : null; // cable
    const k = clamp((y - (ly - 120)) / 150); const hw = mix(40, 200, k * k);
    const sd = Math.max(Math.abs(x - lx) - hw, (ly - 120) - y, y - (ly + 30));
    const rim = Math.exp(-Math.abs(y - (ly + 30)) / 3) * 0.4;
    return [sd, 0.02 + rim * AMBER[0], 0.02 + rim * AMBER[1], 0.02 + rim * AMBER[2]];
  });
  dot(out, lx, ly + 34, 26, [AMBER[0] * 3, AMBER[1] * 3, AMBER[2] * 3], 2.2);
  bloom(out, { t: 0.8, radii: [6, 30, 90], gains: [0.35, 0.3, 0.25] });
  return out;
}
function cone(img, lx, ly, topW, botW, botY, col, gain, field) {
  const d = img.d;
  for (let y = Math.max(0, Math.floor(ly)); y < Math.min(H, botY); y++) {
    const k = (y - ly) / (botY - ly); const hw = mix(topW, botW, k), fall = Math.exp(-k * 1.4) * (1 - k * 0.3);
    for (let x = Math.max(0, Math.floor(lx - hw * 1.4)); x < Math.min(W, Math.ceil(lx + hw * 1.4)); x++) {
      const q = Math.abs(x - lx) / hw; const prof = q < 1 ? 1 - q * q * 0.6 : Math.exp(-(q - 1) * 6) * 0.4;
      const hz = field ? 0.4 + 0.9 * hazeAt(field, x, y) : 1;
      const a = prof * fall * hz * gain, i = (y * W + x) * 3;
      d[i] += col[0] * a; d[i + 1] += col[1] * a; d[i + 2] += col[2] * a;
    }
  }
}
/** Hologram: a rotating wireframe vault (box + round door) above the table, with scanlines. */
function hologram(img, t) {
  const c0 = [0, -0.2, 2.2], S = 0.15, rot = t * 0.45, tilt = 0.35;
  const P = (x, y, z) => {
    const cr = Math.cos(rot), sr = Math.sin(rot); let X = x * cr - z * sr, Z = x * sr + z * cr, Y = y;
    const ct = Math.cos(tilt), st = Math.sin(tilt); const Y2 = Y * ct - Z * st; Z = Y * st + Z * ct; Y = Y2;
    return proj(c0[0] + X * S, c0[1] + Y * S, c0[2] + Z * S * 0.6);
  };
  const flick = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5.3);
  const col = [0.35, 0.95, 1.2];
  const seg = (a, b, g = 1) => { const p = P(...a), q = P(...b); glowSegment(img, p[0], p[1], q[0], q[1], col, 0.7, 6, 0.3 * g * flick); };
  const v = [-1, 1];
  for (const a of v) for (const b of v) { seg([a, b, -1], [a, b, 1]); seg([a, -1, b], [a, 1, b]); seg([-1, a, b], [1, a, b]); }
  for (let k = 0; k < 24; k++) { const a0 = k / 24 * Math.PI * 2, a1 = (k + 1) / 24 * Math.PI * 2; seg([Math.cos(a0) * 0.7, Math.sin(a0) * 0.7, 1], [Math.cos(a1) * 0.7, Math.sin(a1) * 0.7, 1], 1.1); seg([Math.cos(a0) * 0.35, Math.sin(a0) * 0.35, 1], [Math.cos(a1) * 0.35, Math.sin(a1) * 0.35, 1], 0.8); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + t; seg([0, 0, 1], [Math.cos(a) * 0.35, Math.sin(a) * 0.35, 1], 0.7); }
  // floor grid of the hologram + projector beam from the table
  for (let k = -4; k <= 4; k++) { seg([k / 4, -1.25, -1], [k / 4, -1.25, 1], 0.45); seg([-1, -1.25, k / 4], [1, -1.25, k / 4], 0.45); }
  const [bx, by] = proj(0, -0.4, 2.18), [tx, ty] = P(0, 0, 0);
  cone(img, bx, ty - 40, 120, 30, by, col, 0.035);
  // scanlines
  const d = img.d; for (let y = Math.max(0, Math.floor(ty - 260)); y < Math.min(H, by); y++) { if (((y + Math.floor(t * 60)) % 6) < 2) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; d[i] *= 0.7; d[i + 1] *= 0.7; d[i + 2] *= 0.7; } }
}
function briefScene() {
  const base = cached('brief', briefBase);
  const light = blurFast(base, 60);
  const [lx, ly] = proj(0, 1.25, 2.95);
  const tableTop = proj(0, -0.4, 2.45)[1]; // ~1855
  // table: occludes below tableTop, top surface with a projected cyan grid, highlight on the edge
  const mulStatic = vignette(0.55);
  const tableAdd = new Img(W, H);
  {
    const md = mulStatic.d, ad = tableAdd.d;
    for (let y = Math.floor(tableTop) - 2; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, cov = clamp(y - tableTop + 0.5);
      // z of the table surface at this row
      const dy = -(y + 0.5 - CY) / F, z = -0.4 / dy, px = (x + 0.5 - CX) / F * z;
      const g = (Math.abs(((px * 6) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((z * 6) % 1 + 1) % 1 - 0.5) > 0.44) ? 0.5 : 0.04;
      const fall = Math.exp(-(px * px) / 0.5);
      const edge = Math.exp(-(y - tableTop) / 2.5) * 0.5;
      md[i] *= 1 - cov; md[i + 1] *= 1 - cov; md[i + 2] *= 1 - cov;
      ad[i] = cov * (0.012 + TEAL[0] * g * fall * 0.6 + edge * AMBER[0]); ad[i + 1] = cov * (0.016 + TEAL[1] * g * fall * 0.6 + edge * AMBER[1]); ad[i + 2] = cov * (0.022 + TEAL[2] * g * fall * 0.6 + edge * AMBER[2]);
    }
  }
  const motes = dust(160, 11, { x: [-1.4, 1.4], y: [-0.4, 1.3], z: [1.6, 4.5] });
  const blips = Array.from({ length: 7 }, (_, k) => ({ k, ci: k % 3, ri: (k * 2) % 3, u: 0.2 + 0.6 * ((k * 0.37) % 1), v: 0.2 + 0.6 * ((k * 0.61) % 1) }));
  return {
    id: 's1', name: 'briefing over the hologram', exposure: 1.2,
    frame(t) {
      const bg = base.clone();
      const field = hazeField(t, 5, 0.005, [0.01, -0.05]);
      addHaze(bg, light, field, 0.45, 0.3);
      cone(bg, lx, ly + 34, 70, 520, H, AMBER, 0.055, field); // the lamp cone behind them
      // live monitor details: radar sweep, blinking dots, a scan bar (soft = out of focus)
      const rc = [MON.cols[2], MON.rows[0]], [rx, ry] = proj(rc[0], rc[1], MON.z), a = t * 1.6;
      const R = 0.17 / MON.z * F;
      glowSegment(bg, rx, ry, rx + Math.cos(a) * R, ry + Math.sin(a) * R * 0.98, [0.4, 1.1, 1.0], 2, 10, 0.5);
      for (const b of blips) { const on = Math.sin(t * 3 + b.k * 1.7) > 0.3 ? 1 : 0.2; const [bx, by] = proj(MON.cols[b.ci] - MON.w / 2 + b.u * MON.w, MON.rows[b.ri] + MON.h / 2 - b.v * MON.h, MON.z); dot(bg, bx, by, 6, b.k === 3 ? RED : [0.5, 1.2, 1.1], on * 0.9); }
      const sy = proj(0, MON.rows[1] + MON.h / 2 - ((t * 0.25) % 1) * MON.h, MON.z)[1]; const [sx0] = proj(MON.cols[0] - MON.w / 2, 0, MON.z), [sx1] = proj(MON.cols[0] + MON.w / 2, 0, MON.z);
      glowSegment(bg, sx0, sy, sx1, sy, [0.4, 1.0, 1.1], 1.5, 8, 0.35);
      drawDust(bg, motes, t, [1, 0.8, 0.55], 2.95, 99);
      const add = tableAdd.clone();
      hologram(add, t);
      drawDust(add, motes, t, [1, 0.8, 0.55], 0, 2.6);
      return { bg, add, mul: mulStatic };
    },
    light: { top: [168, 150, 132], mid: [120, 126, 132], low: [130, 160, 176], warmRim: 0.4 }, // warm lamp above-behind, cyan hologram from below
    target: { lum: 0.33, cb: 0.01, cr: 0.0, contrast: 1.08 },
    shadow: { top: Math.floor(tableTop), dy: 34, blur: 22, opacity: 0.55 },
  };
}

// ---------------------------------------------------------------- shot 3: vault open, gold light, door edge + crowd in front
function vaultBase() {
  const img = new Img(W, H);
  const oc = [0.25, 0.75, 6], OR = 2.1; // doorway in the antechamber wall
  const [ox, oy] = proj(oc[0], oc[1], oc[2]);
  const ORp = OR / oc[2] * F;
  forEachPixel(img, (x, y, c) => {
    const dx = (x - CX) / F, dy = -(y - CY) / F;
    const px = dx * oc[2], py = dy * oc[2];
    const rr = Math.hypot(px - oc[0], py - oc[1]);
    if (rr < OR) { // inside: vault room, back wall z=11 with gold shelves, very bright
      const z = 11, qx = dx * z, qy = dy * z;
      const shelf = ((((qy + 1.35) % 0.6) + 0.6) % 0.6);
      let e = 0.28 + 0.25 * fbm(qx * 2, qy * 2, 40, 3);
      if (shelf < 0.24 && qy > -1.35 && qy < 2.5) { const bar = Math.abs(((qx * 3.3) % 1 + 1) % 1 - 0.5); e = bar < 0.38 ? 0.9 + 0.8 * (0.24 - shelf) * 4 + (shelf < 0.03 ? 1.2 : 0) : 0.2; }
      if (shelf > 0.24 && shelf < 0.27) e = 0.25;
      const core = Math.exp(-((qx - 0.2) ** 2 + (qy - 1.4) ** 2) / 3) * 1.6;
      c[0] = GOLD[0] * (e + core); c[1] = GOLD[1] * (e + core); c[2] = GOLD[2] * (e + core);
      return;
    }
    // antechamber wall: dark steel, the door frame ring is lit by the gold spill
    const ring = rr - OR, fp = oc[2] / F;
    let alb = 0.03 * (0.7 + 0.6 * fbm(px, py, 41, 3));
    if (ring < 0.35) { alb = 0.09 * (0.8 + 0.4 * vnoise(Math.atan2(py - oc[1], px - oc[0]) * 50, rr * 8, 3)); }
    const spill = 3.5 / (1 + (ring / 0.5) ** 2);
    const lip = clamp((0.025 - Math.abs(ring)) / fp + 0.5) * 4;
    c[0] = alb * (spill * GOLD[0] + 0.2) + lip * GOLD[0]; c[1] = alb * (spill * GOLD[1] + 0.25) + lip * GOLD[1]; c[2] = alb * (spill * GOLD[2] + 0.35) + lip * GOLD[2];
  });
  const out = blur(img, 3);
  bloom(out, { t: 1.0, radii: [8, 40, 140], gains: [0.25, 0.22, 0.2] });
  return { img: out, ox, oy, ORp };
}
function godRays(full, ox, oy, t, gain) {
  const img = new Img(HW, HH), d = img.d;
  for (let y2 = 0; y2 < HH; y2++) for (let x2 = 0; x2 < HW; x2++) {
    const x = x2 * 2 + 1, y = y2 * 2 + 1;
    const ax = x - ox, ay = y - oy, r = Math.hypot(ax, ay);
    if (r < 40) continue;
    const th = Math.atan2(ay, ax);
    const n = vnoise(th * 9 + t * 0.15, 2, 61) * 0.6 + vnoise(th * 23 - t * 0.1, 5, 62) * 0.4;
    const ray = smooth(0.45, 0.95, n) * Math.exp(-r / 900) * smooth(150, 380, r);
    const a = ray * gain, i = (y2 * HW + x2) * 3;
    d[i] += GOLD[0] * a; d[i + 1] += GOLD[1] * a; d[i + 2] += GOLD[2] * a;
  }
  addUp(full, img);
}
// crowd silhouettes in front (bottom), out of focus, backlit by the vault: 7 people, some arms up
const CROWD = Array.from({ length: 7 }, (_, k) => ({ x: 40 + k * 168 + ((k * 53) % 40), y: 1720 + ((k * 37) % 70), s: 0.9 + ((k * 0.29) % 0.35), arm: k % 3 !== 1 ? (k % 2 ? 1 : -1) : 0, ph: k * 1.31 }));
function crowdLayers(t) {
  // drawn at half res (they are out of focus, ~1.2 m from camera), upsampled into full-res mul/add
  const mul = new Img(W, H).fill(1, 1, 1), add = new Img(W, H);
  const top = 1380, h2 = (H - top) / 2;
  const ci = new Img(HW, h2), ri = new Img(HW, h2);
  for (const p of CROWD) {
    const jump = Math.max(0, Math.sin(t * 3.4 + p.ph)) * 22 * p.s, sway = Math.sin(t * 1.7 + p.ph) * 10;
    const hx = p.x + sway, hy = p.y - jump, s = p.s;
    const armA = p.arm && p.ph % 2 < 1.2 ? -1.15 + Math.sin(t * 4 + p.ph) * 0.2 : null;
    for (let y2 = 0; y2 < h2; y2++) for (let x2 = Math.max(0, Math.floor((hx - 260 * s) / 2)); x2 < Math.min(HW, Math.ceil((hx + 260 * s) / 2)); x2++) {
      const x = x2 * 2 + 1, y = top + y2 * 2 + 1, qx = x - hx, qy = y - hy;
      let sd = Math.hypot(qx / (58 * s), qy / (72 * s)) * 60 * s - 60 * s;
      sd = Math.min(sd, sdBox(x, y, hx, hy + 230 * s, 175 * s, 150 * s, 110 * s));
      sd = Math.min(sd, sdBox(x, y, hx, hy + 85 * s, 32 * s, 45 * s, 10));
      if (armA !== null) {
        const sx = hx + p.arm * 130 * s, sy = hy + 140 * s, ex = sx + Math.sin(-armA) * p.arm * 250 * s, ey = sy - Math.cos(armA) * 250 * s;
        const dx = ex - sx, dy = ey - sy, L2 = dx * dx + dy * dy, tt = clamp(((x - sx) * dx + (y - sy) * dy) / L2);
        sd = Math.min(sd, Math.hypot(x - sx - dx * tt, y - sy - dy * tt) - mix(34, 26, tt) * s, Math.hypot(x - ex, y - ey) - 30 * s);
      }
      const j = (y2 * HW + x2) * 3, a = clamp(0.5 - sd / 2);
      if (a > ci.d[j]) ci.d[j] = ci.d[j + 1] = ci.d[j + 2] = a;
      const r = Math.exp(-Math.abs(sd + 3) / 4) * smooth(-1, 0.3, -qy / (200 * s));
      if (r > ri.d[j]) ri.d[j] = ri.d[j + 1] = ri.d[j + 2] = r;
    }
  }
  const cb = blur(ci, 5), rb = blur(ri, 4);
  const cu = new Img(W, H), ru = new Img(W, H);
  const pc = new Img(HW, HH), pr = new Img(HW, HH);
  pc.d.set(cb.d, (top / 2) * HW * 3); pr.d.set(rb.d, (top / 2) * HW * 3);
  addUp(cu, pc); addUp(ru, pr);
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3, c = cu.d[i], r = ru.d[i] * (1 - c * 0.3);
    mul.d[i] = mul.d[i + 1] = mul.d[i + 2] = 1 - c * 0.96;
    add.d[i] = c * 0.010 + r * GOLD[0] * 0.55; add.d[i + 1] = c * 0.009 + r * GOLD[1] * 0.55; add.d[i + 2] = c * 0.011 + r * GOLD[2] * 0.55;
  }
  return { mul, add };
}
/** The opened vault door on the left, ~1.6-2.2 m from camera: thick round slab seen edge-on, locking bolts. */
function doorLayers() {
  const mul = new Img(W, H).fill(1, 1, 1), add = new Img(W, H);
  const cx = -120, cy = 1000, rx = 300, ry = 1060, thick = 150;
  paintSDF(mul, [0, 0, 480, H], (x, y) => {
    const e = Math.hypot((x - cx) / rx, (y - cy) / ry) - 1, sd = e * Math.min(rx, ry);
    const sdEdge = Math.hypot((x - cx - thick) / rx, (y - cy) / ry) * Math.min(rx, ry) - Math.min(rx, ry);
    const s = Math.min(sd, sdEdge, x < cx + thick && Math.abs(y - cy) < ry ? -1 : 99);
    return [s, 0, 0, 0];
  });
  paintSDF(add, [0, 0, 480, H], (x, y) => {
    const face = Math.hypot((x - cx) / rx, (y - cy) / ry) - 1;
    const edgeE = Math.hypot((x - cx - thick) / rx, (y - cy) / ry) - 1;
    if (face < 0) { // door face (towards camera, in shadow): brushed steel, concentric grooves catch a little gold
      const r = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const groove = 0.6 + 0.4 * Math.sin(r * 60) ** 6;
      const k = 0.012 * groove + 0.05 * Math.exp(-(1 - r) * 18);
      return [face * Math.min(rx, ry), GOLD[0] * k + 0.006, GOLD[1] * k + 0.007, GOLD[2] * k + 0.009];
    }
    if (edgeE < 0 || x < cx + thick) { // thick edge: lit by the vault (warm), bands
      const u = (x - (cx + rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)))) / thick;
      const band = 0.55 + 0.45 * Math.sin(clamp(u) * Math.PI) + (Math.abs(((y / 46) % 1) - 0.5) > 0.42 ? -0.25 : 0);
      const k = band * smooth(-0.2, 0.9, u + 0.2), hl = Math.exp(-Math.abs(u - 0.85) / 0.06) * 0.22;
      return [Math.max(edgeE * Math.min(rx, ry), -1), 0.035 * k + GOLD[0] * (0.05 * k + hl), 0.036 * k + GOLD[1] * (0.05 * k + hl), 0.04 * k + GOLD[2] * (0.05 * k + hl)];
    }
    return null;
  });
  // locking bolts sticking out of the edge
  for (let k = 0; k < 9; k++) {
    const by = 260 + k * 190; const ex = cx + thick + rx * Math.sqrt(Math.max(0, 1 - ((by - cy) / ry) ** 2));
    const box = [ex - 10, by - 30, ex + 110, by + 30];
    paintSDF(mul, box, (x, y) => [sdBox(x, y, ex + 48, by, 56, 24, 22), 0, 0, 0]);
    paintSDF(add, box, (x, y) => { const sd = sdBox(x, y, ex + 48, by, 56, 24, 22); const hl = Math.exp(-Math.abs(y - (by - 12)) / 6) * 0.9; return [sd, 0.05 + GOLD[0] * hl * 0.5, 0.05 + GOLD[1] * hl * 0.5, 0.055 + GOLD[2] * hl * 0.5]; });
  }
  return { mul: blur(mul, 2.5), add: blur(add, 2.5) };
}
function vaultScene() {
  const vb = vaultBase(); const base = vb.img, ox = vb.ox, oy = vb.oy;
  const light = blurFast(base, 80);
  const door = doorLayers();
  const vig = vignette(0.5);
  const motes = dust(320, 91, { x: [-2.2, 2.6], y: [-1.3, 3], z: [1.0, 7] });
  return {
    id: 's3', name: 'vault open, mission complete', exposure: 0.85,
    frame(t) {
      const bg = base.clone();
      addHaze(bg, light, hazeField(t, 71, 0.005, [-0.02, -0.03]), 0.4, 0.3);
      godRays(bg, ox, oy, t, 0.22);
      drawDust(bg, motes, t * 1.4, GOLD, 2.9, 99);
      const crowd = crowdLayers(t);
      const mul = vig.clone(); const md = mul.d;
      for (let i = 0; i < md.length; i++) md[i] *= door.mul.d[i] * crowd.mul.d[i];
      const add = door.add.clone();
      // crowd in front of the door: door add is hidden where the crowd covers it
      for (let i = 0; i < add.d.length; i++) add.d[i] = add.d[i] * crowd.mul.d[i] + crowd.add.d[i];
      drawDust(add, motes, t * 1.4, GOLD, 0, 2.6);
      return { bg, add, mul };
    },
    light: { top: [178, 156, 128], mid: [112, 112, 118], low: [92, 94, 104], warmRim: 0.85 }, // strong warm backlight, cool dim front
    target: { lum: 0.30, cb: -0.01, cr: 0.015, contrast: 1.1 },
    shadow: null,
  };
}

export const SCENES = { s1: briefScene, s2: hallScene, s3: vaultScene };

/** Light field image for the squad layer (SQUAD.w x SQUAD.h), hardlight, 128 neutral. */
function lightField(L) {
  const w = SQUAD.w, h = SQUAD.h, buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const a = v < 0.5 ? L.top.map((q, c) => mix(q, L.mid[c], smooth(0, 0.5, v))) : L.mid.map((q, c) => mix(q, L.low[c], smooth(0.5, 1, v)));
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), side = 1 - 0.18 * smooth(0.2, 0.5, Math.abs(u - 0.5)); // a little darker at the sides
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) buf[i + c] = clamp(Math.round(128 + (a[c] * side - 128)), 0, 255);
    }
  }
  return buf;
}
function shadowMask(S) {
  const buf = Buffer.alloc(W * H * 3);
  if (S) for (let y = S.top; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; buf[i] = buf[i + 1] = buf[i + 2] = 255; }
  return buf;
}

/** Render every plate (or `shots`) into outDir. Returns meta. */
export async function buildPlates({ outDir, shots = ['s1', 's2', 's3'], seconds = null, log = () => {} }) {
  setCache(path.join(outDir, 'stills'));
  fs.mkdirSync(outDir, { recursive: true });
  const meta = { version: PLATE_VERSION, W, H, FPS, F, CX, CY, squad: SQUAD, shotSeconds: SHOT_S, shots: {} };
  for (const id of shots) {
    const t0 = Date.now();
    const sc = SCENES[id]();
    const tb = Date.now() - t0;
    const frames = Math.round((seconds || SHOT_S[id] + 0.2) * FPS);
    const cache = new Map();
    const get = (i) => { if (!cache.has(i)) { cache.clear(); cache.set(i, sc.frame(i / FPS)); } return cache.get(i); };
    // three encoders fed from the same frame() call (frame() is computed once per index)
    const bufs = { bg: Buffer.alloc(W * H * 3), add: Buffer.alloc(W * H * 3), mul: Buffer.alloc(W * H * 3) };
    const enc = (layer, file, conv) => ({ file: path.join(outDir, `${id}-${file}.mp4`), render: (i) => conv(get(i)[layer], i) });
    const jobs = [
      enc('bg', 'bg', (img, i) => toRGB24(img, sc.exposure, i * 3 + 1, bufs.bg)),
      enc('add', 'fgadd', (img, i) => toRGB24(img, sc.exposure, i * 3 + 2, bufs.add)),
      enc('mul', 'fgmul', (img) => toRGB24Linear(img, 1, bufs.mul)),
    ];
    // encode the three in lock-step so frame(i) runs once
    await encodeLockstep(jobs, frames);
    await writePng(path.join(outDir, `${id}-light.png`), SQUAD.w, SQUAD.h, lightField(sc.light));
    await writePng(path.join(outDir, `${id}-shadow.png`), W, H, shadowMask(sc.shadow));
    meta.shots[id] = { name: sc.name, light: sc.light, target: sc.target, shadow: sc.shadow, frames };
    log({ shot: id, baseMs: tb, totalMs: Date.now() - t0, frames });
  }
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

async function encodeLockstep(jobs, frames) {
  // one ffmpeg per layer; we write frame i to all three before computing i+1
  const { spawn } = await import('node:child_process');
  const { FFMPEG } = await import('../src/ffmpeg.js');
  const procs = jobs.map((j) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', j.file], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    p.done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c} ${err}`)))));
    return p;
  });
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < jobs.length; k++) {
      const buf = jobs[k].render(i);
      if (!procs[k].stdin.write(Buffer.from(buf))) await new Promise((r) => procs[k].stdin.once('drain', r));
    }
  }
  procs.forEach((p) => p.stdin.end());
  await Promise.all(procs.map((p) => p.done));
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const outDir = arg('out', path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage', 'cache', `composite-${PLATE_VERSION}`));
  const shots = arg('shots', 's1,s2,s3').split(',');
  const seconds = arg('seconds', null) ? Number(arg('seconds')) : null;
  const t0 = Date.now();
  buildPlates({ outDir, shots, seconds, log: (m) => console.log(JSON.stringify(m)) })
    .then(() => console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, outDir })))
    .catch((e) => { console.error(e); process.exit(1); });
}
