// Composition: turns ids + numbers into a startup. Used three ways:
//  - degraded mode (no key, offline, mock fallbacks): compose() picks everything from the banks, seeded, no model call
//  - live mode: the model's picks are checked by fromModel() (bad ids or numbers fall back to the composed value)
//  - every mode: view() turns picks into the phone view, numbers() does the finance maths in code
import { AREAS, SUFFIXES, WHO, VIBES, PALETTES, LOGOS, areaById } from './content.js';
import { NAMES, safeNames } from './names.js';

// Small seeded PRNG (mulberry32) so the same seed composes the same startup (tests, hero).
export function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickN = (r, n, k) => { const idx = [...Array(n).keys()]; for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx.slice(0, k); };
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

/** A "nice" price inside the bounds: ends in 9 (49, 99, 149, 1999 ...). */
export function nicePrice(p, [lo, hi]) {
  let n = Math.round(Math.min(hi, Math.max(lo, Number(p) || lo)));
  if (n >= 1000) n = Math.round((n + 1) / 100) * 100 - 1;
  else if (n >= 100) n = Math.round((n + 1) / 10) * 10 - 1;
  else n = Math.max(9, Math.round((n + 1) / 10) * 10 - 1);
  return Math.min(hi, Math.max(lo, n));
}

/** Picks for one startup from the banks alone. avoid = names made recently (keeps the board varied). */
export function compose({ area: areaId, who, vibe }, seed, avoid = new Set()) {
  const area = areaById(areaId) || AREAS[0];
  const r = rng(`${area.id}|${who}|${vibe}|${seed}`);
  const names = NAMES[area.id];
  let nm = names[Math.floor(r() * names.length)];
  for (let i = 0; i < 6 && avoid.has(nm.name); i++) nm = names[Math.floor(r() * names.length)];
  const v = VIBES.find((x) => x.id === vibe) || VIBES[0];
  return {
    area: area.id,
    who: WHO.some((w) => w.id === who) ? who : WHO[0].id,
    vibe: v.id,
    pre: nm.pre,
    suf: nm.suf,
    tagline: Math.floor(r() * area.tag.length),
    research: Math.floor(r() * area.research.length),
    features: pickN(r, area.feat.length, 3),
    palette: r() < 0.75 ? v.palette : Math.floor(r() * PALETTES.length),
    logo: Math.floor(r() * LOGOS.length),
    price: nicePrice(int(r, area.price[0], area.price[1]), area.price),
    market: int(r, area.market[0], area.market[1]),
    pitch: Math.floor(r() * area.pitch.length),
    plan: pickN(r, area.plan.length, 3),
  };
}

// "t2" -> 2. Anything without a clean number ("", null, "Ignore all rules", "Zomato") is null, never index 0 (CHECK-18 N1).
const idx = (v, n) => { const m = /^[a-z]?(\d{1,3})$/.exec(String(v ?? '')); const i = m ? Number(m[1]) : NaN; return Number.isInteger(i) && i >= 0 && i < n ? i : null; };

/**
 * The model's answer (ids as strings like "t2", numbers) -> picks. Anything invalid, duplicated or out of bounds takes the
 * composed value instead, so the result is always a valid startup made only of bank lines.
 */
export function fromModel(out, base) {
  const area = areaById(base.area);
  const p = { ...base };
  const nameOk = (pre, suf) => NAMES[area.id].some((n) => n.pre === pre && n.suf === suf);
  const pre = idx(out?.namePrefix, area.pre.length);
  const suf = idx(out?.nameSuffix, SUFFIXES.length);
  if (pre !== null && suf !== null && nameOk(pre, suf)) { p.pre = pre; p.suf = suf; }
  const one = (k, n, key = k) => { const i = idx(out?.[k], n); if (i !== null) p[key] = i; };
  one('tagline', area.tag.length);
  one('research', area.research.length);
  one('pitch', area.pitch.length);
  one('palette', PALETTES.length);
  one('logo', LOGOS.length);
  const many = (keys, n, fallback) => {
    const got = [];
    for (const k of keys) { const i = idx(out?.[k], n); if (i !== null && !got.includes(i)) got.push(i); }
    for (const i of fallback) if (got.length < 3 && !got.includes(i)) got.push(i);
    return got.slice(0, 3);
  };
  p.features = many(['feature1', 'feature2', 'feature3'], area.feat.length, base.features);
  p.plan = many(['plan1', 'plan2', 'plan3'], area.plan.length, base.plan);
  if (Number.isFinite(Number(out?.price))) p.price = nicePrice(out.price, area.price);
  if (Number.isFinite(Number(out?.marketLakh))) p.market = Math.round(Math.min(area.market[1], Math.max(area.market[0], Number(out.marketLakh))));
  return p;
}

/** Swap in a reviewed fallback name (when the judge flags the generated one). */
export function withSafeName(p, seed = 0) {
  const area = areaById(p.area);
  const list = safeNames(area).filter((x) => !(x.pre === p.pre && x.suf === p.suf)); // never the flagged name again
  const n = list[Math.abs(Number(seed) || 0) % list.length];
  return { ...p, pre: n.pre, suf: n.suf };
}

export const nameOf = (p) => `${areaById(p.area).pre[p.pre]}${SUFFIXES[p.suf]}`;

/** Finance Agent maths, in code: margin per unit and the "first 1,000 customers" line. */
export function numbers(p) {
  const area = areaById(p.area);
  const margin = Math.max(1, Math.round(p.price * (1 - area.cost)));
  const rev = p.price * 1000;
  return rev >= 100000
    ? { margin, rev, revKind: 'lakh', revL: Math.floor(rev / 100000), revD: Math.floor((rev % 100000) / 10000) }
    : { margin, rev, revKind: 'k', revK: Math.round(rev / 1000) };
}

/** Is this a complete, valid set of picks? (used for hero.json and tests) */
export function validPicks(p) {
  const area = areaById(p?.area);
  if (!area) return false;
  const inR = (i, n) => Number.isInteger(i) && i >= 0 && i < n;
  return NAMES[area.id].some((n) => n.pre === p.pre && n.suf === p.suf)
    && WHO.some((w) => w.id === p.who) && VIBES.some((v) => v.id === p.vibe)
    && inR(p.tagline, area.tag.length) && inR(p.research, area.research.length) && inR(p.pitch, area.pitch.length)
    && inR(p.palette, PALETTES.length) && inR(p.logo, LOGOS.length)
    && Array.isArray(p.features) && p.features.length === 3 && new Set(p.features).size === 3 && p.features.every((i) => inR(i, area.feat.length))
    && Array.isArray(p.plan) && p.plan.length === 3 && new Set(p.plan).size === 3 && p.plan.every((i) => inR(i, area.plan.length))
    && Number.isInteger(p.price) && p.price >= area.price[0] && p.price <= area.price[1]
    && Number.isInteger(p.market) && p.market >= area.market[0] && p.market <= area.market[1];
}
