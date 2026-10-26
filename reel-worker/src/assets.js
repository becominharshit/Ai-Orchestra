// Assets the worker makes for itself at boot, with ffmpeg only (no downloaded media of any kind):
//   cache/<v>/fonts/*.ttf        copies of reel-worker/fonts (made from core's vendored fonts)
//   cache/<v>/bed-<template>.wav  synthesised beat per template (kick, hats, clap, bass, pad) 30 s
//   cache/<v>/endcard.mp4        the pre-rendered 2 s Zenith end card (1080x1920, handle, "B.Tech in AI + mini-MBA. Ek degree, KRMU ki.")
//   cache/<v>/hero-<n>.mp4       3 abstract test clips (fractal, game of life, gradients) for ?demo=hero
// Bump ASSET_VERSION when you change any of these so old caches are ignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from './ffmpeg.js';
import { TEMPLATES, TEMPLATE_IDS, W, H, FPS, END_CARD_S } from './templates.js';
import { endCardAss } from './subs.js';

export const ASSET_VERSION = 'v6';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONT_SRC = path.join(HERE, '..', 'fonts');
const BEDS_DIR = path.join(HERE, '..', 'beds'); // TODO(student) GarageBand beds go here
export const BED_S = 30;
export const HERO_S = 7.5;

const f6 = (x) => Number(x).toFixed(6);

/** aevalsrc expression for a template's beat. Pure function so a test can check it is well formed. */
export function bedExpr(bpm, bed) {
  const B = 60 / bpm;
  const p = `mod(t,${f6(B)})`;
  const kp = bed.kickEvery === 2 ? `mod(t,${f6(2 * B)})` : p;
  const parts = [];
  parts.push(`0.85*sin(2*PI*(42*${kp}+5.4*(1-exp(-28*${kp}))))*exp(-6*${kp})`); // kick: pitch drop + decay
  if (bed.hats === '8th') parts.push(`0.15*(2*random(0)-1)*exp(-90*mod(t+${f6(B / 2)},${f6(B)}))`);
  if (bed.hats === '16th') parts.push(`0.085*(2*random(0)-1)*exp(-150*mod(t,${f6(B / 4)}))`);
  if (bed.clap) parts.push(`0.26*(2*random(1)-1)*exp(-24*mod(t+${f6(B)},${f6(2 * B)}))`);
  const [n0, n1, n2, n3] = bed.notes;
  const m = `mod(floor(t/${f6(4 * B)}),4)`;
  const f = `if(eq(${m},0),${n0},if(eq(${m},1),${n1},if(eq(${m},2),${n2},${n3})))`;
  parts.push(`0.30*sin(2*PI*${f}*t)*(0.35+0.65*exp(-3.5*${p}))`); // bass, plucked on every beat
  const third = bed.chord === 'minor' ? 4.8 : 5;
  parts.push(`0.045*(sin(2*PI*${f}*4*t)+sin(2*PI*${f}*${third}*t)+sin(2*PI*${f}*6*t))*(0.6+0.4*sin(2*PI*t/${f6(4 * B)}))`); // pad
  return parts.join('+');
}

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

const HERO = [
  // abstract only: no people, no camera footage
  { v: 'mandelbrot=s=360x640:r=30:maxiter=600,scale=720:1280,hue=h=t*24', a: 'anoisesrc=color=pink:amplitude=0.05:r=48000,lowpass=f=900' },
  { v: 'life=s=180x320:mold=10:r=30:ratio=0.14:death_color=0x2A1B5E:life_color=0x62BBF3,scale=720:1280:flags=neighbor', a: null },
  { v: 'gradients=s=720x1280:r=30:c0=0xFF8FC0:c1=0x4E308D:c2=0x62BBF3:nb_colors=3:speed=0.05', a: 'sine=f=196:r=48000,volume=0.06' },
];

export function createAssets({ storageDir, log = () => {} }) {
  const dir = path.join(storageDir, 'cache', ASSET_VERSION);
  const fontsDir = path.join(dir, 'fonts');
  const file = (name) => path.join(dir, name);
  const state = { ready: false, error: null, ms: 0 };

  async function make(name, args) {
    const out = file(name);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return;
    const tmp = file(`tmp-${name}`);
    await runFfmpeg([...args, tmp], { cwd: dir, timeoutMs: 180000 });
    fs.renameSync(tmp, out);
  }

  async function build() {
    const t0 = Date.now();
    fs.mkdirSync(fontsDir, { recursive: true });
    for (const f of fs.readdirSync(FONT_SRC)) if (f.endsWith('.ttf')) fs.copyFileSync(path.join(FONT_SRC, f), path.join(fontsDir, f));
    fs.writeFileSync(file('endcard.ass'), endCardAss(END_CARD_S));
    for (const id of TEMPLATE_IDS) {
      const t = TEMPLATES[id];
      if (t.bedFile && fs.existsSync(path.join(BEDS_DIR, t.bedFile))) continue;
      await make(`bed-${id}.wav`, ['-f', 'lavfi', '-i', `aevalsrc=exprs='${bedExpr(t.bpm, t.bed)}':s=48000:d=${BED_S}`,
        '-af', 'highpass=f=28,lowpass=f=11000,volume=0.9,alimiter=limit=0.9', '-ac', '2', '-c:a', 'pcm_s16le']);
    }
    await make('endcard.mp4', ['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:r=${FPS}:d=${END_CARD_S}:c0=0x62BBF3:c1=0x4E308D:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.015`,
      '-vf', 'format=yuv420p,ass=endcard.ass:fontsdir=fonts', '-t', String(END_CARD_S), ...ENC, '-an', '-movflags', '+faststart']);
    for (let i = 0; i < HERO.length; i++) {
      const h = HERO[i];
      const args = ['-f', 'lavfi', '-i', h.v];
      if (h.a) args.push('-f', 'lavfi', '-i', h.a);
      args.push('-t', String(HERO_S), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-pix_fmt', 'yuv420p');
      if (h.a) args.push('-c:a', 'aac', '-b:a', '96k', '-ac', '2'); else args.push('-an');
      await make(`hero-${i + 1}.mp4`, args);
    }
    state.ms = Date.now() - t0;
    state.ready = true;
    log({ kind: 'assets', ok: true, ms: state.ms });
  }

  const ready = build().catch((e) => { state.error = e.message; log({ kind: 'assets', ok: false, err: e.message }); throw e; });
  ready.catch(() => {});

  return {
    ready,
    dir,
    fontsDir,
    state,
    bed(id) {
      const t = TEMPLATES[id];
      if (t?.bedFile && fs.existsSync(path.join(BEDS_DIR, t.bedFile))) return path.join(BEDS_DIR, t.bedFile);
      return file(`bed-${id}.wav`);
    },
    endCard: file('endcard.mp4'),
    hero: [1, 2, 3].map((n) => file(`hero-${n}.mp4`)),
  };
}
