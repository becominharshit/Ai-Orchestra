// AI Sharks server (public name "AI Sharks", never "Shark Tank"; internal id stays `shark`). Counter 3 (counter map v4).
//
//   GET  /api/shark/prompts    idea prompts for visitors who freeze (from fixtures/pitches.json)
//   POST /api/shark/questions  { pitch, mode }  -> Safety Agent, then Host + 3 sharks write one question each.
//                              Returns the questions plus `qtoken`, a signed copy of what we issued.
//   POST /api/shark/verdict    { pitch, qtoken, answers } -> 3 scores /10, verdict, compliment, fix, mini-MBA lesson
//
// Safety, in this order, in EVERY mode (live, mock, offline, hero):
//   1. lib/safety.js on the pitch (questions + verdict) and on every answer: unsafe -> kind redirect, no game,
//      no score. Self-harm -> a caring line with "Kisi bade se baat karo".
//   2. The model's own `safe` + category (both schemas), enforced here.
//   3. lib/guard.js on every free-text field the model writes: profanity/links/personal data (core textfilter),
//      negativity about the person, and any echo of the visitor's own words (names, schools, places) ->
//      replaced by a safe template line. Questions are signed, so the client cannot inject its own.
// Claude: lib/prompts.js (schemas + system prompts for claude-opus-5-5). Offline/mock/hero: lib/engine.js.
// Privacy: pitch and answers are never logged or stored; analytics are counts only (verdict_deal, verdict_out, ...).
// Audio never reaches this server: the browser turns speech into text (Web Speech API) and sends only text.
import crypto from 'node:crypto';
import { check as safetyCheck, redirectMessage } from './lib/safety.js';
import { questionsFor, verdictFor, detect, titleFor, templateWhy, templateLine, templateExplain, templateHost, FIXTURES, CATS, TEMPLATE_WORDS } from './lib/engine.js';
import { QUESTIONS_SCHEMA, VERDICT_SCHEMA, QUESTIONS_SYSTEM, VERDICT_SYSTEM, questionsMessages, verdictMessages, SHARK_IDS, CATEGORIES, CONCEPTS, SAFETY } from './lib/prompts.js';
import { lessonCard, PROGRAMME, LESSONS } from './lib/lessons.js';
import { clean, cleanInput, seeded, pickWith } from './lib/text.js';
import { guardLine, firstSafe, visitorWords, allowWords } from './lib/guard.js';
import { makeSafety, makeStage, safetyModeOf } from './lib/coreapi.js';
import { registerV2 } from './lib/v2/routes.js';
import * as TV from './web/tvtext.js';

const MAX_PITCH = 700;
const MAX_ANSWER = 240;
const IN_AT = 7; // a shark is "in" at 7/10 or more
const DEAL_AT = 2; // DEAL when at least 2 of 3 sharks are in
const TOKEN_TTL_MS = 30 * 60 * 1000;
const V2_READY = true; // web/v2 ships (TASK-13); SHARK_V2=0 always serves v1

// Our own fixture copy is allowed too, minus capitalised mid-sentence words (Gurugram, NCR, QR ...).
const ownWords = (t) => String(t).replace(/(?<![.!?:]\s|^)\b[A-Z][A-Za-z]+/g, ' ');
allowWords([TEMPLATE_WORDS, ...Object.values(CATS).flat(), ...FIXTURES.flatMap((f) => [...f.keywords, f.prompt, f.answer.idea.title, f.answer.idea.tvTitle, ownWords(JSON.stringify(f.answer)), ownWords(f.pitch)]), ...Object.values(TV.TITLES).flat(), ...Object.values(LESSONS).map((l) => l.title)]);

const DEFAULT_CHIPS = {
  vc: ['Pehle apna area, phir har city', 'Online, poore India mein', 'Abhi socha nahi'],
  mkt: ['Mere jaise students', 'Insta reel se', 'Abhi pata karna hai'],
  fin: ['Cost 50, price 99', 'Pre-orders se start', 'Abhi calculate karna hai'],
};
const DEFAULT_Q = {
  vc: 'Tumhara idea 1 jagah se 100 shehron tak kaise jaayega?',
  mkt: 'Tumhara pehla customer kaun hai, aur woh tumhe kyun chunega?',
  fin: 'Ek order pe kitna kharcha, aur kitne mein bechoge?',
};

/** Letters or digits in any script (so a Devanagari pitch is not "too short"). */
const letterCount = (s) => (String(s).match(/[\p{L}\p{N}]/gu) || []).length;

/** Idea prompts (3 to 12), stable per seed so a reload does not reshuffle. */
export function prompts(n = 12, seed = '') {
  const list = FIXTURES.map((f) => ({ id: f.id, prompt: f.prompt, pitch: f.pitch }));
  if (n >= list.length) return list;
  const rnd = seeded(`p:${seed}`);
  return list.map((p) => [rnd(), p]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]);
}

/** Questions answer -> guarded shape. Every free-text field falls back to the offline engine's line. */
export function shapeQuestions(d, { pitch = '', visitor = visitorWords(pitch) } = {}) {
  const fb = questionsFor(pitch);
  const tfb = titleFor(pitch, detect(pitch));
  const idea = d.idea || {};
  const out = {
    idea: {
      title: firstSafe(visitor, clean(idea.title, 40), clean(fb.idea.title, 40), tfb.title),
      tvTitle: firstSafe(visitor, clean(idea.tvTitle, 36), clean(fb.idea.tvTitle, 36), tfb.tvTitle),
      category: CATEGORIES.includes(idea.category) ? idea.category : fb.idea.category,
    },
    hostLine: firstSafe(visitor, clean(d.hostLine, 100), clean(fb.hostLine, 100), templateHost(pitch)),
    questions: {},
  };
  for (const id of SHARK_IDS) {
    const q = d.questions?.[id] || {};
    const f = fb.questions[id];
    const raw = Array.isArray(q.chips) ? q.chips : [];
    const chips = [0, 1, 2].map((i) => firstSafe(visitor, clean(raw[i], 44), clean(f.chips[i], 44), DEFAULT_CHIPS[id][i]));
    out.questions[id] = { q: firstSafe(visitor, clean(q.q, 130), clean(f.q, 130), DEFAULT_Q[id]), chips };
  }
  return out;
}

/** Verdict answer -> guarded shape with server-side scoring rules. */
export function shapeVerdict(d, { pitch = '', answers = {}, idea = {}, visitor = visitorWords(pitch, ...Object.values(answers || {})) } = {}) {
  const fb = verdictFor(pitch, { idea }, answers);
  const sharks = {};
  for (const id of SHARK_IDS) {
    const s = d.sharks?.[id] || {};
    let score = Math.round(Number(s.score));
    if (!Number.isFinite(score)) score = 6;
    score = Math.max(4, Math.min(10, score));
    const isIn = score >= IN_AT;
    // The fallback line always matches the score band, so "in" never reads "Main out".
    const lineOk = guardLine(clean(s.line, 56), visitor);
    const bandOk = lineOk.ok && (isIn ? !/\bout\b/i.test(lineOk.text) : !/\bmain in\b|\bin hoon\b|\bshark in\b/i.test(lineOk.text));
    sharks[id] = {
      score,
      in: isIn,
      why: firstSafe(visitor, clean(s.why, 110), templateWhy(id, isIn, pitch)),
      line: bandOk ? lineOk.text : templateLine(id, isIn, pitch),
    };
  }
  const ins = SHARK_IDS.filter((id) => sharks[id].in).length;
  const total = SHARK_IDS.reduce((t, id) => t + sharks[id].score, 0);
  const concept = CONCEPTS.includes(d.lesson?.concept) ? d.lesson.concept : fb.lesson.concept;
  return {
    verdict: ins >= DEAL_AT ? 'deal' : 'out',
    ins,
    total,
    max: 30,
    sharks,
    compliment: firstSafe(visitor, clean(d.compliment, 130), fb.compliment, 'Stage pe aake pitch karna khud mein bada move hai!'),
    fix: firstSafe(visitor, clean(d.fix, 130), fb.fix, 'Ek line likho: main kiske liye kya banata hoon.'),
    lesson: lessonCard(concept, firstSafe(visitor, clean(d.lesson?.explain, 240), templateExplain(concept, pitch))),
    tvLine: firstSafe(visitor, clean(d.tvLine, 80), fb.tvLine, 'Fresh idea, sharks ne dhyaan se suna!'),
    programme: PROGRAMME,
  };
}

// ---------- signed questions: the verdict prompt only ever sees questions this server issued ----------
const SECRET = crypto.randomBytes(32);
const pitchHash = (pitch) => crypto.createHash('sha256').update(pitch).digest('base64url').slice(0, 22);
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

export function issueToken(pitch, shaped, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ h: pitchHash(pitch), x: now + TOKEN_TTL_MS, q: Object.fromEntries(SHARK_IDS.map((id) => [id, shaped.questions[id].q])), t: shaped.idea.tvTitle })).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function readToken(token, pitch, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4000 || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = sign(body);
  if (!mac || mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.h !== pitchHash(pitch) || !(p.x > now)) return null;
    return p;
  } catch { return null; }
}

/** Register every TV / share-card string with core's public-text registry (CONTRACT 13). */
export function registerPublicText(safety) {
  const flat = (obj, prefix = '') => {
    const out = {};
    const walk = (v, key) => {
      if (typeof v === 'string') out[key] = v;
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}_${i}`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, key ? `${key}_${k}` : k);
    };
    walk(obj, prefix);
    return out;
  };
  safety.bank('orx', TV.ORX);
  safety.bank('enum', TV.ENUMS);
  safety.bank('copy', TV.COPY);
  safety.bank('lesson', { ...TV.LESSON_TITLES, ...flat(TV.LESSON_LINES, 'line') });
  safety.bank('title', flat(TV.TITLES));
  safety.bank('host', flat(TV.HOST, 'h'));
  safety.bank('tvline', flat(TV.TVLINE));
  safety.bank('q', flat(TV.QUESTIONS));
  safety.bank('take', flat(TV.TAKES));
  safety.bank('share', TV.SHARE);
  for (const [name, [text, slots]] of Object.entries({ ...TV.TEMPLATES, ...TV.SHARE_TEMPLATES })) safety.template(name, text, slots);
}

export default function register(ctx) {
  const { app, claude, demo, limits, analytics, bus, log } = ctx;
  const safety = makeSafety(ctx);
  const stage = makeStage(ctx);
  registerPublicText(safety);
  stage.declare({ boards: [{ id: 'total', title: 'Aaj ke top pitches', unit: '/40', order: 'desc', min: 0, max: 40, decimals: 0 }], panels: { leaderboard: 'total' } });
  analytics.declare(['verdict_deal', 'verdict_out', 'pitch_mode', 'safety_redirect', 'game_mode', 'panel_mummy']);
  // Extra TV-safe keys used in our result payload and custom TV events (all guarded generated text, never visitor input).
  bus.allowKeys(['line', 'lesson', 'step', 'total', 'ins', 'why', 'idea', 'host', 'deal', 'deals', 'take', 'axes', 'sharks', 'panel', 'nickname', 'v']);

  const heroFixtureId = () => {
    const h = demo.hero();
    const f = h?.fixtures?.pitches;
    return typeof f === 'number' ? FIXTURES[f]?.id : typeof f === 'string' ? f : FIXTURES[0].id;
  };

  // One place that decides where an answer comes from: hero fixture, Claude (or mock), or the offline engine.
  async function answer(task, req, live, offline) {
    if (demo.isHero(req)) return { data: offline(true), source: 'hero' };
    try {
      const data = await live();
      return { data, source: claude.mode() === 'mock' ? 'mock' : 'claude' };
    } catch (e) {
      if (!(e instanceof claude.DemoFallback)) throw e;
      analytics.inc('fallback');
      if (e.reason !== 'demo_mode') log({ kind: 'demo', task, reason: e.reason });
      return { data: offline(false), source: 'fixture', reason: e.reason };
    }
  }

  const redirect = (req, kind, message, layer) => {
    const k = SAFETY.includes(kind) && kind !== 'ok' ? kind : 'other';
    if (!demo.isHero(req)) analytics.count('safety_redirect', { kind: k });
    // Self-harm: no idea prompts, no game. Just the caring message.
    return { safe: false, kind: k, care: k === 'care', message: message || redirectMessage(k), prompts: k === 'care' ? [] : prompts(4, `${Date.now() >> 14}:${k}`), safety: { layer } };
  };

  // Which phone app /shark/ serves (web/boot.js). v2 is the default; SHARK_V2=0 keeps v1.
  const V2 = process.env.SHARK_V2 !== '0';
  // safetyMode (CONTRACT 13): 'live' only with a live AI crisis check. In 'degraded' AI Sharks is CHIPS ONLY:
  // v2 accepts reviewed chip picks only, v1 (free text only) refuses to play (lead decision, CHECK-13b).
  const safetyMode = () => safetyModeOf(ctx);
  app.get('/config', limits.rate(), (req, res) => res.json({ v2: V2, v2ready: V2 && V2_READY, stage: !!stage.core, safetyMode: safetyMode() }));
  app.get('/prompts', limits.rate(), (req, res) => res.json({ prompts: prompts(12) }));

  registerV2({ app, claude, demo, limits, analytics, log, safety, stage, answer, redirect, safetyMode });

  app.post('/questions', limits.guard(), async (req, res) => {
    const pitch = cleanInput(req.body?.pitch, MAX_PITCH);
    const mode = req.body?.mode === 'voice' ? 'voice' : 'text';
    if (letterCount(pitch) < 8) return res.status(400).json({ error: 'short', message: 'Thoda aur batao! Kam se kam ek line ka pitch chahiye.' });
    const t0 = Date.now();
    if (safetyMode() !== 'live') return res.status(409).json({ error: 'chips_only', message: 'Abhi AI Sharks chips se khelte hain! Idea type chuno.' });
    const hit = await safety.inputLive(req, pitch);
    if (safety.isUnchecked(hit)) return safety.uncheckedResponse(res); // live check undecided (CHECK-20 F8): not a crisis, not counted
    if (safety.isCrisis(hit)) return res.json(redirect(req, 'care', null, 'care'));
    const s = safetyCheck(pitch);
    if (!s.ok) return res.json(redirect(req, s.kind, s.message, 'local'));
    if (!demo.isHero(req)) analytics.count('pitch_mode', { mode });

    const r = await answer('questions', req,
      () => claude.run({ task: 'questions', system: QUESTIONS_SYSTEM, messages: questionsMessages(pitch), schema: QUESTIONS_SCHEMA, maxTokens: 1600, effort: 'low', mock: () => questionsFor(pitch) }),
      (hero) => questionsFor(pitch, hero ? { forceId: heroFixtureId() } : {}));
    if (r.data.safe === false || (r.data.safety && r.data.safety !== 'ok')) return res.json(redirect(req, r.data.safety, null, 'model'));
    const shaped = shapeQuestions(r.data, { pitch });
    // TV: templates only (CHECK-05b): category title, a bank host line, bank questions per shark.
    const trnd = seeded(`tv1:${pitch}`);
    const tvTitle = pickWith(trnd, TV.TITLES[shaped.idea.category] || TV.TITLES.other);
    const tv = { title: tvTitle, host: pickWith(trnd, TV.HOST), questions: Object.fromEntries(SHARK_IDS.map((id) => [id, pickWith(trnd, TV.QUESTIONS[id][TV.ASK_AXIS[id]])])) };
    shaped.idea.tvTitle = tvTitle;
    res.json({ safe: true, ...shaped, tv, qtoken: issueToken(pitch, shaped), source: r.source, reason: r.reason, ms: Date.now() - t0, words: pitch.split(/\s+/).length });
  });

  app.post('/verdict', limits.guard(), async (req, res) => {
    const pitch = cleanInput(req.body?.pitch, MAX_PITCH);
    if (letterCount(pitch) < 8) return res.status(400).json({ error: 'short', message: 'Pitch kho gaya. Ek baar phir se try karo!' });
    if (safetyMode() !== 'live') return res.status(409).json({ error: 'chips_only', message: 'Abhi AI Sharks chips se khelte hain! Idea type chuno.' });
    const answers = Object.fromEntries(SHARK_IDS.map((id) => [id, cleanInput(req.body?.answers?.[id], MAX_ANSWER)]));
    // Every visitor field (the re-sent pitch and all answers) through core's live crisis gate, then our rules.
    const hitV = await safety.inputLive(req, pitch, ...Object.values(answers));
    if (safety.isUnchecked(hitV)) return safety.uncheckedResponse(res);
    if (safety.isCrisis(hitV)) return res.json(redirect(req, 'care', null, 'care'));
    const s = safetyCheck(pitch);
    if (!s.ok) return res.json(redirect(req, s.kind, s.message, 'local'));
    for (const id of SHARK_IDS) {
      const sa = answers[id] ? safetyCheck(answers[id]) : { ok: true };
      if (!sa.ok) return res.json(redirect(req, sa.kind, sa.message, 'local'));
    }
    // Only questions this server issued for this exact pitch reach the prompt; anything else -> our own defaults.
    const tok = readToken(req.body?.qtoken, pitch);
    const fbq = shapeQuestions(questionsFor(pitch), { pitch });
    const questions = Object.fromEntries(SHARK_IDS.map((id) => [id, tok?.q?.[id] || fbq.questions[id].q]));
    const idea = { tvTitle: tok?.t || fbq.idea.tvTitle };
    const t0 = Date.now();
    const r = await answer('verdict', req,
      () => claude.run({ task: 'verdict', system: VERDICT_SYSTEM, messages: verdictMessages(pitch, questions, answers), schema: VERDICT_SCHEMA, maxTokens: 2000, effort: 'low', mock: () => verdictFor(pitch, { idea }, answers) }),
      (hero) => (hero && demo.hero()?.fixtures?.verdict ? structuredClone(demo.hero().fixtures.verdict) : verdictFor(pitch, { idea }, answers)));
    if (r.data.safe === false || (r.data.category && r.data.category !== 'ok')) return res.json(redirect(req, r.data.category, null, 'model'));
    const v = shapeVerdict(r.data, { pitch, answers, idea });
    const trnd = seeded(`tv1v:${pitch}:${v.total}`);
    const tvTitle = Object.values(TV.TITLES).flat().includes(idea.tvTitle) ? idea.tvTitle : pickWith(trnd, TV.TITLES.other);
    v.tv = {
      title: tvTitle, verdict: v.verdict, total: v.total, ins: v.ins,
      sharks: SHARK_IDS.map((id) => ({ id, score: v.sharks[id].score, label: v.sharks[id].in ? 'IN' : 'OUT', line: pickWith(trnd, TV.TAKES[id][v.sharks[id].in ? 'deal' : 'out']) })),
      lesson: TV.LESSON_TITLES[v.lesson.concept] || 'Customer', line: pickWith(trnd, TV.TVLINE[v.verdict]),
    };
    if (!demo.isHero(req)) analytics.count(v.verdict === 'deal' ? 'verdict_deal' : 'verdict_out');
    res.json({ ...v, tvTitle: idea.tvTitle, signed: !!tok, source: r.source, reason: r.reason, ms: Date.now() - t0 });
  });
}
