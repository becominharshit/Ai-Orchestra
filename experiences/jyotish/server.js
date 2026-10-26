// AI Jyotish server routes (mounted at /api/jyotish/ by core). See README.md in this folder.
//
//   POST /api/jyotish/reading  { sign, number, age, time, palm? }    -> reading (Hast Rekha + Kaal + Career), judged
//   POST /api/jyotish/vibes    { sign, number, age }                 -> Dating + Health tabs (curated bank lines only)
//   POST /api/jyotish/dost     { friends: [{ sign, number, age }] }  -> squad vibe report (TASK-15), bank text only
//
// Bank-only (lead decision after CHECK-02c): EVERY line a visitor reads, on the phone, the TV or a card, is a reviewed
// bank line or template (lib/public.js, lib/banks.js, lib/dost.js, registered with ctx.safety). The model traces the
// palm and picks ids; it writes no text. Core's judge still checks the picked lines (sanity), unapproved -> default.
// Privacy: the phone never sends the name, DOB or birth place, only what the agents computed (sign, number,
// age band, time bucket). The palm photo goes to Claude in memory only. The TV copy (TV switch on) travels as an inline
// picture on core's bus, which drops it at the end of the session or after 3 minutes. Nothing is written or logged.
import fs from 'node:fs';
import path from 'node:path';
import { SIGNS, SIGN_IDS, signById, LIFE_PATHS, AGE_BANDS, TIME_BUCKETS } from './web/lib/astro.js';
import { cleanLines, stockLines, LINE_KINDS } from './web/lib/palmlines.js';
import { READING_SCHEMA, VIBES_SCHEMA, readingSystem, readingUserText, vibesSystem, vibesUserText } from './lib/prompts.js';
import { pickVibes, resolveVibes } from './lib/banks.js';
import { banks as publicBanks, TEMPLATES, NUMBER_LINES as NUM } from './lib/public.js';
import { safetyFor } from './lib/safety.js';
import { dostBanks, DOST_TEMPLATES, DOST_SCHEMA, dostSystem, dostUserText, resolveDost, defaultDostPick, squadScore, nicksFor, ENERGY, ROLES, seedOf } from './lib/dost.js';

const PB = publicBanks();

// Offline personalisation: fixtures are one per sign (reading) and one per life-path number (vibes);
// the number also swaps in its own "Tum kaun ho" line so sign + number together feel personal.
export const NUMBER_LINES = NUM;

const MAX_PALM_CHARS = 1_200_000; // ~900 KB JPEG as base64; the phone sends ~80-200 KB

export function loadFixtures(dir) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'fixtures', f), 'utf8'));
  return { reading: read('reading.json'), vibes: read('vibes.json') };
}

/** Validate the phone's body. Unknown values fall back to safe defaults (never trust the client). Extra fields are dropped. */
export function parseBody(b = {}) {
  const sign = signById(SIGN_IDS.includes(b.sign) ? b.sign : 'leo');
  const number = LIFE_PATHS.includes(Number(b.number)) ? Number(b.number) : 1;
  const age = AGE_BANDS.includes(b.age) ? b.age : 'young';
  const time = TIME_BUCKETS.includes(b.time) ? b.time : '';
  let palm = null;
  if (typeof b.palm === 'string' && b.palm.length < MAX_PALM_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.palm)) palm = b.palm;
  return { sign, number, age, time, palm };
}

/** The curated answer for this sign + number (offline, mock, and the replacement bank), with a stock palm drawing. */
export function fixtureReading(fx, { sign, number }, { exactPalm = false } = {}) {
  const base = structuredClone(fx.reading[SIGNS.indexOf(sign)] || fx.reading[0]);
  base.who[2] = NUMBER_LINES[number] || base.who[2];
  const meanings = Object.fromEntries(base.palm.lines.map((l) => [l.kind, l.meaning]));
  base.palm.lines = stockLines(exactPalm ? '' : `${sign.id}:${number}`).map((l) => ({ ...l, meaning: meanings[l.kind] || '' }));
  base.picks = defaultPicks(sign, number);
  return base;
}
export const fixtureVibes = (fx, number) => structuredClone(fx.vibes[LIFE_PATHS.indexOf(number)] || fx.vibes[0]);

function hashOf(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const generic = (bank) => Object.keys(PB[bank]).filter((id) => /_g\d\d$/.test(id));

/**
 * Offline / mock / fill-in picks, keyed by sign AND life path so two visitors of the same sign rarely match:
 * the sign's own lines rotate with the number, plus general lines chosen by sign + number. No repeats.
 */
export function defaultPicks(sign, number = 1) {
  const h = hashOf(`${sign.id}:${number}`);
  // position of the number among the 12 life paths: rotates the sign's own lines and walks the general lines with a
  // step that is coprime to the list length, so two numbers of the same sign never get the same past or future
  const idx = Math.max(0, LIFE_PATHS.indexOf(number));
  const si = Math.max(0, SIGNS.indexOf(sign));
  const rot = (n, k, off) => Array.from({ length: n }, (_, i) => ((i + off) % 3) + 1).slice(0, k);
  const g = (bank, slot) => { const list = generic(bank); return list[(idx * 5 + si * 3 + slot * 7) % list.length]; };
  const meanings = Object.fromEntries(LINE_KINDS.map((k, i) => [k, `meaning_${k}_${((h >>> (i * 3)) % 6) + 1}`]));
  return {
    title: (h % 3) ? `title_${sign.id}` : g('title', 0),
    who: [`who_${sign.id}_${(idx % 2) + 1}`, g('who', 1)],
    past: [...rot(3, 2, idx % 3).map((i) => `past_${sign.id}_${i}`), g('past', 2)],
    future: [...rot(3, 2, (idx + 1) % 3).map((i) => `future_${sign.id}_${i}`), g('future', 3)],
    career: sign.id,
    meanings,
  };
}

const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k); // never accept inherited names like 'constructor'

/** Validate a pick: known ids only, no duplicate lines, right counts; gaps filled from defaultPicks. */
export function resolvePicks(picks, sign, number) {
  const d = defaultPicks(sign, number);
  const sd = { who: [1, 2].map((i) => `who_${sign.id}_${i}`), past: [1, 2, 3].map((i) => `past_${sign.id}_${i}`), future: [1, 2, 3].map((i) => `future_${sign.id}_${i}`) };
  let fixed = 0;
  const many = (bank, ids, defs, n) => {
    const ok = [];
    for (const id of Array.isArray(ids) ? ids : []) if (typeof id === 'string' && own(PB[bank], id) && !ok.some((x) => PB[bank][x] === PB[bank][id])) ok.push(id);
    ok.splice(n);
    for (const id of [...defs, ...sd[bank]]) { if (ok.length >= n) break; if (!ok.some((x) => PB[bank][x] === PB[bank][id])) { ok.push(id); fixed += 1; } }
    return ok;
  };
  const title = typeof picks?.title === 'string' && own(PB.title, picks.title) ? picks.title : (fixed += 1, d.title);
  const career = SIGN_IDS.includes(picks?.career) ? picks.career : (fixed += 1, d.career);
  const meanings = Object.fromEntries(LINE_KINDS.map((k) => {
    const id = picks?.meanings?.[k];
    return [k, typeof id === 'string' && id.startsWith(`meaning_${k}_`) && own(PB.meaning, id) ? id : (fixed += 1, d.meanings[k])];
  }));
  return {
    ids: { title, who: [...many('who', picks?.who, d.who, 2), `num_${number}`], past: many('past', picks?.past, d.past, 3), future: many('future', picks?.future, d.future, 3), tv: `tv_${sign.id}`, career, meanings },
    fixed,
  };
}

/** Palm geometry + final response shape. src = where the palm lines come from, text = the safe lines. */
export function buildReading(src, text, fallback, { seed, usePalm }) {
  const cl = usePalm && src?.palm?.isPalm ? cleanLines(src.palm.lines, seed) : { lines: stockLines(seed), fromStock: 4 };
  const fbMeaning = Object.fromEntries((fallback.palm?.lines || []).map((l) => [l.kind, l.meaning]));
  const lines = cl.lines.map((l) => ({ ...l, meaning: text.meanings?.[l.kind] || fbMeaning[l.kind] || '' }));
  return {
    reading: {
      title: text.title, who: text.who, past: text.past, future: text.future, career: text.career, tvLine: text.tvLine,
      palm: { isPalm: !!src?.palm?.isPalm, hand: ['left', 'right'].includes(src?.palm?.hand) ? src.palm.hand : 'unknown', lines },
    },
    palmSource: cl.fromStock >= 4 ? 'stock' : cl.fromStock ? 'mixed' : 'vision',
  };
}

export default function register(ctx) {
  const { app, claude, demo, limits, analytics, bus, dir, log } = ctx;
  const fx = loadFixtures(dir);
  const safety = safetyFor(ctx, { mode: () => claude.mode() });
  safety.registerAll({ ...PB, ...dostBanks() }, { ...TEMPLATES, ...DOST_TEMPLATES });
  // stage board (CONTRACT 12): a fun board of squads, not a ranking of people
  ctx.stage?.declare?.({ boards: [{ id: 'squad', title: 'Aaj ki green-flag squads', unit: '%', order: 'desc', min: 0, max: 100, decimals: 0 }], panels: { leaderboard: 'squad' } });
  analytics.declare(['jy_sign', 'jy_photo', 'jy_tab', 'jy_guard', 'jy_judge', 'jy_dost']);
  // Extra keys this experience puts in TV payloads (all generated text or geometry; never personal).
  bus.allowKeys(['who', 'element', 'locked', 'hint', 'career']);

  // ---- reading: one vision call for Hast Rekha + Kaal + Career, then the judge ----
  app.post('/reading', limits.guard(), async (req, res) => {
    const t0 = Date.now();
    const p = parseBody(req.body);
    const seed = `${p.sign.id}:${p.number}`;
    const hero = demo.isHero(req);
    const fallback = fixtureReading(fx, p, { exactPalm: hero || !p.palm });

    const content = [];
    if (p.palm) content.push(claude.image(p.palm));
    content.push({ type: 'text', text: readingUserText({ ...p, hasPhoto: !!p.palm }) });

    const r = await demo.wrap('reading', { seed, req }, () => claude.run({
      task: 'reading',
      system: readingSystem(),
      messages: [{ role: 'user', content }],
      schema: READING_SCHEMA,
      maxTokens: 4000,
      effort: 'low',
      // CLAUDE_MOCK=1: the fixture for this sign + number, as if the model had answered
      mock: () => { const f = fixtureReading(fx, p, { exactPalm: !p.palm }); return { palm: { ...f.palm, lines: f.palm.lines.map(({ meaning, ...l }) => l) }, picks: f.picks }; },
    }));

    // ---- everything the visitor reads is a reviewed bank line, chosen by the model's ids (or sign + number) ----
    const pickSrc = r.demo ? (r.reason === 'hero' ? r.data?.picks : null) : r.data?.picks;
    let picked = resolvePicks(pickSrc, p.sign, p.number);
    // judge on the picks, for sanity: any picked line it does not approve -> the sign + number default for that slot
    const live = !r.demo && claude.mode() === 'live';
    let judged = 0;
    if (live) {
      const items = [['title', picked.ids.title], ...picked.ids.who.slice(0, 2).map((id, i) => [`who.${i}`, id]), ...picked.ids.past.map((id, i) => [`past.${i}`, id]), ...picked.ids.future.map((id, i) => [`future.${i}`, id])];
      const bankOf = (slot) => slot.split('.')[0];
      const approved = await safety.judge(items.map(([slot, id]) => ({ id: slot, text: PB[bankOf(slot)][id] })));
      const bad = items.filter(([slot]) => !approved.has(slot)).map(([slot]) => slot);
      if (bad.length) {
        judged = bad.length;
        const d = defaultPicks(p.sign, p.number);
        const next = structuredClone(picked.ids);
        for (const slot of bad) {
          const [bank, i] = slot.split('.');
          if (bank === 'title') next.title = d.title; else next[bank][Number(i)] = d[bank][Number(i)];
        }
        picked = resolvePicks({ ...next, who: next.who.slice(0, 2) }, p.sign, p.number);
      }
    }
    const ids = picked.ids;
    const P = (bank, id) => safety.publicText(bank, id);
    const pub = {
      title: P('title', ids.title),
      who: ids.who.map((id) => P(id.startsWith('num_') ? 'num' : 'who', id)),
      past: ids.past.map((id) => P('past', id)),
      future: ids.future.map((id) => P('future', id)),
      tv: P('tvline', ids.tv),
      sign: P('sign', `sign_${p.sign.id}`),
      kicker: P('ui', 'ui_kicker'),
      hint: P('ui', 'ui_hint'),
    };
    const shortest = (arr) => [...arr].sort((a, b) => a.text.length - b.text.length)[0];
    pub.card = { kicker: safety.publicText('card_kicker', { sign: p.sign.en, n: String(p.number) }), title: P('ui', 'ui_card'), footer: P('ui', 'ui_forfun'), lines: [shortest(pub.past), shortest(pub.future)] };

    // phone: the same reviewed lines (no model wording anywhere), plus the reviewed career set and palm meanings
    const c = ids.career;
    const text = {
      title: pub.title.text, who: pub.who.map((x) => x.text), past: pub.past.map((x) => x.text), future: pub.future.map((x) => x.text), tvLine: pub.tv.text,
      career: { headline: PB.career[`car_${c}_h`], read: [1, 2].map((i) => PB.career[`car_${c}_r${i}`]), learn: [1, 2, 3].map((i) => PB.career[`car_${c}_l${i}`]), roles: [1, 2, 3].map((i) => PB.career[`car_${c}_o${i}`]) },
      meanings: Object.fromEntries(LINE_KINDS.map((k) => [k, PB.meaning[ids.meanings[k]]])),
    };
    const src = r.demo ? fallback : r.data;
    const out = buildReading(src, text, fallback, { seed: hero || !p.palm ? '' : seed, usePalm: !!p.palm && !r.demo && claude.mode() !== 'mock' });
    if (judged) { analytics.count('jy_judge', { n: Math.min(99, judged) }); log({ kind: 'guard', task: 'reading', judged }); }
    analytics.count('jy_sign', { sign: p.sign.id });
    analytics.count('jy_photo', { src: p.palm ? 'photo' : 'none' });

    res.json({
      ...out,
      public: pub,
      guard: { judged, judgeRan: live, picksFixed: picked.fixed },
      source: r.demo ? (r.reason === 'hero' ? 'hero' : 'fixture') : claude.mode() === 'mock' ? 'mock' : 'claude',
      reason: r.reason,
      ms: Date.now() - t0,
    });
  });

  // ---- Dost compatibility: 2-4 friends, signs + numbers only (names and DOBs stay on the phone) ----
  app.post('/dost', limits.guard(), async (req, res) => {
    const t0 = Date.now();
    const list = Array.isArray(req.body?.friends) ? req.body.friends.slice(0, 4) : [];
    if (list.length < 2) return res.status(400).json({ error: 'need_friends', message: 'Kam se kam 2 dost chahiye.' });
    const friends = list.map((f) => parseBody(f)).map(({ sign, number, age }) => ({ sign, number, age }));
    const seed = seedOf(friends);
    const r = await demo.wrap('dost', { seed, req }, () => claude.run({
      task: 'dost',
      system: dostSystem(),
      messages: [{ role: 'user', content: dostUserText(friends) }],
      schema: DOST_SCHEMA,
      maxTokens: 800,
      effort: 'low',
      mock: () => defaultDostPick(friends),
    }));
    const { pick, fixed } = resolveDost(r.demo ? defaultDostPick(friends) : r.data, friends);
    const score = squadScore(friends);
    const nicks = nicksFor(friends);
    const P = (bank, id) => safety.publicText(bank, id);
    const energy = P('dost_energy', pick.energy);
    const pub = {
      kicker: P('dost_ui', 'dui_kicker'),
      energy,
      energyLine: P('dost_energy_line', `${pick.energy}_l`),
      roles: friends.map((_, i) => ({
        nick: nicks[i],
        role: P('dost_role', pick.roles[i]),
        line: P('dost_role_line', `${pick.roles[i]}_l`),
        tv: safety.publicText('dost_role_tv', { nick: nicks[i], role: ROLES.find((x) => x.id === pick.roles[i]).text }),
      })),
      lines: pick.lines.map((id) => P('dost_line', id)),
      score: safety.publicText('dost_score', { score }),
      hint: P('dost_ui', 'dui_hint'),
      card: {
        kicker: safety.publicText('dost_kicker', { n: friends.length, energy: ENERGY.find((e) => e.id === pick.energy).text }),
        title: P('dost_ui', 'dui_card'),
        lines: [P('dost_energy_line', `${pick.energy}_l`), P('dost_line', pick.lines[0])],
      },
    };
    // stage board entry (only when this visitor picked a nickname for the big screen; core answers no_nickname otherwise)
    const board = ctx.stage?.post ? ctx.stage.post(req, 'squad', { score, extra: { line: energy.text } }) : { ok: false, reason: 'off' };
    analytics.count('jy_dost', { n: friends.length });
    res.json({ public: pub, adj: pick.adj, score, board, guard: { picksFixed: fixed }, source: r.demo ? (r.reason === 'hero' ? 'hero' : 'fixture') : claude.mode() === 'mock' ? 'mock' : 'claude', ms: Date.now() - t0 });
  });

  // ---- vibes: Dating + Health tabs. The model picks bank ids; text comes only from lib/banks.js. ----
  app.post('/vibes', limits.guard(), async (req, res) => {
    if (demo.isHero(req)) return res.json({ skipped: true });
    const t0 = Date.now();
    const p = parseBody(req.body);
    const seed = `${p.number}:${p.sign.id}`;
    const r = await demo.wrap('vibes', { seed, req }, () => claude.run({
      task: 'vibes',
      system: vibesSystem(),
      messages: [{ role: 'user', content: vibesUserText(p) }],
      schema: VIBES_SCHEMA,
      maxTokens: 1200,
      effort: 'low',
      mock: () => pickVibes(seed),
    }));
    const pick = r.demo ? fixtureVibes(fx, p.number) : r.data;
    const v = resolveVibes(pick, seed);
    if (v.fixed) log({ kind: 'guard', task: 'vibes', fixedIds: v.fixed });
    res.json({
      vibes: v.vibes,
      guard: { fixedIds: v.fixed },
      source: r.demo ? 'fixture' : claude.mode() === 'mock' ? 'mock' : 'claude',
      ms: Date.now() - t0,
    });
  });
}
