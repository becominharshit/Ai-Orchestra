// All text of Build Your Own AI Agent.
//  1. PUBLIC text (TV, share card, Agent card): registered with core safety (banks, lists, templates with typed slots)
//     and produced only through publicText(). Never a visitor-typed string: there is no text box in this experience.
//  2. PHONE wording banks: the agent's intro, step reasons and tip when the model's wording is not available
//     (offline, mock, hero) or the judge flagged it. Reviewed copy; shown only on the visitor's own phone.
import { JOBS, TOOLS, SLIDERS, VOICES, NAME_ADJ, NAME_NOUN, LOOKUP, toolById, style } from './jobs.js';
import { hm } from './tools.js';
import { INTRO, WHY, TIPS, lineOf, eligibleTips, allBankLines } from './banks.js';

// ---------------- phone wording (CHECK-19 F3): only reviewed lines from lib/banks.js, picked by id ----------------
// fixed notes per template on the result (phone): what this result is and is not
export const NOTE = {
  jee: 'Yeh ek guide hai, marks ya rank ka promise nahi. Apni speed se chalo. Apne teacher/mentor se bhi discuss karo.',
  boards: 'Yeh ek guide hai, marks ka promise nahi. Apni speed se chalo. Apne teacher/mentor se bhi discuss karo.',
  concept: 'Explanation hamari reviewed list se hai. Apne teacher/mentor se bhi discuss karo.',
  lecture: 'Video mein apna chehra ya naam dikhana zaroori nahi. Apne teacher/mentor se bhi discuss karo.',
  mock: 'Mock practice hai, result ka promise nahi. Apne teacher/mentor se bhi discuss karo.',
  skill: 'Koi bhi free online editor chalega. Roz thoda, bas.',
  mvp: 'Users ka data lo toh unki permission se, aur kam se kam.',
  hackathon: 'Yeh din ka plan hai, 9 se 9. Raat ka kaam nahi: ghar jao aur neend poori karo. Kisi bade ko plan bata ke rakho.',
  cofounder: 'Yeh practice plan hai, financial advice nahi. Paisa lagane se pehle mentor ya ghar walon se baat karo.',
  d2c: 'Customer ki photo ya review unki permission se hi post karo.',
  creator: 'Apni privacy ka dhyan rakho: ghar ka address ya school ki details post mat karo.',
  fest: 'Saman aur bijli ka kaam kisi bade ki madad se karo.',
  debate: 'Debate ideas pe hoti hai, logon pe nahi. Respect se bolo.',
  career: 'Work split Zenith School of AI research, 2026 se hai. Yeh outlook hai, guarantee nahi.',
  collegeq: 'Hum kisi college ka naam ya score nahi dete. Jawab likh ke compare karo, decision family ke saath.',
  cricket: 'Gully match ka fun plan hai. Koi betting ya fantasy nahi. Practice se pehle warm up zaroor.',
};

export const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
/** The phone wording for the picked line ids: intro (with the agent name and task filled in), one line per step, 3 tips. */
export function wordsFor(design, lines) {
  const tip = new Map(eligibleTips(design).map((t) => [t.id, t.text]));
  return {
    intro: fill(lineOf(lines.intro), { name: design.name.text, task: design.job.task }),
    why: lines.says.map((id) => lineOf(id)),
    tips: lines.tips.map((id) => tip.get(id)).filter(Boolean),
  };
}
/** The safest line for a slot, used if the backstop (guard or judge) ever flags a picked line. */
export function safeWords(design, plan) {
  return { intro: fill(INTRO[design.voice.id][2], { name: design.name.text, task: design.job.task }), why: plan.steps.map((s) => WHY[s.tool][1]), tip: TIPS[design.job.id].general[0] };
}
export const allPhoneBankLines = () => [...allBankLines().map((l) => fill(l, { name: 'Nova Jugnu', task: 'Mera revision plan banao' })), ...Object.values(NOTE)];

// ---------------- public text (TV, share card, Agent card) ----------------
// Slot ranges are tight on purpose (CHECK-19 F1): no slot can carry a long number, and none goes over 4 digits.
export const PHASES = { pp: 'Powerplay', mid: 'Middle overs', death: 'Death overs' };
export const TAGS = { planner: 'PLAN', lookup: 'LOOKUP', calculator: 'CALC', calendar: 'CALENDAR', notes: 'NOTES', check: 'CHECK' };
export const STAT = { days: 'Din', sessions: 'Sessions', blocks: 'Blocks', hours: 'Ghante', steps: 'Steps' };
const allItems = () => [...new Set(JOBS.flatMap((j) => j.items.options.map((o) => o.label)))];
const allStarts = () => [...new Set(JOBS.flatMap((j) => [...(j.params.find((p) => p.id === 'start')?.options.map((o) => o.id) || []), ...(j.fixed?.start ? [j.fixed.start] : [])]))];
const budgetCats = () => [...new Set(Object.values(LOOKUP.fest.budget).flat().map((c) => c[0]))];

export function registerPublic(safety) {
  safety.list('adj', NAME_ADJ);
  safety.list('noun', NAME_NOUN);
  safety.list('items', allItems());
  safety.list('tools', TOOLS.map((t) => t.agent));
  safety.list('toolLabels', TOOLS.map((t) => t.label));
  safety.list('jobs', JOBS.map((j) => j.name));
  safety.list('voices', VOICES.map((v) => v.label));
  safety.list('starts', allStarts());
  safety.list('phases', Object.values(PHASES));
  safety.list('budgetCats', budgetCats());
  safety.list('speechParts', LOOKUP.debate.speech.map((x) => x[0]));
  safety.list('careers', [...new Set(Object.values(LOOKUP.career.areas).flatMap((a) => a.careers.map((c) => c.title)))]);
  SLIDERS.forEach((s) => safety.list(`stops_${s.id}`, s.stops));

  safety.bank('orx', {
    title: 'Build Your Own AI Agent', planner: 'Planner', plannerRole: 'Plan as strict JSON steps', check: 'Safety Check', checkRole: 'Judge pass, phone only',
    ...Object.fromEntries(TOOLS.flatMap((t) => [[`a_${t.id}`, t.agent], [`r_${t.id}`, t.role]])),
    tPlan: 'Task ka plan banao', tCalc: 'Time aur numbers nikalo', tCal: 'Asli schedule banao', tNotes: 'Checklist banao', tCheck: 'Wording check karo', tLookAll: 'Curated data padho',
    bPlan: 'plan ready', bCalc: 'numbers ready', bCal: 'schedule ready', bLook: 'facts ready', bNotes: 'checklist ready', bCheck: 'sab clear',
    source: 'Source: Zenith curated list', kicker: 'Agent ready', customPlan: 'plan', customRun: 'run',
    lPlanLive: 'Planner: Claude, strict JSON', lPlanMock: 'Planner: mock mode, no key', lPlanBank: 'Planner: banked plan, offline safe', lFixNone: 'Plan check: sab steps valid',
    lAgenda: 'Event day plan ready, har block timed', lConcept: 'Worked example: calculator se', lQuestions: 'Sawaal: reviewed list se', lCycles: '3 revision rounds set',
  });
  safety.bank('roles', Object.fromEntries(JOBS.map((j) => [j.id, j.role])));
  safety.bank('icons', Object.fromEntries(JOBS.map((j) => [j.id, j.icon])));
  safety.bank('stats', STAT);
  safety.bank('toolLabels', Object.fromEntries(TOOLS.map((t) => [t.id, t.label])));
  safety.bank('itemLabels', Object.fromEntries(allItems().map((l, i) => [`i${i}`, l])));
  safety.bank('tags', TAGS);
  safety.bank('ends', Object.fromEntries(SLIDERS.flatMap((s) => [[`${s.id}_l`, s.left], [`${s.id}_r`, s.right]])));
  safety.bank('cards', { kicker: 'Maine apna AI agent banaya', kicker17: 'Maine 17 saal mein apna AI agent banaya', agentKicker: 'AI Agent Card', footer: 'Zenith School of AI, Ideas 4.0' });

  const T = (id, text, slots) => safety.template(id, text, slots);
  T('name', '{adj} {noun}', { adj: 'list:adj', noun: 'list:noun' });
  T('lookItem', 'Lookup: {item}', { item: 'list:items' });
  T('step', 'Step {i}', { i: 'int:1..6' });
  T('logPlan', 'Plan: {n} steps, {t} tools', { n: 'int:1..6', t: 'int:1..4' });
  T('logStep', '{i}. {tool}', { i: 'int:1..6', tool: 'list:tools' });
  T('logFix', 'Plan check: {n} fixes in code', { n: 'int:1..40' });
  T('logSplit', '{n} sessions x {m} min = {h}h {mm}m', { n: 'int:1..200', m: 'int:5..90', h: 'int:0..99', mm: 'int:0..59' });
  T('logItem', '{item}: {n} sessions, {p}%', { item: 'list:items', n: 'int:0..200', p: 'int:0..100' });
  T('logItem1', '{item}: 1 session, {p}%', { item: 'list:items', p: 'int:0..100' });
  T('logCal', '{d} din, {n} slots, {start} se, {c} clash', { d: 'int:1..31', n: 'int:1..200', start: 'list:starts', c: 'int:0..9' });
  T('logLight', 'Light day: Day {d}', { d: 'int:1..31' });
  T('logLook', '{item}: {f} facts, {t} topics', { item: 'list:items', f: 'int:0..9', t: 'int:0..20' });
  T('logNotes', 'Checklist: {n} items', { n: 'int:1..12' });
  T('logJudge', 'Judge: {ok} of {n} lines ok', { ok: 'int:0..12', n: 'int:0..12' });
  T('logBanked', 'Reviewed lines: {n}, phone only', { n: 'int:0..12' });
  T('logBlocks', '{n} work blocks, {b} breaks, 09:00 se 21:00', { n: 'int:1..20', b: 'int:1..12' });
  T('logWeak', 'Weak chapter: {n} sessions', { n: 'int:0..99' });
  T('logTypes', 'Practice types: {n} din x 3', { n: 'int:1..31' });
  T('logRound', 'Round {i}: Day {a} to {b}', { i: 'int:1..3', a: 'int:1..31', b: 'int:1..31' });
  T('logSeries', '{e} episodes x {s} sec, {w} words each', { e: 'int:1..9', s: 'int:10..90', w: 'int:50..300' });
  T('logSection', '{item}: {m} min', { item: 'list:items', m: 'int:1..180' });
  T('logBuffer', 'Revision buffer: {m} min', { m: 'int:0..60' });
  T('logWeeks', '{w} weeks, {m} min per week', { w: 'int:1..6', m: 'int:1..999' });
  T('logCustomers', 'Pehle 10 customers: {a}, {b}, {c}, {d} per week', { a: 'int:0..10', b: 'int:0..10', c: 'int:0..10', d: 'int:0..10' });
  T('logPosts', '{n} posts, {h}h {m}m creation time', { n: 'int:1..60', h: 'int:0..99', m: 'int:0..59' });
  T('logFitOk', 'Time kaafi hai: {h}h {m}m extra', { h: 'int:0..99', m: 'int:0..59' });
  T('logFitShort', 'Time kam hai: {h}h {m}m aur chahiye', { h: 'int:0..99', m: 'int:0..59' });
  T('logBudget', '{cat}: {p}% of budget', { cat: 'list:budgetCats', p: 'int:0..100' });
  T('logTeam', '{n} kaam, {k} per person', { n: 'int:1..200', k: 'int:1..200' });
  T('logSpeech', '{part}: {s} sec', { part: 'list:speechParts', s: 'int:1..240' });
  T('logCareer', '{c}: AI {a}%, with AI {b}%, people {p}%', { c: 'list:careers', a: 'int:0..100', b: 'int:0..100', p: 'int:0..100' });
  T('logQuestions', '{item}: {n} sawaal', { item: 'list:items', n: 'int:0..10' });
  T('logChase', 'Target {t} in {o} overs: {a}.{b} per over', { t: 'int:1..240', o: 'int:1..20', a: 'int:0..36', b: 'int:0..9' });
  T('logPhase', '{phase}: {r} runs in {o} overs', { phase: 'list:phases', r: 'int:0..240', o: 'int:2..20' });
  T('logPhase1', '{phase}: {r} runs in 1 over', { phase: 'list:phases', r: 'int:0..36' });
  T('done', 'Task done in {s}.{t}s', { s: 'int:0..120', t: 'int:0..9' });
  T('cardJob', 'Template: {job}', { job: 'list:jobs' });
  T('cardPersona', '{a}, {b}, {c}', { a: 'list:stops_strict', b: 'list:stops_funny', c: 'list:stops_detail' });
  T('cardVoice', 'Voice: {voice}', { voice: 'list:voices' });
  T('tools1', 'Tools: {a}', { a: 'list:toolLabels' });
  T('tools2', 'Tools: {a}, {b}', { a: 'list:toolLabels', b: 'list:toolLabels' });
  T('tools3', 'Tools: {a}, {b}, {c}', { a: 'list:toolLabels', b: 'list:toolLabels', c: 'list:toolLabels' });
  T('tools4', 'Tools: {a}, {b}, {c}, {d}', { a: 'list:toolLabels', b: 'list:toolLabels', c: 'list:toolLabels', d: 'list:toolLabels' });
  T('tvTask', '{d} din, {n} sessions, {h}h {m}m', { d: 'int:1..31', n: 'int:1..200', h: 'int:0..99', m: 'int:0..59' });
  T('tvSteps', '{n} steps, {t} tools', { n: 'int:1..6', t: 'int:1..4' });
}

/** Everything the phone needs to draw the orchestra BEFORE the run (all registered strings). */
export function orxStrings(pt) {
  const s = (k) => pt('orx', k).text;
  return {
    title: s('title'),
    planner: { name: s('planner'), role: s('plannerRole') },
    check: { name: s('check'), role: s('checkRole') },
    tools: Object.fromEntries(TOOLS.map((t) => [t.id, { name: s(`a_${t.id}`), role: s(`r_${t.id}`) }])),
    tasks: { plan: s('tPlan'), check: s('tCheck') },
    tags: Object.fromEntries(Object.keys(TAGS).map((k) => [k, pt('tags', k).text])),
    roles: Object.fromEntries(JOBS.map((j) => [j.id, pt('roles', j.id).text])),
  };
}

/** The init event of a run (server publishes it; the phone builds the same from the bundle). */
export function orxInit(pt, design) {
  const O = orxStrings(pt);
  const tools = TOOLS.filter((t) => design.tools.includes(t.id));
  return {
    title: O.title, planTask: O.tasks.plan,
    orchestrator: { id: 'agent', name: pt('name', { adj: design.name.adj, noun: design.name.noun }).text, role: O.roles[design.job.id], icon: design.job.icon },
    agents: [
      { id: 'planner', name: O.planner.name, role: O.planner.role, icon: 'brain', label: O.tags.planner },
      ...tools.map((t) => ({ id: t.id, name: O.tools[t.id].name, role: O.tools[t.id].role, icon: t.icon, label: O.tags[t.id] })),
      { id: 'check', name: O.check.name, role: O.check.role, icon: 'shield', label: O.tags.check },
    ],
  };
}

const tenths = (n) => ({ a: Math.floor(n / 10), b: n % 10 });

/**
 * The orchestra script after the plan came back: one entry per agent turn, with log lines that are filled
 * templates (numbers and our own labels only). Phone and TV play it from the same timeline (web/timeline.js).
 */
export function orxScript(pt, design, { plan, trace, fixes, source, judged }) {
  const t = (id, slots) => pt(id, slots).text;
  const b = (k) => pt('orx', k).text;
  const steps = [];
  steps.push({
    id: 'planner', task: b('tPlan'),
    logs: [b(source === 'claude' ? 'lPlanLive' : source === 'mock' ? 'lPlanMock' : 'lPlanBank'), t('logPlan', { n: plan.steps.length, t: new Set(plan.steps.map((s) => s.tool)).size }),
      ...plan.steps.map((s, i) => t('logStep', { i: i + 1, tool: toolById(s.tool).agent })), fixes ? t('logFix', { n: Math.min(40, fixes) }) : b('lFixNone')],
    back: b('bPlan'),
  });
  trace.forEach((tr, i) => {
    const o = tr.out;
    const logs = [];
    let task;
    let back;
    if (tr.tool === 'lookup') {
      task = tr.item === 'all' ? b('tLookAll') : t('lookItem', { item: o.items[0].label });
      for (const it of o.items.slice(0, 5)) logs.push(t('logLook', { item: it.label, f: Math.min(9, it.facts.length), t: Math.min(20, it.topics.length) }));
      if (design.job.id === 'concept') logs.push(b('lConcept'));
      if (design.job.id === 'collegeq') logs.push(b('lQuestions'));
      logs.push(b('source'));
      back = b('bLook');
    } else if (tr.tool === 'calculator') {
      task = b('tCalc');
      if (o.total && design.job.schedule === 'days') { const f = hm(o.focusMin); logs.push(t('logSplit', { n: o.total, m: o.sessionMin, h: f.h, mm: f.m })); }
      for (const it of o.perItem.slice(0, 5)) logs.push(it.sessions === 1 ? t('logItem1', { item: it.label, p: it.percent }) : t('logItem', { item: it.label, n: it.sessions, p: it.percent }));
      logs.push(...extraLogs(t, b, design, o));
      back = b('bCalc');
    } else if (tr.tool === 'calendar') {
      task = b('tCal');
      if (o.days.length) logs.push(t('logCal', { d: o.days.length, n: o.total, start: o.start, c: Math.min(9, o.clashes) }));
      const light = o.days.find((d) => d.light);
      if (light) logs.push(t('logLight', { d: light.day }));
      if (o.agenda) logs.push(b('lAgenda'));
      back = b('bCal');
    } else {
      task = b('tNotes');
      logs.push(t('logNotes', { n: Math.min(12, o.items.length) }));
      back = b('bNotes');
    }
    steps.push({ id: tr.tool, task, logs: logs.slice(0, 7), handoff: t('step', { i: i + 1 }), back });
  });
  steps.push({
    id: 'check', task: b('tCheck'),
    logs: [judged.live ? t('logJudge', { ok: Math.min(12, judged.ok), n: Math.min(12, judged.n) }) : t('logBanked', { n: Math.min(12, judged.n) })],
    back: b('bCheck'),
  });
  return steps;
}

function extraLogs(t, b, design, o) {
  const x = o.extra;
  const { job, params } = design;
  switch (job.id) {
    case 'jee': return [t('logWeak', { n: Math.min(99, x.weakSessions) }), t('logTypes', { n: params.days })];
    case 'boards': return [b('lCycles'), ...x.cycles.map((c, i) => t('logRound', { i: i + 1, a: c.from, b: c.to }))];
    case 'lecture': return [t('logSeries', { e: x.episodes, s: x.secondsEach, w: x.wordsEach })];
    case 'mock': return [...x.sections.map((s) => t('logSection', { item: s.label, m: s.minutes })), t('logBuffer', { m: x.buffer })];
    case 'skill': return [t('logWeeks', { w: x.weeks, m: Math.min(999, x.weeklyMin) })];
    case 'hackathon': return [t('logBlocks', { n: o.total, b: x.breaks })];
    case 'cofounder': return [t('logCustomers', { a: x.perWeek[0], b: x.perWeek[1], c: x.perWeek[2], d: x.perWeek[3] })];
    case 'd2c':
    case 'creator': { const f = hm(x.needMin); const g = hm(Math.abs(x.haveMin - x.needMin)); return [t('logPosts', { n: x.posts, h: f.h, m: f.m }), t(x.enough ? 'logFitOk' : 'logFitShort', { h: Math.min(99, g.h), m: g.m })]; }
    case 'fest': return [...x.split.map((s) => t('logBudget', { cat: s.label, p: s.percent })), t('logTeam', { n: x.tasks, k: x.perPerson })];
    case 'debate': return x.timing.map((p) => t('logSpeech', { part: p.label, s: p.seconds }));
    case 'career': return x.careers.map((c) => t('logCareer', { c: c.title, a: c.by_ai, b: c.with_ai, p: c.led_by_people }));
    case 'collegeq': return x.perPriority.map((p) => t('logQuestions', { item: p.label, n: p.count }));
    case 'cricket': return [t('logChase', { t: x.target, o: x.overs, ...tenths(x.rrTenths) }), ...x.phases.map((p) => (p.overs === 1 ? t('logPhase1', { phase: PHASES[p.id], r: p.runs }) : t('logPhase', { phase: PHASES[p.id], r: p.runs, o: p.overs })))];
    default: return [];
  }
}

/**
 * Share card (CHANGE-02a: the agent's name, template and role only), Agent card (name, template, role, personality,
 * voice, tools) and the TV spotlight, all from publicText. TV numbers are small integers (CHECK-19 F1).
 */
export function publicCards(pt, design, { plan, outputs }) {
  const { job, sliders, voice, tools, name } = design;
  const labels = tools.map((id) => toolById(id).label);
  const tl = pt(`tools${labels.length}`, Object.fromEntries(labels.map((l, i) => [['a', 'b', 'c', 'd'][i], l])));
  const persona = pt('cardPersona', { a: SLIDERS[0].stops[sliders[0]], b: SLIDERS[1].stops[sliders[1]], c: SLIDERS[2].stops[sliders[2]] });
  const nm = pt('name', { adj: name.adj, noun: name.noun });
  const role = pt('roles', job.id);
  const tpl = pt('cardJob', { job: job.name });
  const card = { kickers: { neutral: pt('cards', 'kicker'), age17: pt('cards', 'kicker17') }, title: nm, lines: [tpl, role], footer: pt('cards', 'footer') };
  const agentCard = { kicker: pt('cards', 'agentKicker'), title: nm, role, template: tpl, voice: pt('cardVoice', { voice: voice.label }), tools: tl, persona, footer: pt('cards', 'footer'), sliders, ends: SLIDERS.map((s) => [pt('ends', `${s.id}_l`), pt('ends', `${s.id}_r`)]), icon: job.icon };
  const calc = outputs.calculator;
  const cal = outputs.calendar;
  const days = job.schedule === 'days';
  const total = (calc || cal)?.total || 0;
  const focusMin = calc ? calc.focusMin : total * plan.sessionMin;
  const f = hm(focusMin);
  const task = days && total ? pt('tvTask', { d: design.params.days, n: total, h: f.h, m: f.m }) : pt('tvSteps', { n: plan.steps.length, t: tools.length });
  const tv = {
    kicker: pt('orx', 'kicker').text, title: nm.text, subtitle: role.text, icon: pt('icons', job.id).text,
    tags: labels, labels: SLIDERS.flatMap((s) => [pt('ends', `${s.id}_l`).text, pt('ends', `${s.id}_r`).text]), scores: sliders.map((v) => ({ value: v, max: 4 })),
    lines: [task.text],
    stats: [
      { label: STAT.days, value: design.params.days },
      ...(total ? [{ label: days ? STAT.sessions : STAT.blocks, value: total }, { label: STAT.hours, value: Math.max(0, Math.round(focusMin / 60)) }] : []),
      { label: STAT.steps, value: plan.steps.length },
    ],
    skills: design.items.slice(0, 5).map((id) => job.items.options.find((o) => o.id === id).label),
    rows: cal && days ? cal.days.slice(0, 14).map((d) => ({ items: d.slots.slice(0, 8).map((s) => s.item), level: d.light ? 1 : 0 })) : [],
  };
  return { card, agentCard, tv };
}
