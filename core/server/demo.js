// Fixtures for offline/demo mode and the filming "hero" profile.
//
// Fixtures: experiences/<id>/fixtures/<set>.json = an array of answers shaped exactly like the Claude schema
//           (or { "items": [...] }). Loaded automatically at startup.
// Hero:     experiences/<id>/demo/hero.json = a seeded FICTIONAL visitor for footage. Shape:
//           { "profile": { ...form values the web app pre-fills... }, "fixtures": { "<set>": <index or object> } }
//           Web: open /<id>/?demo=hero. The kit sends header x-pz-demo: hero and demo.wrap() always answers
//           from fixtures (no Claude call), so no real visitor data ever appears in footage.
import fs from 'node:fs';
import path from 'node:path';
import { DemoFallback } from './claude.js';

export function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createDemo({ config, analytics, log = () => {} }) {
  const sets = new Map(); // `${exp}/${set}` -> array
  const heroes = new Map(); // exp -> hero json

  function register(exp, set, fixtures) {
    const arr = Array.isArray(fixtures) ? fixtures : Array.isArray(fixtures?.items) ? fixtures.items : [fixtures];
    sets.set(`${exp}/${set}`, arr);
  }

  function loadDir(exp, expDir) {
    const fx = path.join(expDir, 'fixtures');
    if (fs.existsSync(fx)) {
      for (const f of fs.readdirSync(fx)) {
        if (!f.endsWith('.json')) continue;
        try { register(exp, f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'))); }
        catch (e) { log({ kind: 'demo', exp, file: f, err: 'bad fixture json' }); }
      }
    }
    const hero = path.join(expDir, 'demo', 'hero.json');
    if (fs.existsSync(hero)) {
      try { heroes.set(exp, JSON.parse(fs.readFileSync(hero, 'utf8'))); } catch { log({ kind: 'demo', exp, err: 'bad hero.json' }); }
    }
  }

  function list(exp, set) { return sets.get(`${exp}/${set}`) || []; }

  /** Deterministic pick by seed (same input -> same fixture, so it still feels personal). */
  function pick(exp, set, seed) {
    const arr = list(exp, set);
    if (!arr.length) return null;
    const i = seed === undefined || seed === null ? Math.floor(Math.random() * arr.length) : hashSeed(seed) % arr.length;
    return structuredClone(arr[i]);
  }

  function hero(exp) { return heroes.get(exp) || null; }

  function isHero(req) {
    return req?.headers?.['x-pz-demo'] === 'hero' || req?.query?.demo === 'hero';
  }

  function heroFixture(exp, set) {
    const h = hero(exp);
    const f = h?.fixtures?.[set];
    if (f === undefined) return pick(exp, set, 'hero');
    if (typeof f === 'number') return structuredClone(list(exp, set)[f] ?? pick(exp, set, 'hero'));
    return structuredClone(f);
  }

  /**
   * Run `fn` (usually a claude.run call). On DemoFallback answer from fixture set `set`.
   * Returns { data, demo, reason }. demo=false means a real (or mock) Claude answer.
   */
  async function wrap({ exp, set, seed, req }, fn) {
    if (isHero(req)) {
      const data = heroFixture(exp, set);
      if (data) return { data, demo: true, reason: 'hero' };
    }
    try {
      return { data: await fn(), demo: false, reason: null };
    } catch (e) {
      if (!(e instanceof DemoFallback)) throw e;
      analytics?.inc(exp, 'fallback');
      const data = pick(exp, set, seed);
      if (!data) { const err = new Error('no fixture'); err.status = 503; err.fallbackReason = e.reason; throw err; }
      if (e.reason !== 'demo_mode') log({ kind: 'demo', exp, set, reason: e.reason });
      return { data, demo: true, reason: e.reason };
    }
  }

  return { register, loadDir, pick, list, hero, isHero, wrap };
}
