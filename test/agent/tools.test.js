// Build Your Own AI Agent: the tools are real and deterministic, every shown number is feasible (CHECK-19 F2), the
// plan repair is the authority, and every line of copy passes the rules. Run: node --test test/agent/tools.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOBS, TOOL_IDS, LOOKUP, validateDesign, SLIDERS } from '../../experiences/agent/lib/jobs.js';
import { split, percents, interleave, calculator, calendar, lookup, toMin, clashes, planDate, SPACED } from '../../experiences/agent/lib/tools.js';
import { planSchema, repairPlan, execute, defaultPlan, defaultLines, pickKnobs, MAX_STEPS } from '../../experiences/agent/lib/plan.js';
import { compose } from '../../experiences/agent/lib/compose.js';
import { allPhoneBankLines } from '../../experiences/agent/lib/text.js';
import { isRest } from '../../experiences/agent/lib/tools.js';
import { mockPlan } from '../../experiences/agent/server.js';
import { buildTimeline } from '../../experiences/agent/web/timeline.js';
import { cleanPayload, labelOk } from '../../experiences/agent/web/tvcheck.js';
import { checkSchema, strictSchema } from '../../core/server/claude.js';
import { cleanText } from '../../core/server/textfilter.js';
import { detect } from '../../core/web/care-words.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DASH = /[\u2012-\u2015]/;
const TODAY = '2026-10-27';
const combos = (arr, k) => (k === 0 ? [[]] : arr.flatMap((x, i) => combos(arr.slice(i + 1), k - 1).map((c) => [x, ...c])));
const product = (lists) => lists.reduce((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]);
const firstParams = (job, items) => Object.fromEntries(job.params.map((p) => [p.id, p.options.find((o) => !o.for || items.includes(o.for)).id]));
const design = (job, over = {}) => {
  const items = over.items || job.items.options.slice(0, job.items.min).map((o) => o.id);
  const v = validateDesign({ job: job.id, items, params: { ...firstParams(job, items), ...(over.params || {}) }, sliders: over.sliders || [2, 2, 2], voice: 'guru', tools: over.tools || TOOL_IDS, name: '1.2' });
  assert.ok(v.ok, `${job.id}: ${v.message}`);
  return v.design;
};
/** Every design a visitor can make for a template (item sets capped for the 10-subject Boards list). */
function* allDesigns(job) {
  const opts = job.items.options.map((o) => o.id);
  const sets = [];
  for (let k = job.items.min; k <= job.items.max; k++) sets.push(...combos(opts.length > 6 ? opts.slice(0, 6) : opts, k));
  for (const items of sets) {
    const lists = job.params.map((p) => p.options.filter((o) => !o.for || items.includes(o.for)).map((o) => o.id));
    for (const vals of product(lists)) for (const sliders of [[0, 0, 0], [2, 2, 2], [4, 4, 4]]) {
      const params = Object.fromEntries(job.params.map((p, i) => [p.id, vals[i]]));
      const v = validateDesign({ job: job.id, items, params, sliders, voice: 'coach', tools: TOOL_IDS, name: '0.0' });
      assert.ok(v.ok, `${job.id} ${JSON.stringify(params)}: ${v.message}`);
      yield v.design;
    }
  }
}

test('16 curated templates (CHANGE-02a), no open prompt: chips only, fixed sections, required tools', () => {
  assert.equal(JOBS.length, 16);
  assert.deepEqual(JOBS.map((j) => j.id), ['jee', 'boards', 'concept', 'lecture', 'mock', 'skill', 'mvp', 'hackathon', 'cofounder', 'd2c', 'creator', 'fest', 'debate', 'career', 'collegeq', 'cricket']);
  for (const j of JOBS) {
    assert.ok(j.needs.every((t) => TOOL_IDS.includes(t)));
    const d = design(j, { tools: ['notes'] });
    for (const t of j.needs) assert.ok(d.tools.includes(t), `${j.id} always has ${t}`);
  }
});

test('split and percents: parts always add up exactly; every item gets one when there is enough', () => {
  for (let total = 0; total <= 60; total++) {
    for (const w of [[1], [2, 2], [3, 2, 1], [1, 1, 3], [4, 3, 3, 2, 1]]) {
      const s = split(total, w);
      assert.equal(s.reduce((a, b) => a + b, 0), total, `${total} ${w}`);
      if (total >= w.length) assert.ok(s.every((x) => x >= 1));
      if (total > 0) assert.equal(percents(s).reduce((a, b) => a + b, 0), 100);
    }
  }
  const seq = interleave([4, 3, 3]);
  assert.deepEqual([0, 1, 2].map((i) => seq.filter((x) => x === i).length), [4, 3, 3]);
  assert.deepEqual([0, 1, 6].map((i) => planDate('2026-10-27', i).label), ['Wed 28 Oct', 'Thu 29 Oct', 'Tue 3 Nov']);
});

test('property: every configuration of every template gives feasible, consistent output on every surface', () => {
  let n = 0;
  for (const job of JOBS) {
    for (const d of allDesigns(job)) {
      n += 1;
      const { plan } = repairPlan(defaultPlan(d), d);
      assert.ok(plan.steps.length >= 1 && plan.steps.length <= MAX_STEPS);
      const { outputs } = execute(d, plan, { today: TODAY });
      const calc = outputs.calculator;
      const cal = outputs.calendar;
      const x = calc?.extra || {};
      const p = d.params;
      // calendar: no clash, inside the day, never late at night, calendar and calculator agree
      if (cal && job.schedule !== 'agenda') {
        assert.equal(clashes(cal.days), 0);
        for (const day of cal.days) {
          const used = day.slots.reduce((a, s) => a + toMin(s.end) - toMin(s.start), 0);
          assert.ok(used <= p.perDay, `${job.id} day uses ${used} of ${p.perDay}`);
          for (const s of day.slots) {
            assert.ok(toMin(s.start) >= toMin('06:30') && toMin(s.end) <= toMin('22:00'), `${job.id} ${s.start}-${s.end}`);
            assert.ok(toMin(s.end) <= toMin(p.start) + p.perDay);
          }
        }
        if (job.schedule === 'spaced') assert.deepEqual(cal.days.map((dd) => dd.day - 1), SPACED.filter((k) => k < p.days));
        if (calc && job.schedule === 'days') assert.deepEqual(d.items.map((_, i) => cal.days.flatMap((dd) => dd.slots).filter((s) => s.item === i).length), calc.perItem.map((it) => it.sessions));
      }
      // CHECK-19 F4: every timed plan (hackathon day, fest run of show) is a healthy day for under-18s
      for (const a of [cal?.agenda].filter(Boolean)) {
        const startM = toMin(a[0].start);
        let t = startM;
        let stretch = 0;
        for (const blk of a) {
          assert.equal(toMin(blk.start), t, 'blocks follow each other');
          assert.ok(t >= toMin('06:00') && t + blk.min <= toMin('22:00') && blk.day === 1, `${job.id}: ${blk.start} ${blk.label} is inside 06:00 to 22:00`);
          stretch = isRest(blk) ? 0 : stretch + blk.min;
          assert.ok(stretch <= 120, `${job.id}: a break at least every 2 h (${blk.label})`);
          t += blk.min;
        }
        const meals = a.filter((blk) => blk.tag === 'meal').map((blk) => toMin(blk.start));
        if (startM <= toMin('12:00') && t >= toMin('14:30')) assert.ok(meals.some((m) => m >= toMin('12:00') && m <= toMin('14:00')), `${job.id}: lunch at lunch time`);
        if (t >= toMin('19:30')) assert.ok(meals.some((m) => m >= toMin('18:00') && m <= toMin('20:00')), `${job.id}: dinner at dinner time`);
        if (job.id === 'hackathon') { assert.equal(a[0].start, '09:00'); assert.equal(a.at(-1).end, '21:00'); }
      }
      if (cal && job.schedule === 'days') for (const day of cal.days) if (day.slots.length > 1) assert.ok(plan.breakMin >= 5 && plan.sessionMin <= 60, 'breaks between sessions');
      // numbers per template: feasible and adding up
      if (calc) {
        if (calc.perItem.length) assert.equal(calc.perItem.reduce((s, it) => s + it.percent, 0), 100);
        if (job.id === 'cricket') {
          assert.equal(x.target, p.rate * x.overs);
          assert.equal(x.phases.reduce((s, ph) => s + ph.overs, 0), x.overs);
          assert.equal(x.phases.reduce((s, ph) => s + ph.runs, 0), x.target);
          for (const ph of x.phases) { assert.ok(ph.overs >= 1 && ph.runs >= 0); assert.ok(ph.runs / ph.overs <= 36, `${p.format} ${p.rate}: ${ph.runs} in ${ph.overs}`); assert.ok(ph.runs / ph.overs <= 20, 'stays gully-realistic'); }
        }
        if (job.id === 'fest') assert.equal(x.split.reduce((s, c) => s + c.rupees, 0), p.budget);
        if (job.id === 'debate') assert.equal(x.timing.reduce((s, c) => s + c.seconds, 0), p.speech * 60);
        if (job.id === 'mock') { assert.equal(x.sections.reduce((s, c) => s + c.minutes, 0) + x.buffer, p.mins); assert.equal(x.sections.at(-1).weak, true, 'weak subject last'); }
        if (job.id === 'collegeq') { assert.ok(x.questions >= 2 * d.items.length && x.questions <= 10); assert.ok(x.perPriority.every((q) => q.count <= 4)); }
        if (job.id === 'cofounder') assert.equal(x.perWeek.reduce((s, c) => s + c, 0), 10);
        if (job.id === 'd2c') assert.equal(x.postSplit.reduce((s, c) => s + c.posts, 0), 5);
        if (job.id === 'creator') assert.equal(x.postSplit.reduce((s, c) => s + c.posts, 0), x.posts);
        if (job.id === 'boards') { assert.equal(x.cycles.reduce((s, c) => s + c.days, 0), p.days); assert.equal(x.cycles.at(-1).to, p.days); }
        if (job.id === 'concept') assert.ok(Number.isFinite(x.example.value) && x.example.shown);
        if (job.id === 'career') for (const c of x.careers) assert.equal(c.by_ai + c.with_ai + c.led_by_people, 100);
      }
      // the fixed sections: present, filled, clean
      const sections = compose(d, outputs, { today: TODAY });
      assert.ok(sections.length >= 1, job.id);
      const text = JSON.stringify(sections);
      assert.ok(!/undefined|NaN|\{topic\}|null/.test(text), `${job.id}: ${text.slice(0, 200)}`);
      assert.ok(!DASH.test(text));
    }
  }
  assert.ok(n > 5000, `${n} configurations`);
});

test('concept explainer: the worked examples are computed right', () => {
  const ex = (id) => calculator(design(JOBS.find((j) => j.id === 'concept'), { items: [id] }), { weights: [2], sessionMin: 15, breakMin: 5, lightDay: false }).extra.example;
  assert.equal(ex('newton').value, 6);
  assert.equal(ex('current').value, 2);
  assert.equal(ex('refraction').value, 1.5);
  assert.equal(ex('mole').value, 2);
  assert.equal(ex('integration').value, 9);
  assert.equal(ex('probability').shown, '6 / 36 = 1 / 6');
  assert.equal(ex('supply').value, 20);
  assert.equal(ex('recursion').value, 120);
  assert.equal(ex('bonding').value, 8);
  assert.equal(ex('photosynthesis').value, 6);
});

test('lookup reads only the curated file; every template item has content; calendar uses topics in order', () => {
  for (const job of JOBS) for (const o of job.items.options) assert.ok(LOOKUP[job.id].items[o.id], `${job.id}.${o.id}`);
  const jee = design(JOBS[0], { items: ['physics', 'maths'], params: { cls: 'c12', weak: 'm_calc' } });
  const l = lookup(jee, 'i1');
  assert.deepEqual(l.items[0].topics, LOOKUP.jee.items.physics.topicsBy.c12);
  const plan = { steps: [{ tool: 'lookup', item: 'all' }, { tool: 'calendar', item: 'all' }], weights: [2, 2], sessionMin: 45, breakMin: 15, lightDay: false };
  const { outputs } = execute(jee, plan, { today: TODAY });
  const phys = outputs.calendar.days.flatMap((x) => x.slots).filter((s) => s.id === 'physics').map((s) => s.topic);
  assert.deepEqual(phys.slice(0, 3), LOOKUP.jee.items.physics.topicsBy.c12.slice(0, 3));
  const { outputs: o2 } = execute(jee, { ...plan, steps: [{ tool: 'calendar', item: 'all' }, { tool: 'lookup', item: 'all' }] }, { today: TODAY });
  assert.ok(o2.calendar.days.every((x) => x.slots.every((s) => s.topic === null)), 'order matters: no lookup before, no topics');
});

test('plan schema is strict (closed objects, enums only) and the mock answer fits it', () => {
  for (const job of JOBS) {
    const d = design(job);
    const s = strictSchema(planSchema(d));
    const closed = (x) => { if (x.type === 'object') { assert.equal(x.additionalProperties, false); Object.values(x.properties).forEach(closed); } if (x.items) closed(x.items); };
    closed(s);
    assert.deepEqual(checkSchema(mockPlan(d), s), []);
  }
});

test('repairPlan: code is the authority (bad steps out, missing tools in, notes last, max 6, knobs fit the day)', () => {
  const d = design(JOBS[0], { params: { perDay: 120 } });
  const r = repairPlan({ steps: [{ tool: 'notes', item: 'all' }, { tool: 'hack', item: 'all' }, { tool: 'calendar', item: 'i9' }, { tool: 'calendar', item: 'i1' }, { tool: 'calendar', item: 'all' }, { tool: 'lookup', item: 'i1' }, { tool: 'lookup', item: 'i1' }], weights: [9, 2], sessionMin: 999, breakMin: 3, lightDay: 'yes' }, d);
  const tools = r.plan.steps.map((s) => s.tool);
  assert.equal(tools[tools.length - 1], 'notes');
  assert.deepEqual([...new Set(tools)].sort(), [...TOOL_IDS].sort());
  assert.ok(r.plan.steps.length <= MAX_STEPS);
  assert.ok(d.job.sessions.includes(r.plan.sessionMin) && d.job.breaks.includes(r.plan.breakMin));
  assert.ok(r.fixes >= 6);
  const many = repairPlan({ steps: [1, 2, 3, 4, 5].map((i) => ({ tool: 'lookup', item: `i${i}` })), weights: [1, 2, 3, 2, 1], sessionMin: 30, breakMin: 10, lightDay: true }, design(JOBS[1], { items: ['physics', 'chemistry', 'maths', 'biology', 'english'] }));
  assert.ok(many.plan.steps.length <= 6);
  for (const st of ['strict', 'balanced', 'chill']) for (const job of JOBS) for (const P of [job.fixed?.perDay, ...(job.params.find((pp) => pp.id === 'perDay')?.options.map((o) => o.id) || [])].filter(Boolean)) assert.ok(pickKnobs(job, P, st).sessionMin <= P, `${job.id} ${P} ${st}`);
});

test('validateDesign: only our ids pass; text anywhere is refused; a weak option must match the chosen items', () => {
  const ok = { job: 'jee', items: ['physics', 'maths'], params: { cls: 'c11', weak: 'p_mech', perDay: 120, start: '16:00' }, sliders: [1, 2, 3], voice: 'coach', tools: ['calendar'], name: '0.0' };
  assert.equal(validateDesign(ok).ok, true);
  for (const bad of [{ job: 'Rohan' }, { job: '__proto__' }, { items: ['physics', 'Mera naam Rohan hai'] }, { items: ['physics'] }, { params: { ...ok.params, weak: 'c_org' } }, { params: { ...ok.params, cls: 'kuch bhi' } }, { sliders: [1, 2, 9] }, { voice: 'rap god' }, { tools: ['calendar', 'web_search'] }, { tools: 'calendar' }, { name: 'Rohan Sharma' }, { name: '99.1' }]) {
    assert.equal(validateDesign({ ...ok, ...bad }).ok, false, JSON.stringify(bad));
  }
});

test('TV: the hook draws only checked labels and in-range integers (CHECK-19 F1)', () => {
  const forged = { kicker: 'Agent ready', title: 'Nova Jugnu', subtitle: 'Coding Mentor', icon: 'code', tags: ['Calculator', 'Call 98765 43210'], labels: ['Strict', 'Chill', 'Serious', 'Funny', 'Short', 'Detailed'], scores: [{ value: 400, max: 4 }, { value: 2, max: 4 }, { value: -1, max: 4 }], stats: [{ label: 'Din', value: 9876543210 }, { label: 'Sessions', value: 80085 }, { label: 'Ghante', value: 10.5 }, { label: 'Steps', value: 5 }, { label: 'Phone', value: 3 }], rows: [{ items: [0, 1, -1, 99], level: 0 }, { items: [0, 1], level: 0 }], skills: ['Physics'], lines: ['9876543210'] };
  const c = cleanPayload(forged);
  assert.deepEqual(c.stats, [{ label: 'Steps', value: 5 }]);
  assert.deepEqual(c.scores, [2]);
  assert.equal(c.rows.length, 1);
  assert.deepEqual(c.tags, ['Calculator']);
  assert.deepEqual(c.lines, []);
  assert.equal(labelOk('+91 98765 43210'), false);
  assert.equal(cleanPayload({ title: '9876543210' }), null);
});

test('timeline: phone and TV play the same events; it ends with the done line', () => {
  const d = design(JOBS[0]);
  const { plan } = repairPlan(defaultPlan(d), d);
  const script = [{ id: 'planner', task: 't', logs: ['a', '1. Lookup Tool'], back: 'b' }, { id: 'lookup', task: 't', logs: ['x'], handoff: 'Step 1', back: 'b' }, { id: 'check', task: 't', logs: ['y'], back: 'b' }];
  const tl = buildTimeline(script, 'Task done in 9.1s');
  assert.ok(tl.every((e, i) => i === 0 || e.at >= tl[i - 1].at));
  assert.equal(tl.at(-1).ev.t, 'done');
  assert.ok(plan.steps.length);
});

test('copy: no dashes, care words or profanity in any line of data or banks', () => {
  const lines = [...allPhoneBankLines()];
  const walk = (v) => { if (typeof v === 'string') lines.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(Object.fromEntries(Object.entries(LOOKUP).filter(([k]) => k !== '_about')));
  for (const j of JOBS) walk({ n: j.name, r: j.role, b: j.blurb, t: j.task, i: j.items, p: j.params });
  walk(SLIDERS);
  for (const l of lines) {
    if (typeof l !== 'string' || l.length > 140) continue;
    assert.ok(!DASH.test(l), `dash: ${l}`);
    assert.equal(detect(l), false, `care word: ${l}`);
    assert.equal(cleanText(l), l, `profanity or link: ${l}`);
    assert.ok(!/guarantee[ds]?|100\s?%/i.test(l) || /nahi/i.test(l), `promise: ${l}`);
  }
  const d = design(JOBS[0], { sliders: [0, 0, 0] });
  assert.notEqual(defaultLines(d, []).intro, defaultLines({ ...d, sliders: [4, 0, 0] }, []).intro, 'personality changes the intro');
});

test('files: no dashes anywhere in the experience; no fs writes; no network in the browser code', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const f of [...walk(path.join(ROOT, 'experiences/agent')), ...walk(path.join(ROOT, 'test/agent'))]) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/[\u2012-\u2015]/.test(src), `dash in ${path.relative(ROOT, f)}`);
    if (f.includes('experiences/agent') && !f.includes('experiences/agent/ops/')) assert.ok(!/writeFile|appendFile|createWriteStream/.test(src), `fs write in ${f}`); // ops/ = offline maintainer tools
    if (f.includes('experiences/agent/web')) assert.ok(!/https?:\/\/(?!play\.zenithschool\.ai)/.test(src.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '')), `external URL in ${f}`);
  }
});
