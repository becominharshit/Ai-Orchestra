// Pipe raw rgb24 frames from JS into ffmpeg (x264 or png). Used by the plate and test-actor generators.
import { spawn } from 'node:child_process';
import { FFMPEG } from '../../src/ffmpeg.js';

/**
 * Encode `frames` frames made by render(i) -> Buffer(rgb24, w*h*3).
 * opts: crf (default 14), preset, extra output args, pix ('yuv420p'), fps.
 */
export async function encodeFrames({ file, w, h, fps = 30, frames, render, crf = 14, preset = 'medium', out = null, pix = 'yuv420p', bitrate = null }) {
  const outArgs = out || [
    '-c:v', 'libx264', '-preset', preset, ...(bitrate ? ['-b:v', bitrate, '-maxrate', bitrate, '-bufsize', bitrate] : ['-crf', String(crf)]),
    '-pix_fmt', pix, '-movflags', '+faststart',
  ];
  const args = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-', ...outArgs, file];
  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}: ${err}`)))));
  for (let i = 0; i < frames; i++) {
    const buf = await render(i);
    if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
  }
  p.stdin.end();
  await done;
}

/** Write one rgb24 buffer as a PNG still. */
export function writePng(file, w, h, buf) {
  return encodeFrames({ file, w, h, frames: 1, render: () => buf, out: ['-frames:v', '1', '-c:v', 'png'] });
}
