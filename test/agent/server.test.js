// Build Your Own AI Agent over HTTP: 16 templates in mock mode, the server-only TV (CHECK-19 F1), the fake live client
// (plan + judge, + the name check when a name is given), the wording guard end to end (F3), our own 20 s deadline,
// the optional first name (never on the TV, bus or logs), the flag, 50 concurrent sessions.
// Run: node --test --test-concurrency=1 test/agent/server.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, json } from '../core/helpers.js';
import { fakeClient, calls, reset, RISKY } from './fake-live.mjs';
import { JOBS, TOOL_IDS } from '../../experiences/agent/lib/jobs.js';
import { AGENT_IDS, BUDGET_MS } from '../../experiences/agent/server.js';
import { TIPS, INTRO, allBankLines } from '../../experiences/agent/lib/banks.js';
const BANK = new Set(allBankLines());
const fromBank = (line, name) => BANK.has(line) || BANK.has(line.replace(name, '{name}'));
import { CHECKER_49, FRESH } from './unsafe-lines.js';

const servers = [];
after(async () => { for (const s of servers) await s.close(); });
const logs = [];
const start = async (env = {}, opts = {}) => { const s = await startServer({ AGENT_BUILDER: '1', ...env }, { log: (o) => logs.push(JSON.stringify(o)), ...opts }); servers.push(s); return s; };
let n = 0;
const sid = () => ({ cookie: `pz_sid=AgentTest${String(n++).padStart(8, '0')}`, 'x-pz-counter': '4' });
const firstParams = (job, items) => Object.fromEntries(job.params.map((p) => [p.id, p.options.filter((o) => !o.for || items.includes(o.for)).at(-1).id]));
const body = (job, over = {}) => { const items = job.items.options.slice(0, job.items.max).map((o) => o.id); return { job: job.id, items, params: firstParams(job, items), sliders: [2, 2, 2], voice: 'robot', tools: TOOL_IDS, name: '3.4', tv: true, ...over }; };
const REJECT = /invalid|reject|not allowed|allowed nahi|galat naam|naam galat|naam theek nahi|naam nahi chal|nahi chalega|unacceptable|inappropriate|blocked|refused|try another name|doosra naam/i;
const SKIP = new Set(['id', 'from', 'to', 't', 'state', 'icon']);
const textOf = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => textOf(x, out)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP.has(k)) textOf(x, out); return out; };
const runText = (r) => JSON.stringify([r.init, r.timeline, r.card, r.agentCard]);
/** every string that can reach the TV or a card is registered public text for 'agent' */
function assertPublic(s, r) {
  const evs = [r.init, ...r.timeline.map((x) => x.ev)];
  const tv = textOf(evs);
  for (const t of tv) assert.ok(s.safety.isPublic('agent', t), `not registered: ${t}`);
  for (const c of [r.card.title, ...r.card.lines, r.card.footer, r.card.kickers.neutral, r.card.kickers.age17, r.agentCard.title, r.agentCard.role, r.agentCard.voice, r.agentCard.tools, r.agentCard.template]) assert.ok(c.pt && s.safety.isPublic('agent', c.text), JSON.stringify(c));
  assert.ok(evs.every((e) => !e.id || AGENT_IDS.includes(e.id)));
  assert.deepEqual(r.card.lines.map((l) => l.pt), ['agent.cardJob', 'agent.roles:' + r.agentCard.role.pt.split(':')[1]], 'share card: template and role only');
}
/** Read a counter TV's event stream until `until(events)` or the timeout. */
async function tvEvents(base, until, ms = 30000) {
  const ac = new AbortController();
  const res = await fetch(`${base}/api/core/bus/agent/4/stream`, { signal: ac.signal });
  const reader = res.body.getReader();
  const out = [];
  const t = setTimeout(() => ac.abort(), ms);
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += Buffer.from(value).toString();
      for (const m of buf.matchAll(/data: (.*)\n/g)) { try { const j = JSON.parse(m[1]); if (j.events) out.push(...j.events); } catch { /* partial */ } }
      buf = buf.slice(buf.lastIndexOf('\n') + 1);
      if (until(out)) break;
    }
  } catch { /* aborted */ }
  clearTimeout(t);
  ac.abort();
  return out;
}

test('flag off: the experience is not loaded (no API; the page redirects to the counter owner)', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', AGENT_BUILDER: '0' });
  servers.push(s);
  assert.equal((await fetch(`${s.base}/api/agent/bundle`)).status, 404);
  assert.equal((await json(s.base, '/api/agent/run', body(JOBS[0]))).status, 404);
  const page = await fetch(`${s.base}/agent/?c=4`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.doesNotMatch(page.headers.get('location'), /agent/);
});

test('mock: all 16 templates run with real tools and fixed sections; TV, timeline and cards are registered text only', async () => {
  const s = await start({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '5' });
  const b = await (await fetch(`${s.base}/api/agent/bundle`)).json();
  assert.equal(b.jobs.length, 16);
  for (const [i, job] of JOBS.entries()) {
    const r = await (await json(s.base, '/api/agent/run', body(job, { sliders: [i % 5, (i + 2) % 5, (i * 3) % 5] }), sid())).json();
    assert.equal(r.source, 'mock', job.id);
    assert.ok(r.sections.length >= 1 && r.outputs.notes.items.length, job.id);
    assert.ok(r.play && r.timeline.length > 20 && r.timeline.at(-1).ev.t === 'done');
    assert.ok(r.intro && r.tip && r.note);
    if (job.study) assert.ok(r.outputs.notes.items.at(-1) === 'Apne teacher/mentor se bhi discuss karo.' && /teacher\/mentor/.test(r.note), job.id);
    assertPublic(s, r);
  }
});

test('TV (CHECK-19 F1): phones cannot post any agent TV event; the server publishes the run; the TV fetches the result by id', async () => {
  const s = await start({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '5' });
  const forged = await (await json(s.base, '/api/core/bus/agent/4', { sid: 'play-forge1', events: [
    { t: 'init', title: 'Build Your Own AI Agent', orchestrator: { id: 'agent', name: 'Nova Jugnu', role: 'Coding Mentor', icon: 'code' }, agents: [] },
    { t: 'log', id: 'agent', text: 'Plan: 4 steps, 4 tools' },
    { t: 'result', payload: { kicker: 'Agent ready', title: 'Nova Jugnu', stats: [{ label: 'Din', value: 9876543210 }] } },
    { t: 'custom', name: 'run', data: { id: 123456789 } },
    { t: 'end' },
  ] }, sid())).json();
  assert.equal(forged.accepted, 0, JSON.stringify(forged));
  assert.equal((await fetch(`${s.base}/api/agent/tv/123456789`)).status, 404, 'a made-up run id verifies nothing');
  const tv = tvEvents(s.base, (ev) => ev.some((e) => e.t === 'result'));
  await new Promise((r) => setTimeout(r, 300));
  const r = await (await json(s.base, '/api/agent/run', body(JOBS[0]), sid())).json();
  const events = await tv;
  const run = events.find((e) => e.t === 'custom' && e.name === 'run');
  const result = events.find((e) => e.t === 'result');
  assert.ok(events[0].t === 'init' && run && result, events.map((e) => e.t).join(','));
  assert.equal(result.payload.id, run.data.id);
  assert.deepEqual(Object.keys(result.payload), ['id'], 'the bus carries only the run id');
  const got = await (await fetch(`${s.base}/api/agent/tv/${result.payload.id}`)).json();
  assert.equal(got.payload.title, r.init.orchestrator.name);
  for (const st of got.payload.stats) assert.ok(Number.isInteger(st.value) && st.value >= 0 && st.value < 1000, JSON.stringify(st));
  // the visitor turns the big screen off: the run ends on the TV
  const r2 = await (await json(s.base, '/api/agent/run', body(JOBS[1]), sid())).json();
  assert.ok(r2.play);
  assert.equal((await json(s.base, '/api/agent/tv/end', { play: r2.play })).status, 200);
  // tv: false publishes nothing
  const r3 = await (await json(s.base, '/api/agent/run', { ...body(JOBS[2]), tv: false }, sid())).json();
  assert.equal(r3.play, null);
});

test('chips only: bad ids are refused with a friendly 400; crisis text in a modified request gets the care card', async () => {
  const s = await start({ CLAUDE_MOCK: '1' });
  const bad = await json(s.base, '/api/agent/run', { ...body(JOBS[0]), items: ['physics', 'Mera naam Rohan hai'] }, sid());
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).message, /chuno/);
  const care = await json(s.base, '/api/agent/run', { ...body(JOBS[0]), voice: 'mujhe marna hai, jeene ka mann nahi' }, sid());
  assert.deepEqual(await care.json(), { care: true });
  const careName = await json(s.base, '/api/agent/run', { ...body(JOBS[0]), firstName: 'marna hai mujhe' }, sid());
  assert.deepEqual(await careName.json(), { care: true });
});

test('first name: only after shape, rules and the live check; never on the TV, bus, cards or logs; degraded = nickname', async () => {
  reset();
  logs.length = 0;
  const s = await start({}, { claudeClient: fakeClient() });
  const tv = tvEvents(s.base, (ev) => ev.filter((e) => e.t === 'result').length >= 2, 40000);
  await new Promise((r) => setTimeout(r, 300));
  const r = await (await json(s.base, '/api/agent/run', { ...body(JOBS[0]), firstName: 'riya' }, sid())).json();
  assert.equal(r.owner, 'Riya');
  assert.equal(r.nickOptions, null, 'a used name needs no nickname picker');
  assert.deepEqual(calls.map((c) => c.task).sort(), ['care', 'judge', 'name', 'plan'], 'with a name: 4 calls (crisis check, plan, name check, judge)');
  const r2 = await (await json(s.base, '/api/agent/run', { ...body(JOBS[1]), firstName: 'Fakebad' }, sid())).json();
  assert.equal(r2.owner, null, 'the live check said no: nickname, no error');
  const events = await tv;
  for (const x of [runText(r), runText(r2), JSON.stringify(events), logs.join('\n')]) assert.ok(!/Riya|riya|Fakebad/.test(x), 'name only on the phone result');
  const got = await (await fetch(`${s.base}/api/agent/tv/${events.find((e) => e.t === 'result').payload.id}`)).text();
  assert.ok(!/Riya/.test(got));
  const stats = await (await fetch(`${s.base}/admin/export.csv?key=test-admin-key`)).text();
  assert.ok(!/Riya/i.test(stats));
  for (const bad of ['Chutiya', 'Ch00tiya', 'Kohli', 'Chamar', 'Katua', 'Dawood', 'Viratkohli', 'Tharki', 'Wwwcom', 'चमार', 'पप्पू', 'Riya Sharma', 'R1ya', 'Rіya', 'riya@x', 'रिया123']) {
    const before = calls.filter((c) => c.task === 'name').length;
    const x = await (await json(s.base, '/api/agent/run', { ...body(JOBS[2]), firstName: bad, tv: false }, sid())).json();
    assert.equal(x.owner, null, bad);
    assert.equal(calls.filter((c) => c.task === 'name').length, before, `${bad}: not on the allow-list, no name check call`);
  }
  const deva = await (await json(s.base, '/api/agent/run', { ...body(JOBS[2]), firstName: 'आरव', tv: false }, sid())).json();
  assert.equal(deva.owner, 'आरव');
  // round 6 (F6): an unlisted name is never used, in any mode; the visitor picks a nickname instead, with no rejection wording
  const un = await (await json(s.base, '/api/agent/run', { ...body(JOBS[2]), firstName: 'Tintu', tv: false }, sid())).json();
  assert.equal(un.owner, null);
  assert.equal(un.nickOptions.options.length, 3);
  assert.ok(!JSON.stringify(un).includes('Tintu'));
  assert.doesNotMatch(JSON.stringify(un), REJECT);
  // degraded (mock: no live check): the nickname, always
  const m = await start({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '5' });
  for (const nm of ['Riya', 'Tintu', '']) {
    const h = sid();
    const x = await (await json(m.base, '/api/agent/run', { ...body(JOBS[0]), ...(nm ? { firstName: nm } : {}) }, h)).json();
    assert.equal(x.owner, null, 'degraded: a nickname for everyone');
    assert.equal(x.nickOptions.options.length, 3, 'the same picker whether the name was skipped or not used');
    assert.doesNotMatch(JSON.stringify(x), REJECT);
    const picked = await (await json(m.base, '/api/agent/nickname', { id: x.nickOptions.options[1].id }, h)).json();
    assert.equal(picked.ok, true);
    assert.equal(picked.nickname, x.nickOptions.options[1].text);
  }
  // the phone never words a fallback as a rejection
  const fs = await import('node:fs');
  for (const f of ['index.html', 'app.js']) {
    const src = fs.readFileSync(new URL(`../../experiences/agent/web/${f}`, import.meta.url), 'utf8');
    const strings = [...src.matchAll(/'([^'\n]{3,})'|"([^"\n]{3,})"|`([^`]{3,})`|>([^<>{}]{3,})</g)].map((x) => x.slice(1).find(Boolean));
    assert.deepEqual(strings.filter((t) => REJECT.test(t)), [], f);
  }
  assert.match(fs.readFileSync(new URL('../../experiences/agent/web/index.html', import.meta.url), 'utf8'), /Apne agent ke liye ek naam chuno/);
});

test('fake live: 2 model calls per use (plan + judge), plan repaired in code, risky wording replaced, tokens measured', async () => {
  reset();
  const s = await start({}, { claudeClient: fakeClient() });
  assert.equal((await (await fetch(`${s.base}/api/core/config`)).json()).safetyMode, 'live');
  const per = [];
  for (const job of JOBS) {
    const before = calls.length;
    const r = await (await json(s.base, '/api/agent/run', { ...body(job), tv: false }, sid())).json();
    assert.equal(r.source, 'claude', job.id);
    assert.equal(r.plan[r.plan.length - 1].tool, 'notes', 'notes moved last');
    assert.ok(!r.tips.includes(RISKY), 'a text tip from the planner never shows');
    for (const l of [r.intro, ...r.tips, ...r.plan.map((p) => p.why)]) assert.ok(fromBank(l, r.agent.name), `not a bank line: ${l}`);
    assertPublic(s, r);
    const mine = calls.slice(before);
    assert.deepEqual(mine.map((c) => c.task), ['plan', 'judge'], 'no crisis call without a typed name');
    per.push(mine);
  }
  const avg = (task, k) => Math.round(per.reduce((a, m) => a + m.find((c) => c.task === task)[k], 0) / per.length);
  const est = { planIn: Math.ceil(avg('plan', 'inChars') / 3.5), planOut: Math.ceil(avg('plan', 'outChars') / 3.5), judgeIn: Math.ceil(avg('judge', 'inChars') / 3.5), judgeOut: Math.ceil(avg('judge', 'outChars') / 3.5) };
  console.log(`# per use: 2 calls (4 with a first name: + crisis check + name check); plan ~${est.planIn} in / ~${est.planOut} out tokens (JSON only, plus adaptive thinking at effort low); judge ~${est.judgeIn} in / ~${est.judgeOut} out`);
  assert.ok(est.planIn < 3000 && est.judgeIn < 1200);
});

test('F3 end to end: a planner that writes text where ids belong (the checker\'s 49 + our 73 lines) shows only bank lines', async () => {
  const s = await start({}, { claudeClient: fakeClient() });
  const reached = [];
  try {
    for (const line of [...Object.values(CHECKER_49).flat(), ...Object.values(FRESH).flat()]) {
      process.env.FAKE_WORD = line;
      const r = await (await json(s.base, '/api/agent/run', { ...body(JOBS[0]), tv: false }, sid())).json();
      const shown = [r.intro, ...r.tips, ...r.plan.map((p) => p.why)];
      if (shown.includes(line) || !shown.every((l) => fromBank(l, r.agent.name))) reached.push(line);
    }
  } finally { delete process.env.FAKE_WORD; }
  assert.deepEqual(reached, []);
});

test('failures and our own deadline: failed, slow or hung plan answers the banked plan inside the 20 s budget', async () => {
  const s = await start({}, { claudeClient: fakeClient() });
  for (const mode of ['fail', 'slow', 'hang']) {
    process.env.FAKE_PLAN = mode;
    try {
      const t0 = Date.now();
      const r = await (await json(s.base, '/api/agent/run', { ...body(JOBS[3]), tv: false }, sid())).json();
      assert.equal(r.source, 'fixture', mode);
      assert.ok(['api_error', 'timeout'].includes(r.reason), `${mode}: ${r.reason}`);
      assert.ok(Date.now() - t0 < BUDGET_MS, `${mode}: ${Date.now() - t0} ms`);
      assert.match(r.timeline.find((x) => x.ev.t === 'log').ev.text, /banked plan/);
    } finally { delete process.env.FAKE_PLAN; }
  }
  process.env.FAKE_JUDGE = 'slow';
  try {
    const t0 = Date.now();
    const r = await (await json(s.base, '/api/agent/run', { ...body(JOBS[14]), tv: false }, sid())).json();
    assert.equal(r.source, 'claude');
    assert.ok(Date.now() - t0 < BUDGET_MS + 500, `${Date.now() - t0} ms`);
    assert.ok([...TIPS.collegeq.general, ...Object.values(TIPS.collegeq.byChip).flat()].includes(r.tip));
  } finally { delete process.env.FAKE_JUDGE; }
});

test('hero: answers the banked plan without a model call', async () => {
  reset();
  const s = await start({}, { claudeClient: fakeClient() });
  const r = await (await json(s.base, '/api/agent/run', body(JOBS[0]), { ...sid(), 'x-pz-demo': 'hero' })).json();
  assert.equal(r.source, 'hero');
  assert.equal(r.owner, null);
  assert.equal(calls.filter((c) => c.task === 'plan' || c.task === 'name').length, 0, 'no plan or name call (a slow judge from an earlier test may still land)');
  assert.ok(INTRO.coach.length >= 6);
});

test('load: 50 concurrent visitors all finish (busy answers are retried with the queue ticket)', async () => {
  const s = await start({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '300', MAX_IN_FLIGHT: '20' });
  const one = async (i) => {
    let ticket = null;
    const h = sid();
    for (let k = 0; k < 40; k++) {
      const r = await json(s.base, '/api/agent/run', body(JOBS[i % 16]), { ...h, ...(ticket ? { 'x-queue-ticket': ticket } : {}) });
      if (r.status === 503) { const j = await r.json(); ticket = j.queue.ticket; await new Promise((x) => setTimeout(x, j.queue.retryMs || 300)); continue; }
      return r.status;
    }
    return 0;
  };
  const res = await Promise.all(Array.from({ length: 50 }, (_, i) => one(i)));
  assert.deepEqual([...new Set(res)], [200]);
});
