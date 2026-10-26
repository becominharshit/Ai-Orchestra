// Load test: N reels queued at once on one worker; all must finish, the worker must stay healthy.
// Prints per-job render times and the throughput (reels/hour) for this machine / container.
//   node test/reel/load.mjs                              in-process worker, 10 jobs, concurrency 1
//   node test/reel/load.mjs --jobs 10 --concurrency 2
//   node test/reel/load.mjs --url http://127.0.0.1:8813 --secret <s>   against a running worker (e.g. docker --cpus=1)
//   node test/reel/load.mjs --clips a.mp4,b.mp4,c.mp4                   with your own clips
import { sampleClips, startWorker, uploadFile, waitJob } from './helpers.js';
import { TEMPLATE_IDS } from '../../reel-worker/src/templates.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const JOBS = Number(arg('jobs', 10));
const CONC = Number(arg('concurrency', 1));
let base = arg('url', '');
let secret = arg('secret', process.env.REEL_SHARED_SECRET || 'load-secret');
let w = null;
if (!base) {
  w = await startWorker({ concurrency: CONC, secret, queueMax: Math.max(30, JOBS) });
  await w.assets.ready;
  base = w.base;
}
const H = { 'x-reel-secret': secret };
// --clips a.mp4,b.mp4,c.mp4 uses your own (for example phone-like 1080p 16 Mbit/s) clips instead of the small test clips
const clips = arg('clips', '') ? arg('clips').split(',') : await sampleClips();
console.log(`load: ${JOBS} reels at once -> ${base} (concurrency ${w ? CONC : 'as configured'})`);

const t0 = Date.now();
const ids = [];
for (let j = 0; j < JOBS; j++) {
  const c = [];
  for (const f of clips) { const r = await uploadFile(`${base}/clips`, f, H); if (r.status !== 200) throw new Error(`upload ${r.status} ${JSON.stringify(r.data)}`); c.push(r.data.clipId); }
  ids.push(c);
}
const tUp = Date.now();
const jobs = [];
for (let j = 0; j < JOBS; j++) {
  const tpl = TEMPLATE_IDS[j % TEMPLATE_IDS.length];
  const r = await fetch(`${base}/jobs`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ template: tpl, clips: ids[j], captions: ['Squad aa gayi, frame full!', 'Har ek ka apna signature style', 'Saath mein hum unstoppable'], hook: 'Meet the squad' }) });
  const d = await r.json();
  if (r.status !== 202) throw new Error(`submit ${r.status} ${JSON.stringify(d)}`);
  jobs.push({ id: d.id, tpl, ahead: d.ahead });
}
console.log(`queued ${JOBS}: ahead = ${jobs.map((j) => j.ahead).join(',')}`);
const tSub = Date.now();
const results = await Promise.all(jobs.map((j) => waitJob(base, j.id, H, { timeoutMs: 30 * 60_000 })));
const tEnd = Date.now();
const health = await fetch(`${base}/healthz`).then((r) => r.json());
const ok = results.filter((r) => r.state === 'done');
const render = ok.map((r) => r.result.renderMs).sort((a, b) => a - b);
const avg = render.reduce((a, b) => a + b, 0) / (render.length || 1);
const wall = (tEnd - tSub) / 1000;
console.log(`done ${ok.length}/${JOBS}, failed ${JOBS - ok.length}; worker healthy: ${health.ok} (${JSON.stringify(health.queue)})`);
console.log(`render ms: min ${render[0]} p50 ${render[Math.floor(render.length / 2)]} max ${render.at(-1)} avg ${Math.round(avg)}`);
console.log(`upload ${(tUp - t0) / 1000}s, queue drain ${wall.toFixed(1)}s -> ${(ok.length / wall * 3600).toFixed(0)} reels/hour (renders only, back to back)`);
console.log(`mean file ${(ok.reduce((a, r) => a + r.result.bytes, 0) / (ok.length || 1) / 1048576).toFixed(1)} MB, mean reel ${(ok.reduce((a, r) => a + r.result.duration, 0) / (ok.length || 1)).toFixed(1)}s`);
await w?.close();
process.exit(ok.length === JOBS && health.ok ? 0 : 1);
