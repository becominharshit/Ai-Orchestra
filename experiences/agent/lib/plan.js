// The planner: ONE structured-output Claude call returns the agent's plan as JSON steps (tools + knobs from enums).
// Core's Claude proxy does not take tool definitions, so instead of tool_use blocks we ask for the plan as strict
// JSON (output_config.format) and run the tools in our own code (lib/tools.js). Same safety as strict tool use:
// the model can only pick values from our enums, and repairPlan() is the final authority on what runs.
import { JOBS, TOOL_IDS, toolById, SLIDERS, itemLabel, paramLabel, style, detailLevel } from './jobs.js';
import { calculator, calendar, lookup, notes, sessionsPerDay } from './tools.js';
import { introIds, whyIds, eligibleTips, lineOf } from './banks.js';
import { hashSeed } from '../../../core/server/demo.js';

export const MAX_STEPS = 6;
const ORDER = { lookup: 0, calculator: 1, calendar: 2, notes: 3 }; // only used to place tools the planner left out

export function planSchema(design) {
  const n = design.items.length;
  return {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: `2 to ${MAX_STEPS} steps, in the order they should run`,
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: design.tools },
            item: { type: 'string', enum: [...design.items.map((_, i) => `i${i + 1}`), 'all'], description: 'lookup: one item or all; other tools: all' },
            say: { type: 'string', enum: whyIds().filter((id) => design.tools.some((t) => id.startsWith(`w_${t}_`))), description: 'id of the reviewed line that explains this step (it must belong to the same tool)' },
          },
          required: ['tool', 'item', 'say'],
        },
      },
      weights: { type: 'array', description: `exactly ${n} numbers, one per item (i1..i${n}): 1 = less time, 3 = more time`, items: { type: 'integer', enum: [1, 2, 3] } },
      sessionMin: { type: 'integer', enum: design.job.sessions, description: 'length of one session in minutes' },
      breakMin: { type: 'integer', enum: design.job.breaks, description: 'break between sessions in minutes' },
      lightDay: { type: 'boolean', description: 'true = the middle day is a lighter recap day' },
      intro: { type: 'string', enum: introIds(design.voice.id), description: 'id of the reviewed intro line that fits the personality' },
      tips: { type: 'array', description: 'ids of the 3 reviewed tips that fit this student best, best first', items: { type: 'string', enum: eligibleTips(design).map((t) => t.id) } },
    },
    required: ['steps', 'weights', 'sessionMin', 'breakMin', 'lightDay', 'intro', 'tips'],
  };
}

export const PLAN_SYSTEM = `You are the planning brain of an AI agent that a student designed from a fixed template at a college fest stall in India (most visitors are Class 11 and 12 students).
You never write text. The result's sections come from reviewed content and the tools, and every line of wording is a reviewed line you pick by its id.
You choose which tools run, in what order, with which settings, and which reviewed lines fit. The tools are real code:
- lookup: reads a curated, reviewed list (facts, topic names and the template's reviewed content) for one item (i1, i2, ...) or all items. No web.
- calculator: splits the total time across the items by your weights, totals, and the template's own maths.
- calendar: builds a real schedule with start and end times and breaks. If a lookup ran before it, each session gets a topic name.
- notes: turns everything that ran before it into a checklist. Put it last.
Rules: 2 to 6 steps. Use every tool the student switched on at least once. Only lookup takes a single item; other tools use "all".
Personality sliders run from 0 to 4. strict: 0 = strict (longer sessions, short breaks, no light day), 4 = chill (shorter sessions, longer breaks, a light day).
funny: 0 = serious lines, 4 = playful lines. detail: 0 = few steps, 4 = more lookups and more steps.
Weights: give more time (3) to the item that usually needs the most practice, 1 to the lightest. Pick a session and break length that fit the daily time well.
Lines: "intro" is one id from lines.intro, each step's "say" is one id from lines.say for that step's tool, "tips" are 3 ids from lines.tips that fit this student's chips best.`;

export function planMessages(design) {
  const { job, items, params, sliders, voice, tools } = design;
  const brief = {
    job: job.name,
    task: job.task,
    items: Object.fromEntries(items.map((id, i) => [`i${i + 1}`, itemLabel(job, id)])),
    settings: Object.fromEntries(job.params.map((p) => [p.label, paramLabel(job, p.id, params[p.id])])),
    dailyMinutes: params.perDay,
    days: params.days,
    personality: Object.fromEntries(SLIDERS.map((s, i) => [s.id, sliders[i]])),
    voice: voice.label,
    toolsOn: tools.map((t) => `${t}: ${toolById(t).blurb}`),
    lines: {
      intro: Object.fromEntries(introIds(voice.id).map((id) => [id, lineOf(id)])),
      say: Object.fromEntries(tools.map((t) => [t, Object.fromEntries(whyIds().filter((id) => id.startsWith(`w_${t}_`)).map((id) => [id, lineOf(id)]))])),
      tips: Object.fromEntries(eligibleTips(design).map((x) => [x.id, x.text])),
    },
  };
  return [{ role: 'user', content: `Plan this agent's one task.\n${JSON.stringify(brief, null, 1)}` }];
}

/** What a planner would do for these sliders (used by CLAUDE_MOCK and as the shape of the banked fixtures). */
export function defaultPlan(design, { sessionMin, breakMin, lightDay, weights } = {}) {
  const st = style(design.sliders[0]);
  const long = detailLevel(design.sliders[2]) === 'long';
  const n = design.items.length;
  const steps = [];
  if (long) design.items.forEach((_, i) => steps.push({ tool: 'lookup', item: `i${i + 1}` }));
  else steps.push({ tool: 'lookup', item: 'all' });
  steps.push({ tool: 'calculator', item: 'all' }, { tool: 'calendar', item: 'all' }, { tool: 'notes', item: 'all' });
  const knobs = pickKnobs(design.job, design.params.perDay, st);
  const on = steps.filter((s) => design.tools.includes(s.tool)); // repairPlan caps at 6 (lookups merge first)
  const lines = defaultLines(design, on);
  return {
    steps: on.map((s, i) => ({ ...s, say: lines.says[i] })),
    weights: weights || Array.from({ length: n }, (_, i) => (i === 0 ? 3 : 2)),
    sessionMin: sessionMin ?? knobs.sessionMin, breakMin: breakMin ?? knobs.breakMin, lightDay: lightDay ?? st === 'chill', intro: lines.intro, tips: lines.tips,
  };
}

/**
 * Session and break length for a personality that also use the day well: among lengths that fill at least
 * (best fill - 20 points) of the daily time, strict takes the longest session, chill the shortest, balanced the middle.
 */
export function pickKnobs(job, perDay, st) {
  const breaks = [...job.breaks].sort((a, b) => a - b);
  const breakMin = st === 'strict' ? breaks[0] : st === 'chill' ? breaks[breaks.length - 1] : breaks[Math.floor((breaks.length - 1) / 2)];
  const fit = job.sessions.filter((m) => m <= perDay);
  const cands = (fit.length ? fit : [Math.min(...job.sessions)]).map((S) => { const n = sessionsPerDay(perDay, S, breakMin); return { S, fill: (n * S + (n - 1) * breakMin) / perDay }; });
  const best = Math.max(...cands.map((c) => c.fill));
  const good = cands.filter((c) => c.fill >= best - 0.2).map((c) => c.S).sort((a, b) => a - b);
  const sessionMin = st === 'strict' ? good[good.length - 1] : st === 'chill' ? good[0] : good[Math.floor((good.length - 1) / 2)];
  return { sessionMin, breakMin };
}

/** Which reviewed lines to show without a model (offline, mock, hero, or a bad pick): personality-led, chip tips first. */
export function defaultLines(design, steps) {
  const band = { strict: 0, balanced: 2, chill: 4 }[style(design.sliders[0])] + (design.sliders[1] >= 3 ? 1 : 0);
  const seen = {};
  const say = steps.map((x) => { const k = (seen[x.tool] = (seen[x.tool] ?? -1) + 1); return `w_${x.tool}_${({ strict: [0, 3], balanced: [1, 4], chill: [2, 5] }[style(design.sliders[0])])[k % 2]}`; });
  const tips = eligibleTips(design);
  const chip = tips.filter((x) => x.chip);
  const gen = tips.filter((x) => !x.chip);
  const off = hashSeed(`${design.job.id}:${design.items.join('.')}:${design.sliders.join('.')}`) % Math.max(1, gen.length);
  const picked = [...chip, ...gen.slice(off), ...gen.slice(0, off)].slice(0, 3).map((x) => x.id);
  return { intro: introIds(design.voice.id)[band], says: say, tips: picked };
}

const nearest = (list, v) => [...list].sort((a, b) => Math.abs(a - v) - Math.abs(b - v) || a - b)[0];

/**
 * The code is the authority on what runs. Drops steps with unknown tools or items, removes repeats, adds any
 * switched-on tool the planner left out, puts notes last, caps at 6 steps (lookups merge into "all" first),
 * snaps every knob to an allowed value that fits the day. Returns the plan plus how many fixes it needed.
 */
export function repairPlan(raw, design) {
  let fixes = 0;
  const n = design.items.length;
  const itemsOk = [...design.items.map((_, i) => `i${i + 1}`), 'all'];
  const src = Array.isArray(raw?.steps) ? raw.steps : [];
  let steps = [];
  const seen = new Set();
  for (const s of src) {
    const tool = s?.tool;
    let item = s?.item;
    if (!design.tools.includes(tool) || !itemsOk.includes(item)) { fixes += 1; continue; }
    if (tool !== 'lookup' && item !== 'all') { item = 'all'; fixes += 1; }
    const key = `${tool}:${item}`;
    if (seen.has(key) || (tool === 'lookup' && seen.has('lookup:all'))) { fixes += 1; continue; }
    seen.add(key);
    steps.push({ tool, item, say: typeof s.say === 'string' && s.say.startsWith(`w_${tool}_`) && lineOf(s.say) ? s.say : null });
  }
  // a lookup of "all" makes single-item lookups redundant
  if (seen.has('lookup:all')) {
    const before = steps.length;
    steps = steps.filter((s) => !(s.tool === 'lookup' && s.item !== 'all'));
    fixes += before - steps.length;
  }
  for (const t of TOOL_IDS.filter((x) => design.tools.includes(x))) {
    if (steps.some((s) => s.tool === t)) continue;
    fixes += 1;
    const at = steps.findIndex((s) => ORDER[s.tool] > ORDER[t]);
    const step = { tool: t, item: 'all', say: null };
    if (at < 0) steps.push(step); else steps.splice(at, 0, step);
  }
  const ni = steps.findIndex((s) => s.tool === 'notes');
  if (ni >= 0 && ni !== steps.length - 1) { steps.push(steps.splice(ni, 1)[0]); fixes += 1; }
  if (steps.length > MAX_STEPS) {
    const looks = steps.filter((s) => s.tool === 'lookup');
    const firstLook = steps.indexOf(looks[0]);
    steps = steps.filter((s) => s.tool !== 'lookup');
    steps.splice(firstLook, 0, { tool: 'lookup', item: 'all', say: looks[0].say });
    fixes += 1;
  }
  const w = Array.isArray(raw?.weights) ? raw.weights : [];
  const weights = Array.from({ length: n }, (_, i) => (Number.isInteger(w[i]) && w[i] >= 1 && w[i] <= 3 ? w[i] : (fixes += 1, 2)));
  if (w.length !== n) fixes += w.length > n ? 1 : 0;
  const perDay = design.params.perDay;
  const fit = design.job.sessions.filter((m) => m <= perDay);
  const allowedS = fit.length ? fit : [Math.min(...design.job.sessions)];
  let sessionMin = Number(raw?.sessionMin);
  if (!allowedS.includes(sessionMin)) { fixes += 1; sessionMin = nearest(allowedS, Number.isFinite(sessionMin) ? sessionMin : allowedS[0]); }
  let breakMin = Number(raw?.breakMin);
  if (!design.job.breaks.includes(breakMin)) { fixes += 1; breakMin = nearest(design.job.breaks, Number.isFinite(breakMin) ? breakMin : design.job.breaks[0]); }
  const lightDay = typeof raw?.lightDay === 'boolean' ? raw.lightDay : (fixes += 1, false);
  return {
    plan: { steps, weights, sessionMin: Math.min(sessionMin, perDay), breakMin, lightDay },
    lines: pickLines(raw, design, steps),
    fixes,
  };
}

/** The reviewed line ids to show: the planner's picks where valid, else the personality defaults. */
function pickLines(raw, design, steps) {
  const def = defaultLines(design, steps);
  const intro = introIds(design.voice.id).includes(raw?.intro) ? raw.intro : def.intro;
  const says = steps.map((x, i) => x.say || def.says[i]);
  const ok = new Set(eligibleTips(design).map((t) => t.id));
  const tips = [...new Set((Array.isArray(raw?.tips) ? raw.tips : []).filter((t) => ok.has(t)))].slice(0, 3);
  for (const t of def.tips) if (tips.length < 3 && !tips.includes(t)) tips.push(t);
  return { intro, says, tips };
}

/** Run the plan: each step calls its real tool, in the planner's order. Returns the trace and the outputs. */
export function execute(design, plan, { today } = {}) {
  const trace = [];
  const outputs = {};
  const topics = {};
  const detailMax = [4, 5, 6, 7, 8][design.sliders[2]];
  for (const step of plan.steps) {
    const t0 = process.hrtime.bigint();
    let out;
    if (step.tool === 'lookup') {
      out = lookup(design, step.item);
      for (const it of out.items) topics[it.id] = it.topics;
      const prev = outputs.lookup;
      outputs.lookup = prev ? { ...out, items: [...prev.items, ...out.items.filter((x) => !prev.items.some((p) => p.id === x.id))] } : out;
    } else if (step.tool === 'calculator') {
      out = outputs.calculator = calculator(design, plan);
    } else if (step.tool === 'calendar') {
      out = outputs.calendar = calendar(design, plan, { today, topics: { ...topics } });
    } else if (step.tool === 'notes') {
      out = outputs.notes = notes(design, outputs, detailMax);
    }
    trace.push({ tool: step.tool, item: step.item, out, us: Number((process.hrtime.bigint() - t0) / 1000n) });
  }
  return { trace, outputs };
}

export { JOBS };
