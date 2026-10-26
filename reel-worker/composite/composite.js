// Squad Reel "Composite" mode (Zenith Heist): the squad, keyed off the booth's green screen, inside code-made plates.
// Behind REEL_COMPOSITE (default OFF; TASK-22 wires the flag and the route). Server-side only, nothing to any vendor.
//
// One ffmpeg pass. Per storyboard shot:
//   booth clip -> centre crop + scale into the squad box -> colour-difference key (G - max(R,B), levels measured on the
//   backdrop) -> matte choke + soft edge -> despill (G' = min(G, max(R,B))) -> match LUT (squad luma/colour to the plate)
//   -> light field (hardlight, plate's light direction/colour) -> light wrap (blurred plate bleeds over the edges)
//   -> contact shadow on the receivers the plate marks -> over the plate -> foreground multiply + add layers
//   (table/hologram, lasers, vault-door edge, crowd heads) -> global Heist grade LUT -> camera push + handheld shake
//   (one transform over everything, so squad and plate move together) -> film grain.
// Then: beat cuts with a flash, banked captions (ASS), the Zenith end card, the Heist music bed (+ squad audio if any).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFfmpeg } from '../src/ffmpeg.js';
import { sampleFrames, keyLevels, fgStats, matchTransform, matchCube, heistCube } from './match.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FONTS_DIR = path.join(HERE, '..', 'fonts');
const r3 = (x) => Number(x).toFixed(3);
export const END_S = 2.4;
export const ORDER = ['s1', 's2', 's3'];

// camera per shot: zoom z(T) and shake, T = seconds into the shot (ffmpeg expression in `in`, frames)
const CAM = {
  s1: { z: '(1.0+0.045*T/7.2)', amp: 1.0 },                      // slow push-in on the briefing
  s2: { z: '(1.055-0.05*T/4.8)', amp: 1.3 },                     // pull back as the crew walks in
  s3: { z: '(1.0+0.06*(1-exp(-max(0,T-0.9)*3)))', amp: 2.0 },    // punch-in on "Zenith!", livelier handheld
};
function perspective(id, W, H, FPS) {
  const c = CAM[id];
  const T = `(in/${FPS})`;
  const z = c.z.replaceAll('T', T);
  const sx = `(${c.amp}*(2.6*sin(2*PI*0.71*${T})+1.3*sin(2*PI*1.93*${T}+1.1)+0.6*sin(2*PI*4.1*${T}+0.3)))`;
  const sy = `(${c.amp}*(2.2*sin(2*PI*0.53*${T}+2.0)+1.1*sin(2*PI*2.31*${T}+0.4)))`;
  const th = `(${c.amp}*0.0011*sin(2*PI*0.37*${T}+0.7))`;
  const hw = `(${W / 2}/${z})`, hh = `(${H / 2}/${z})`;
  const pt = (ux, uy) => [
    `${W / 2}+${sx}+(${ux}*${hw}*cos(${th})-(${uy})*${hh}*sin(${th}))`,
    `${H / 2}+${sy}+(${ux}*${hw}*sin(${th})+(${uy})*${hh}*cos(${th}))`,
  ];
  const [p0, p1, p2, p3] = [pt(-1, -1), pt(1, -1), pt(-1, 1), pt(1, 1)];
  const q = (e) => `'${e}'`;
  return `perspective=x0=${q(p0[0])}:y0=${q(p0[1])}:x1=${q(p1[0])}:y1=${q(p1[1])}:x2=${q(p2[0])}:y2=${q(p2[1])}:x3=${q(p3[0])}:y3=${q(p3[1])}:interpolation=linear:eval=frame`;
}

// ---------------------------------------------------------------- text (ASS), banked lines only
const ascii = (s) => String(s ?? '').normalize('NFKD').replace(/[‒-―−]/g, ', ').replace(/[^\x20-\x7E]/g, '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
const ts = (s) => { const t = Math.max(0, s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t - h * 3600 - m * 60; return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`; };
function wrap(text, max) { const out = []; let cur = ''; for (const w of text.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); return out.slice(0, 2); }

export function compositeAss({ W, H, shots, hook, captions }) {
  const ev = [];
  const total = shots.reduce((s, x) => s + x.dur, 0);
  ev.push(`Dialogue: 0,${ts(0)},${ts(total)},Mark,,0,0,0,,{\\an7\\pos(48,60)}@zenith_school_of_ai`);
  if (hook) {
    // title card feel: small mono kicker + big serif title, letter-spacing tightens in
    ev.push(`Dialogue: 3,${ts(0.15)},${ts(2.1)},Kick,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.24)})\\fad(200,250)\\fsp14\\t(0,900,\\fsp6)}OPERATION ZENITH`);
    ev.push(`Dialogue: 3,${ts(0.3)},${ts(2.1)},Hook,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.30)})\\fad(250,250)\\fscx108\\fscy108\\t(0,700,\\fscx100\\fscy100)}${wrap(ascii(hook), 16).join('\\N')}`);
  }
  let st = 0;
  shots.forEach((s, i) => {
    const cap = ascii(captions[i]);
    const a = st + (i === 0 && hook ? 2.2 : 0.25);
    if (cap) ev.push(`Dialogue: 1,${ts(a)},${ts(st + s.dur - 0.05)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${Math.round(H * 0.19)})\\fad(160,120)\\fscx94\\fscy94\\t(0,220,\\fscx100\\fscy100)}> ${wrap(cap, 24).join('\\N')}`);
    st += s.dur;
  });
  const sty = (name, font, size, col, outline, back, bs, ol, sh, al = 5) => `Style: ${name},${font},${size},${col},${col},${outline},${back},0,0,0,0,100,100,0,0,${bs},${ol},${sh},${al},40,40,0,1`;
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    sty('Hook', 'ZR Newsreader SemiBold', 150, '&H00FFFFFF', '&H00000000', '&H90000000', 1, 0, 6),
    sty('Kick', 'ZR JetBrains Bold', 40, '&H00FFF77C', '&H00000000', '&HA0000000', 1, 0, 3),
    sty('Cap', 'ZR JetBrains Bold', 62, '&H00FFF77C', '&H340F0405', '&H340F0405', 3, 18, 0),
    sty('Mark', 'ZR Jakarta ExtraBold', 42, '&H20FFFFFF', '&H99000000', '&H80000000', 1, 1, 2, 7),
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...ev, ''].join('\n');
}

/** Zenith end card with motion (scale-in, light sweep), 1080x1920, END_S seconds. Approved lines only. */
function endCardAss(W, H) {
  const L = (layer, st, txt) => `Dialogue: ${layer},${ts(st)},${ts(END_S)},Base,,0,0,0,,${txt}`;
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Base,ZR Jakarta SemiBold,50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1', '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    L(0, 0, `{\\an7\\pos(0,0)\\p1\\1c&H3D1719&\\1a&H50&}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`),
    L(1, 0.05, `{\\an5\\pos(540,700)\\fnZR JetBrains Bold\\fs40\\1c&HFFE6BF&\\fsp12\\fad(200,0)\\t(0,800,\\fsp5)}MISSION COMPLETE`),
    L(1, 0.12, `{\\an5\\pos(540,880)\\fnZR Newsreader SemiBold\\fs220\\fad(150,0)\\fscx112\\fscy112\\t(0,600,\\fscx100\\fscy100)}Zenith`),
    L(1, 0.25, `{\\an5\\pos(540,1060)\\fnZR Newsreader Italic\\fs104\\1c&HFFDEE6&\\fad(250,0)}School of AI`),
    L(1, 0.12, `{\\an7\\move(-500,770,1100,770,100,900)\\p1\\1c&HF3BB62&\\1a&H70&\\blur6}m 0 0 l 380 0 300 260 -80 260{\\p0}`),
    L(1, 0.4, `{\\an7\\pos(170,1170)\\p1\\1c&H8D304E&\\fad(200,0)}m 0 0 l 740 0 740 104 0 104{\\p0}`),
    L(2, 0.4, `{\\an5\\pos(540,1222)\\fnZR Jakarta ExtraBold\\fs72\\fad(200,0)}@zenith_school_of_ai`),
    L(1, 0.55, `{\\an5\\pos(540,1350)\\fnZR Jakarta SemiBold\\fs44\\1c&HFFF0F2&\\fad(200,0)}B.Tech in AI + mini-MBA, one KRMU degree`),
    L(1, 0.7, `{\\an5\\pos(540,1580)\\fnZR JetBrains Bold\\fs48\\1c&HFFE6BF&\\fad(200,0)}play.zenithschool.ai`),
    L(1, 0.8, `{\\an5\\pos(540,1660)\\fnZR Jakarta SemiBold\\fs40\\1c&HF5D4D9&\\fad(200,0)}Squad Reel Studio at KRMU Ideas 4.0`), ''].join('\n');
}

/** Heist bed: 100 bpm minor, half-time kick, 16th bass pulse, offbeat ticks, impacts on the cuts, a riser into the vault. */
export function bedExpr(cuts, total) {
  const B = 0.6, f6 = (x) => Number(x).toFixed(5);
  const m = `mod(t,${f6(2 * B)})`, q = `mod(t,${f6(B / 4)})`;
  const bar = `mod(floor(t/${f6(4 * B)}),4)`;
  const f = `if(eq(${bar},0),55,if(eq(${bar},1),43.65,if(eq(${bar},2),65.41,49)))`;
  const parts = [
    `0.8*sin(2*PI*(44*${m}+6*(1-exp(-30*${m}))))*exp(-7*${m})`,
    `0.22*(sin(2*PI*${f}*t)+0.45*sin(4*PI*${f}*t)+0.25*sin(6*PI*${f}*t))*(0.25+0.75*exp(-11*${q}))`,
    `0.05*(2*random(0)-1)*exp(-160*mod(t+${f6(B / 2)},${f6(B)}))`,
    `0.035*(sin(2*PI*${f}*4*t)+sin(2*PI*${f}*4.757*t)+sin(2*PI*${f}*6*t))*(0.6+0.4*sin(2*PI*t/${f6(8 * B)}))`,
  ];
  for (const c of cuts) parts.push(`if(between(t,${f6(c)},${f6(c + 1.6)}),0.75*sin(2*PI*(34*(t-${f6(c)})+18*(1-exp(-12*(t-${f6(c)})))))*exp(-2.6*(t-${f6(c)})),0)`);
  const r = cuts[cuts.length - 1];
  parts.push(`if(between(t,${f6(r - 1.4)},${f6(r)}),0.16*(2*random(1)-1)*pow((t-${f6(r - 1.4)})/1.4,2),0)`);
  return { expr: parts.join('+'), total };
}

/** Assets made once next to the plates: end card, Heist grade LUT, the bed for the fixed storyboard. */
export async function ensureAssets(platesDir, meta) {
  const W = meta.W, H = meta.H;
  const fontsDir = path.join(platesDir, 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  for (const f of fs.readdirSync(FONTS_DIR)) if (f.endsWith('.ttf')) fs.copyFileSync(path.join(FONTS_DIR, f), path.join(fontsDir, f));
  const heist = path.join(platesDir, 'heist.cube');
  if (!fs.existsSync(heist)) heistCube(heist);
  const end = path.join(platesDir, 'endcard.mp4');
  if (!fs.existsSync(end)) {
    fs.writeFileSync(path.join(platesDir, 'endcard.ass'), endCardAss(W, H));
    await runFfmpeg(['-f', 'lavfi', '-i', `gradients=s=${W}x${H}:r=30:d=${END_S}:c0=0x62BBF3:c1=0x4E308D:x0=0:y0=0:x1=${W}:y1=${H}:speed=0.02`,
      '-vf', 'format=yuv420p,ass=endcard.ass:fontsdir=fonts', '-t', String(END_S), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-an', 'endcard.mp4'], { cwd: platesDir });
  }
  const bed = path.join(platesDir, 'bed-heist.wav');
  if (!fs.existsSync(bed)) {
    const S = meta.shotSeconds; const cuts = [0, S.s1, S.s1 + S.s2, S.s1 + S.s2 + S.s3];
    const total = cuts[3] + END_S;
    const { expr } = bedExpr(cuts, total);
    await runFfmpeg(['-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=48000:d=${r3(total + 0.5)}`, '-af', 'highpass=f=30,lowpass=f=12000,volume=0.8,alimiter=limit=0.9', '-ac', '2', '-c:a', 'pcm_s16le', 'bed-heist.wav'], { cwd: platesDir, timeoutMs: 300000 });
  }
  return { heist, end, bed, fontsDir };
}

/** Per job: measure the backdrop + squad on each clip, write the match LUT. Returns per-shot key levels and stats. */
export async function analyse(shots, meta, jobDir) {
  const out = [];
  for (const s of shots) {
    const frames = await sampleFrames(s.clip, { n: 3, t0: s.in + 0.4, t1: s.in + Math.max(0.5, s.dur - 0.4), crop: meta.squad.crop });
    const levels = keyLevels(frames);
    const stats = fgStats(frames, levels);
    const m = matchTransform(stats, meta.shots[s.id].target);
    const cube = path.join(jobDir, `match-${s.id}.cube`);
    matchCube(cube, m);
    out.push({ id: s.id, levels, stats, match: m, cube: path.basename(cube) });
  }
  return out;
}

/**
 * Build the ffmpeg args. j = { shots:[{id, clip, in, dur, hasAudio}], an:[analyse()], platesDir, meta, assets, jobDir, outFile, hook, captions, opts }
 * Paths for filters are relative to jobDir (cwd), so the plate dir is referenced via a relative path.
 */
export function buildArgs(j) {
  const { meta, shots, an } = j;
  const W = meta.W, H = meta.H, FPS = meta.FPS, SQ = meta.squad;
  const o = { wrap: 0.55, spill: 0.92, grain: 6, threads: '', ...(j.opts || {}) };
  const rel = (p) => path.relative(j.jobDir, p).split(path.sep).join('/');
  const args = [], chains = [];
  let idx = 0;
  const inp = (a) => { args.push(...a); return idx++; };
  shots.forEach((s, i) => {
    const d = s.dur, P = j.platesDir, sh = meta.shots[s.id].shadow, L = an[i].levels;
    const ia = inp(['-ss', r3(s.in), '-t', r3(d + 0.3), '-i', s.clip]);
    const ib = inp(['-t', r3(d), '-i', path.join(P, `${s.id}-bg.mp4`)]);
    const im = inp(['-t', r3(d), '-i', path.join(P, `${s.id}-fgmul.mp4`)]);
    const id = inp(['-t', r3(d), '-i', path.join(P, `${s.id}-fgadd.mp4`)]);
    const il = inp(['-loop', '1', '-framerate', String(FPS), '-t', r3(d), '-i', path.join(P, `${s.id}-light.png`)]);
    const ir = sh ? inp(['-loop', '1', '-framerate', String(FPS), '-t', r3(d), '-i', path.join(P, `${s.id}-shadow.png`)]) : -1;
    const n = (x) => `${x}${i}`;
    const cut = `trim=duration=${r3(d)},setpts=PTS-STARTPTS`;
    // --- key, despill, match, light field
    chains.push(`[${ia}:v]fps=${FPS},${cut},crop=${SQ.crop},scale=${SQ.w}:${SQ.h}:flags=bicubic,format=gbrp,extractplanes=g+b+r[${n('kg')}][${n('kb')}][${n('kr')}]`);
    chains.push(`[${n('kg')}]split[${n('g1')}][${n('g2')}]`, `[${n('kb')}]split[${n('b1')}][${n('b2')}]`, `[${n('kr')}]split[${n('r1')}][${n('r2')}]`);
    chains.push(`[${n('b1')}][${n('r1')}]blend=all_mode=lighten[${n('mx')}]`);
    chains.push(`[${n('g1')}][${n('mx')}]blend=all_mode=subtract,split[${n('d1')}][${n('d2')}]`);
    chains.push(`[${n('d1')}]lut=c0='clip((val-${L.lo})*255/${L.hi - L.lo},0,255)',negate,erosion,gblur=sigma=0.9,lut=c0='clip((val-10)*255/235,0,255)',split=4[${n('a1')}][${n('a2')}][${n('a3')}][${n('a4')}]`);
    chains.push(`[${n('g2')}][${n('d2')}]blend=all_mode=subtract:all_opacity=${o.spill}[${n('gd')}]`);
    chains.push(`[${il}:v]format=gbrp,${cut}[${n('lf')}]`);
    chains.push(`[${n('gd')}][${n('b2')}][${n('r2')}]mergeplanes=0x001020:gbrp,lut3d=file=${an[i].cube}:interp=tetrahedral[${n('fc')}]`);
    chains.push(`[${n('fc')}][${n('lf')}]blend=all_mode=hardlight[${n('fl')}]`);
    // --- plate + light wrap
    chains.push(`[${ib}:v]fps=${FPS},format=gbrp,${cut},split[${n('pm')}][${n('pw')}]`);
    chains.push(`[${n('pw')}]crop=${SQ.w}:${SQ.h}:${SQ.x}:${SQ.y},scale=${SQ.w / 4}:${Math.round(SQ.h / 4)},gblur=sigma=7,scale=${SQ.w}:${SQ.h}[${n('pb')}]`);
    chains.push(`[${n('a1')}]scale=${SQ.w / 4}:${Math.round(SQ.h / 4)},gblur=sigma=4,scale=${SQ.w}:${SQ.h},negate[${n('inv')}]`);
    chains.push(`[${n('inv')}][${n('a2')}]blend=all_mode=multiply,format=gbrp[${n('wm')}]`);
    chains.push(`[${n('pb')}][${n('wm')}]blend=all_mode=multiply[${n('wr')}]`);
    chains.push(`[${n('fl')}][${n('wr')}]blend=all_mode=screen:all_opacity=${o.wrap}[${n('fw')}]`);
    chains.push(`[${n('fw')}][${n('a3')}]alphamerge[${n('fa')}]`);
    let plate = n('pm');
    if (sh) {
      chains.push(`[${n('a4')}]pad=${W}:${H + sh.dy}:0:${SQ.y + sh.dy},crop=${W}:${H}:0:0,scale=${W / 4}:${H / 4},gblur=sigma=${sh.blur / 4},scale=${W}:${H}[${n('sb')}]`);
      chains.push(`[${ir}:v]format=gray,${cut}[${n('sr')}]`);
      chains.push(`[${n('sb')}][${n('sr')}]blend=all_mode=multiply,lut=c0='255-val*${sh.opacity}',format=gbrp[${n('sk')}]`);
      chains.push(`[${n('pm')}][${n('sk')}]blend=all_mode=multiply[${n('ps')}]`);
      plate = n('ps');
    } else {
      chains.push(`[${n('a4')}]nullsink`);
    }
    chains.push(`[${plate}][${n('fa')}]overlay=x=${SQ.x}:y=${SQ.y}:format=gbrp:shortest=1[${n('c1')}]`);
    // --- foreground layers, grade, camera, grain, cut flash
    chains.push(`[${im}:v]fps=${FPS},format=gbrp,${cut}[${n('mu')}]`, `[${id}:v]fps=${FPS},format=gbrp,${cut}[${n('ad')}]`);
    chains.push(`[${n('c1')}][${n('mu')}]blend=all_mode=multiply[${n('c2')}]`);
    chains.push(`[${n('c2')}][${n('ad')}]blend=all_mode=addition[${n('c3')}]`);
    const flash = i === 0 ? `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.7:t=fill:enable='lt(t,0.12)'` : `drawbox=x=0:y=0:w=iw:h=ih:color=0xFFE9C4@0.45:t=fill:enable='lt(t,0.067)'`;
    chains.push(`[${n('c3')}]lut3d=file=${rel(j.assets.heist)}:interp=tetrahedral,${perspective(s.id, W, H, FPS)},format=yuv420p,noise=c0s=${o.grain}:c0f=t+u:c1s=2:c1f=t:c2s=2:c2f=t,${flash},setsar=1[${n('v')}]`);
    if (s.hasAudio) chains.push(`[${ia}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${r3(d)},asetpts=PTS-STARTPTS[${n('a')}]`);
    else chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${r3(d)},aformat=sample_fmts=fltp[${n('a')}]`);
  });
  const ie = inp(['-i', j.assets.end]);
  const ibed = inp(['-i', j.assets.bed]);
  chains.push(`[${ie}:v]fps=${FPS},format=yuv420p,setsar=1,trim=duration=${END_S},setpts=PTS-STARTPTS[vend]`);
  chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${END_S},aformat=sample_fmts=fltp[aend]`);
  chains.push(`${shots.map((_, i) => `[v${i}][a${i}]`).join('')}[vend][aend]concat=n=${shots.length + 1}:v=1:a=1[vcat][voice]`);
  fs.writeFileSync(path.join(j.jobDir, 'subs.ass'), compositeAss({ W, H, shots, hook: j.hook, captions: j.captions }));
  chains.push(`[vcat]ass=subs.ass:fontsdir=${rel(j.assets.fontsDir)}[vout]`);
  const T = shots.reduce((a, s) => a + s.dur, 0), total = T + END_S;
  chains.push(`[${ibed}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${r3(total)},asetpts=PTS-STARTPTS,volume='if(lt(t,${r3(T)}),0.55,0.9)':eval=frame,afade=t=out:st=${r3(total - 0.8)}:d=0.8[bed]`);
  chains.push(`[voice][bed]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.92[aout]`);
  const thr = o.threads ? ['-filter_complex_threads', String(o.threads)] : [];
  args.push(...thr, '-filter_complex', chains.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', o.preset || 'veryfast', '-crf', '19', '-profile:v', 'high', '-level:v', '4.2', '-maxrate', '12M', '-bufsize', '24M',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), ...(o.threads ? ['-threads', String(o.threads)] : []),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-t', r3(total), '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', j.outFile);
  return args;
}

/** Render one composite reel. Returns timings. */
export async function renderComposite(j, { onProgress } = {}) {
  const t0 = Date.now();
  fs.mkdirSync(j.jobDir, { recursive: true });
  j.assets = j.assets || await ensureAssets(j.platesDir, j.meta);
  const t1 = Date.now();
  j.an = await analyse(j.shots, j.meta, j.jobDir);
  const t2 = Date.now();
  const total = j.shots.reduce((a, s) => a + s.dur, 0) + END_S;
  await runFfmpeg(buildArgs(j), { cwd: j.jobDir, timeoutMs: Number(process.env.REEL_COMPOSITE_TIMEOUT_MS) || 300000, onProgress: ({ outS, speed }) => onProgress?.({ value: Math.min(1, outS / total), speed }) });
  const t3 = Date.now();
  return { assetsMs: t1 - t0, analyseMs: t2 - t1, renderMs: t3 - t2, totalMs: t3 - t0, seconds: total, analysis: j.an.map((a) => ({ id: a.id, levels: a.levels, lum: a.stats.p50, gain: a.match.gain })) };
}
