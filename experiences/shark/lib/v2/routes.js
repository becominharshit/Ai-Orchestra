// AI Sharks v2 routes (TASK-13), mounted by server.js under /api/shark/v2/.
//   GET  /v2/prompts                     12 fixture games for "Idea nahi aa raha?" (all 4 cards)
//   POST /v2/names     { names }         co-founder first names: ok or not (share card only; never stored or logged)
//   POST /v2/questions { parts, mode, coop }          -> panel, phone questions (guard + judge), tv block, qtoken
//   POST /v2/verdict   { parts, qtoken, answers, mode, coop } -> 4-axis scorecard, per-shark Deal, lesson, tv + share blocks
// Safety in every mode: care path (core care.detect when present), local filter on every card and answer,
// model safe/category, guard + judge on every model line (phone only). TV and share text = templates only.
import crypto from 'node:crypto';
import { check as safetyCheck } from '../safety.js';
import { cleanInput, seeded, pickWith, clean } from '../text.js';
import { pick, visitorWords, guardLine } from '../guard.js';
import { cleanText } from '../../../../core/server/textfilter.js';
import { lessonCard, PROGRAMME } from '../lessons.js';
import { CATEGORIES, CONCEPTS } from '../prompts.js';
import { PERSONAS, AXES, AXIS_LABEL, MAIN, pickPanel, lensScore, DEAL_AT, DEALS_FOR_DEAL } from './personas.js';
import { GAMES, PART_IDS, joinParts, questionsV2, verdictV2, tvTitleFor, templateExplain } from './engine.js';
import { questionsSchema, verdictSchema, questionsSystem, verdictSystem, questionsMessages, verdictMessages } from './prompts.js';
import { QUESTIONS, ASK_AXIS, TAKES, HOST, TVLINE, TITLES, LESSON_TITLES, COPY, SHARE } from '../../web/tvtext.js';

const TOKEN_TTL_MS = 30 * 60 * 1000;
export const MIN_REVEAL_MS = 13000; // earliest board post after the verdict = the phone's rule (TV reveal + hold, 13 s)
const sidHash = (req) => crypto.createHash('sha256').update(String(req?.sid || '')).digest('base64url').slice(0, 16);
const letterCount = (s) => (String(s).match(/[\p{L}\p{N}]/gu) || []).length;
const hashOf = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url').slice(0, 22);

export function registerV2({ app, claude, demo, limits, analytics, log, safety, stage, answer, redirect, safetyMode = () => 'degraded' }) {
  const SECRET = crypto.randomBytes(32);
  const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const issue = (payload) => { const body = Buffer.from(JSON.stringify({ ...payload, x: Date.now() + TOKEN_TTL_MS })).toString('base64url'); return `${body}.${sign(body)}`; };
  const read = (token, h) => {
    if (typeof token !== 'string' || token.length > 6000 || !token.includes('.')) return null;
    const [body, mac] = token.split('.');
    const want = sign(body);
    if (!mac || mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.h === h && p.x > Date.now() ? p : null; } catch { return null; }
  };

  // Chip path ("Idea type chuno"): { pick: { game, idea, customer, problem, paisa } } -> reviewed bank text for every
  // card the visitor picked; a card they typed instead keeps its text (and goes through every check as usual).
  const cleanParts = (raw, pick) => {
    const g = pick && typeof pick.game === 'string' ? GAMES.find((x) => x.id === pick.game) : null;
    return Object.fromEntries(PART_IDS.map((k) => {
      const i = Number.isInteger(pick?.[k]) ? pick[k] : -1;
      const chip = g?.cardChips?.[k]?.[i];
      return [k, chip || cleanInput(raw?.[k], 240)];
    }));
  };
  // Degraded safety mode = CHIPS ONLY (lead, CHECK-13b): every card must be a reviewed chip pick and every answer
  // one of the chips this server issued (or a pass). Nothing free-typed is scored without a live AI gate.
  const allPicked = (pick) => {
    const g = pick && typeof pick.game === 'string' ? GAMES.find((x) => x.id === pick.game) : null;
    return !!g && PART_IDS.every((k) => Number.isInteger(pick[k]) && typeof g.cardChips?.[k]?.[pick[k]] === 'string');
  };
  const CHIPS_ONLY = { error: 'chips_only', message: 'Abhi chips se khelte hain! Idea type chuno aur jawab chuno.' };
  const modeOf = (b) => ({ mode: b?.mode === 'voice' ? 'voice' : 'text', coop: !!b?.coop });
  const heroGame = () => { const f = demo.hero()?.fixtures?.games; return typeof f === 'number' ? GAMES[f]?.id : typeof f === 'string' ? f : 'laundry'; };
  const pt = (bank, id) => safety.publicText(bank, id).text;

  /** Unsafe input anywhere (care first, core's live crisis check in live mode) -> response sent, returns true. */
  async function blocked(req, res, texts) {
    const hit = await safety.inputLive(req, ...texts);
    if (safety.isUnchecked(hit)) { safety.uncheckedResponse(res); return true; } // live check undecided (CHECK-20 F8): chips path, not a crisis
    if (safety.isCrisis(hit)) { res.json(redirect(req, 'care', null, 'care')); return true; }
    for (const t of texts) {
      if (!t) continue;
      const s = safetyCheck(t);
      if (!s.ok) { res.json(redirect(req, s.kind, s.message, 'local')); return true; }
    }
    return false;
  }

  /** Replace judge-flagged phone lines with their template fallbacks. */
  async function judged(lines) {
    const { flagged } = await safety.judge(lines.map(({ id, text }) => ({ id, text })));
    const bad = new Set(flagged || []);
    return Object.fromEntries(lines.map((l) => [l.id, bad.has(l.id) ? l.fallback : l.text]));
  }

  const posted = new Set(); // board tokens already used (one post per game)
  const inFlight = new Set();
  app.post('/v2/board', limits.rate(), (req, res) => {
    const t = String(req.body?.btoken || '');
    const body = t.split('.')[0];
    let p = null;
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { /* bad token */ }
    const ok = p && typeof p.h === 'string' && p.h.startsWith('b:') && read(t, p.h);
    if (!ok || p.s !== sidHash(req)) return res.status(400).json({ ok: false, reason: 'bad_token' }); // bound to this session
    if (posted.has(p.n)) return res.json({ ok: false, reason: 'already_posted' });
    // Never before the reveal could have finished (gate + TV reveal); the phone waits for its own reveal anyway.
    const early = (Number(p.at) || 0) + MIN_REVEAL_MS - Date.now();
    if (early > 0) return res.json({ ok: false, reason: 'too_early', retryMs: Math.min(early + 100, MIN_REVEAL_MS) });
    if (inFlight.has(p.n)) return res.json({ ok: false, reason: 'already_posted' });
    inFlight.add(p.n);
    try {
      const r = stage.post(req, 'total', { score: Math.max(0, Math.min(40, Number(p.total) || 0)), extra: { verdict: safety.publicText('enum', p.verdict === 'deal' ? 'deal' : 'out').text } });
      if (r?.ok) { posted.add(p.n); if (posted.size > 20000) posted.clear(); } // a failed post does not burn the token
      res.json(r?.ok ? { ok: true, rank: r.rank, best: r.best } : { ok: false, reason: r?.reason || 'off' });
    } finally { inFlight.delete(p.n); }
  });

  app.get('/v2/prompts', limits.rate(), (req, res) => res.json({ prompts: GAMES.map((g) => ({ id: g.id, prompt: g.prompt, parts: g.parts, cardChips: g.cardChips })) }));

  app.post('/v2/names', limits.rate(), (req, res) => {
    const names = (Array.isArray(req.body?.names) ? req.body.names : []).slice(0, 2).map((n) => String(n ?? '').normalize('NFKC').trim());
    const ok = names.map((n) => /^[\p{L}][\p{L} .]{0,13}$/u.test(n) && letterCount(n) >= 2 && safetyCheck(n).ok && cleanText(n) === n && guardLine(n).ok !== false);
    res.json({ ok });
  });

  app.post('/v2/questions', limits.guard(), async (req, res) => {
    const parts = cleanParts(req.body?.parts, req.body?.pick);
    const { mode, coop } = modeOf(req.body);
    if (safetyMode() !== 'live' && !allPicked(req.body?.pick)) return res.status(409).json(CHIPS_ONLY);
    if (letterCount(parts.idea) < 4 || letterCount(joinParts(parts)) < 10) return res.status(400).json({ error: 'short', message: 'Idea card mein thoda aur batao! Ek line kaafi hai.' });
    if (await blocked(req, res, Object.values(parts))) return;
    const t0 = Date.now();
    const hero = demo.isHero(req);
    const h = hashOf(joinParts(parts));
    const panel = hero ? [...MAIN] : pickPanel(h);
    if (!hero) { analytics.count('pitch_mode', { mode }); analytics.count('game_mode', { mode: coop ? 'coop' : 'solo' }); if (panel.includes('mummy')) analytics.count('panel_mummy'); }

    const fb = questionsV2(parts, panel, hero ? { forceId: heroGame() } : {});
    const r = await answer('questions_v2', req,
      () => claude.run({ task: 'questions_v2', system: questionsSystem(panel), messages: questionsMessages(parts, { mode, coop }), schema: questionsSchema(panel), maxTokens: 1600, effort: 'low', mock: () => questionsV2(parts, panel) }),
      () => fb);
    if (r.data.safe === false || (r.data.safety && r.data.safety !== 'ok')) return res.json(redirect(req, r.data.safety, null, 'model'));

    const visitor = visitorWords(...Object.values(parts));
    const d = r.data;
    const lines = [
      { id: 'title', text: pick(visitor, { max: 40, title: true }, d.idea?.title, fb.idea.title), fallback: fb.idea.title },
      { id: 'host', text: pick(visitor, { max: 100 }, d.hostLine, fb.hostLine), fallback: fb.hostLine },
    ];
    for (const id of panel) {
      lines.push({ id: `q_${id}`, text: pick(visitor, { max: 130 }, d.questions?.[id]?.q, fb.questions[id].q), fallback: fb.questions[id].q });
      for (let i = 0; i < 3; i++) lines.push({ id: `c_${id}_${i}`, text: pick(visitor, { max: 44 }, d.questions?.[id]?.chips?.[i], fb.questions[id].chips[i]), fallback: fb.questions[id].chips[i] });
    }
    const out = r.source === 'claude' ? await judged(lines) : Object.fromEntries(lines.map((l) => [l.id, l.text]));
    const category = CATEGORIES.includes(d.idea?.category) ? d.idea.category : fb.idea.category;
    const questions = Object.fromEntries(panel.map((id) => [id, { q: out[`q_${id}`], chips: [0, 1, 2].map((i) => out[`c_${id}_${i}`]) }]));

    // TV: templates only. The persona's TV question is a reviewed bank line for their lens axis.
    const rnd = seeded(`tv:${h}`);
    const tvTitle = tvTitleFor(parts);
    const tv = {
      title: tvTitle,
      host: pickWith(rnd, HOST),
      questions: Object.fromEntries(panel.map((id) => [id, pickWith(rnd, QUESTIONS[id][ASK_AXIS[id]])])),
    };
    const qtoken = issue({ h, panel, q: Object.fromEntries(panel.map((id) => [id, questions[id].q])), ch: Object.fromEntries(panel.map((id) => [id, questions[id].chips])), t: tvTitle, c: category });
    res.json({ safe: true, v: 2, panel, idea: { title: out.title, category }, hostLine: out.host, questions, tv, qtoken, source: r.source, reason: r.reason, ms: Date.now() - t0, words: joinParts(parts).split(/\s+/).filter(Boolean).length });
  });

  // One total per question token (and per session + pitch without a valid token): a re-call returns the same verdict.
  const verdictCache = new Map();
  const remember = (k, v) => { verdictCache.set(k, v); if (verdictCache.size > 5000) verdictCache.delete(verdictCache.keys().next().value); };

  app.post('/v2/verdict', limits.guard(), async (req, res) => {
    const parts = cleanParts(req.body?.parts, req.body?.pick);
    const { mode, coop } = modeOf(req.body);
    if (letterCount(parts.idea) < 4) return res.status(400).json({ error: 'short', message: 'Pitch kho gaya. Ek baar phir se try karo!' });
    const h = hashOf(joinParts(parts));
    const tok = read(req.body?.qtoken, h);
    const hero = demo.isHero(req);
    const panel = Array.isArray(tok?.panel) && tok.panel.every((id) => PERSONAS[id]) ? tok.panel : hero ? [...MAIN] : pickPanel(h);
    const answers = Object.fromEntries(panel.map((id) => [id, cleanInput(req.body?.answers?.[id], 200)]));
    if (safetyMode() !== 'live') {
      const issued = tok?.ch || {};
      const chipOk = panel.every((id) => !answers[id] || (Array.isArray(issued[id]) && issued[id].includes(answers[id])));
      if (!allPicked(req.body?.pick) || !tok || !chipOk) return res.status(409).json(CHIPS_ONLY);
    }
    if (await blocked(req, res, [...Object.values(parts), ...Object.values(answers)])) return;
    const cacheKey = `${tok ? String(req.body.qtoken).split('.')[1] : `${sidHash(req)}:${h}`}:${hero ? 'h' : ''}`;
    if (verdictCache.has(cacheKey)) return res.json({ ...verdictCache.get(cacheKey), cached: true });
    const fbq = questionsV2(parts, panel);
    const questions = Object.fromEntries(panel.map((id) => [id, tok?.q?.[id] || fbq.questions[id].q]));
    const t0 = Date.now();

    const fb = verdictV2(parts, answers, panel, { mode, coop });
    const heroV = hero ? demo.hero()?.fixtures?.verdictV2 : null;
    const r = await answer('verdict_v2', req,
      () => claude.run({ task: 'verdict_v2', system: verdictSystem(panel), messages: verdictMessages(parts, questions, answers, panel, { mode, coop }), schema: verdictSchema(panel), maxTokens: 2000, effort: 'low', mock: () => verdictV2(parts, answers, panel, { mode, coop }) }),
      () => (heroV ? structuredClone(heroV) : fb));
    if (r.data.safe === false || (r.data.category && r.data.category !== 'ok')) return res.json(redirect(req, r.data.category, null, 'model'));
    const d = r.data;

    // Numbers: clamp, and the server decides every Deal from the axes and the persona's lens.
    const axes = Object.fromEntries(AXES.map((k) => { let n = Math.round(Number(d.axes?.[k])); if (!Number.isFinite(n)) n = fb.axes[k]; return [k, Math.max(4, Math.min(10, n))]; }));
    const total = AXES.reduce((t, k) => t + axes[k], 0);
    const visitor = visitorWords(...Object.values(parts), ...Object.values(answers));
    const rnd = seeded(`take:${h}:${total}`);
    const sharks = {};
    const lines = [];
    for (const id of panel) {
      const lens = lensScore(id, axes);
      const deal = lens >= DEAL_AT;
      const bankTake = pickWith(rnd, TAKES[id][deal ? 'deal' : 'out']);
      const own = String(d.sharks?.[id]?.take ?? '');
      const bandOk = deal ? !/main out|out hoon/i.test(own) : !/\bdeal\b/i.test(own.replace(/main out hoon/gi, ''));
      lines.push({ id: `take_${id}`, text: pick(visitor, { max: 100 }, bandOk ? own : '', bankTake), fallback: bankTake });
      sharks[id] = { deal, lens, tvTake: bankTake };
    }
    const concept = CONCEPTS.includes(d.lesson?.concept) ? d.lesson.concept : fb.lesson.concept;
    lines.push(
      { id: 'compliment', text: pick(visitor, { max: 130 }, d.compliment, fb.compliment), fallback: fb.compliment },
      { id: 'fix', text: pick(visitor, { max: 130 }, d.fix, fb.fix), fallback: fb.fix },
      { id: 'explain', text: pick(visitor, { max: 240 }, d.lesson?.explain, templateExplain(concept)), fallback: templateExplain(concept) },
    );
    const out = r.source === 'claude' ? await judged(lines) : Object.fromEntries(lines.map((l) => [l.id, l.text]));
    for (const id of panel) sharks[id].take = out[`take_${id}`];
    const deals = panel.filter((id) => sharks[id].deal).length;
    const verdict = deals >= DEALS_FOR_DEAL ? 'deal' : 'out';
    const tvTitle = TITLES && Object.values(TITLES).flat().includes(tok?.t) ? tok.t : tvTitleFor(parts);
    const tvLine = pickWith(rnd, TVLINE[verdict]);
    const lesson = lessonCard(concept, out.explain);

    // TV block: only bank lines, templates and numbers.
    const tv = {
      title: tvTitle,
      verdict,
      total,
      max: 40,
      deals,
      axes: AXES.map((k) => ({ id: k, label: COPY[`axis${k[0].toUpperCase()}${k.slice(1)}`], value: axes[k] })),
      sharks: panel.map((id) => ({ id, deal: sharks[id].deal, take: sharks[id].tvTake })),
      lesson: LESSON_TITLES[concept], // the TV adds its own "Mini-MBA lesson:" label
      line: tvLine,
    };
    // Share card: publicText objects only (CONTRACT 13.2).
    const share = {
      kicker: safety.publicText('share', 'kicker'),
      title: safety.publicText('share', verdict === 'deal' ? 'titleDeal' : 'titleOut'),
      footer: safety.publicText('share', 'footer'),
      coop: coop ? safety.publicText('share', 'coop') : null,
      lines: [
        safety.publicText('shareIdea', { title: tvTitle }),
        safety.publicText('shareTotal', { score: total, deals }),
        safety.publicText('shareAxes', { i: axes.idea, c: axes.customer, m: axes.money, e: axes.energy }),
        safety.publicText('sharePanel', { a: PERSONAS[panel[0]].name, b: PERSONAS[panel[1]].name, c: PERSONAS[panel[2]].name }),
      ],
    };

    // Leaderboard: posted after the reveal (POST /v2/board), because a post also ends a big-screen turn and
    // the TV reveal must still belong to this player. The total is signed here, so the phone cannot change it.
    let btoken = null;
    if (!hero) {
      analytics.count(verdict === 'deal' ? 'verdict_deal' : 'verdict_out');
      btoken = issue({ h: `b:${h}`, total, verdict, n: crypto.randomBytes(6).toString('hex'), s: sidHash(req), at: Date.now() });
    }
    const body = {
      v: 2, verdict, total, max: 40, deals, axes, panel,
      sharks: Object.fromEntries(panel.map((id) => [id, { deal: sharks[id].deal, take: sharks[id].take }])),
      compliment: out.compliment, fix: out.fix, lesson, programme: PROGRAMME,
      tv, share, btoken, bigScreen: !!stage.turn?.(req), signed: !!tok, source: r.source, reason: r.reason, ms: Date.now() - t0,
    };
    remember(cacheKey, body);
    res.json(body);
  });

  return { AXIS_LABEL, clean, pt };
}
