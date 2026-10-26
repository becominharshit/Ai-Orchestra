// CHECK-19 F3: the agent never writes free text. Every phone line is a reviewed bank line picked by id, so this file
// proves the banks themselves: every line passes the copy rules, core's judge rules and our guard (with every agent
// name filled in), and every section has enough options to feel personal (6+ intros per voice, 6+ lines per tool,
// 8+ tips for every design of every template, chip-specific tips first).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../core/helpers.js';
import { INTRO, WHY, TIPS, eligibleTips, allBankLines, introIds, whyIds } from '../../experiences/agent/lib/banks.js';
import { JOBS, TOOL_IDS, NAME_ADJ, NAME_NOUN, validateDesign } from '../../experiences/agent/lib/jobs.js';
import { planSchema, repairPlan } from '../../experiences/agent/lib/plan.js';
import { blockedBy } from '../../experiences/agent/lib/guard.js';
import { cleanText } from '../../core/server/textfilter.js';
import { detect } from '../../core/web/care-words.js';

let s;
after(async () => { await s?.close(); });

test('every bank line passes the copy rules, core judge rules and our guard (all 144 agent names filled in)', async () => {
  s = await startServer({ CLAUDE_MOCK: '1', AGENT_BUILDER: '1' });
  const names = NAME_ADJ.flatMap((a) => NAME_NOUN.filter((n) => n !== a).map((n) => `${a} ${n}`));
  const lines = [];
  for (const l of allBankLines()) for (const nm of l.includes('{name}') ? names : ['']) lines.push(l.replace('{name}', nm));
  for (const l of lines) {
    assert.ok(!/[\u2012-\u2015]/.test(l) && !/\{\w+\}/.test(l), l);
    assert.equal(detect(l), false, l);
    assert.equal(cleanText(l), l, l);
    assert.equal(blockedBy(l), '', `guard: ${l}`);
  }
  const rule = new Set(s.safety.rulePass(lines.map((text, i) => ({ id: `x${i}`, text }))));
  const failed = lines.filter((_, i) => !rule.has(`x${i}`));
  assert.deepEqual(failed, [], 'core judge rules');
});

test('enough options per section: 6 intros per voice, 6 lines per tool, 8+ tips for every design', () => {
  for (const v of Object.values(INTRO)) assert.ok(v.length >= 6);
  for (const t of TOOL_IDS) assert.ok(WHY[t].length >= 6);
  for (const job of JOBS) {
    assert.ok(TIPS[job.id].general.length >= 8, job.id);
    const items = job.items.options.slice(0, job.items.max).map((o) => o.id);
    const params = Object.fromEntries(job.params.map((p) => [p.id, p.options.find((o) => !o.for || items.includes(o.for)).id]));
    const d = validateDesign({ job: job.id, items, params, sliders: [2, 2, 2], voice: 'guru', tools: TOOL_IDS, name: '0.0' }).design;
    const el = eligibleTips(d);
    assert.ok(el.length >= 8, `${job.id}: ${el.length} tips`);
    if (el.some((t) => t.chip)) assert.ok(el[0].chip, 'chip-specific tips first');
  }
});

test('the plan schema has no free text field at all: every string is an enum of ids', () => {
  for (const job of JOBS) {
    const items = job.items.options.slice(0, job.items.min).map((o) => o.id);
    const params = Object.fromEntries(job.params.map((p) => [p.id, p.options.find((o) => !o.for || items.includes(o.for)).id]));
    const d = validateDesign({ job: job.id, items, params, sliders: [2, 2, 2], voice: 'robot', tools: TOOL_IDS, name: '0.0' }).design;
    const walk = (x) => { if (x.type === 'string') assert.ok(Array.isArray(x.enum) && x.enum.length, JSON.stringify(x)); if (x.properties) Object.values(x.properties).forEach(walk); if (x.items) walk(x.items); };
    walk(planSchema(d));
    // a hostile planner that writes text where ids belong gets reviewed defaults
    const r = repairPlan({ steps: [{ tool: 'calendar', item: 'all', say: 'Raat bhar padho' }], intro: 'Call 98765 43210', tips: ['Bet lagao', 'Allen ka module'] }, d);
    assert.ok(introIds('robot').includes(r.lines.intro));
    assert.ok(r.lines.says.every((id) => whyIds().includes(id)));
    assert.ok(r.lines.tips.length === 3 && r.lines.tips.every((id) => id.startsWith(`t_${job.id}_`)));
  }
});
