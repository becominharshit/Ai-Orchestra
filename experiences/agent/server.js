// Build Your Own AI Agent (flag AGENT_BUILDER, default off; counter from core's map; see README.md).
// A visitor picks one of 16 curated templates and designs the agent with chips (task chips, 3 personality sliders, a
// voice, tools, a generated name, optionally a first name for their own phone). Then the agent does ONE real task:
// one structured-output Claude call plans the steps (tools + knobs from enums), our code repairs the plan and runs the
// tools for real (lib/tools.js), and each template's fixed sections are assembled from reviewed data (lib/compose.js).
// The model never writes text (CHECK-19 F3): it picks reviewed line ids; the guard and core's judge are a backstop.
// TV (CHECK-19 F1): this server publishes every TV event itself (ctx.bus.publish). The phone never posts to the TV.
// Privacy: nothing stored; no request body, name or answer is logged. Analytics are counts only.
import crypto from 'node:crypto';
import { bundle, validateDesign, style, detailLevel, itemLabel } from './lib/jobs.js';
import { planSchema, PLAN_SYSTEM, planMessages, defaultPlan, repairPlan, execute, pickKnobs } from './lib/plan.js';
import { registerPublic, orxStrings, orxInit, orxScript, publicCards, wordsFor, safeWords, NOTE } from './lib/text.js';
import { todayIst } from './lib/tools.js';
import { compose } from './lib/compose.js';
import { wordingOk } from './lib/guard.js';
import { nameShape, nameRulesOk, onAllowList, NAME_SCHEMA, NAME_SYSTEM } from './lib/name.js';
import { openingEvents, buildTimeline, timelineMs } from './web/timeline.js';

export const BUDGET_MS = 20000; // the whole run: plan call + judge (TASK-19: 20 s budget)
export const PLAN_TIMEOUT_MS = 13000; // our own deadline for the plan call; then the banked plan runs
export const NAME_TIMEOUT_MS = 3000; // the live name check; on timeout the nickname is used
export const AGENT_IDS = ['agent', 'planner', 'lookup', 'calculator', 'calendar', 'notes', 'check'];
const TV_END_AFTER_MS = 30000; // the TV goes back to its idle loop this long after the result
export const TV_ID_MIN = 100000000; // run ids are 9 digits (core caps registered ranges under 1e9)
export const TV_ID_MAX = 999999999;
const OFF = 'Yeh counter abhi band hai. Baaki counters pe khelo!';
const DASH = /[\u2012-\u2015]/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXTRA = ['job_pick', 'voice_pick', 'tools_on', 'plan_src', 'plan_fix', 'judge_flag', 'name_used', 'name_fallback', 'nick_pick'];

/** Backstop for a reviewed line before it goes to the phone: tidy, no dashes, past our guard. */
export function cleanLine(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return !t || t.length > 120 || DASH.test(t) || !wordingOk(t) ? '' : t;
}
/** A promise that rejects with `err` after `ms` (our own deadline, whatever the SDK does). */
const deadline = (ms, err) => sleep(ms).then(() => { throw err; });
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v.slice(0, 1200)); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out.slice(0, 16); };
const counterOf = (req) => { const n = Number(req.headers['x-pz-counter'] ?? req.body?.c); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null; };

export default function register(ctx) {
  const { app, claude, demo, limits, analytics, safety, bus, config, stage } = ctx;
  // Core skips this folder while AGENT_BUILDER is off (config.flags). Older cores without flags: check it here.
  const on = config.flags ? config.flags.agentBuilder !== false : ['1', 'true', 'yes'].includes(String(process.env.AGENT_BUILDER || '').toLowerCase());
  analytics.declare(EXTRA, { serverOnly: true });
  analytics.declare(['agent_card', 'age_line']);
  registerPublic(safety);
  safety.agents(AGENT_IDS);
  // CHECK-19 F1: every TV event of this experience comes from this server; core refuses all of them from phones.
  bus.serverOnly?.(['init', 'assign', 'status', 'log', 'handoff', 'progress', 'done', 'reset', 'result', 'custom', 'end']);
  bus.numbers?.({ id: [TV_ID_MIN, TV_ID_MAX] }); // the run id the TV verifies; every other number is small
  const pt = (id, k) => safety.publicText(id, k);
  // 3 core-generated nicknames ({ id, text }), bank-safe, bound to this visitor's session
  const nickOffer = (req) => { const o = stage.nicknames(req); return { options: (Array.isArray(o) ? o : o?.options || []).slice(0, 3).map(({ id, text }) => ({ id, text })) }; };
  const B = { ...bundle(), orx: orxStrings(pt) };

  // ---- TV runs: the server's own publishing, and the store the TV hook verifies results against ----
  const tvRuns = new Map(); // tvId (number) -> { payload, at }
  const plays = new Map(); // play id -> { sid, c, timers }
  const prune = () => {
    const old = Date.now() - 2 * 3600 * 1000;
    for (const [k, v] of tvRuns) if (v.at < old || tvRuns.size > 2000) tvRuns.delete(k);
    for (const [k, v] of plays) if (v.at < old) plays.delete(k);
  };
  const publish = (p, events) => { if (p && p.c !== null) bus.publish(p.c, p.id, events); };
  const endPlay = (p) => { if (!p) return; for (const t of p.timers) clearTimeout(t); p.timers = []; publish(p, [{ t: 'end' }]); plays.delete(p.id); };

  app.get('/bundle', (req, res) => (on ? res.json({ on: true, ...B }) : res.status(404).json({ error: 'off', message: OFF })));

  // The TV hook fetches a result by the id the server published, so a forged bus `result` shows nothing.
  app.get('/tv/:id', limits.rate(), (req, res) => {
    const r = /^\d{9}$/.test(req.params.id) ? tvRuns.get(Number(req.params.id)) : null;
    res.set('Cache-Control', 'no-store');
    return r ? res.json({ ok: true, payload: r.payload }) : res.status(404).json({ ok: false }); // payload null while the run is still playing
  });
  // The visitor picks one of the 3 nickname options (core-generated, bank-safe) to put on the phone and the Agent card.
  app.post('/nickname', limits.rate(), (req, res) => {
    const r = stage.pickNickname(req, String(req.body?.id || ''));
    if (!r.ok) return res.json({ ok: false, options: nickOffer(req) }); // an old offer: fresh options, no error text
    if (!demo.isHero(req)) analytics.count('nick_pick');
    res.json({ ok: true, nickname: r.nickname });
  });

  // The phone's "Big screen" switch went off, or the visitor starts again: stop this run on the TV.
  app.post('/tv/end', limits.rate(), (req, res) => {
    const p = plays.get(String(req.body?.play || ''));
    if (p && p.sid === req.sid) endPlay(p);
    res.json({ ok: true });
  });

  app.post('/run', limits.guard(), async (req, res) => {
    if (!on) return res.status(404).json({ error: 'off', message: OFF });
    const body = req.body || {};
    const typedName = typeof body.firstName === 'string' ? body.firstName : '';
    // the only free text: the optional first name goes through core's live crisis gate first (care card, nothing else)
    if (typedName) {
      const hit = await safety.inputLive(req, typedName.slice(0, 40));
      if (safety.isUnchecked(hit)) return safety.uncheckedResponse(res); // live check undecided: the name is not used
      if (safety.isCrisis(hit)) return safety.careResponse(res);
    }
    const v = validateDesign(body);
    if (!v.ok) {
      // Chips only: a real phone never sends other text. A modified one might; it still gets core's crisis gate.
      const typed = strings({ ...body, firstName: undefined }).filter((s) => !/^[a-z0-9_.:]{1,24}$/.test(s));
      if (typed.length) {
        const hit = await safety.inputLive(req, ...typed);
        if (safety.isUnchecked(hit)) return safety.uncheckedResponse(res);
        if (safety.isCrisis(hit)) return safety.careResponse(res);
      }
      return res.status(400).json({ error: 'bad_input', message: v.message });
    }
    const d = v.design;
    const t0 = Date.now();
    const hero = demo.isHero(req);
    const live = claude.mode() === 'live' && safety.safetyMode() === 'live';
    prune();

    // TV: the server opens the run on the counter TV (init + a run id the TV hook can verify), if the visitor allows it
    const c = counterOf(req);
    const play = body.tv === true && c !== null ? { id: `agent-${crypto.randomBytes(6).toString('hex')}`, sid: req.sid, c, timers: [], at: Date.now() } : null;
    const tvId = crypto.randomInt(TV_ID_MIN, TV_ID_MAX + 1);
    const init = orxInit(pt, d);
    if (play) { tvRuns.set(tvId, { payload: null, at: Date.now() }); plays.set(play.id, play); publish(play, [...openingEvents(init), { t: 'custom', name: 'run', data: { id: tvId } }]); }

    // 1. Plan (one Claude call, strict JSON, enums only, our own deadline) and, in parallel, the optional name check.
    const planCall = demo.wrap(`plan_${style(d.sliders[0])}_${detailLevel(d.sliders[2])}`, { seed: d.job.id, req }, () => {
      const call = claude.run({ task: 'plan', system: PLAN_SYSTEM, messages: planMessages(d), schema: planSchema(d), maxTokens: 1500, effort: 'low', timeoutMs: PLAN_TIMEOUT_MS, mock: () => mockPlan(d) });
      call.catch(() => {}); // if our deadline wins, the late answer is ignored
      return Promise.race([call, deadline(PLAN_TIMEOUT_MS + 300, new claude.DemoFallback('timeout'))]);
    });
    const [r, owner] = await Promise.all([planCall, checkName(typedName, { live, hero })]);
    const source = r.demo ? (r.reason === 'hero' ? 'hero' : 'fixture') : claude.mode() === 'mock' ? 'mock' : 'claude';

    // 2. Code is the authority: repair the plan, then run the real tools in the planner's order.
    // banked plans are template-neutral: their session and break lengths are chosen for this day and personality
    const raw = r.demo ? { ...r.data, ...pickKnobs(d.job, d.params.perDay, style(d.sliders[0])) } : r.data;
    const { plan, lines, fixes } = repairPlan(raw, d);
    const today = todayIst();
    const { trace, outputs } = execute(d, plan, { today });
    const sections = compose(d, outputs, { today });

    // 3. Wording: reviewed lines only (the planner picked their ids). Backstop: our guard, then core's judge (live).
    const picked = wordsFor(d, lines);
    const safe = safeWords(d, plan);
    const slots = [{ id: 'intro', text: picked.intro }, ...picked.why.map((t, i) => ({ id: `w${i}`, text: t })), ...picked.tips.map((t, i) => ({ id: `t${i}`, text: t }))];
    const passGuard = slots.filter((l) => cleanLine(l.text) === l.text);
    const left = Math.max(1000, BUDGET_MS - (Date.now() - t0) - 400);
    // banked runs (offline, hero, failed call) show the defaults, which the bank tests prove; the judge is for model picks
    const verdict = r.demo ? { ok: passGuard } : passGuard.length ? await Promise.race([safety.judge(passGuard), sleep(left).then(() => null)]) : { ok: [] };
    const okIds = new Set((verdict?.ok || []).map((l) => l.id));
    const words = {
      intro: okIds.has('intro') ? picked.intro : safe.intro,
      why: plan.steps.map((_, i) => (okIds.has(`w${i}`) ? picked.why[i] : safe.why[i])),
      tips: picked.tips.map((t, i) => (okIds.has(`t${i}`) ? t : null)).filter(Boolean),
    };
    if (!words.tips.length) words.tips = [safe.tip];
    const judged = { live: live && !r.demo, ok: okIds.size, n: slots.length };
    if (!hero && slots.length > okIds.size) analytics.count('judge_flag', { n: Math.min(99, slots.length - okIds.size) });
    if (!hero) {
      analytics.count('job_pick', { job: d.job.id });
      analytics.count('voice_pick', { voice: d.voice.id });
      analytics.count('tools_on', { n: d.tools.length });
      analytics.count('plan_src', { src: source });
      if (fixes && source === 'claude') analytics.count('plan_fix', { n: Math.min(99, fixes) });
      if (typedName) analytics.count(owner ? 'name_used' : 'name_fallback');
    }

    // 4. TV: the same timeline the phone plays, published by this server, then the verified result.
    const script = orxScript(pt, d, { plan, trace, fixes: source === 'claude' || source === 'mock' ? fixes : 0, source, judged });
    const timeline = buildTimeline(script, '');
    const secs = Math.min(120, (Date.now() - t0 + timelineMs(timeline)) / 1000);
    timeline[timeline.length - 1].ev.summary = pt('done', { s: Math.floor(secs), t: Math.floor((secs * 10) % 10) }).text;
    const cards = publicCards(pt, d, { plan, outputs });
    if (play) {
      tvRuns.set(tvId, { payload: cards.tv, at: Date.now() });
      const byAt = new Map();
      for (const { at, ev } of timeline) byAt.set(at, [...(byAt.get(at) || []), ev]);
      for (const [at, evs] of byAt) play.timers.push(setTimeout(() => publish(play, evs), at));
      const endAt = timelineMs(timeline);
      play.timers.push(setTimeout(() => publish(play, [{ t: 'result', payload: { id: tvId } }]), endAt + 200));
      play.timers.push(setTimeout(() => endPlay(play), endAt + TV_END_AFTER_MS));
      for (const t of play.timers) t.unref?.();
    }

    res.json({
      source, reason: r.reason, ms: Date.now() - t0, play: play ? play.id : null,
      owner, // the visitor's first name (phone and Agent card) only if it is on the allow-list and passed every check
      // no name used (skipped, or not used for any reason): 3 core-generated nicknames to pick from; the same for everyone
      nickOptions: owner ? null : nickOffer(req),
      agent: { name: d.name.text, job: d.job.name, role: d.job.role, icon: d.job.icon, task: d.job.task, voice: d.voice.label, sliders: d.sliders, tools: d.tools, study: !!d.job.study },
      init, timeline,
      plan: plan.steps.map((s, i) => ({ tool: s.tool, item: s.item === 'all' ? null : itemLabel(d.job, d.items[Number(s.item.slice(1)) - 1]), why: words.why[i] })),
      knobs: { sessionMin: plan.sessionMin, breakMin: plan.breakMin, lightDay: plan.lightDay, weights: plan.weights },
      outputs, sections, intro: words.intro, tip: words.tips[0], tips: words.tips, note: NOTE[d.job.id],
      card: cards.card, agentCard: cards.agentCard,
    });
  });

  /** The optional first name -> the name, or null (a picked nickname instead, silently). Live mode only. */
  async function checkName(raw, { live, hero }) {
    if (!raw || hero) return null;
    const name = nameShape(raw);
    // round 6 (F6): only names on the allow-list, in every mode; then the rules and the live AI check
    if (!name || !onAllowList(name) || !nameRulesOk(name) || !live) return null;
    try {
      const out = await Promise.race([
        claude.run({ task: 'name', system: NAME_SYSTEM, messages: [{ role: 'user', content: JSON.stringify({ name }) }], schema: NAME_SCHEMA, maxTokens: 300, effort: 'low', timeoutMs: NAME_TIMEOUT_MS }),
        deadline(NAME_TIMEOUT_MS + 200, new Error('name check timeout')),
      ]);
      return out?.ok === true ? name : null;
    } catch {
      return null;
    }
  }
}

/** CLAUDE_MOCK=1: what a planner would answer for these sliders (ids only, like the real planner). */
export function mockPlan(d) {
  return defaultPlan(d);
}
