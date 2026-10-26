#!/usr/bin/env node
// Load test: N visitors at the same time, spread across the experiences, plus the counter TVs listening on the bus.
//   node ops/loadtest/run.mjs                         starts its own local server in MOCK mode (no key, temp data dir),
//                                                     50 visitors, then stops it
//   node ops/loadtest/run.mjs --sessions 150
//   node ops/loadtest/run.mjs --url http://localhost:8790 --sessions 50      against a server you already run
//   node ops/loadtest/run.mjs --url https://play.zenithschool.ai --sessions 50 --remote-ok
//        against the deployed site: no analytics events are sent (they would spoil the stall numbers), and every
//        Claude-backed call is real unless the site runs in mock or demo mode. Ask the lead first.
// Options: --sessions N (50)  --tvs N (8 TV streams)  --exps a,b (default: every experience the server has)
//          --rounds N (1: flows per visitor)  --json (print the summary as JSON)
//          --strict   also fail when an experience page or API answers 404 or has no server.js yet (use once
//                     TASK-02..06 are in; without it, 404 counts as "not built yet" so the test runs with only core)
// Experience API steps come from experiences/<id>/server.js (see scenarios.mjs).
// Exit code 1 if any error happened (5xx, network error, or a TV stream that dropped).
// TODO(student): add a --ramp option that adds visitors over 60 s instead of all at once (closer to a real queue).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario, discoverRoutes } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

const SESSIONS = Number(opt('sessions', 50));
const TVS = Number(opt('tvs', 8));
const ROUNDS = Number(opt('rounds', 1));
const STRICT = has('strict');
let BASE = opt('url', '');
const ROUTES = {}; // experience id -> API routes from its server.js (null = no server.js yet)
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- a local mock server when no --url is given
async function startLocal() {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-load-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'core', 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '600', DATA_DIR: data, PZ_NO_DOTENV: '1', PZ_QUIET: '1', ANTHROPIC_API_KEY: '', BUCKET_NAME: '', ADMIN_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${url}/healthz`)).ok) return { url, stop: () => { child.kill('SIGTERM'); fs.rmSync(data, { recursive: true, force: true }); } }; } catch { /* not up yet */ }
    if (child.exitCode !== null) break;
    await sleep(250);
  }
  child.kill('SIGKILL');
  throw new Error(`The local server did not start (node core/server/index.js).\n${err.slice(-800)}`);
}

// ---------------------------------------------------------------- measurements
const samples = []; // { step, ms, status }
const counts = { requests: 0, ok: 0, notBuilt: 0, limited: 0, clientErr: 0, serverErr: 0, netErr: 0 };
const errors = new Map();
const strictMisses = new Map();
function record(step, ms, status, { expApi = false, page = false } = {}) {
  if ((expApi || page) && status === 404) strictMisses.set(step, (strictMisses.get(step) || 0) + 1);
  counts.requests++;
  samples.push({ step, ms, status });
  if (status === 0) counts.netErr++;
  else if (status === 404) counts.notBuilt++;
  else if (status === 429 || status === 503) counts.limited++;
  else if (status >= 500) counts.serverErr++;
  else if (status >= 400) counts.clientErr++;
  else counts.ok++;
  if (status === 0 || status >= 500) errors.set(`${step} -> ${status || 'network'}`, (errors.get(`${step} -> ${status || 'network'}`) || 0) + 1);
}
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// ---------------------------------------------------------------- one visitor
function visitor(i, { sendTrack }) {
  let cookie = '';
  // Phones in India share IPs through CGNAT; locally we spread visitors over fake IPs so per-IP limits behave as at the stall.
  const ip = `10.${(i >> 8) & 255}.${i & 255}.${1 + (i % 250)}`;
  async function api(method, p, body, flags = {}) {
    const t0 = performance.now();
    let status = 0; let json = null;
    try {
      const headers = { accept: 'application/json', ...(cookie ? { cookie } : {}), ...(LOCAL_HOSTS.includes(new URL(BASE).hostname) ? { 'x-forwarded-for': ip } : {}) };
      if (body !== undefined) headers['content-type'] = 'application/json';
      const r = await fetch(new URL(p, BASE), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'follow', signal: AbortSignal.timeout(60000) });
      status = r.status;
      const sc = r.headers.get('set-cookie');
      if (sc && !cookie) cookie = sc.split(';')[0];
      const text = await r.text();
      if ((r.headers.get('content-type') || '').includes('json')) { try { json = JSON.parse(text); } catch { /* not json */ } }
    } catch { status = 0; }
    const ms = performance.now() - t0;
    const step = `${method} ${p.replace(/\?.*$/, '').replace(/\/\d+(?=\/|$)/g, '/:n')}`;
    record(step, ms, status, flags);
    return { status, ms, json };
  }
  const track = (exp, event) => (sendTrack ? api('POST', '/api/core/track', { exp, event }) : null);
  return { api, track };
}

async function oneFlow(i, exp, opts) {
  const { api, track } = visitor(i, opts);
  const counter = 1 + (i % 8);
  await api('GET', '/');
  await api('GET', '/api/core/config');
  await api('GET', `/${exp}/?c=${counter}`, undefined, { page: true });
  await api('GET', `/api/core/exp/${exp}`);
  await track(exp, 'start');
  // the phone mirrors its orchestra to the counter TV
  const sid = `load-${i}`;
  await api('POST', `/api/core/bus/${exp}/${counter}`, { sid, events: [
    { type: 'init', title: 'Load test', orchestrator: 'Orchestrator', agents: [{ id: 'a1', name: 'Agent One' }] },
    { type: 'assign', id: 'a1', task: 'Test task' }, { type: 'status', id: 'a1', state: 'working' },
  ] });
  await runScenario(exp, { api, routes: ROUTES[exp] });
  await api('POST', `/api/core/bus/${exp}/${counter}`, { sid, events: [{ type: 'status', id: 'a1', state: 'done' }, { type: 'done', summary: 'Ho gaya' }] });
  await track(exp, 'gate_view');
  await track(exp, 'gate_unlock');
  await track(exp, 'complete');
  await track(exp, 'share');
}

// ---------------------------------------------------------------- the counter TVs (SSE)
function tvStream(exp, c) {
  const ctrl = new AbortController();
  const state = { exp, c, events: 0, opened: false, dropped: false, error: '' };
  (async () => {
    try {
      const r = await fetch(new URL(`/api/core/bus/${exp}/${c}/stream`, BASE), { headers: { accept: 'text/event-stream' }, signal: ctrl.signal });
      state.opened = r.ok;
      if (!r.ok) { state.error = `HTTP ${r.status}`; return; }
      const dec = new TextDecoder();
      for await (const chunk of r.body) state.events += (dec.decode(chunk).match(/\n\n/g) || []).length;
      if (!ctrl.signal.aborted) state.dropped = true;
    } catch (e) { if (!ctrl.signal.aborted) { state.dropped = true; state.error = e.name; } }
  })();
  return { state, close: () => ctrl.abort() };
}

// ---------------------------------------------------------------- main
async function main() {
  let local = null;
  if (!BASE) { local = await startLocal(); BASE = local.url; }
  const host = new URL(BASE).hostname;
  const isLocal = LOCAL_HOSTS.includes(host);
  if (!isLocal && !has('remote-ok')) throw new Error(`${BASE} is not this laptop. Add --remote-ok after the lead agrees (no analytics are sent in that case).`);
  const sendTrack = isLocal;

  let exps = opt('exps', '')?.split(',').filter(Boolean);
  if (!exps.length) {
    const st = await (await fetch(new URL('/status.json', BASE))).json();
    exps = (st.experiences || []).filter((e) => e !== '_sample' || (st.experiences || []).length === 1);
    if (!exps.length) exps = ['_sample'];
  }
  const st0 = await (await fetch(new URL('/status.json', BASE))).json().catch(() => ({}));
  for (const e of exps) ROUTES[e] = discoverRoutes(e);
  const unbuilt = exps.filter((e) => !ROUTES[e]);
  console.log(`Load test: ${SESSIONS} visitors at once x ${ROUNDS} round(s), ${TVS} TV streams, against ${BASE}${local ? ' (local, started for this test)' : ''}`);
  console.log(`  server mode: claude ${st0.claude ?? '?'}, mock ${st0.mock ?? '?'}, demo ${st0.demo ?? '?'}; experiences: ${exps.join(', ')}${sendTrack ? '' : '; analytics events NOT sent'}${STRICT ? '; STRICT' : ''}`);
  for (const e of exps) console.log(`  ${e}: ${ROUTES[e] ? `${ROUTES[e].length} API step(s) from server.js: ${ROUTES[e].map((r) => `${r.method} /api/${e}${r.path}`).join(', ') || 'none'}` : 'no server.js yet (not built)'}`);

  const tvs = Array.from({ length: TVS }, (_, k) => tvStream(exps[k % exps.length], 1 + (k % 8)));
  await sleep(500);
  const t0 = performance.now();
  const flows = [];
  for (let i = 0; i < SESSIONS; i++) {
    flows.push((async () => { for (let r = 0; r < ROUNDS; r++) await oneFlow(i * ROUNDS + r, exps[(i + r) % exps.length], { sendTrack }); })());
  }
  const results = await Promise.allSettled(flows);
  const wall = (performance.now() - t0) / 1000;
  await sleep(500);
  const st1 = await (await fetch(new URL('/status.json', BASE))).json().catch(() => ({}));
  for (const t of tvs) t.close();

  const ms = samples.map((s) => s.ms);
  const okMs = samples.filter((s) => s.status && s.status < 400).map((s) => s.ms);
  const bySteps = {};
  for (const s of samples) (bySteps[s.step] ||= []).push(s.ms);
  const tvBad = tvs.filter((t) => !t.state.opened || t.state.dropped);
  const crashed = results.filter((r) => r.status === 'rejected').length;
  const summary = {
    url: BASE, visitors: SESSIONS, rounds: ROUNDS, wallSeconds: +wall.toFixed(1), ...counts,
    p50ms: Math.round(pct(okMs, 50)), p95ms: Math.round(pct(okMs, 95)), maxms: Math.round(Math.max(0, ...ms)),
    tvStreams: TVS, tvStreamsFailed: tvBad.length, tvEventsReceived: tvs.reduce((s, t) => s + t.state.events, 0),
    flowsCrashed: crashed, errors: Object.fromEntries(errors), strict: STRICT, unbuilt, notFoundSteps: Object.fromEntries(strictMisses), limitsAfter: st1.limits ?? null,
    slowestSteps: Object.entries(bySteps).map(([k, v]) => ({ step: k, n: v.length, p50: Math.round(pct(v, 50)), p95: Math.round(pct(v, 95)) })).sort((a, b) => b.p95 - a.p95).slice(0, 8),
  };
  if (local) local.stop();

  if (has('json')) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log('');
    console.log(`  ${summary.requests} requests in ${summary.wallSeconds} s: ${summary.ok} ok, ${summary.notBuilt} not built yet (404), ${summary.limited} limited/queued (429/503), ${summary.clientErr} other 4xx, ${summary.serverErr} server errors, ${summary.netErr} network errors`);
    console.log(`  latency of answered requests: p50 ${summary.p50ms} ms, p95 ${summary.p95ms} ms, max ${summary.maxms} ms`);
    console.log(`  TV streams: ${TVS - tvBad.length}/${TVS} stayed open, ${summary.tvEventsReceived} events received`);
    console.log('  slowest steps (p95):');
    for (const s of summary.slowestSteps) console.log(`    ${s.step.padEnd(42)} n=${String(s.n).padEnd(5)} p50 ${s.p50} ms  p95 ${s.p95} ms`);
    if (errors.size) { console.log('  errors:'); for (const [k, v] of errors) console.log(`    ${k}: ${v}`); }
    if (st1.limits) console.log(`  server limits after the run: ${JSON.stringify(st1.limits)}`);
    if (STRICT && (unbuilt.length || strictMisses.size)) {
      console.log('  STRICT failures:');
      for (const e of unbuilt) console.log(`    ${e}: no experiences/${e}/server.js`);
      for (const [k, v] of strictMisses) console.log(`    ${k} -> 404: ${v}`);
    }
  }
  const strictFailed = STRICT && (unbuilt.length > 0 || strictMisses.size > 0);
  const failed = summary.serverErr + summary.netErr + tvBad.length + crashed > 0 || strictFailed;
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
