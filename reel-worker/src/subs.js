// Burned-in text as an ASS subtitle file, rendered by ffmpeg's `ass` filter (libass) with the vendored fonts.
// Why ASS and not drawtext: the linux ffmpeg-static build (7.x) has no drawtext (it needs harfbuzz), but every
// build we use has libass. One `ass=` filter also costs less than a dozen drawtext filters.
//
// Text arrives already vetted (bank lines resolved on play-web, CHECK_build 12) and is cleaned again here:
// ASCII only, no override braces or backslashes, so nothing can inject ASS tags.
import { TEMPLATES, W, H, HOOK_S } from './templates.js';
import { cleanText, wrapLines, charsPerLine } from './text.js';

export const FAMILY = {
  'PlusJakartaSans-ExtraBold.ttf': 'ZR Jakarta ExtraBold',
  'PlusJakartaSans-SemiBold.ttf': 'ZR Jakarta SemiBold',
  'Newsreader-SemiBold.ttf': 'ZR Newsreader SemiBold',
  'Newsreader-MediumItalic.ttf': 'ZR Newsreader Italic',
  'JetBrainsMono-Bold.ttf': 'ZR JetBrains Bold',
};
const SIZE = 1.25; // libass sizes by line height, drawtext-like em sizes need a little more

/** 'white' | '0xRRGGBB' | '0xRRGGBB@0.8' -> ASS &HAABBGGRR */
export function assColor(c = 'white') {
  const [hex, a] = String(c).split('@');
  const rgb = hex === 'white' ? 'FFFFFF' : hex === 'black' ? '000000' : hex.replace(/^0x/i, '').padStart(6, '0');
  const alpha = a === undefined ? 0 : Math.round((1 - Number(a)) * 255);
  const h2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
  return `&H${h2(alpha)}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
}
const ts = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t - h * 3600 - m * 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};
const safe = (s) => cleanText(s, 120).replace(/[{}\\]/g, '');

function style(name, st, size) {
  const font = FAMILY[st.font] || 'ZR Jakarta ExtraBold';
  const primary = assColor(st.color);
  if (st.box) {
    // BorderStyle 3 = opaque box behind each line, OutlineColour = box colour, Outline = padding
    return `Style: ${name},${font},${Math.round(size * SIZE)},${primary},${primary},${assColor(st.box)},${assColor(st.box)},0,0,0,0,100,100,0,0,3,${Math.round(size * 0.28)},0,5,40,40,0,1`;
  }
  return `Style: ${name},${font},${Math.round(size * SIZE)},${primary},${primary},${assColor('0x000000@0.85')},${assColor('0x000000@0.6')},0,0,0,0,100,100,0,0,1,2,${Math.max(2, Math.round(size * 0.06))},5,40,40,0,1`;
}

/** Build the ASS file for one reel: hook (0-2 s), one caption per shot, handle watermark during the shots. */
export function reelAss({ template, plan, captions = [], hook = '' }) {
  const t = TEMPLATES[template];
  const capMono = t.caption.font.startsWith('JetBrains');
  const hookMono = t.hook.font.startsWith('JetBrains');
  const up = (s) => (t.caption.upper ? s.toUpperCase() : s);
  const ev = [];
  const y = (frac) => Math.round(H * frac);
  const wmY = t.look.letterbox ? 222 : 66;
  ev.push(`Dialogue: 0,${ts(0)},${ts(plan.shotsTotal)},Mark,,0,0,0,,{\\an7\\pos(48,${wmY})}@zenith_school_of_ai`);
  if (hook) {
    const lines = wrapLines(up(safe(hook)), Math.floor(charsPerLine(t.hook.size * SIZE * 0.92, hookMono) * (t.caption.upper ? 0.9 : 1)), 3);
    ev.push(`Dialogue: 2,${ts(0)},${ts(HOOK_S)},Hook,,0,0,0,,{\\an5\\pos(${W / 2},${y(0.43)})\\fad(250,300)}${lines.join('\\N')}`);
  }
  plan.shots.forEach((s, i) => {
    const cap = safe(captions[i] || '');
    if (!cap) return;
    const st = s.start + (i === 0 && hook ? HOOK_S + 0.05 : 0.18);
    const lines = wrapLines(`${t.caption.prefix}${up(cap)}`, Math.floor(charsPerLine(t.caption.size * SIZE * 0.92, capMono) * (t.caption.upper ? 0.8 : 1)), 2);
    ev.push(`Dialogue: 1,${ts(st)},${ts(s.start + s.dur)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${y(t.caption.y)})\\fad(200,0)}${lines.join('\\N')}`);
  });
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Hook', t.hook, t.hook.size),
    style('Cap', t.caption, t.caption.size),
    `Style: Mark,ZR Jakarta ExtraBold,${Math.round(34 * SIZE)},${assColor('0xFFFFFF@0.88')},${assColor('white')},${assColor('0x000000@0.6')},${assColor('0x000000@0.5')},0,0,0,0,100,100,0,0,1,1,2,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...ev, '',
  ].join('\n');
}

/** The 2 s Zenith end card text (pre-rendered once at boot). */
export function endCardAss(seconds = 2) {
  const line = (font, size, color, x, y, delayMs, text, extra = '') => `Dialogue: 0,${ts(0)},${ts(seconds)},Base,,0,0,0,,{\\an5\\pos(${x},${y})\\fn${font}\\fs${Math.round(size * SIZE)}\\1c${assColor(color).slice(0, 2)}${assColor(color).slice(4)}&\\fad(${delayMs},0)${extra}}${text}`;
  const box = (x, y, w, h, color) => `Dialogue: 0,${ts(0)},${ts(seconds)},Box,,0,0,0,,{\\an7\\pos(${x},${y})\\p1\\1c${assColor(color).slice(0, 2)}${assColor(color).slice(4)}&\\1a&H${assColor(color).slice(2, 4)}&}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}{\\p0}`;
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Base,ZR Jakarta SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`,
    `Style: Box,ZR Jakarta SemiBold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    box(0, 0, W, H, '0x19173D@0.16'),
    box(90, 600, 900, 760, '0x0B0A24@0.42'),
    box(90, 600, 900, 6, '0x62BBF3@0.9'),
    line('ZR JetBrains Bold', 34, '0xBFE6FF', 540, 700, 50, 'MADE WITH AI AGENTS'),
    line('ZR Newsreader SemiBold', 170, 'white', 540, 860, 120, 'Zenith'),
    line('ZR Newsreader Italic', 86, '0xE6DEFF', 540, 1010, 200, 'School of AI'),
    box(160, 1104, 760, 92, '0x4E308D@0.92'),
    line('ZR Jakarta ExtraBold', 62, 'white', 540, 1150, 300, '@zenith_school_of_ai'),
    line('ZR Jakarta SemiBold', 36, '0xF2F0FF', 540, 1280, 400, 'B.Tech in AI + mini-MBA. Ek degree, KRMU ki.'),
    line('ZR JetBrains Bold', 40, '0xBFE6FF', 540, 1530, 500, 'play.zenithschool.ai'),
    line('ZR Jakarta SemiBold', 34, '0xD9D4F5', 540, 1600, 550, 'Squad Reel Studio at KRMU Ideas 4.0'),
    '',
  ].join('\n');
}
