// Public text for Squad Reel (CHECK_build item 12, CONTRACT section 13).
// Everything that can reach the reel (burned-in captions and hook), the TV or the share card is either a vetted
// bank line (banks/<template>.json, reviewed) or a fixed template with typed slots. Claude only PICKS ids.
//
// Every bank, list and template is registered with core's ctx.safety (CONTRACT 13) and publicText() goes through
// it, so the strict bus and the share card accept exactly these lines. The local engine mirrors core for tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from './templates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BANKS = Object.fromEntries(TEMPLATES.map((t) => [t.id, JSON.parse(fs.readFileSync(path.join(HERE, 'banks', `${t.id}.json`), 'utf8'))]));
export const SQUAD = [2, 3, 4, 5];
const fill = (text, n) => text.replace(/\{n\}/g, String(n));

// ---------- the lines ----------
/** id -> { text, kind: 'caption'|'hook'|'post', tpl, shot?, style? } for every bank line. */
export const LINES = new Map();
for (const [tpl, b] of Object.entries(BANKS)) {
  for (const [shot, arr] of Object.entries(b.captions)) for (const l of arr) LINES.set(l.id, { text: l.text, kind: 'caption', tpl, shot: Number(shot) });
  for (const l of b.hooks) LINES.set(l.id, { text: l.text, kind: 'hook', tpl, style: l.style });
  for (const l of b.posts) LINES.set(l.id, { text: l.text, kind: 'post', tpl });
}
/** every text a line can become (lines with the {n} squad slot, filled for 2..5) */
export function variants(text) { return text.includes('{n}') ? SQUAD.map((n) => fill(text, n)) : [text]; }

export const STYLE_LABELS = {
  title: 'Title card hook, 2s mein padh lo',
  question: 'Question hook, jawab ke liye rukna padega',
  pov: 'POV hook, viewer khud ko scene mein dekhe',
  countdown: 'Countdown hook, kuch hone wala hai',
  alert: 'Alert hook, scroll rokne wala word',
  callout: 'Callout hook, tag karne ka mann kare',
};

// ---------- orchestra + TV lines (fixed text and templates with typed slots) ----------
// Slot types follow CONTRACT 13.1 (CHECK_build 13): int, enum (list:<name>), count. Never a free-text slot.
export const LISTS = {
  tpl: TEMPLATES.map((t) => t.name),
  dec: Array.from({ length: 1000 }, (_, i) => (i / 10).toFixed(1)), // "0.0" .. "99.9" (seconds, MB, speed)
  src: ['Claude', 'Mock', 'Offline', 'Demo'],
  caplines: [...new Set([...LINES.values()].filter((l) => l.kind === 'caption').flatMap((l) => variants(l.text)))],
  hooklines: [...new Set([...LINES.values()].filter((l) => l.kind === 'hook').flatMap((l) => variants(l.text)))],
  styles: Object.values(STYLE_LABELS),
};
const SHOT = 'int:1..3';
const DEC = 'list:dec';

export const ORX_BANK = {
  a_director: 'Director', a_captions: 'Captions', a_hook: 'Hook', a_editor: 'Editor', a_thumbnail: 'Thumbnail',
  r_director: 'Beat cut plan', r_captions: 'Claude captions', r_hook: 'Claude opener', r_editor: 'ffmpeg 9:16 cut', r_thumbnail: 'Cover pick',
  k_captions: 'Har shot ke liye Hinglish caption', k_hook: 'Opening text, 0-2s', k_editor: 'Trim, 9:16 crop, captions burn, beat cuts', k_thumbnail: 'Har shot se ek frame score karo, cover chuno',
  h_opener: '0-2s opener', h_captions: '3 captions', h_hook: 'hook text', h_cuts: '3 cuts on the beat', h_final: 'final cut', h_cover: 'cover ready',
  l_free: 'Render slot free, abhi shuru', l_endcard: 'Zenith end card (2s) + bed fade-out', l_fail: 'Render atak gaya. Ek baar phir try karte hain.',
  kicker: 'Squad Reel ready', card_kicker: 'Humari Squad Reel', card_line: 'AI agents ne 20 second mein edit kiya',
};

/** name -> [text with {slots}, { slot: type }]. Worker log lines (reel-worker/src/jobs.js) must match these exactly. */
export const ORX_TEMPLATES = {
  o_title: ['Squad Reel: {tpl}', { tpl: 'list:tpl' }],
  o_tpl: ['{tpl}', { tpl: 'list:tpl' }],
  o_clips: ['{tpl}: 3 clips mile ({a}s, {b}s, {c}s), squad of {n}', { tpl: 'list:tpl', a: DEC, b: DEC, c: DEC, n: 'int:2..5' }],
  o_plan_shot: ['Shot {shot}: {beats} beats = {dur}s from {at}s @ {bpm} BPM', { shot: SHOT, beats: 'int:1..99', dur: DEC, at: DEC, bpm: 'int:60..200' }],
  o_durs: ['{a}s / {b}s / {c}s', { a: DEC, b: DEC, c: DEC }],
  o_cap_src: ['{src}: 3 captions from the {tpl} bank', { src: 'list:src', tpl: 'list:tpl' }],
  o_cap_line: ['Shot {shot}: "{line}"', { shot: SHOT, line: 'list:caplines' }],
  o_hook_src: ['{src}: "{line}"', { src: 'list:src', line: 'list:hooklines' }],
  o_hook_style: ['Style: {style}', { style: 'list:styles' }],
  o_queue: ['Queue update: {n} aage', { n: 'count' }],
  o_done: ['Reel ready: {dur}s, 1080x1920, {mb} MB, {secs}s total', { dur: DEC, mb: DEC, secs: 'count' }],
  w_queue: ['Render queue: {n} aage, ETA ~{s}s', { n: 'count', s: 'count' }],
  w_plan: ['{tpl} @ {bpm} BPM: {b1} + {b2} + {b3} beats + 2s end card = {total}s', { tpl: 'list:tpl', bpm: 'int:60..200', b1: 'int:1..99', b2: 'int:1..99', b3: 'int:1..99', total: DEC }],
  w_shot: ['Shot {shot}: {w}x{h} {dur}s -> {a}s to {b}s, crop 1080x1920', { shot: SHOT, w: 'int:16..8192', h: 'int:16..8192', dur: DEC, a: DEC, b: DEC }],
  w_burn: ['Burning hook (0-2s) + {n} captions, cuts at {c1}s, {c2}s', { n: 'int:0..3', c1: DEC, c2: DEC }],
  w_enc: ['Encoding shot {shot}/3, {speed}x realtime', { shot: SHOT, speed: DEC }],
  w_enc0: ['Encoding shot {shot}/3', { shot: SHOT }],
  w_done: ['Rendered in {s}s: {w}x{h} h264 + AAC, {dur}s, {mb} MB, faststart', { s: DEC, w: 'int:16..8192', h: 'int:16..8192', dur: DEC, mb: DEC }],
  w_frame: ['Shot {shot} @ {at}s: detail {kb} KB, brightness {luma}%, score {score}', { shot: SHOT, at: DEC, kb: 'count', luma: 'int:0..100', score: 'count' }],
  w_cover: ['Cover = shot {shot} frame (score {score})', { shot: SHOT, score: 'count' }],
};

// ---------- local engine (same semantics as core's ctx.safety; the tests use it, and it backs up a missing core) ----------
function makeSlotOk(lists) {
  return function slotOk(type, v) {
    const vals = Array.isArray(type) ? type : typeof type === 'string' && type.startsWith('list:') ? lists.get(type.slice(5)) : null;
    if (vals) return vals.includes(String(v));
    if (type === 'count') return /^\d{1,7}$/.test(String(v));
    const m = /^int:(-?\d+)\.\.(-?\d+)$/.exec(type);
    if (m) return /^-?\d+$/.test(String(v)) && Number(v) >= Number(m[1]) && Number(v) <= Number(m[2]);
    return false;
  };
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compile(text) {
  const names = [];
  const re = new RegExp(`^${esc(text).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return '(.+?)'; })}$`);
  return { re, names };
}

/**
 * createPublic({ safety }): registers every bank line, list and template (with core when ctx.safety is given)
 * and returns { publicText, isPublic, line, core }. Registration errors from core are thrown: a line core
 * rejects must be fixed in the bank, or strict mode would drop it on the TV.
 */
export function createPublic({ exp = 'reel', safety = null } = {}) {
  const lists = new Map();
  const bankLines = new Map();
  const templates = new Map();
  const slotOk = makeSlotOk(lists);
  const core = safety && typeof safety.publicText === 'function' ? safety : null;

  function list(name, values) { lists.set(name, values.map(String)); core?.list(name, values); }
  function bank(name, obj) { bankLines.set(name, { ...(bankLines.get(name) || {}), ...obj }); core?.bank(name, obj); }
  function template(name, text, slots) { templates.set(name, { text, slots, ...compile(text) }); core?.template(name, text, slots); }

  /** { pt, text } for a bank line (publicText(bank, id)) or a template (publicText(name, slots)). Throws when unknown. */
  function publicText(name, arg) {
    if (core) return core.publicText(name, arg);
    if (typeof arg === 'string') {
      const text = bankLines.get(name)?.[arg];
      if (text === undefined) throw Object.assign(new Error(`unknown line ${name}.${arg}`), { code: 'bad_line' });
      return { pt: `${exp}.${name}:${arg}`, text };
    }
    const t = templates.get(name);
    if (!t) throw Object.assign(new Error(`unknown template ${name}`), { code: 'bad_line' });
    for (const n of t.names) if (!slotOk(t.slots[n], arg?.[n])) throw Object.assign(new Error(`bad slot ${name}.${n}`), { code: 'bad_slot' });
    return { pt: `${exp}.${name}`, text: t.text.replace(/\{(\w+)\}/g, (_, n) => String(arg[n])) };
  }

  /** true when text is exactly a registered bank line or matches a template (what core's strict bus checks). */
  function isPublic(text) {
    if (typeof text !== 'string' || /^-?\d+(\.\d+)?%?$/.test(text)) return true;
    for (const b of bankLines.values()) for (const v of Object.values(b)) if (v === text) return true;
    for (const t of templates.values()) {
      const m = t.re.exec(text);
      if (m && t.names.every((n, i) => slotOk(t.slots[n], m[i + 1]))) return true;
    }
    return false;
  }

  for (const [name, values] of Object.entries(LISTS)) list(name, values);
  const plain = {};
  for (const [id, l] of LINES) {
    if (l.text.includes('{n}')) template(id, l.text, { n: 'int:2..5' }); // the only slot in the banks: squad size
    else plain[id] = l.text;
  }
  bank('lines', plain);
  bank('orx', ORX_BANK);
  for (const [name, [text, slots]] of Object.entries(ORX_TEMPLATES)) template(name, text, slots);

  /** A bank line as public text, with the squad-size slot filled. */
  function line(id, n = 3) {
    const l = LINES.get(id);
    if (!l) throw Object.assign(new Error(`unknown line ${id}`), { code: 'bad_line' });
    return { id, ...(l.text.includes('{n}') ? publicText(id, { n }) : publicText('lines', id)) };
  }

  return { publicText, isPublic, line, core: !!core };
}
