// Local load test (mock Claude): N concurrent visitor sessions of the sample, plus 8 stage TVs, big-screen queue
// turns and 25 two-player duel rooms (AI ya Asli, or a stub). Each sample session does what the
// phone does: page + kit assets, track start, the Claude-backed call (following 503 queue tickets),
// TV bus publish, track complete. Reports p50/p95 and errors; exit code 1 on any failure.
//   npm run loadtest                         (spawns its own mock server, 50 sessions)
//   node test/core/load.mjs --sessions 150   (more)
//   node test/core/load.mjs --url http://127.0.0.1:8790   (an already running LOCAL server)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SESSIONS = Number(opt('--sessions', 50));
const LATENCY = opt('--latency', '900');
let base = opt('--url', '');
if (base && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error('load.mjs only runs against a local server (http://localhost:PORT or http://127.0.0.1:PORT). TASK-07 ops/loadtest covers staging.');
  process.exit(2);
}

let srv = null;
let dataDir = null;
if (!base) {
  fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  dataDir = fs.mkdtempSync(path.join(ROOT, 'tmp', 'load-')); // inside the repo (git-ignored)
  // PORT=0: the OS picks a free port, so parallel runs never collide; we read it from the start line.
  let port = 0;
  srv = spawn(process.execPath, ['core/server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: LATENCY, ANTHROPIC_API_KEY: '', DATA_DIR: dataDir, PZ_QUIET: '1', PZ_NO_DOTENV: '1', ADMIN_KEY: '', STAGE_MIN_TURN_S: '0' }, // load turns are short; the 20 s rule has its own unit test
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 15000);
    srv.stdout.on('data', (d) => { const m = String(d).match(/play-zenith on http:\/\/[^:]+:(\d+)/); if (m) { port = Number(m[1]); clearTimeout(t); res(); } });
  });
  base = `http://127.0.0.1:${port}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const errors = [];
const vibeMs = [];
const sessionMs = [];
let queued = 0;
let maxAhead = 0;

async function session(i) {
  const sid = `load-${i}-${Math.random().toString(36).slice(2, 10)}`;
  const headers = { 'content-type': 'application/json', cookie: `pz_sid=${sid}`, 'x-forwarded-for': `49.36.${Math.floor(i / 250)}.${i % 250}` };
  const t0 = Date.now();
  const must = async (p, init = {}) => {
    const r = await fetch(base + p, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${p} -> ${r.status}`);
    return r;
  };
  try {
    await sleep(Math.random() * 300); // phones do not all tap at the same millisecond
    await (await must('/_sample/?c=' + ((i % 8) + 1))).text();
    await Promise.all(['/core/kit.js', '/core/orchestra.js', '/core/tokens.css', '/_sample/app.js'].map(async (p) => (await must(p)).arrayBuffer()));
    await must('/api/core/track', { method: 'POST', body: JSON.stringify({ exp: '_sample', event: 'start' }) });
    // Claude-backed call, following the queue like kit.api() does
    const v0 = Date.now();
    let ticket = null;
    let res;
    for (let tries = 0; tries < 200; tries++) {
      const r = await fetch(`${base}/api/_sample/vibe`, { method: 'POST', headers: { ...headers, ...(ticket ? { 'x-queue-ticket': ticket } : {}) }, body: JSON.stringify({ word: `word${i}`, subject: 'coding' }) });
      if (r.status === 503) {
        const b = await r.json();
        if (!ticket) queued++;
        ticket = b.queue.ticket;
        maxAhead = Math.max(maxAhead, b.queue.ahead);
        await sleep(b.queue.retryMs);
        continue;
      }
      if (!r.ok) throw new Error(`vibe -> ${r.status}`);
      res = await r.json();
      break;
    }
    if (!res || !res.vibe?.title) throw new Error('vibe: no answer');
    vibeMs.push(Date.now() - v0);
    // the sample's real TV text (registered banks and templates), as PUBLIC_TEXT_STRICT is on by default
    const events = [{ t: 'init', ts: 0, title: 'Vibe Scanner', orchestrator: { id: 'conductor', name: 'Vibe Conductor' }, agents: [{ id: 'number', name: 'Number Agent', role: 'Word score, in code', label: 'NUMBER' }] },
      { t: 'handoff', ts: 10, from: 'number', to: 'conductor', label: `lucky number = ${res.number}` }, { t: 'done', ts: 20, summary: 'Vibe report ready in 1.2s' }];
    const b = await (await must(`/api/core/bus/_sample/${(i % 8) + 1}`, { method: 'POST', body: JSON.stringify({ sid, events }) })).json();
    if (b.rejected?.length) throw new Error(`bus rejected: ${b.rejected[0].reason}`);
    await must('/api/core/track', { method: 'POST', body: JSON.stringify({ exp: '_sample', event: 'complete' }) });
    sessionMs.push(Date.now() - t0);
  } catch (e) {
    errors.push(`session ${i}: ${e.message}`);
  }
}

// Stage TVs: one live SSE stream per counter (what the counter TVs keep open all day)
const tvAborts = [];
let tvMessages = 0;
async function stageTv(exp, c) {
  const ctrl = new AbortController();
  tvAborts.push(ctrl);
  try {
    const r = await fetch(`${base}/api/core/bus/${exp}/${c}/stream`, { signal: ctrl.signal });
    const reader = r.body.getReader();
    for (;;) { const { done } = await reader.read(); if (done) break; tvMessages++; }
  } catch { /* aborted at the end */ }
}
for (let c = 1; c <= 8; c++) stageTv('_sample', c);

// Big-screen players: nickname -> queue -> play when it is their turn (CONTRACT 12.4)
const BIG = Math.min(10, Math.floor(SESSIONS / 5));
let bigTurns = 0;
async function bigScreenSession(i) {
  const sid = `big-${i}-${Math.random().toString(36).slice(2, 10)}`;
  const headers = { 'content-type': 'application/json', cookie: `pz_sid=${sid}`, 'x-forwarded-for': `49.37.0.${i}` };
  const c = (i % 4) + 1;
  try {
    const opts = await (await fetch(`${base}/api/core/stage/nicknames`, { headers })).json();
    const pick = await (await fetch(`${base}/api/core/stage/nickname`, { method: 'POST', headers, body: JSON.stringify({ id: opts.options[0].id }) })).json();
    if (!pick.ok) throw new Error('nickname');
    const j = await (await fetch(`${base}/api/core/stage/queue`, { method: 'POST', headers, body: JSON.stringify({ exp: '_sample', c }) })).json();
    if (!j.ok) throw new Error(`queue: ${j.reason}`);
    for (let k = 0; k < 400; k++) {
      const st = await (await fetch(`${base}/api/core/stage/queue/${j.ticket}`, { headers })).json();
      if (st.status === 'your_turn') {
        let ticket = null;
        let r;
        for (let tries = 0; tries < 200; tries++) {
          r = await fetch(`${base}/api/_sample/vibe`, { method: 'POST', headers: { ...headers, 'x-pz-counter': String(c), ...(ticket ? { 'x-queue-ticket': ticket } : {}) }, body: JSON.stringify({ word: 'swift', subject: 'coding' }) });
          if (r.status !== 503) break;
          const b = await r.json();
          ticket = b.queue.ticket;
          await sleep(b.queue.retryMs);
        }
        if (!r.ok) throw new Error(`vibe ${r.status}`);
        const after = await (await fetch(`${base}/api/core/stage/queue/${j.ticket}`, { headers })).json();
        if (after.status !== 'done' || !after.token) throw new Error('no reward token after the turn');
        bigTurns++;
        return;
      }
      if (st.status !== 'waiting') throw new Error(`queue status ${st.status}`);
      await sleep(250);
    }
    throw new Error('turn never came');
  } catch (e) { errors.push(`big ${i}: ${e.message}`); }
}

// Duel rooms (AI ya Asli 1v1): 25 rooms x 2 phones. Uses the experience's room API when it is there,
// else a stub: both phones push live scores to the counter TV (what a room does to the bus).
const ROOMS = Number(opt('--rooms', 25));
let roomsDone = 0;
async function duelRoom(i) {
  const mk = (p) => { const sid = `duel-${i}-${p}-${Math.random().toString(36).slice(2, 8)}`; return { 'content-type': 'application/json', cookie: `pz_sid=${sid}`, 'x-forwarded-for': `49.38.${i}.${p}` }; };
  const A = mk(1);
  const B = mk(2);
  try {
    // like two real players: B never picks the same name as A (asli refuses a same-name join)
    const nickFor = async (hd, not) => {
      const o = await (await fetch(`${base}/api/asli/nicknames`, { headers: hd })).json();
      const pick = (o.options || []).find((x) => x.text !== not);
      if (!pick) return null;
      const r = await (await fetch(`${base}/api/asli/nickname`, { method: 'POST', headers: hd, body: JSON.stringify({ id: pick.id }) })).json();
      return r.ok ? (r.nickname || pick.text) : null;
    };
    const hasAsli = (await fetch(`${base}/api/asli/nicknames`, { headers: A })).ok;
    const nickA = hasAsli ? await nickFor(A) : null;
    if (nickA && await nickFor(B, nickA)) {
      const room = await (await fetch(`${base}/api/asli/duel/create`, { method: 'POST', headers: A, body: JSON.stringify({ c: 6 }) })).json();
      if (!room.code) throw new Error(`create: ${room.error || 'no code'}`);
      const joinOnce = () => fetch(`${base}/api/asli/duel/join`, { method: 'POST', headers: B, body: JSON.stringify({ code: room.code }) });
      let join = await joinOnce();
      // under heavy load a 409 (same name, or the nickname not stored yet) is retried once with a fresh nickname
      if (join.status === 409) { await join.body?.cancel?.(); if (await nickFor(B, nickA)) join = await joinOnce(); }
      if (!join.ok) throw new Error(`join ${join.status} ${(await join.json().catch(() => ({}))).error || ''}`.trim());
    } else {
      for (const [p, hd] of [[1, A], [2, B]]) {
        const r = await (await fetch(`${base}/api/core/bus/_sample/9`, { method: 'POST', headers: hd, body: JSON.stringify({ sid: `room${i}p${p}`, events: [{ t: 'custom', name: 'duel', data: { round: 3, score: 2 } }] }) })).json();
        if (r.rejected?.length) throw new Error(`stub bus: ${r.rejected[0].reason}`);
      }
    }
    roomsDone++;
  } catch (e) { errors.push(`room ${i}: ${e.message}`); }
}

const t0 = Date.now();
await Promise.all([
  ...Array.from({ length: SESSIONS }, (_, i) => session(i)),
  ...Array.from({ length: BIG }, (_, i) => bigScreenSession(i)),
  ...Array.from({ length: ROOMS }, (_, i) => duelRoom(i)),
]);
const status = await (await fetch(`${base}/status.json`)).json().catch(() => ({}));
const report = {
  sessions: SESSIONS, ok: SESSIONS - errors.length, errors: errors.length, wallMs: Date.now() - t0,
  claudeCall: { p50: pct(vibeMs, 50), p95: pct(vibeMs, 95), max: Math.max(0, ...vibeMs) },
  session: { p50: pct(sessionMs, 50), p95: pct(sessionMs, 95) },
  queued, maxAhead, peakInFlight: status.limits?.peakInFlight, maxInFlight: status.limits?.max,
  stageTvs: tvAborts.length, tvMessages, bigScreenTurns: `${bigTurns}/${BIG}`, duelRooms: `${roomsDone}/${ROOMS}`,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) console.error(errors.slice(0, 10).join('\n'));
for (const a of tvAborts) a.abort();
if (srv) { const exited = new Promise((r) => srv.once('exit', r)); srv.kill(); await exited; }
if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
process.exitCode = errors.length ? 1 : 0;
