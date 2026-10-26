// Media helpers for the content scripts (asli:voices, asli:add). macOS built-ins only, nothing to install:
//   say        text to speech with the voices already on this Mac (AI clips)
//   avconvert  trims audio and drops source metadata (AVFoundation)
//   afconvert  encodes to small mono AAC .m4a (plays on iPhone and Android)
//   sips       resizes photos and re-encodes them as JPEG (via BMP, so EXIF / GPS / camera data is dropped)
// These run on the content laptop only. The server never converts anything.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_CLIP_S = 5;

// 60 s cap: macOS speech / AV services can stall; a stuck tool must fail loudly, not hang the script.
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 }).toString();
const tmp = (ext) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'asli-')), `x.${ext}`);

export function haveTools() {
  const has = (c) => { try { execFileSync('/usr/bin/which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
  return { say: has('say'), afconvert: has('afconvert'), avconvert: has('avconvert'), sips: has('sips'), afinfo: has('afinfo') };
}

export function installedVoices() {
  return run('say', ['-v', '?']).split('\n').map((l) => l.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/)).filter(Boolean).map((m) => ({ name: m[1].trim(), locale: m[2] }));
}

export function durationS(file) {
  const out = run('afinfo', [file]);
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  return m ? Number(m[1]) : NaN;
}

/** Any audio the Mac can read (m4a, mp3, wav, aiff, caf, mp4/mov audio) -> mono 22.05 kHz AAC m4a, max MAX_CLIP_S. */
export function toClip(src, out, { start = 0, maxS = MAX_CLIP_S } = {}) {
  let input = src;
  const dur = durationS(src);
  if (start > 0 || !(dur <= maxS)) {
    // avconvert trims and, by default, filters out source metadata (location, device, names).
    const trimmed = tmp('m4a');
    run('avconvert', ['-p', 'PresetAppleM4A', '-s', src, '-o', trimmed, '--replace', '--start', String(start), '--duration', String(maxS)]);
    input = trimmed;
  }
  run('afconvert', ['-f', 'm4af', '-d', 'aac@22050', '-c', '1', '-b', '64000', input, out]);
  return { out, seconds: Math.round(durationS(out) * 10) / 10, bytes: fs.statSync(out).size };
}

/** say -v <voice> "<text>" -> m4a clip. */
export function sayClip(voice, text, out, { rate } = {}) {
  const aiff = tmp('aiff');
  run('say', ['-v', voice, ...(rate ? ['-r', String(rate)] : []), '-o', aiff, text]);
  return toClip(aiff, out);
}

/** Photo (jpg, heic, png, webp) -> JPEG, longest side max 1080 px, all metadata dropped. */
export function toPhoto(src, out, { max = 1080, quality = 78 } = {}) {
  const bmp = tmp('bmp');
  run('sips', ['-s', 'format', 'bmp', '-Z', String(max), src, '--out', bmp]);
  run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), bmp, '--out', out]);
  const info = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', out]);
  const w = Number(info.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(info.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return { out, width: w, height: h, bytes: fs.statSync(out).size };
}
