import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createClaude, DemoFallback, costUsd, checkSchema, strictSchema } from '../../core/server/claude.js';
import { makeConfig } from '../../core/server/config.js';
import { tmpDir } from './helpers.js';

const SCHEMA = { type: 'object', properties: { title: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } }, required: ['title', 'lines'] };
const cfg = (o = {}) => makeConfig({ ANTHROPIC_API_KEY: '', CLAUDE_MOCK: '0', DEMO_MODE: '0', OFFLINE: '0', DATA_DIR: tmpDir('claude'), CLAUDE_MOCK_LATENCY_MS: '5', ...o });

function fakeClient({ inTok = 1_000_000, outTok = 0, text = '{"title":"t","lines":["a"]}', stop = 'end_turn' } = {}) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (body, opts) => { calls.push({ body, opts }); return { stop_reason: stop, content: [{ type: 'text', text }], usage: { input_tokens: inTok, output_tokens: outTok } }; } } },
  };
}

test('price table: Opus 5.5 is $4 in / $20 out per MTok', () => {
  const c = cfg();
  assert.equal(c.model, 'claude-opus-5-5');
  assert.equal(costUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }, c.prices['claude-opus-5-5']), 24);
});

test('spend cap: calls flip to DemoFallback once SPEND_CAP_USD is reached, and the total survives a restart', async () => {
  const config = cfg({ SPEND_CAP_USD: '10', ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const client = fakeClient({ inTok: 1_000_000 }); // $4 per call
  const claude = createClaude({ config, client });
  const args = { exp: 'test', task: 't', messages: [{ role: 'user', content: 'hi' }], schema: SCHEMA };
  await claude.run(args); // $4
  await claude.run(args); // $8
  await claude.run(args); // $12 (allowed: estimate fitted under the cap before the call)
  assert.equal(claude.mode(), 'spend_cap');
  await assert.rejects(claude.run(args), (e) => e instanceof DemoFallback && e.reason === 'spend_cap');
  assert.equal(client.calls.length, 3, 'no API call is made after the cap');
  // restart: a new instance reads spend.json and is still capped
  const again = createClaude({ config, client: fakeClient() });
  assert.ok(again.spend.totalUsd >= 12);
  await assert.rejects(again.run(args), (e) => e.reason === 'spend_cap');
});

test('request shape: model, adaptive thinking, low effort, json_schema format, server-side fallbacks, 25s timeout, 1 retry, no temperature', async () => {
  const client = fakeClient({ inTok: 100, outTok: 50 });
  const claude = createClaude({ config: cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' }), client });
  const out = await claude.run({ messages: [{ role: 'user', content: [claude.image('AAAA'), { type: 'text', text: 'palm' }] }], schema: SCHEMA, system: 's' });
  assert.deepEqual(out, { title: 't', lines: ['a'] });
  const { body, opts } = client.calls[0];
  assert.equal(body.model, 'claude-opus-5-5');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(body.fallbacks, 'default');
  assert.ok(!('temperature' in body) && !('top_p' in body));
  assert.equal(opts.timeout, 25000);
  assert.equal(opts.maxRetries, 1);
  assert.equal(body.messages[0].content[0].source.media_type, 'image/jpeg');
});

test('DEMO_MODE and no key both refuse with DemoFallback (no network)', async () => {
  const a = createClaude({ config: cfg({ DEMO_MODE: '1' }) });
  await assert.rejects(a.run({ messages: [] }), (e) => e.reason === 'demo_mode');
  const b = createClaude({ config: cfg() });
  await assert.rejects(b.run({ messages: [] }), (e) => e.reason === 'no_key');
});

test('CLAUDE_MOCK returns the schema-shaped mock and rejects a mock that does not match', async () => {
  const c = createClaude({ config: cfg({ CLAUDE_MOCK: '1' }) });
  assert.deepEqual(await c.run({ schema: SCHEMA, mock: { title: 'x', lines: [] } }), { title: 'x', lines: [] });
  assert.deepEqual(await c.run({ schema: SCHEMA, mock: (args) => ({ title: args.task, lines: ['1'] }), task: 'fn' }), { title: 'fn', lines: ['1'] });
  await assert.rejects(c.run({ schema: SCHEMA, mock: { title: 3 } }), (e) => e.reason === 'schema');
  await assert.rejects(c.run({ schema: SCHEMA }), (e) => e.reason === 'no_mock');
});

test('refusal, bad JSON and API errors become DemoFallback; logs never contain the prompt or the answer', async () => {
  const logs = [];
  const log = (o) => logs.push(JSON.stringify(o));
  const config = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const refuse = createClaude({ config, client: fakeClient({ stop: 'refusal', text: '' }), log });
  await assert.rejects(refuse.run({ messages: [{ role: 'user', content: 'SECRET-PROMPT-123' }], schema: SCHEMA }), (e) => e.reason === 'refusal');
  const bad = createClaude({ config, client: fakeClient({ text: 'not json SECRET-ANSWER-456' }), log });
  await assert.rejects(bad.run({ messages: [{ role: 'user', content: 'SECRET-PROMPT-123' }], schema: SCHEMA }), (e) => e.reason === 'bad_json');
  const boom = createClaude({ config, client: { beta: { messages: { create: async () => { const e = new Error('overloaded'); e.status = 529; throw e; } } } }, log });
  await assert.rejects(boom.run({ messages: [{ role: 'user', content: 'SECRET-PROMPT-123' }], schema: SCHEMA }), (e) => e.reason === 'api_error');
  const all = logs.join('\n');
  assert.ok(logs.length >= 3);
  assert.ok(!all.includes('SECRET-PROMPT-123') && !all.includes('SECRET-ANSWER-456'));
});

test('schema helpers', () => {
  assert.deepEqual(checkSchema({ a: 1 }, { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }), ['$.a: expected string, got integer']);
  const s = strictSchema({ type: 'object', properties: { x: { type: 'object', properties: {} } } });
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.x.additionalProperties, false);
});

test('per-experience daily budgets (BUDGET_USD_<EXP>): one experience goes to banked answers, the others and the safety calls keep going; the global cap is unchanged', async () => {
  const dir = tmpDir('budget');
  const config = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key', DATA_DIR: dir, BUDGET_USD_STARTUP: '1.5', BUDGET_USD__SAMPLE: '50', SPEND_CAP_USD: '350' });
  assert.deepEqual(config.budgets, { startup: 1.5, _sample: 50 });
  assert.equal(config.spendCapUsd, 350);
  // each call costs $1 (250k input tokens at $4 per MTok)
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 't', lines: [] }) }], usage: { input_tokens: 250000, output_tokens: 0 } }) } } };
  const c = createClaude({ config, client });
  const call = (exp, task = 'call') => c.run({ exp, task, system: 's', messages: [{ role: 'user', content: 'x' }], schema: SCHEMA, maxTokens: 100 });
  await call('startup');
  await call('startup'); // $1 spent + estimate still under 1.5
  await assert.rejects(call('startup'), (e) => e instanceof DemoFallback && e.reason === 'exp_budget', 'over its daily share: banked mode');
  await call('shark'); // no budget: unaffected
  await call('_sample'); // its own budget is fine
  await call('startup', 'care'); // the care check is never blocked by a budget
  await call('startup', 'judge');
  assert.equal(c.mode(), 'live', 'the global mode stays live');
  const st = c.status().budgets;
  assert.deepEqual(Object.keys(st).sort(), ['_sample', 'startup']);
  assert.equal(st.startup.ok, false);
  assert.ok(st.startup.spentTodayUsd >= 2);
  assert.equal(c.budgetOf('shark').budgetUsd, null);
  assert.equal(c.budgetOf('startup').ok, false);
  // persisted per IST day, so a restart keeps the day's spend
  c.spend.save();
  const again = createClaude({ config, client });
  assert.equal(again.budgetOf('startup').ok, false);
  await assert.rejects(again.run({ exp: 'startup', system: 's', messages: [{ role: 'user', content: 'x' }], schema: SCHEMA, maxTokens: 100 }), (e) => e.reason === 'exp_budget');
});

test('BUDGET_USD_<EXP>=0 means banked answers only (no model calls for that experience); unset means no per-experience budget', async () => {
  const config = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key', BUDGET_USD_SHARK: '0', BUDGET_USD_REEL: '', BUDGET_USD_ASLI: '-3', BUDGET_USD_JYOTISH: 'abc' });
  assert.deepEqual(config.budgets, { shark: 0 });
  let calls = 0;
  const client = { beta: { messages: { create: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 't', lines: [] }) }], usage: { input_tokens: 10, output_tokens: 5 } }; } } } };
  const c = createClaude({ config, client });
  const run = (exp, task) => c.run({ exp, task, system: 's', messages: [{ role: 'user', content: 'x' }], schema: SCHEMA, maxTokens: 100 });
  await assert.rejects(run('shark'), (e) => e.reason === 'exp_budget');
  assert.equal(calls, 0, 'no model call at all');
  await run('shark', 'care'); // safety still runs
  await run('reel');
  assert.equal(calls, 2);
  assert.equal(c.budgetOf('shark').ok, false);
  assert.equal(c.budgetOf('reel').budgetUsd, null);
});

test('CHECK-21 L4: spend (total, per IST day, per experience) is pushed to the bucket store and restored at boot, so a redeploy keeps the cap and the budgets', async () => {
  const { startServer, json } = await import('./helpers.js');
  const mem = { obj: null, puts: 0 };
  const spendStore = { get: async () => (mem.obj ? JSON.parse(JSON.stringify(mem.obj)) : null), put: async (o) => { mem.obj = o; mem.puts++; return true; } };
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ crisis: false, confidence: 0 }) }], usage: { input_tokens: 250000, output_tokens: 0 } }) } } };
  const env = { CLAUDE_MOCK: '0', ANTHROPIC_API_KEY: 'test-not-a-real-key', BUDGET_USD__SAMPLE: '1.5', SPEND_CAP_USD: '350' };
  const a = await startServer({ ...env, DATA_DIR: tmpDir('l4a') }, { claudeClient: client, spendStore });
  await json(a.base, '/api/_sample/vibe', { word: 'chai', subject: 'coding' }, { cookie: 'pz_sid=l4-1' }); // care check ($1) + vibe call
  const spentA = a.claude.spend.totalUsd;
  assert.ok(spentA >= 1);
  await a.close(); // pushes on stop
  assert.ok(mem.puts >= 1);
  // a "redeploy": a fresh DATA_DIR (empty disk), the same bucket
  const b = await startServer({ ...env, DATA_DIR: tmpDir('l4b') }, { claudeClient: client, spendStore });
  try {
    assert.ok(b.claude.spend.totalUsd >= spentA, 'the total survives');
    assert.ok(b.claude.budgetOf('_sample').spentTodayUsd >= 1, "today's per-experience spend survives");
  } finally { await b.close(); }
  // merge by max: an older bucket copy never lowers the local meter
  const { SpendMeter } = await import('../../core/server/claude.js');
  const m = new SpendMeter({ file: null, capUsd: 350 });
  m.add(5, 'shark');
  m.merge({ totalUsd: 2, calls: 1, byDay: { [Object.keys(m.byDay)[0]]: { shark: 1, reel: 3 } } });
  assert.equal(m.totalUsd, 5);
  assert.equal(m.expSpent('shark'), 5);
  assert.equal(m.expSpent('reel'), 3);
});

test('N21b: a bucket that cannot be read at boot does not start spend from zero: half the remaining cap, no push, retries, a staff alert, then the real totals', async () => {
  const { startServer } = await import('./helpers.js');
  let fails = 3;
  const mem = { obj: { totalUsd: 120, calls: 40, byDay: {} }, puts: 0 };
  const spendStore = { get: async () => { if (fails-- > 0) throw Object.assign(new Error('net down'), { name: 'NetworkingError' }); return JSON.parse(JSON.stringify(mem.obj)); }, put: async (o) => { mem.obj = o; mem.puts++; return true; } };
  // a disk that already has an earlier total: half of what is left
  const disk = tmpDir('n21b');
  fs.writeFileSync(path.join(disk, 'spend.json'), JSON.stringify({ totalUsd: 10, calls: 3, byDay: {} }));
  const s = await startServer({ CLAUDE_MOCK: '1', SPEND_CAP_USD: '350', SPEND_RESTORE_RETRY_MS: '100', SPEND_RESTORE_ALERT_MS: '150', DATA_DIR: disk }, { spendStore });
  try {
    assert.equal(s.claude.spend.capUsd, 180, 'the known total plus half of what is left while the bucket is unknown');
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(s.safety.allAlerts().some((a) => a.kind === 'spend'), 'staff alert after the retry window');
    assert.equal(s.claude.spend.totalUsd, 120, 'the real totals once the bucket answers');
    assert.equal(s.claude.spend.capUsd, 350, 'the configured cap comes back');
    assert.equal(mem.puts, 0, 'nothing was pushed before the restore');
  } finally { await s.close(); }
  // a fresh disk (no earlier total known) and an unreadable bucket: the fixed conservative cap ($75, SPEND_UNKNOWN_CAP_USD), and the alert
  const down = { get: async () => { throw Object.assign(new Error('net down'), { name: 'NetworkingError' }); }, put: async () => true };
  const fresh = await startServer({ CLAUDE_MOCK: '1', SPEND_CAP_USD: '350', SPEND_RESTORE_RETRY_MS: '50', SPEND_RESTORE_ALERT_MS: '100', DATA_DIR: tmpDir('n21b-fresh') }, { spendStore: down });
  try {
    assert.equal(fresh.claude.spend.capUsd, 75);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fresh.claude.spend.capUsd, 75, 'stays until the bucket loads');
    assert.ok(fresh.safety.allAlerts().some((a) => a.kind === 'spend'));
  } finally { await fresh.close(); }
  const custom = await startServer({ CLAUDE_MOCK: '1', SPEND_CAP_USD: '350', SPEND_UNKNOWN_CAP_USD: '40', DATA_DIR: tmpDir('n21b-c') }, { spendStore: down });
  try { assert.equal(custom.claude.spend.capUsd, 40, 'a setting'); } finally { await custom.close(); }
  // nothing in the bucket yet (first deploy) is not an error: full cap at once
  const empty = await startServer({ CLAUDE_MOCK: '1', SPEND_CAP_USD: '350', DATA_DIR: tmpDir('n21b2') }, { spendStore: { get: async () => null, put: async () => true } });
  try { assert.equal(empty.claude.spend.capUsd, 350); } finally { await empty.close(); }
});
