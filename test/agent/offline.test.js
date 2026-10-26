// Build Your Own AI Agent in offline mode (DEMO_MODE=1 OFFLINE=1): safetyMode is 'degraded', the planner is the banked
// plan for the visitor's personality, the tools still run for real, nothing leaves the machine, and a first name is
// never used (the generated nickname instead). Banked results per template x key chips: at least 3 distinct each.
// Own file: offline mode patches global fetch.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, json } from '../core/helpers.js';
import { JOBS, TOOL_IDS } from '../../experiences/agent/lib/jobs.js';

let s;
after(async () => { await s?.close(); });

test('offline: degraded, banked plan per personality, real tools for every template, 3+ distinct banked results each, no network', async () => {
  s = await startServer({ DEMO_MODE: '1', OFFLINE: '1', AGENT_BUILDER: '1' });
  assert.equal((await (await fetch(`${s.base}/api/core/config`)).json()).safetyMode, 'degraded');
  let n = 0;
  for (const job of JOBS) {
    const results = new Set();
    // key chips: the first chip group with more than one option, cycled, plus the item choice
    const key = job.params.find((p) => p.options.length > 1 && !p.options[0].for && p.id !== 'start');
    for (let k = 0; k < 3; k++) {
      const o = job.items.options;
      const items = [...o.slice(k % o.length), ...o.slice(0, k % o.length)].slice(0, job.items.min).map((x) => x.id); // rotate the chip choice
      const params = Object.fromEntries(job.params.map((p) => { const ok = p.options.filter((x) => !x.for || items.includes(x.for)); return [p.id, ok[p === key || ok[0].for ? k % ok.length : 0].id]; }));
      const b = { job: job.id, items, params, sliders: [k * 2, 2, k * 2], voice: 'filmy', tools: TOOL_IDS, name: '5.6', firstName: 'Riya' };
      const r = await (await json(s.base, '/api/agent/run', b, { cookie: `pz_sid=AgentOffline${String(n++).padStart(6, '0')}` })).json();
      assert.equal(r.source, 'fixture', job.id);
      assert.equal(r.reason, 'demo_mode');
      assert.equal(r.owner, null, 'degraded: the nickname, never the typed name');
      assert.ok(r.sections.length >= 1);
      assert.match(r.timeline.find((x) => x.ev.t === 'log').ev.text, /banked plan/);
      results.add(JSON.stringify(r.sections));
    }
    assert.ok(results.size >= 3, `${job.id}: ${results.size} distinct banked results`);
  }
  await assert.rejects(fetch('https://api.anthropic.com/v1/messages'), /offline mode: blocked/);
});
