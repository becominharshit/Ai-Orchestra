// Content for AI ya Asli?: load the manifest, validate it (npm run asli:check), and the Curator's round picker.
// Pure functions, no Express, so scripts and tests can use them directly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanText } from '../../../core/server/textfilter.js';

export const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// ASLI_CONTENT_DIR points scripts, tests and the server at another content folder (same layout).
export const CONTENT_DIR = process.env.ASLI_CONTENT_DIR ? path.resolve(process.env.ASLI_CONTENT_DIR) : path.join(HERE, 'content');
export const MANIFEST = path.join(CONTENT_DIR, 'manifest.json');
export const MEDIA_DIR = path.join(CONTENT_DIR, 'media');

export const TYPES = ['text', 'code', 'audio', 'image'];
export const ID_PREFIX = { text: 't', code: 'c', audio: 'a', image: 'i' };
export const LIMITS = {
  text: 140,        // characters: readable in about 6 s, and the TV rejects free text over 140
  codeChars: 340,
  codeLines: 8,
  codeCols: 70,     // the phone wraps long lines (pre-wrap); keep them short anyway
  reveal: 110,      // the "kaise pehchana" tip
  credit: 140,
  transcript: 90,
  mediaBytes: { audio: 400_000, image: 900_000 },
};
// Round time per item (ms). The timer for audio starts when the clip starts.
export function roundMs(item) {
  if (item.type === 'audio') return 8000;
  if (item.type === 'code') return 7000;
  if (item.type === 'image') return 6000;
  return (item.body || '').length > 110 ? 7000 : 6000;
}

// Words that must never appear in game content (PG, no politics, no religion jokes, nothing scary).
// Word-boundary match, case-insensitive. Keep this list boring and broad; false positives are fine, fix the copy.
const BANNED = [
  'bjp', 'congress', 'modi', 'rahul', 'kejriwal', 'election', 'vote', 'party worker', 'pakistan', 'china',
  'god', 'bhagwan', 'allah', 'jesus', 'ram', 'krishna', 'shiva', 'mandir', 'masjid', 'church', 'temple', 'religion', 'hindu', 'muslim', 'sikh', 'christian',
  'ghost', 'bhoot', 'blood', 'khoon', 'kill', 'murder', 'dead', 'die', 'suicide', 'horror', 'drugs', 'daaru', 'sharab', 'beer', 'sexy', 'nude',
  'idiot', 'stupid', 'pagal', 'ullu', 'fat', 'mota', 'kaala', 'gora',
];
const BANNED_RE = new RegExp(`\\b(${BANNED.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'i');
const DASHES = /[\u2012\u2013\u2014\u2015\u2E3A\u2E3B]/; // figure, en, em, horizontal bar, two/three-em dashes

export function loadManifest(file = MANIFEST) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(json.items)) throw new Error('manifest.items must be an array');
  return json;
}
export function saveManifest(json, file = MANIFEST) {
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

export const isPlayable = (it) => it.approved === true && !it.teaser;

/** Text that a visitor or the TV will see for this item (used by checks). */
export function visibleStrings(it) {
  return [it.body, it.transcript, it.reveal_line, it.credit].filter((s) => typeof s === 'string');
}

/**
 * Validate the manifest. Returns { errors: [], warnings: [], stats }.
 * errors fail npm run asli:check; warnings are printed.
 * opts.mediaDir: where media files live (checked for approved audio/image items).
 * opts.tvCheck: optional (event) => { ok, reason } (core bus checkEvent) to prove every round is TV-safe.
 */
export function validate(json, { mediaDir = MEDIA_DIR, tvCheck = null } = {}) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const items = json.items || [];
  for (const it of items) {
    const at = it.id || '(no id)';
    const err = (m) => errors.push(`${at}: ${m}`);
    if (!it.id || typeof it.id !== 'string') { err('missing id'); continue; }
    if (seen.has(it.id)) err('duplicate id');
    seen.add(it.id);
    if (!TYPES.includes(it.type)) { err(`type must be one of ${TYPES.join('/')}`); continue; }
    if (!new RegExp(`^${ID_PREFIX[it.type]}\\d{3}$`).test(it.id)) err(`id must look like ${ID_PREFIX[it.type]}001 (neutral, never hints the answer)`);
    if (!['ai', 'real'].includes(it.answer)) err('answer must be ai or real');
    if (typeof it.approved !== 'boolean') err('approved must be true or false');
    if (typeof it.reveal_line !== 'string' || !it.reveal_line.trim()) err('reveal_line missing');
    else if (it.reveal_line.length > LIMITS.reveal) err(`reveal_line too long (${it.reveal_line.length} > ${LIMITS.reveal})`);
    for (const s of visibleStrings(it)) {
      if (DASHES.test(s)) err('contains an em-dash or en-dash (use a comma, colon or full stop)');
      const bad = s.match(BANNED_RE);
      if (bad) err(`contains a blocked word "${bad[1]}" (PG / no politics / no religion / nothing scary)`);
    }
    if (it.approved) {
      if (typeof it.credit !== 'string' || !it.credit.trim()) err('approved items need a credit');
      else if (it.credit.length > LIMITS.credit) err(`credit too long (${it.credit.length})`);
      if (it.answer === 'ai' && !/^AI \(/.test(it.credit || '')) err('AI items need credit "AI (<tool>)", e.g. "AI (Claude)"');
      if (it.answer === 'real' && /^AI\b/.test(it.credit || '')) err('real items cannot have an AI credit');
      if (it.answer === 'real' && (it.type === 'audio' || it.type === 'image') && !it.consent) err('real student media needs consent: true (see inbox/README.md)');
    }
    if (it.type === 'text') {
      if (typeof it.body !== 'string' || !it.body.trim()) err('text needs body');
      else if (it.body.length > LIMITS.text) err(`text too long (${it.body.length} > ${LIMITS.text})`);
    }
    if (it.type === 'code') {
      if (typeof it.body !== 'string' || !it.body.trim()) err('code needs body');
      else {
        const lines = it.body.split('\n');
        if (it.body.length > LIMITS.codeChars) err(`code too long (${it.body.length} > ${LIMITS.codeChars} chars)`);
        if (lines.length > LIMITS.codeLines) err(`code has ${lines.length} lines (max ${LIMITS.codeLines})`);
        const wide = Math.max(...lines.map((l) => l.length));
        if (wide > LIMITS.codeCols) err(`code line too wide (${wide} > ${LIMITS.codeCols})`);
      }
    }
    if (it.type === 'audio' || it.type === 'image') {
      if (typeof it.src !== 'string' || !/^[a-z]\d{3}\.(m4a|mp3|jpg|webp|png)$/.test(it.src)) err('src must be a neutral file name like a001.m4a / i001.jpg');
      else if (it.approved) {
        const f = path.join(mediaDir, it.src);
        if (!fs.existsSync(f)) err(`media file missing: content/media/${it.src}`);
        else if (fs.statSync(f).size > LIMITS.mediaBytes[it.type]) err(`media file too big (${fs.statSync(f).size} bytes)`);
      }
      if (it.type === 'audio' && it.transcript && it.transcript.length > LIMITS.transcript) err('transcript too long');
    }
    if (tvCheck && it.approved) {
      const r = tvCheck({ t: 'custom', name: 'round', data: tvRoundData(it, 1, 'ask') });
      if (!r.ok) err(`not TV-safe: ${r.reason}`);
      const r2 = tvCheck({ t: 'custom', name: 'round', data: { round: 1, state: 'reveal', answer: it.answer, tip: it.reveal_line, credit: it.credit } });
      if (!r2.ok) err(`reveal not TV-safe: ${r2.reason}`);
    }
  }

  const stats = statsFor(items);
  const p = stats.playable;
  if (p.total < 20) errors.push(`only ${p.total} playable items (need 20+ for varied games)`);
  const aiShare = p.total ? p.ai / p.total : 0;
  if (aiShare < 0.4 || aiShare > 0.6) errors.push(`answers not balanced: ${p.ai} AI vs ${p.real} real among playable items (need 40-60% AI)`);
  for (const t of TYPES) {
    const s = stats.byType[t];
    if (!s.ai && !s.real) continue;
    if (s.ai < 2 || s.real < 2) warnings.push(`${t}: ${s.ai} AI / ${s.real} real approved, so the Curator skips ${t} rounds until both sides have 2+`);
    else if (Math.min(s.ai, s.real) / (s.ai + s.real) < 0.3) warnings.push(`${t}: ${s.ai} AI / ${s.real} real is lopsided; add more ${s.ai < s.real ? 'AI' : 'real'} ${t} items`);
  }
  const pending = items.filter((it) => !it.approved).length;
  if (pending) warnings.push(`${pending} item(s) waiting for review (approved:false). Approve with npm run asli:approve -- <ids>`);
  return { errors, warnings, stats };
}

export function statsFor(items) {
  const byType = Object.fromEntries(TYPES.map((t) => [t, { ai: 0, real: 0, pending: 0 }]));
  const playable = { total: 0, ai: 0, real: 0 };
  for (const it of items) {
    if (!byType[it.type]) continue;
    if (!it.approved) { byType[it.type].pending += 1; continue; }
    if (it.teaser) continue;
    byType[it.type][it.answer] += 1;
    playable.total += 1;
    playable[it.answer] += 1;
  }
  return { byType, playable, teasers: items.filter((it) => it.approved && it.teaser).length, all: items.length };
}

/** What the phone and the TV see before the answer (no answer, no credit). */
export function publicRound(it, i) {
  const r = { i, type: it.type, limitMs: roundMs(it), lang: it.lang || '' };
  if (it.type === 'text' || it.type === 'code') r.body = it.body;
  if (it.type === 'audio') { r.src = `/api/asli/media/${it.id}`; r.transcript = it.transcript || ''; }
  if (it.type === 'image') { r.src = `/api/asli/media/${it.id}`; r.alt = it.alt || 'Ek photo'; }
  return r;
}

/** TV payload for one round (bus custom event data). Keys must be in the TV-safe allowlist. */
export function tvRoundData(it, round, state) {
  const d = { round, type: it.type, state };
  if (it.type === 'text') d.text = it.body;
  if (it.type === 'code') d.lines = it.body.split('\n').map(tvLine); // { x: indent, text } per line (TV text limit 140)
  if (it.type === 'audio') d.text = it.transcript || '';
  if (it.type === 'image') d.image = `/api/asli/media/${it.id}`;
  return d;
}

/**
 * One code line as it travels to the TV: the bus cleans text (collapses spaces), so the indent goes as a number
 * and the text is exactly what core's cleanText makes of it (that is also what lib/public.js registers).
 */
export function tvLine(line) {
  const indent = (String(line).match(/^ */) || [''])[0].length;
  return { x: Math.min(12, indent), text: cleanText(String(line)) || '' };
}

// ---------------- Curator ----------------

/** Small seeded RNG (mulberry32) so tests and the hero run are repeatable. */
export function rng(seed = Date.now()) {
  let a = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Which types can be played: both answers need at least 2 playable items. */
export function activeTypes(items) {
  const s = statsFor(items).byType;
  return TYPES.filter((t) => s[t].ai >= 2 && s[t].real >= 2);
}

/** Round quotas per type for a 10-round game. Text always leads; the rest only when active. */
export function quotas(active, count = 10) {
  const q = { text: 0, code: 0, audio: 0, image: 0 };
  if (active.includes('code')) q.code = 2;
  if (active.includes('audio')) q.audio = 2;
  if (active.includes('image')) q.image = 2;
  q.text = count - q.code - q.audio - q.image;
  if (!active.includes('text')) { // never happens with the seed set, but stay safe
    const other = active.filter((t) => t !== 'text');
    for (let i = 0; q.text > 0 && other.length; i++, q.text--) q[other[i % other.length]] += 1;
  }
  return q;
}

/**
 * Curator: pick a balanced 10-round set.
 *   - types by quota (text, code, voice, images when there are enough of both answers)
 *   - 4 to 6 AI answers (so counting does not give away the last rounds)
 *   - unseen items first (opts.seen = ids this phone saw recently)
 *   - never two items of the same group (the same voice line read by AI and by a student)
 *   - at most 2 "modern" AI texts while there are no real modern texts (otherwise "modern = AI" is a giveaway)
 *   - round 1 is text, no more than 3 of the same answer in a row
 * Returns { items, plan: { byType, ai, real } }.
 */
export function curate(allItems, { seen = [], seed = Date.now(), count = 10 } = {}) {
  const r = rng(seed);
  const pool = allItems.filter(isPlayable);
  const active = activeTypes(pool);
  const q = quotas(active, count);
  const seenSet = new Set(seen);
  const realModernText = pool.some((it) => it.type === 'text' && it.answer === 'real' && it.style === 'modern');

  // How many AI rounds: 4, 5 or 6 (5 most often).
  const x = r();
  const aiTarget = x < 0.25 ? 4 : x < 0.75 ? 5 : 6;

  // Split each type's quota into AI / real, respecting what exists.
  const avail = (t, a) => pool.filter((it) => it.type === t && it.answer === a).length;
  const split = {};
  let aiSum = 0;
  for (const t of TYPES) {
    const n = q[t];
    if (!n) continue;
    let ai = Math.round(n / 2 + (r() < 0.5 ? -0.01 : 0.01));
    ai = Math.min(avail(t, 'ai'), Math.max(n - avail(t, 'real'), ai));
    split[t] = { ai, real: n - ai };
    aiSum += ai;
  }
  // Nudge towards aiTarget using text (largest pool), then the others.
  for (const t of ['text', 'code', 'audio', 'image']) {
    if (!split[t]) continue;
    while (aiSum < aiTarget && split[t].real > 0 && split[t].ai < avail(t, 'ai')) { split[t].ai++; split[t].real--; aiSum++; }
    while (aiSum > aiTarget && split[t].ai > 0 && split[t].real < avail(t, 'real')) { split[t].ai--; split[t].real++; aiSum--; }
  }

  const picked = [];
  const groups = new Set();
  let modernAi = 0;
  const take = (t, a, n) => {
    const cands = shuffle(pool.filter((it) => it.type === t && it.answer === a), r)
      .sort((x1, x2) => (seenSet.has(x1.id) ? 1 : 0) - (seenSet.has(x2.id) ? 1 : 0));
    let got = 0;
    for (const it of cands) {
      if (got >= n) break;
      if (it.group && groups.has(it.group)) continue;
      if (t === 'text' && a === 'ai' && it.style === 'modern' && !realModernText && modernAi >= 2) continue;
      picked.push(it);
      if (it.group) groups.add(it.group);
      if (t === 'text' && a === 'ai' && it.style === 'modern') modernAi++;
      got++;
    }
    // Fallback (tiny pools): relax the group/modern rules rather than play fewer rounds.
    for (const it of cands) { if (got >= n) break; if (!picked.includes(it)) { picked.push(it); got++; } }
  };
  for (const t of TYPES) if (split[t]) { take(t, 'ai', split[t].ai); take(t, 'real', split[t].real); }

  const items = order(picked, r);
  const plan = { byType: Object.fromEntries(TYPES.map((t) => [t, items.filter((it) => it.type === t).length])), ai: items.filter((it) => it.answer === 'ai').length };
  plan.real = items.length - plan.ai;
  return { items, plan };
}

/** Order: text first, media spread out, no more than 3 same answers in a row. */
function order(items, r) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const a = shuffle(items, r);
    if (a[0] && a[0].type !== 'text' && a.some((it) => it.type === 'text')) continue;
    let ok = true;
    for (let i = 3; i < a.length && ok; i++) if (a[i].answer === a[i - 1].answer && a[i].answer === a[i - 2].answer && a[i].answer === a[i - 3].answer) ok = false;
    for (let i = 1; i < a.length && ok; i++) if (a[i].type !== 'text' && a[i].type === a[i - 1].type && a[i].type !== 'code') ok = false;
    if (ok) return a;
  }
  return shuffle(items, r);
}

/** Extra TV-safe keys this experience uses in bus payloads (server.js registers them with bus.allowKeys). */
export const TV_KEYS = ['answer', 'tip', 'credit', 'pick', 'points', 'total', 'guess', 'confidence', 'right', 'plan', 'ai', 'real', 'players', 'of', 'streak', 'limit', 'time', 'n', 'me', 'done', 'left', 'code'];
