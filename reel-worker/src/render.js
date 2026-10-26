// Editor + Thumbnail agents: the real ffmpeg work.
//
// Editor, one ffmpeg pass:
//   3 clips -> seek/trim to the Director's beat plan -> scale + crop to 1080x1920 -> template look (grade, letterbox)
//   -> white flash on each beat cut -> hook text (0-2 s) + Hinglish caption per shot + handle watermark (ASS via libass)
//   -> concat with the pre-rendered 2 s end card -> squad audio + music bed (bed ducked under voices, lifted on the card)
//   -> H.264 High / yuv420p / AAC 48 kHz / +faststart (plays on iOS Safari and Android Chrome)
// Thumbnail: scores one small frame per shot (detail x brightness) and saves the winner as cover.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { runFfmpeg, ffmpegBuffer, probe } from './ffmpeg.js';
import { TEMPLATES, W, H, FPS, END_CARD_S } from './templates.js';
import { reelAss } from './subs.js';

const r3 = (x) => Number(x).toFixed(3);

/**
 * Build the ffmpeg arguments for a job. Pure apart from writing the small text files into jobDir.
 * @param {{ template, plan, clips:[{file, hasAudio}], captions:string[], hook:string, jobDir, fontsDir, bedFile, endCardFile, outFile }} j
 */
export function buildEditorArgs(j) {
  const t = TEMPLATES[j.template];
  const { plan } = j;
  const fontsRel = path.relative(j.jobDir, j.fontsDir).split(path.sep).join('/');
  const args = [];
  // REEL_THREADS=1 pins decode, filters and x264 to one thread (models a 1 vCPU box; the load test uses it)
  const THR = process.env.REEL_THREADS ? String(process.env.REEL_THREADS) : '';
  const inT = THR ? ['-threads', THR] : [];
  plan.shots.forEach((s, i) => { args.push(...inT, '-ss', r3(s.in), '-t', r3(s.dur + 0.25), '-i', j.clips[i].file); });
  const endIdx = plan.shots.length;
  args.push(...inT, '-i', j.endCardFile);
  args.push('-stream_loop', '-1', '-i', j.bedFile);
  const bedIdx = endIdx + 1;

  const chains = [];
  plan.shots.forEach((s, i) => {
    const f = [
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic`,
      `crop=${W}:${H}`, 'setsar=1', `fps=${FPS}`, 'format=yuv420p',
      `tpad=stop_mode=clone:stop_duration=1`, `trim=duration=${r3(s.dur)}`, 'setpts=PTS-STARTPTS',
    ];
    if (t.look.grade) f.push(t.look.grade);
    if (t.look.letterbox) f.push(`drawbox=x=0:y=0:w=iw:h=190:color=black:t=fill`, `drawbox=x=0:y=ih-190:w=iw:h=190:color=black:t=fill`);
    // beat cut punch: white flash into shots 2 and 3, a quick fade from black into shot 1
    // (drawbox with enable= only works on the flash frames; fade= touches every frame and is slow on 1 vCPU)
    f.push(i === 0 ? `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.6:t=fill:enable='lt(t,0.1)'` : `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.55:t=fill:enable='lt(t,0.1)'`);
    chains.push(`${f.join(',')}[v${i}]`);
    if (j.clips[i].hasAudio) {
      chains.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${r3(s.dur)},asetpts=PTS-STARTPTS[a${i}]`);
    } else {
      chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${r3(s.dur)},aformat=sample_fmts=fltp[a${i}]`);
    }
  });
  chains.push(`[${endIdx}:v]fps=${FPS},format=yuv420p,setsar=1,trim=duration=${END_CARD_S},setpts=PTS-STARTPTS[vend]`);
  chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${END_CARD_S},aformat=sample_fmts=fltp[aend]`);
  const pairs = plan.shots.map((_, i) => `[v${i}][a${i}]`).join('') + '[vend][aend]';
  chains.push(`${pairs}concat=n=${plan.shots.length + 1}:v=1:a=1[vcat][voice]`);
  // hook + captions + handle: one ASS file rendered by libass with the vendored fonts (see subs.js)
  fs.writeFileSync(path.join(j.jobDir, 'subs.ass'), reelAss({ template: j.template, plan, captions: j.captions, hook: j.hook }));
  chains.push(`[vcat]ass=subs.ass:fontsdir=${fontsRel}[vout]`);
  const T = plan.shotsTotal;
  const total = plan.total;
  chains.push(`[${bedIdx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${r3(total)},asetpts=PTS-STARTPTS,`
    + `volume='if(lt(t,${r3(T)}),0.42,0.95)':eval=frame,afade=t=out:st=${r3(total - 0.7)}:d=0.7[bed]`);
  chains.push(`[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92[aout]`);

  const threads = THR ? ['-threads', THR, '-x264-params', `threads=${THR}:lookahead-threads=1`] : [];
  args.push(...(THR ? ['-filter_complex_threads', THR] : []), '-filter_complex', chains.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', process.env.REEL_PRESET || 'veryfast', '-crf', '23', '-profile:v', 'high', '-level:v', '4.1',
    '-maxrate', '4500k', '-bufsize', '9000k', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), ...threads,
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', r3(total), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', j.outFile);
  return args;
}

/** Editor: run the render. onProgress({ value 0..1, outS, speed, shot }) */
export async function renderReel(j, { onProgress, signal } = {}) {
  const args = buildEditorArgs(j);
  const total = j.plan.total;
  const bounds = j.plan.shots.map((s) => s.start + s.dur);
  const r = await runFfmpeg(args, {
    cwd: j.jobDir,
    signal,
    timeoutMs: Number(process.env.REEL_RENDER_TIMEOUT_MS) || 240000,
    onProgress: ({ outS, speed }) => {
      let shot = bounds.findIndex((b) => outS < b) + 1;
      if (shot === 0) shot = j.plan.shots.length + 1; // end card
      onProgress?.({ value: Math.min(1, outS / total), outS, speed, shot });
    },
  });
  return r;
}

/** Average luma 0..1 of a frame at time t (scaled down to one pixel). */
async function lumaAt(file, t) {
  const b = await ffmpegBuffer(['-ss', r3(t), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-']);
  return b.length ? b[0] / 255 : 0;
}

/**
 * Thumbnail: one small frame per shot from the finished reel, scored by detail (JPEG size at fixed quality)
 * x brightness (closest to 0.55). The best frame is saved full size as cover.jpg.
 */
export async function pickCover({ outFile, plan, jobDir }) {
  const scores = [];
  for (const s of plan.shots) {
    const at = s.start + Math.min(s.dur * 0.6, s.dur - 0.2);
    const small = path.join(jobDir, `frame-${s.n}.jpg`);
    await runFfmpeg(['-ss', r3(at), '-i', outFile, '-frames:v', '1', '-vf', 'scale=180:320', '-q:v', '5', small], { timeoutMs: 20000 });
    const kb = fs.statSync(small).size / 1024;
    const luma = await lumaAt(outFile, at);
    const score = kb * (1 - Math.min(0.9, Math.abs(luma - 0.55) * 1.4));
    scores.push({ shot: s.n, at: Number(r3(at)), kb: Math.round(kb * 10) / 10, luma: Math.round(luma * 100) / 100, score: Math.round(score * 10) / 10 });
    fs.rmSync(small, { force: true });
  }
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const cover = path.join(jobDir, 'cover.jpg');
  await runFfmpeg(['-ss', r3(best.at), '-i', outFile, '-frames:v', '1', '-q:v', '3', cover], { timeoutMs: 20000 });
  return { best, scores, cover };
}

/** Check a finished file: the numbers the Director reports at the end. */
export async function inspect(file) {
  const p = await probe(file);
  const bytes = fs.statSync(file).size;
  // faststart: the moov atom must come before mdat (top-level atoms are size + type)
  const fd = fs.openSync(file, 'r');
  let pos = 0;
  const order = [];
  try {
    const hdr = Buffer.alloc(16);
    while (pos < bytes && order.length < 12) {
      fs.readSync(fd, hdr, 0, 16, pos);
      let size = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      if (size === 1) size = Number(hdr.readBigUInt64BE(8));
      if (size < 8) break;
      order.push(type);
      pos += size;
    }
  } finally { fs.closeSync(fd); }
  const faststart = order.indexOf('moov') >= 0 && order.indexOf('moov') < order.indexOf('mdat');
  return { ...p, bytes, faststart, atoms: order };
}
