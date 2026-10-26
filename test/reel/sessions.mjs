// 50 visitor sessions at once through play-web (mock Claude) and one worker, the way the phone does it:
// 3 uploads, plan, captions, hook, render (on 503 busy: wait retryMs and resend with the queue ticket), poll to done.
// Each session has its own cookie and its own client IP (X-Forwarded-For, like phones behind the load balancer).
//   node test/reel/sessions.mjs [--sessions 50] [--concurrency 2]
// Pass = every session gets its reel, no 429, no 5xx other than the queue's 503 busy, worker healthy afterwards.
import fs from 'node:fs';
import { startWorker, sampleClips, tmpDir } from './helpers.js';
import { createServer } from '../../core/server/index.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('sessions', 50));
const CONC = Number(arg('concurrency', 2));
const SECRET = 'sessions-secret';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.REEL_SHARED_SECRET = SECRET;
const w = await startWorker({ secret: SECRET, concurrency: CONC });
await w.assets.ready;
const s = await createServer({ PZ_QUIET: '1', PZ_NO_DOTENV: '1', CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '600', REEL_WORKER_URL: w.base, DATA_DIR: tmpDir('sess'), PUBLIC_TEXT_STRICT: '1' });
const srv = await s.start(0, '127.0.0.1');
const base = `http://127.0.0.1:${srv.address().port}/api/reel/`;
const clips = (await sampleClips()).map((f) => fs.readFileSync(f));
console.log(`sessions: ${N} at once, worker concurrency ${CONC}`);

const stats = { done: 0, failed: 0, status: {}, busy: 0, waitMs: [] };
const count = (st) => { stats.status[st] = (stats.status[st] || 0) + 1; };

async function session(n) {
  const sid = `loadsession${String(n).padStart(4, '0')}`;
  const ip = `10.${Math.floor(n / 250)}.${n % 250}.${(n * 7) % 250}`;
  const H = { cookie: `pz_sid=${sid}`, 'x-forwarded-for': ip };
  // like kit.api(): a 503 busy (core Claude queue or the render queue) waits retryMs and resends with its ticket
  const post = async (p, body, extra = {}) => {
    let ticket = null;
    for (;;) {
      const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...H, ...extra, ...(ticket ? { 'x-queue-ticket': ticket } : {}) }, body: JSON.stringify(body) });
      count(r.status);
      const data = await r.json().catch(() => ({}));
      if (r.status === 503 && data.error === 'busy') { stats.busy += 1; ticket = data.queue.ticket; await sleep(data.queue.retryMs || 1500); continue; }
      return { status: r.status, data };
    }
  };
  const ids = [];
  for (const [i, buf] of clips.entries()) {
    const r = await fetch(`${base}upload?shot=${i + 1}`, { method: 'POST', headers: { 'content-type': 'video/mp4', ...H }, body: buf });
    count(r.status);
    if (r.status !== 200) throw new Error(`upload ${r.status}`);
    ids.push((await r.json()).clipId);
  }
  const tpl = ['intro', 'trailer', 'roast', 'heist'][n % 4];
  const plan = await post('plan', { template: tpl, clips: ids });
  if (plan.status !== 200) throw new Error(`plan ${plan.status}`);
  const cap = await post('captions', { template: tpl, squad: 3, durations: plan.data.shots.map((x) => x.dur) });
  const hook = await post('hook', { template: tpl, squad: 3 });
  if (cap.status !== 200 || hook.status !== 200) throw new Error(`text ${cap.status}/${hook.status}`);
  const body = { template: tpl, clips: ids, captionIds: cap.data.captions.map((c) => c.id), hookId: hook.data.hook.id, squad: 3 };
  const t0 = Date.now();
  const job = await post('render', body);
  if (job.status !== 202) throw new Error(`render ${job.status} ${job.data.error}`);
  for (;;) {
    const r = await fetch(`${base}job/${job.data.id}`, { headers: H });
    const v = await r.json();
    if (v.state === 'done') break;
    if (v.state === 'failed') throw new Error('render failed');
    await sleep(1500);
  }
  stats.waitMs.push(Date.now() - t0);
}

const t0 = Date.now();
const results = await Promise.allSettled(Array.from({ length: N }, (_, i) => session(i)));
for (const r of results) { if (r.status === 'fulfilled') stats.done += 1; else { stats.failed += 1; console.log('session failed:', r.reason.message); } }
const health = await fetch(`${w.base}/healthz`).then((r) => r.json());
const left = fs.readdirSync(w.store.inDir).length;
stats.waitMs.sort((a, b) => a - b);
console.log(`done ${stats.done}/${N}, failed ${stats.failed}, total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`HTTP status counts ${JSON.stringify(stats.status)}, busy retries ${stats.busy}`);
console.log(`render wait (submit to done): p50 ${Math.round(stats.waitMs[Math.floor(stats.waitMs.length / 2)] / 1000)}s, max ${Math.round((stats.waitMs.at(-1) || 0) / 1000)}s`);
console.log(`worker healthy ${health.ok} ${JSON.stringify(health.queue)}, clips left in storage/in: ${left}`);
await s.stop();
await w.close();
const ok = stats.done === N && !stats.status[429] && health.ok && left === 0;
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);
