// Squad Reel worker: a small HTTP service in front of ffmpeg. Only play-web talks to it (shared secret).
//   PORT=8813 node src/server.js          (container: PORT 8080, Lightsail service play-reel, container "worker")
//
// Endpoints (all but /healthz need header x-reel-secret = REEL_SHARED_SECRET):
//   GET  /healthz                    { ok, assets, queue }            (Lightsail health check)
//   POST /clips?shot=1               raw video body -> { clipId, duration, width, height, hasAudio }
//   POST /clips/sample               the 3 abstract hero clips as uploaded clips (filming, ?demo=hero)
//   GET  /samples/:n                 hero clip n (1-3) preview
//   POST /plan  { template, clips }  Director plan (beats) for these clips
//   POST /jobs  { template, clips, captions[], hook, demo } -> { id, ahead }
//   GET  /jobs/:id?since=<seq>       state, queue position, new orchestra events, result
//   POST /jobs/:id/repost { repost } repost consent flag (default off)
//   GET  /files/:id                  reel.mp4 (Range supported), /files/:id/cover.jpg
//   GET  /reposts                    ids of reels whose squad said Zenith may repost (staff)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createStore, createSweeper, newId, ID_RE } from './store.js';
import { createAssets } from './assets.js';
import { createJobs } from './jobs.js';
import { planCut } from './plan.js';
import { probe } from './ffmpeg.js';
import { TEMPLATES } from './templates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const LIMITS = {
  maxBytes: num(process.env.REEL_MAX_CLIP_MB, 80) * 1048576,
  maxSeconds: num(process.env.REEL_MAX_CLIP_S, 30),
  minSeconds: num(process.env.REEL_MIN_CLIP_S, 2),
  inputTtlMin: num(process.env.REEL_INPUT_TTL_MIN, 10), // uploaded but never rendered clips
};

// Friendly Hinglish messages for every refusal (the phone shows them as is).
export const MESSAGES = {
  too_big: `Yeh clip bahut badi hai (max ${Math.round(LIMITS.maxBytes / 1048576)} MB). Chhota shot record karo.`,
  bad_type: 'Yeh video file nahi lag rahi. Camera se shot record karo.',
  not_video: 'Is file mein video nahi mila. Ek baar phir record karo.',
  too_long: `Shot thoda lamba hai (max ${LIMITS.maxSeconds}s). Chhota shot lo, hum beat pe cut kar denge.`,
  too_short: `Shot bahut chhota hai. Kam se kam ${Math.round(LIMITS.minSeconds)} second record karo.`,
  busy: 'Abhi bahut reels ban rahi hain. Thodi der mein phir try karo.',
  clip_missing: 'Ek clip expire ho gayi. Shots dobara record karo.',
  bad_template: 'Template nahi mila. Ek template chuno.',
  bad_clips: 'Teen alag shots chahiye.',
  not_found: 'Yeh reel ab available nahi hai (48 ghante baad delete ho jaati hai).',
  unauthorized: 'Not allowed.',
};

function keyOk(given, want) {
  if (!want || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * createWorker(opts) -> { app, start(port, host), stop(), jobs, store, assets, sweeper }
 * opts: storageDir, secret, ttlHours, concurrency, queueMax, now, log, production
 */
export function createWorker(opts = {}) {
  const env = process.env;
  const cfg = {
    storageDir: path.resolve(opts.storageDir || env.REEL_STORAGE_DIR || path.join(HERE, '..', 'storage')),
    secret: opts.secret ?? env.REEL_SHARED_SECRET ?? '',
    ttlHours: num(opts.ttlHours ?? env.REEL_TTL_HOURS, 48),
    concurrency: Math.max(1, Math.min(4, num(opts.concurrency ?? env.REEL_CONCURRENCY, 1))),
    queueMax: num(opts.queueMax ?? env.REEL_QUEUE_MAX, 30),
    production: opts.production ?? env.NODE_ENV === 'production',
  };
  const quiet = opts.quiet ?? env.PZ_QUIET === '1';
  const log = opts.log || ((o) => { if (!quiet) process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), svc: 'reel', ...o }) + '\n'); });
  const now = opts.now || (() => Date.now());

  const store = createStore({ dir: cfg.storageDir });
  const assets = createAssets({ storageDir: cfg.storageDir, log });
  const jobs = createJobs({ store, assets, concurrency: cfg.concurrency, queueMax: cfg.queueMax, now, log });
  const sweeper = createSweeper({ store, ttlHours: cfg.ttlHours, inputTtlMin: opts.inputTtlMin ?? LIMITS.inputTtlMin, now, inUse: jobs.inUse, log });
  if (cfg.production && !cfg.secret) log({ kind: 'boot', warn: 'REEL_SHARED_SECRET is not set: every request except /healthz is refused' });

  const app = express();
  app.disable('x-powered-by');
  const fail = (res, code, status = 400, extra = {}) => res.status(status).json({ error: code, message: MESSAGES[code] || MESSAGES.busy, ...extra });

  app.get('/healthz', (req, res) => res.json({ ok: true, assets: assets.state.ready ? 'ready' : assets.state.error ? 'error' : 'warming', queue: jobs.status() }));

  // shared secret on everything else (dev without a secret: open, but only when not in production)
  app.use((req, res, next) => {
    if (!cfg.secret) return cfg.production ? fail(res, 'unauthorized', 503) : next();
    if (!keyOk(req.get('x-reel-secret'), cfg.secret)) return fail(res, 'unauthorized', 401);
    next();
  });

  // access log: method, route shape, status, ms. Ids are random; no query strings, no bodies.
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => log({ kind: 'http', m: req.method, p: req.path.replace(/[a-z]{20}/g, ':id').slice(0, 60), s: res.statusCode, ms: Date.now() - t0 }));
    next();
  });

  // ---------- upload ----------
  app.post('/clips', async (req, res) => {
    const type = String(req.get('content-type') || '').toLowerCase();
    if (!type.startsWith('video/') && type !== 'application/octet-stream') return fail(res, 'bad_type', 415);
    const len = Number(req.get('content-length') || 0);
    if (len > LIMITS.maxBytes) return fail(res, 'too_big', 413);
    const id = newId();
    const part = path.join(store.inDir, `${id}.part`);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk, enc, cb) {
        bytes += chunk.length;
        if (bytes > LIMITS.maxBytes) return cb(Object.assign(new Error('too big'), { code: 'too_big' }));
        cb(null, chunk);
      },
    });
    try {
      await pipeline(req, counter, fs.createWriteStream(part));
      fs.renameSync(part, store.clipFile(id));
    } catch (e) {
      fs.rmSync(part, { force: true });
      if (!res.headersSent) { res.set('Connection', 'close'); fail(res, e.code === 'too_big' ? 'too_big' : 'not_video', e.code === 'too_big' ? 413 : 400); }
      req.resume();
      return;
    }
    const p = await probe(store.clipFile(id));
    const bad = !p.hasVideo ? 'not_video' : p.duration > LIMITS.maxSeconds + 0.5 ? 'too_long' : p.duration < LIMITS.minSeconds ? 'too_short' : null;
    if (bad) { store.deleteClip(id); return fail(res, bad, 422); }
    const meta = { createdAt: now(), duration: Math.round(p.duration * 1000) / 1000, width: p.width, height: p.height, rotation: p.rotation, hasAudio: p.hasAudio, vcodec: p.vcodec, bytes };
    store.saveClipMeta(id, meta);
    log({ kind: 'clip', clip: id, bytes, s: meta.duration });
    res.json({ clipId: id, duration: meta.duration, width: meta.width, height: meta.height, hasAudio: meta.hasAudio });
  });

  // hero filming clips: abstract footage made by ffmpeg at boot, copied in as if uploaded
  app.post('/clips/sample', async (req, res) => {
    await assets.ready.catch(() => {});
    if (!assets.state.ready) return fail(res, 'busy', 503);
    const clips = [];
    for (const f of assets.hero) {
      const id = newId();
      fs.copyFileSync(f, store.clipFile(id));
      const p = await probe(store.clipFile(id));
      const meta = { createdAt: now(), duration: Math.round(p.duration * 1000) / 1000, width: p.width, height: p.height, rotation: 0, hasAudio: p.hasAudio, vcodec: p.vcodec, bytes: fs.statSync(f).size, sample: true };
      store.saveClipMeta(id, meta);
      clips.push({ clipId: id, duration: meta.duration, width: meta.width, height: meta.height, hasAudio: meta.hasAudio });
    }
    res.json({ clips });
  });
  app.get('/samples/:n', async (req, res) => {
    const n = Number(req.params.n);
    if (![1, 2, 3].includes(n)) return fail(res, 'not_found', 404);
    await assets.ready.catch(() => {});
    if (!assets.state.ready) return fail(res, 'busy', 503);
    res.type('video/mp4').sendFile(assets.hero[n - 1], { maxAge: '1h' });
  });

  // ---------- plan + jobs ----------
  app.post('/plan', express.json({ limit: '16kb' }), (req, res) => {
    const { template, clips } = req.body || {};
    if (!TEMPLATES[template]) return fail(res, 'bad_template');
    const metas = (Array.isArray(clips) ? clips : []).map((id) => store.clipMeta(String(id)));
    if (!metas.length || metas.some((m) => !m)) return fail(res, 'clip_missing', 410);
    try { res.json(planCut(template, metas.map((m) => m.duration))); } catch (e) { fail(res, e.code || 'bad_clips', 422, { shot: e.shot }); }
  });

  app.post('/jobs', express.json({ limit: '16kb' }), (req, res) => {
    try {
      const b = req.body || {};
      const job = jobs.submit({ template: b.template, clips: b.clips, captions: Array.isArray(b.captions) ? b.captions : [], hook: b.hook, demo: b.demo });
      const v = jobs.view(job.id);
      res.status(202).json({ id: job.id, ahead: v.ahead, plan: job.plan });
    } catch (e) {
      if (e.code === 'busy') return fail(res, 'busy', 503, { ahead: e.ahead, retryMs: e.retryMs });
      fail(res, e.code || 'bad_clips', e.status || 422, e.shot ? { shot: e.shot } : {});
    }
  });

  app.get('/jobs/:id', (req, res) => {
    if (!ID_RE.test(req.params.id)) return fail(res, 'not_found', 404);
    const v = jobs.view(req.params.id, Number(req.query.since) || 0);
    if (!v) return fail(res, 'not_found', 404);
    res.json(v);
  });

  app.post('/jobs/:id/repost', express.json({ limit: '1kb' }), (req, res) => {
    if (!ID_RE.test(req.params.id) || !jobs.setRepost(req.params.id, req.body?.repost === true)) return fail(res, 'not_found', 404);
    res.json({ ok: true, repost: req.body?.repost === true });
  });

  app.get('/reposts', (req, res) => {
    const out = [];
    for (const id of fs.readdirSync(store.jobsDir)) {
      const m = store.jobMeta(id);
      if (m?.repost && !m.demo) out.push({ id, createdAt: m.createdAt, template: m.template, duration: m.duration });
    }
    res.json({ reels: out.sort((a, b) => b.createdAt - a.createdAt) });
  });

  // ---------- files ----------
  app.get('/files/:id', (req, res) => {
    if (!ID_RE.test(req.params.id)) return fail(res, 'not_found', 404);
    const f = path.join(store.jobDir(req.params.id), 'reel.mp4');
    if (!fs.existsSync(f)) return fail(res, 'not_found', 404);
    res.set('Cache-Control', 'private, max-age=3600');
    res.type('video/mp4').sendFile(f, { acceptRanges: true, cacheControl: false });
  });
  app.get('/files/:id/cover.jpg', (req, res) => {
    if (!ID_RE.test(req.params.id)) return fail(res, 'not_found', 404);
    const f = path.join(store.jobDir(req.params.id), 'cover.jpg');
    if (!fs.existsSync(f)) return fail(res, 'not_found', 404);
    res.set('Cache-Control', 'private, max-age=3600');
    res.type('image/jpeg').sendFile(f, { cacheControl: false });
  });

  app.use((req, res) => fail(res, 'not_found', 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => { log({ kind: 'error', p: req.path.slice(0, 40), err: err.type || err.name }); if (!res.headersSent) fail(res, 'busy', err.status || 500); });

  sweeper.start(60_000);
  let server = null;
  return {
    app, store, assets, jobs, sweeper, cfg,
    start(port = num(env.PORT, 8080), host = env.HOST || '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server = app.listen(port, host, (err) => (err ? reject(err) : resolve(server)));
        server.once('error', reject);
      });
    },
    async stop() {
      sweeper.stop();
      jobs.stop();
      if (server) await new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
    },
  };
}

// Run directly: node src/server.js
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const w = createWorker();
  const srv = await w.start();
  console.log(`play-reel worker on http://localhost:${srv.address().port}  storage: ${path.relative(process.cwd(), w.cfg.storageDir) || '.'}  concurrency ${w.cfg.concurrency}  ttl ${w.cfg.ttlHours}h`);
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
    if (stopping) process.exit(1);
    stopping = true;
    await w.stop();
    process.exit(0);
  });
}
