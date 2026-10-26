// The ONLY way experiences talk to Claude. Server-side, metered, capped, never logs content.
//
//   const out = await claude.run({ task, system, messages, schema, mock, maxTokens, effort, sessionId })
//
// - Returns the parsed JSON object that matches `schema` (structured output via output_config.format).
// - Throws DemoFallback when the experience should show a fixture instead: DEMO_MODE / offline, no key,
//   spend cap reached, timeout, API error, refusal, or unparseable output. Use demo.wrap() to handle it.
// - CLAUDE_MOCK=1 returns `mock` (an object, or a function of the call args) after a short fake delay.
//
// Privacy: this file never logs prompts, images, answers or request bodies. Only exp, task, status, ms, cost.
import fs from 'node:fs';
import { istDay } from './analytics.js';
import path from 'node:path';

export class DemoFallback extends Error {
  constructor(reason, detail = '') {
    super(`demo fallback: ${reason}`);
    this.name = 'DemoFallback';
    this.reason = reason; // demo_mode | no_key | spend_cap | timeout | api_error | refusal | bad_json | no_mock | schema
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Spend meter: running total in USD, persisted so a restart cannot reset the cap. ---
const EXEMPT_TASKS = new Set(['care', 'judge']); // safety calls are never stopped by an experience budget

export class SpendMeter {
  constructor({ file, capUsd }) {
    this.file = file;
    this.capUsd = capUsd;
    this.totalUsd = 0;
    this.calls = 0;
    this.reserved = 0; // estimated cost of calls in flight, so 30 parallel calls cannot blow past the cap
    this.byDay = {}; // IST day -> { exp: usd } (per-experience daily budgets, TASK-20)
    this.reservedByExp = new Map();
    this.fromDisk = false; // true when an earlier total was read from DATA_DIR/spend.json
    if (file && fs.existsSync(file)) {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        this.fromDisk = true;
        this.totalUsd = Number(j.totalUsd) || 0;
        this.calls = Number(j.calls) || 0;
        if (j.byDay && typeof j.byDay === 'object') this.byDay = j.byDay;
      } catch { /* corrupt file: start from 0 but keep going */ }
    }
  }
  /** Merge a snapshot from the bucket: every total takes the larger value, so a redeploy never resets the cap or a budget. */
  merge(remote) {
    if (!remote || typeof remote !== 'object') return;
    this.totalUsd = Math.max(this.totalUsd, Number(remote.totalUsd) || 0);
    this.calls = Math.max(this.calls, Number(remote.calls) || 0);
    for (const [day, exps] of Object.entries(remote.byDay || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !exps || typeof exps !== 'object') continue;
      const d = (this.byDay[day] ||= {});
      for (const [exp, usd] of Object.entries(exps)) if (Number.isFinite(Number(usd))) d[exp] = Math.max(Number(d[exp]) || 0, Number(usd));
    }
  }
  snapshot() { return { totalUsd: this.totalUsd, calls: this.calls, byDay: this.byDay, savedAt: new Date().toISOString() }; }
  expSpent(exp, day = istDay()) { return Number(this.byDay[day]?.[exp]) || 0; }
  expCanSpend(exp, budgetUsd, estimateUsd = 0, day = istDay()) { return this.expSpent(exp, day) + (this.reservedByExp.get(exp) || 0) + estimateUsd < budgetUsd; }
  reserveExp(exp, usd) { this.reservedByExp.set(exp, Math.max(0, (this.reservedByExp.get(exp) || 0) + usd)); }
  get remaining() { return this.capUsd - this.totalUsd - this.reserved; }
  canSpend(estimateUsd = 0) { return this.totalUsd + this.reserved + estimateUsd < this.capUsd; }
  add(usd, exp = null, day = istDay()) {
    this.totalUsd += usd;
    this.calls += 1;
    if (exp) {
      const d = (this.byDay[day] ||= {});
      d[exp] = (Number(d[exp]) || 0) + usd;
      const days = Object.keys(this.byDay).sort();
      while (days.length > 14) delete this.byDay[days.shift()]; // keep two weeks
    }
  }
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.snapshot()));
    fs.renameSync(tmp, this.file);
  }
}

export function costUsd(usage, price) {
  if (!usage) return 0;
  const M = 1_000_000;
  const inTok = usage.input_tokens || 0;
  const outTok = usage.output_tokens || 0;
  const cr = usage.cache_read_input_tokens || 0;
  const cw = usage.cache_creation_input_tokens || 0;
  return (inTok * price.in + outTok * price.out + cr * price.cacheRead + cw * price.cacheWrite) / M;
}

// --- Minimal JSON-schema check (type, required, properties, items, enum). Enough to keep mocks honest. ---
export function checkSchema(value, schema, at = '$') {
  if (!schema) return [];
  const errs = [];
  const t = schema.type;
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);
  if (t) {
    const types = Array.isArray(t) ? t : [t];
    const actual = typeOf(value);
    const ok = types.some((x) => x === actual || (x === 'number' && actual === 'integer'));
    if (!ok) return [`${at}: expected ${types.join('|')}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: not in enum`);
  if (typeOf(value) === 'object' && schema.properties) {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}.${k}: missing`);
    for (const [k, sub] of Object.entries(schema.properties)) if (k in value) errs.push(...checkSchema(value[k], sub, `${at}.${k}`));
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errs.push(...checkSchema(v, schema.items, `${at}[${i}]`)));
  return errs;
}

// Structured outputs want closed objects. Add additionalProperties:false where the author left it out.
export function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const s = Array.isArray(schema) ? schema.map(strictSchema) : { ...schema };
  if (s.type === 'object' && s.additionalProperties === undefined) s.additionalProperties = false;
  if (s.properties) s.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, strictSchema(v)]));
  if (s.items) s.items = strictSchema(s.items);
  return s;
}

// Build an image block for vision calls from a base64 JPEG (no data: prefix).
export function imageBlock(base64Jpeg, mediaType = 'image/jpeg') {
  const data = String(base64Jpeg).replace(/^data:image\/\w+;base64,/, '');
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

/**
 * createClaude({ config, client?, log? })
 * `client` is injectable for tests (anything with beta.messages.create(body, opts)).
 */
export function createClaude({ config, client = null, log = () => {}, onEvent = () => {} }) {
  const spend = new SpendMeter({ file: path.join(config.dataDir, 'spend.json'), capUsd: config.spendCapUsd });
  let sdk = client;

  async function getClient() {
    if (sdk) return sdk;
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    // maxRetries: 1 = one retry on 429/5xx/connection errors. timeout per attempt.
    sdk = new Anthropic({ apiKey: config.apiKey, maxRetries: 1, timeout: config.claudeTimeoutMs });
    return sdk;
  }

  function mode() {
    if (config.demoMode) return 'demo';
    if (config.mock) return 'mock';
    if (!config.apiKey && !client) return 'no_key';
    if (!spend.canSpend()) return 'spend_cap';
    return 'live';
  }

  async function run(args) {
    const { exp = 'core', task = 'call', system, messages, schema, mock, maxTokens = 2000, effort = 'low' } = args;
    const t0 = Date.now();
    const m = mode();
    if (m === 'demo') throw new DemoFallback('demo_mode');

    if (m === 'mock') {
      if (mock === undefined) throw new DemoFallback('no_mock');
      await sleep(Math.round(config.mockLatencyMs * (0.6 + Math.random() * 0.8)));
      const out = structuredClone(typeof mock === 'function' ? await mock(args) : mock);
      const errs = checkSchema(out, schema);
      if (errs.length) throw new DemoFallback('schema', `mock does not match schema: ${errs.slice(0, 3).join('; ')}`);
      log({ kind: 'claude', exp, task, mode: 'mock', ms: Date.now() - t0 });
      return out;
    }
    if (m === 'no_key') throw new DemoFallback('no_key');

    // Reserve a pessimistic estimate so parallel calls respect the cap.
    const price = config.prices[config.model] || config.prices.default;
    const estimate = costUsd({ input_tokens: 6000, output_tokens: maxTokens }, price);
    if (!spend.canSpend(estimate)) throw new DemoFallback('spend_cap');
    // per-experience daily budget (BUDGET_USD_<EXP>): this experience goes to its banked/demo answers, the others keep
    // going. The safety calls (care check, judge) are never blocked by a budget.
    const budget = config.budgets?.[exp];
    const budgeted = Number.isFinite(budget) && !EXEMPT_TASKS.has(task);
    if (budgeted && !spend.expCanSpend(exp, budget, estimate)) throw new DemoFallback('exp_budget');
    spend.reserved += estimate;
    if (budgeted) spend.reserveExp(exp, estimate);

    const body = {
      model: config.model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema: strictSchema(schema) } } : {}) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(system ? { system } : {}),
      messages,
    };

    let res;
    try {
      const c = await getClient();
      // a caller with its own deadline (the 3 s care check) gets that timeout and no retry
      res = await c.beta.messages.create(body, { timeout: args.timeoutMs || config.claudeTimeoutMs, maxRetries: args.timeoutMs ? 0 : 1 });
    } catch (e) {
      const timeout = e?.name === 'APIConnectionTimeoutError' || /timeout/i.test(e?.message || '');
      log({ kind: 'claude', exp, task, mode: 'live', ok: false, status: e?.status || null, err: timeout ? 'timeout' : e?.name || 'error', ms: Date.now() - t0 });
      onEvent(exp, 'error');
      throw new DemoFallback(timeout ? 'timeout' : 'api_error', String(e?.status || ''));
    } finally {
      spend.reserved = Math.max(0, spend.reserved - estimate);
      if (budgeted) spend.reserveExp(exp, -estimate);
    }

    const usd = costUsd(res.usage, price);
    spend.add(usd, exp);
    try { spend.save(); } catch { /* disk full etc: keep serving, the in-memory total still caps */ }
    const ms = Date.now() - t0;

    if (res.stop_reason === 'refusal') {
      log({ kind: 'claude', exp, task, mode: 'live', ok: false, err: 'refusal', ms, usd: +usd.toFixed(4) });
      throw new DemoFallback('refusal');
    }
    const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try {
      out = schema ? JSON.parse(text) : { text };
    } catch {
      log({ kind: 'claude', exp, task, mode: 'live', ok: false, err: 'bad_json', ms, usd: +usd.toFixed(4) });
      throw new DemoFallback('bad_json');
    }
    log({ kind: 'claude', exp, task, mode: 'live', ok: true, ms, usd: +usd.toFixed(4), in: res.usage?.input_tokens, out: res.usage?.output_tokens });
    return out;
  }

  function budgetStatus() { return Object.fromEntries(Object.entries(config.budgets || {}).map(([e, b]) => [e, { budgetUsd: b, spentTodayUsd: +spend.expSpent(e).toFixed(4), ok: spend.expCanSpend(e, b) }])); }

  return {
    run,
    image: imageBlock,
    mode,
    spend,
    status: () => ({ mode: mode(), spentUsd: +spend.totalUsd.toFixed(4), capUsd: spend.capUsd, calls: spend.calls, budgets: budgetStatus() }),
    /** this experience's daily budget: { budgetUsd, spentTodayUsd, ok } (budgetUsd null when none is set) */
    budgetOf: (exp) => { const b = config.budgets?.[exp]; const spent = +spend.expSpent(exp).toFixed(4); return { budgetUsd: Number.isFinite(b) ? b : null, spentTodayUsd: spent, ok: !Number.isFinite(b) || spend.expCanSpend(exp, b) }; },
    DemoFallback,
  };
}
