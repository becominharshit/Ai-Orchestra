// AI Startup Studio (counter 2, behind STARTUP_STUDIO=1; core skips this folder when the flag is off).
//   chips (problem area, who, vibe) [+ optional one-liner, live safety mode only]
//   -> ONE structured model call that returns ids and numbers only (lib/live.js), or composition from the banks
//   -> judge pass on the name (+ the phone-only note) -> public text from banks/templates -> a /s/<code> page (core)
// Nothing a visitor types reaches the TV, the share card or the page (CHECK_build 12, 13). See README.md.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AREAS, WHO, VIBES, PALETTES, ORX, areaById } from './lib/content.js';
import { compose, fromModel, withSafeName, nameOf, numbers, validPicks } from './lib/compose.js';
import { registerText, publicFor } from './lib/text.js';
import { SYSTEM, schemaFor, messageFor, mockFor, MOCK_NOTES } from './lib/live.js';
import { initials } from './lib/names.js';
import { noteOk } from './lib/note.js';
import { MARKS } from './web/logo.js';

export const AGENT_IDS = ['founder', 'research', 'product', 'brand', 'finance', 'pitch'];
const RECENT_MAX = 12;
const FIELDS = new Set(['area', 'who', 'vibe', 'idea', 'c']); // our own body keys (not visitor text)
const CHIP_IDS = new Set([...AREAS.map((a) => a.id), ...WHO.map((w) => w.id), ...VIBES.map((v) => v.id)]);
const MAX_DEPTH = 5;
const MAX_STRINGS = 64;
/** Every string anywhere in a request body, for the care check. `over` = deeper than 5 levels or more than 64 strings
 *  (the request is then refused with 400 after the care check of what was collected; CHECK-18 round 3). */
function textsIn(v, acc = { texts: [], over: false }, d = 0) {
  if (acc.over) return acc;
  if (d > MAX_DEPTH || acc.texts.length > MAX_STRINGS) { acc.over = true; return acc; }
  if (typeof v === 'string') acc.texts.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textsIn(x, acc, d + 1));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!FIELDS.has(k)) acc.texts.push(k); textsIn(x, acc, d + 1); }
  if (acc.texts.length > MAX_STRINGS) acc.over = true;
  return acc;
}
const IDEA_MAX = 100;

/** The /s/<code> page (CONTRACT 14). Every slot is typed; text slots only accept registered public text. */
export const PAGE_SPEC = {
  prefix: 's',
  template: 'page/site.html',
  css: 'site.css',
  ttlDays: 7,
  title: 'name',
  description: 'tagline',
  slots: {
    palette: 'enum:0|1|2|3', logo: 'enum:0|1|2|3', mark: 'svg', mono: 'text', name: 'text', area: 'text', tagline: 'text', pitch: 'text',
    research: 'text', who: 'text', market: 'text', f1: 'text', f2: 'text', f3: 'text', price: 'text', margin: 'text', revenue: 'text',
    plan1: 'text', plan2: 'text', plan3: 'text',
  },
  svgs: Object.fromEntries(MARKS.map((s, i) => [`m${i}`, s])),
};

export function pageValues(pub, p) {
  return {
    palette: String(p.palette), logo: String(p.logo), mark: `m${p.logo}`, mono: pub.mono.text, name: pub.name.text, area: pub.area.text,
    tagline: pub.tagline.text, pitch: pub.pitch.text, research: pub.research.text, who: pub.who.text, market: pub.market.text,
    f1: pub.features[0].text, f2: pub.features[1].text, f3: pub.features[2].text, price: pub.price.text, margin: pub.margin.text,
    revenue: pub.revenue.text, plan1: pub.plan[0].text, plan2: pub.plan[1].text, plan3: pub.plan[2].text,
  };
}

export default function register(ctx) {
  const { app, claude, demo, limits, analytics, safety, config, log } = ctx;
  registerText(safety);
  safety.agents(AGENT_IDS);
  ctx.bus.allowKeys(['tagline', 'features', 'price', 'market', 'margin', 'revenue', 'pitch', 'area', 'palette', 'logo', 'mono', 'who', 'plan', 'research', 'section']);
  analytics.declare(['shark_link', 'site_open']);
  analytics.declare(['startup_area', 'startup_source', 'startup_judge_flag', 'startup_page_fail', 'startup_made'], { serverOnly: true });
  const site = typeof ctx.publicPage === 'function' ? ctx.publicPage(PAGE_SPEC) : null;
  if (!site) log({ kind: 'boot', warn: 'publicPage missing: startups get no /s/ page' });

  const heroPicks = demo.hero()?.picks || null;
  if (heroPicks && !validPicks(heroPicks)) log({ kind: 'boot', warn: 'demo/hero.json picks are not valid' });
  const recent = []; // last startups made here today: generated names + ids only (the TV board rows)
  const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600000).toISOString().slice(0, 10);
  // "Aaj ki startups: N" (CHECK-18 F3 + round 3): counts only startups this server made, via the server-only event
  // `startup_made` (a phone cannot post it). Core persists it per IST day; at boot we seed today's tally from core's
  // analytics snapshot (read only, documented shape { days: { day: { exp: { event: n } } } }).
  // TODO(core): replace the read with ctx.analytics.today('startup_made') once core offers it.
  const made = { day: istDay(), n: 0 };
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'analytics.json'), 'utf8'));
    made.n = Math.max(0, Number(snap?.days?.[made.day]?.startup?.startup_made) || 0);
  } catch { /* no snapshot yet */ }
  const madeToday = () => { if (made.day !== istDay()) { made.day = istDay(); made.n = 0; } return made.n; };
  const sharkCounter = () => config.experiences?.find((e) => e.id === 'shark')?.counters?.[0] ?? null;

  app.get('/config', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      safetyMode: safety.safetyMode(),
      areas: AREAS.map((a) => ({ id: a.id, label: a.label, sub: a.sub })),
      who: WHO, vibes: VIBES.map(({ id, label }) => ({ id, label })),
      shark: { counter: sharkCounter() },
      orx: ORX, // bank lines the phone's orchestra uses (registered, so the TV accepts them)
    });
  });

  // TV stage panel "Aaj ki startups": generated names only (never anything typed).
  app.get('/today', (req, res) => {
    // made = startups made today (server-only count, see above). Rows are today's last names (memory only).
    const today = recent.filter((r) => istDay(r.at) === istDay());
    res.set('Cache-Control', 'no-store').json({
      made: madeToday(),
      rows: today.slice(-8).reverse().map((r) => ({ title: r.name, area: r.area, palette: r.palette, logo: r.logo, mono: r.mono })),
    });
  });

  app.post('/build', limits.guard(), async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const area = areaById(b.area);
    const ok = { area: !!area, who: WHO.some((w) => w.id === b.who), vibe: VIBES.some((v) => v.id === b.vibe) };
    // The care check runs first, in every mode, on EVERY string in the body (the one-liner, anything a modified phone
    // sends instead of a chip id, extra fields, arrays): a crisis gets the care card, no game, nothing on the TV.
    const scan = textsIn(b);
    const free = scan.texts.filter((t) => !CHIP_IDS.has(t));
    if (free.length) {
      const hit = await safety.inputLive(req, ...free);
      if (safety.isUnchecked(hit)) return safety.uncheckedResponse(res); // live check undecided: the one-liner is not used, chips path
      if (safety.isCrisis(hit)) return safety.careResponse(res);
    }
    if (scan.over) return res.status(400).json({ error: 'bad_input', message: 'Pehle problem area, customer aur vibe chuno.' });
    if (!ok.area || !ok.who || !ok.vibe) return res.status(400).json({ error: 'bad_input', message: 'Pehle problem area, customer aur vibe chuno.' });
    if (b.idea !== undefined && (typeof b.idea !== 'string' || b.idea.length > IDEA_MAX)) return res.status(400).json({ error: 'bad_input', message: 'Ek chhoti line, 100 letters tak.' });
    const idea = typeof b.idea === 'string' ? b.idea.replace(/\s+/g, ' ').trim() : '';
    // degraded safety mode = chips only (no live crisis check): a typed line is refused, never used
    if (idea && safety.safetyMode() !== 'live') return res.status(409).json({ error: 'chips_only', message: 'Abhi sirf chips se startup banti hai. Line hata ke try karo.' });
    const t0 = Date.now();
    const brief = { area: area.id, who: b.who, vibe: b.vibe };
    const hero = demo.isHero(req) && heroPicks;
    const avoid = new Set(recent.map((r) => r.name));
    const base = hero ? { ...heroPicks } : compose(brief, crypto.randomInt(1e9), avoid);
    let picks = base;
    let note = null;
    let source = hero ? 'hero' : 'composed';

    if (!hero) {
      try {
        const out = await claude.run({
          task: 'startup', system: SYSTEM, messages: messageFor({ ...brief, idea }), schema: schemaFor(area),
          maxTokens: 1000, effort: 'low', mock: () => mockFor(base), // ~80 tokens of JSON + low-effort thinking; caps the worst case
        });
        picks = fromModel(out, base);
        note = typeof out.note === 'string' ? out.note.replace(/\s+/g, ' ').trim().slice(0, 120) : null;
        source = claude.mode() === 'mock' ? 'mock' : 'claude';
      } catch (e) {
        if (e?.name !== 'DemoFallback') throw e;
        picks = base; // degraded: composed from the banks, no model call
      }
    }

    // Judge: the generated name (blocklist already applied at boot) and the phone-only note. Fails closed.
    const lines = [{ id: 'name', text: nameOf(picks) }];
    if (note) lines.push({ id: 'note', text: note });
    const { flagged } = await safety.judge(lines);
    if (flagged.includes('name')) { picks = withSafeName(picks, crypto.randomInt(1e6)); analytics.count('startup_judge_flag', { what: 'name' }); }
    if (note && flagged.includes('note')) { note = null; analytics.count('startup_judge_flag', { what: 'note' }); }
    if (note && !noteOk(note)) { note = null; analytics.count('startup_judge_flag', { what: 'note_rule' }); } // money, brands, handles, numbers
    if (!note) note = MOCK_NOTES[crypto.randomInt(MOCK_NOTES.length)]; // reviewed line

    const pub = publicFor(safety, picks);
    let page = null;
    if (site) {
      const r = site.create(req, pageValues(pub, picks));
      if (r.ok) page = { code: r.code, path: r.path, expiresAt: r.expiresAt };
      else { analytics.count('startup_page_fail'); log({ kind: 'startup', warn: 'page_create', reason: r.reason, slot: r.slot }); }
    }
    if (!hero) {
      recent.push({ name: pub.name.text, area: area.label, palette: picks.palette, logo: picks.logo, mono: pub.mono.text, at: Date.now() });
      if (recent.length > RECENT_MAX) recent.shift();
      madeToday();
      made.n += 1;
      analytics.count('startup_made'); // server-only: the TV board count cannot be inflated from a phone
      analytics.count('startup_area', { area: area.id.slice(0, 16) });
      analytics.count('startup_source', { src: source });
    }
    const n = numbers(picks);
    res.json({
      picks: { palette: picks.palette, logo: picks.logo, price: picks.price, market: picks.market, margin: n.margin },
      palette: PALETTES[picks.palette],
      public: pub, // { pt, text } lines: the only text the TV and the share card may use
      note, // phone only, judged (or a reviewed line)
      mono: initials(pub.name.text),
      page,
      shark: { idea: area.shark, counter: sharkCounter() },
      source, ms: Date.now() - t0,
    });
  });
}
