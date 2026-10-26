// ffmpeg runner + probe. The binary: FFMPEG_PATH, else ffmpeg-static (local dev, a devDependency),
// else `ffmpeg` on PATH (the Docker image installs Debian's ffmpeg). No ffprobe needed: we parse `ffmpeg -i`.
import { spawn } from 'node:child_process';

let bin = process.env.FFMPEG_PATH || '';
if (!bin) {
  try { bin = (await import('ffmpeg-static')).default || ''; } catch { /* not installed (Docker): use PATH */ }
}
if (!bin) bin = 'ffmpeg';
export const FFMPEG = bin;

/**
 * Run ffmpeg. Resolves { code, ms, tail } and rejects on a non-zero exit (err.tail = last stderr lines).
 * opts.onProgress({ outS, speed }) gets parsed `-progress pipe:1` updates (add those args yourself).
 * stderr is kept in memory only (last 4 KB) and never logged: it can contain file paths.
 */
export function runFfmpeg(args, { cwd, onProgress, timeoutMs = 240000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    let buf = '';
    let cur = {};
    p.stderr.on('data', (d) => { tail = (tail + d).slice(-4096); });
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq);
        const v = line.slice(eq + 1);
        cur[k] = v;
        if (k === 'progress') {
          const us = Number(cur.out_time_us ?? cur.out_time_ms);
          const speed = parseFloat(cur.speed) || 0;
          if (Number.isFinite(us) && us >= 0) onProgress?.({ outS: us / 1e6, speed, end: v === 'end' });
          cur = {};
        }
      }
    });
    const timer = setTimeout(() => { p.kill('SIGKILL'); }, timeoutMs);
    const onAbort = () => p.kill('SIGKILL');
    signal?.addEventListener('abort', onAbort, { once: true });
    p.on('error', (e) => { clearTimeout(timer); reject(Object.assign(e, { tail })); });
    p.on('close', (code, sig) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const ms = Date.now() - t0;
      if (code === 0) resolve({ code, ms, tail });
      else reject(Object.assign(new Error(sig ? `ffmpeg killed (${sig})` : `ffmpeg exit ${code}`), { code, tail, ms }));
    });
  });
}

/** Run ffmpeg and return stdout as a Buffer (small outputs only, e.g. a 1x1 pixel). */
export function ffmpegBuffer(args, { cwd, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-loglevel', 'error', ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let tail = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => { tail = (tail + d).slice(-2048); });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(Object.assign(new Error(`ffmpeg exit ${code}`), { tail })); });
  });
}

/** Parse the stream summary that `ffmpeg -i <file>` prints. */
export function parseProbe(text) {
  const out = { duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0, rotation: 0, vcodec: '', acodec: '', pixfmt: '', fps: 0, format: '' };
  const fm = text.match(/Input #0, ([^,\s]+)/);
  if (fm) out.format = fm[1];
  const d = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (d) out.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  for (const line of text.split('\n')) {
    if (/Stream #\d+:\d+.*: Video:/.test(line) && !out.hasVideo && !/attached pic/.test(line)) {
      out.hasVideo = true;
      const c = line.match(/Video:\s*([a-z0-9_]+)/i);
      if (c) out.vcodec = c[1];
      const wh = line.match(/,\s*(\d{2,5})x(\d{2,5})[\s,\[]/);
      if (wh) { out.width = Number(wh[1]); out.height = Number(wh[2]); }
      const f = line.match(/([\d.]+)\s*fps/);
      if (f) out.fps = Number(f[1]);
      const pf = line.match(/,\s*(yuvj?\d{3}p\w*|nv12|rgb24|gray)\b/);
      if (pf) out.pixfmt = pf[1];
    } else if (/Stream #\d+:\d+.*: Audio:/.test(line) && !out.hasAudio) {
      out.hasAudio = true;
      const a = line.match(/Audio:\s*([a-z0-9_]+)/i);
      if (a) out.acodec = a[1];
    }
  }
  const r = text.match(/rotation of (-?[\d.]+) degrees/) || text.match(/rotate\s*:\s*(-?\d+)/);
  if (r) out.rotation = Math.round(Number(r[1]));
  return out;
}

/** Probe a media file. Never throws for a non-media file: returns hasVideo=false. */
export async function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostdin', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let text = '';
    p.stderr.on('data', (d) => { if (text.length < 65536) text += d; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.on('error', () => { clearTimeout(timer); resolve(parseProbe('')); });
    p.on('close', () => { clearTimeout(timer); resolve(parseProbe(text)); });
  });
}
