// Shared helpers for the Squad Reel tests: temp storage, generated test clips (ffmpeg lavfi, no downloads),
// a worker on a random port, and a log collector.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runFfmpeg, FFMPEG } from '../../reel-worker/src/ffmpeg.js';

// Fail early and clearly when the ffmpeg binary is missing, not executable or truncated (a broken npm download).
export function assertFfmpeg() {
  let ok = false;
  let why = '';
  try {
    if (FFMPEG.includes('/')) fs.accessSync(FFMPEG, fs.constants.X_OK);
    const r = spawnSync(FFMPEG, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000 });
    ok = r.status === 0 && /ffmpeg version/.test(r.stdout || '');
    why = r.error ? r.error.message : `exit ${r.status}`;
  } catch (e) { why = e.code || e.message; }
  if (!ok) {
    throw new Error(`ffmpeg is not usable (${why}) at ${FFMPEG}.\n  Run \`npm run setup\` in the repo root (or \`cd reel-worker && npm install\`) to (re)download ffmpeg-static, then run the tests again.`);
  }
}
assertFfmpeg();

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const tmpDir = (tag = 'reel') => fs.mkdtempSync(path.join(os.tmpdir(), `pz-${tag}-`));

// One shared cache of generated clips per machine run, so every test file does not re-encode them.
const CLIP_DIR = path.join(os.tmpdir(), 'pz-reel-testclips-v2');

/**
 * Make an abstract test clip. kind: 'portrait' (720x1280 + tone), 'landscape' (1280x720, no audio),
 * 'square4x3' (960x720 + tone), or any { w, h, dur, audio, src }.
 */
export async function makeClip(name, { w = 720, h = 1280, dur = 8, audio = true, src = 'testsrc2', rate = 30 } = {}) {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  const out = path.join(CLIP_DIR, `${name}-${w}x${h}-${dur}-${audio ? 'a' : 'n'}-${src}.mp4`);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  const tmp = `${out}.tmp.mp4`;
  const args = ['-f', 'lavfi', '-i', `${src}=s=${w}x${h}:r=${rate}`];
  if (audio) args.push('-f', 'lavfi', '-i', 'sine=f=330:r=48000,volume=0.3');
  args.push('-t', String(dur), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '64k'); else args.push('-an');
  await runFfmpeg([...args, tmp]);
  fs.renameSync(tmp, out);
  return out;
}

export async function sampleClips() {
  return [
    await makeClip('shot1', { w: 720, h: 1280, dur: 8, audio: true, src: 'testsrc2' }),
    await makeClip('shot2', { w: 1280, h: 720, dur: 9, audio: false, src: 'testsrc' }),
    await makeClip('shot3', { w: 960, h: 720, dur: 7.5, audio: true, src: 'rgbtestsrc' }),
  ];
}

export function logCollector() {
  const lines = [];
  return { lines, log: (o) => lines.push(JSON.stringify(o)) };
}

export async function startWorker(opts = {}) {
  const { createWorker } = await import('../../reel-worker/src/server.js');
  const storageDir = opts.storageDir || tmpDir('store');
  const w = createWorker({ storageDir, secret: 'test-secret', quiet: true, ...opts });
  const srv = await w.start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${srv.address().port}`;
  const H = { 'x-reel-secret': opts.secret ?? 'test-secret' };
  return { ...w, base, storageDir, H, close: () => w.stop() };
}

export async function uploadFile(base, file, headers = {}, type = 'video/mp4') {
  const buf = fs.readFileSync(file);
  const r = await fetch(`${base}`, { method: 'POST', headers: { 'content-type': type, ...headers }, body: buf });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

export async function waitJob(base, id, headers = {}, { timeoutMs = 120000, path: p = '/jobs/' } = {}) {
  const t0 = Date.now();
  const events = [];
  let since = 0;
  for (;;) {
    const r = await fetch(`${base}${p}${id}?since=${since}`, { headers });
    const v = await r.json();
    for (const e of v.events || []) { events.push(e); since = Math.max(since, e.seq); }
    if (v.state === 'done' || v.state === 'failed') return { ...v, events };
    if (Date.now() - t0 > timeoutMs) throw new Error(`job ${id} timed out in state ${v.state}`);
    await new Promise((r2) => setTimeout(r2, 250));
  }
}
