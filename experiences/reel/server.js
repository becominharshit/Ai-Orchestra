// Squad Reel Studio (counter 6), play-web side.
//   Phone -> /api/reel/* here -> reel worker (REEL_WORKER_URL, header x-reel-secret = REEL_SHARED_SECRET).
//   Captions + Hook agents are Claude calls through the core proxy (mock and offline fixtures per template).
//   Director plan, Editor (ffmpeg) and Thumbnail run on the worker; the phone polls the job and plays its events.
//
// Local without a separate worker: when REEL_WORKER_URL is empty and NODE_ENV is not production, the worker from
// ../../reel-worker is started inside this process on the first reel request (REEL_EMBED=0 turns that off).
// Privacy: clips stream straight through to the worker (never stored here); logs hold ids and timings only.
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { TEMPLATES, TEMPLATE_IDS, byId } from './templates.js';
import { createPublic, BANKS, LINES, STYLE_LABELS, variants } from './public.js';

const SECRET = process.env.REEL_SHARED_SECRET || '';
const MAX_MB = Number(process.env.REEL_MAX_CLIP_MB) || 80;
const MAX_S = Number(process.env.REEL_MAX_CLIP_S) || 30;
const MIN_S = Number(process.env.REEL_MIN_CLIP_S) || 2;
const ID_RE = /^[a-z]{20}$/;

const MSG = {
  down: 'Reel studio ka render room abhi warm up ho raha hai. 10 second mein phir try karo.',
  bad: 'Kuch missing hai. Template aur teeno shots phir se check karo.',
  type: 'Yeh video file nahi lag rahi. Camera se shot record karo.',
  big: `Yeh clip bahut badi hai (max ${MAX_MB} MB). Chhota shot record karo.`,
};

// Claude PICKS ids from the vetted banks (banks/<template>.json); it never writes text that reaches the reel,
// the TV or the share card (CHECK_build item 12). The enum lists are filtered by each shot's character budget.
const SYSTEM = `You pick on-screen text for a 20 second Instagram reel that a squad of friends (school or college students in India) records at the Zenith School of AI stall at a college fest.
You only choose ids from the reviewed line banks you are given; you never write new text. Pick lines that fit each shot's moment, feel fresh together (no repeated idea) and suit the squad size. Kind and PG always.`;

const budget = (dur) => Math.max(18, Math.min(52, Math.round(dur * 7))); // same rule as reel-worker/src/plan.js
const pickRandom = (arr) => arr[crypto.randomInt(0, arr.length)];

export default function register({ app, claude, demo, limits, analytics, bus, config, log, safety, admin }) {
  const pub = createPublic({ exp: 'reel', safety }); // registers every bank line and orchestra template
  analytics.declare(['reel_template', 'reel_squad', 'reel_download', 'reel_repost_ok', 'reel_retake', 'reel_render']);
  bus.allowKeys(['hook', 'captions', 'seconds', 'bpm']);
  for (const id of TEMPLATE_IDS) {
    for (const set of ['captions', 'hook']) if (!demo.pick(`${set}_${id}`, 'check')) log({ kind: 'boot', warn: `missing fixtures/${set}_${id}.json` });
  }

  // ---------- worker connection ----------
  let base = config.reelWorkerUrl || '';
  let embedded = null;
  async function workerBase() {
    if (base) return base;
    if (config.production || process.env.REEL_EMBED === '0') return '';
    embedded ||= (async () => {
      const { createWorker } = await import('../../reel-worker/src/server.js');
      const w = createWorker({ secret: SECRET, quiet: process.env.PZ_QUIET === '1' });
      const srv = await w.start(0, '127.0.0.1');
      base = `http://127.0.0.1:${srv.address().port}`;
      log({ kind: 'reel', embedded: true });
      return base;
    })().catch((e) => { embedded = null; log({ kind: 'reel', embedded: false, err: e.code || e.name }); return ''; });
    return embedded;
  }

  async function worker(path, { method = 'GET', json, body, headers = {}, timeoutMs = 15000 } = {}) {
    const b = await workerBase();
    if (!b) { const e = new Error('no worker'); e.down = true; throw e; }
    const h = { 'x-reel-secret': SECRET, ...headers };
    if (json !== undefined) h['content-type'] = 'application/json';
    try {
      return await fetch(b + path, {
        method, headers: h, body: json !== undefined ? JSON.stringify(json) : body, duplex: body ? 'half' : undefined,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (e) {
      e.down = true;
      throw e;
    }
  }

  const down = (res) => res.status(503).json({ error: 'worker_down', message: MSG.down });

  /** Proxy a JSON answer from the worker (status and body as is: the worker's messages are already friendly). */
  async function relay(res, path, opts) {
    try {
      const r = await worker(path, opts);
      const data = await r.json().catch(() => ({}));
      return { status: r.status, data };
    } catch (e) {
      if (e.down) { down(res); return null; }
      throw e;
    }
  }

  // ---------- templates ----------
  app.get('/templates', (req, res) => {
    res.json({ templates: TEMPLATES, limits: { maxMb: MAX_MB, maxS: MAX_S, minS: MIN_S } });
  });

  // ---------- clips ----------
  app.post('/upload', limits.rate(), async (req, res) => {
    const type = String(req.get('content-type') || '').toLowerCase();
    if (!type.startsWith('video/')) { req.resume(); return res.status(415).json({ error: 'bad_type', message: MSG.type }); }
    const len = Number(req.get('content-length') || 0);
    if (len > MAX_MB * 1048576) { req.resume(); res.set('Connection', 'close'); return res.status(413).json({ error: 'too_big', message: MSG.big }); }
    let r;
    try {
      r = await worker('/clips', { method: 'POST', body: Readable.toWeb(req), headers: { 'content-type': type, ...(len ? { 'content-length': String(len) } : {}) }, timeoutMs: 180000 });
    } catch (e) {
      req.resume();
      if (e.down) return down(res);
      throw e;
    }
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  });

  // filming: the 3 abstract sample clips as if uploaded (only with ?demo=hero)
  app.post('/hero-clips', limits.rate(), async (req, res) => {
    if (!demo.isHero(req)) return res.status(403).json({ error: 'hero_only', message: MSG.bad });
    const r = await relay(res, '/clips/sample', { method: 'POST', json: {}, timeoutMs: 60000 });
    if (r) res.status(r.status).json(r.data);
  });
  app.get('/sample/:n', async (req, res) => {
    if (!/^[1-3]$/.test(req.params.n)) return res.status(404).end();
    await streamFrom(req, res, `/samples/${req.params.n}`);
  });

  // ---------- Director plan ----------
  app.post('/plan', limits.rate(), async (req, res) => {
    const { template, clips } = req.body || {};
    if (!byId(template) || !Array.isArray(clips) || clips.length !== 3 || !clips.every((c) => ID_RE.test(c))) return res.status(400).json({ error: 'bad', message: MSG.bad });
    const r = await relay(res, '/plan', { method: 'POST', json: { template, clips } });
    if (r) res.status(r.status).json(r.data);
  });

  // ---------- Captions + Hook agents (Claude via core, picking ids from the vetted banks) ----------
  function readInput(req) {
    const t = byId(req.body?.template);
    const squad = Math.max(2, Math.min(5, Math.round(Number(req.body?.squad)) || 3));
    const durs = (Array.isArray(req.body?.durations) ? req.body.durations : []).slice(0, 3).map((d) => Math.max(1, Math.min(15, Number(d) || 0)));
    return { t, squad, durs: t ? t.shots.map((s, i) => durs[i] || s.seconds) : [] };
  }
  const fits = (l, max, squad) => variants(l.text).every((v) => v.length <= max) && l.text.replaceAll('{n}', String(squad)).length <= max;
  const sourceLabel = (r) => (r.demo ? (r.reason === 'hero' ? 'Demo' : 'Offline') : claude.mode() === 'mock' ? 'Mock' : 'Claude');
  const valid = (id, kind, tpl, shot) => { const l = LINES.get(id); return !!l && l.kind === kind && l.tpl === tpl && (shot === undefined || l.shot === shot); };

  app.post('/captions', limits.guard(), async (req, res) => {
    const { t, squad, durs } = readInput(req);
    if (!t) return res.status(400).json({ error: 'bad', message: MSG.bad });
    const bank = BANKS[t.id];
    const budgets = durs.map(budget);
    const options = [1, 2, 3].map((n) => bank.captions[n].filter((l) => fits(l, budgets[n - 1], squad)));
    const schema = {
      type: 'object',
      properties: {
        shot1: { type: 'string', enum: options[0].map((l) => l.id) },
        shot2: { type: 'string', enum: options[1].map((l) => l.id) },
        shot3: { type: 'string', enum: options[2].map((l) => l.id) },
        post: { type: 'string', enum: bank.posts.map((l) => l.id) },
      },
      required: ['shot1', 'shot2', 'shot3', 'post'],
    };
    const list = (arr) => arr.map((l) => `${l.id}: ${l.text}`).join('\n');
    const t0 = Date.now();
    const r = await demo.wrap(`captions_${t.id}`, { seed: `${t.id}:${squad}:${crypto.randomInt(0, 1000)}`, req }, () => claude.run({
      task: 'reel_captions',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Template: ${t.name} (${t.vibe}). Squad size: ${squad} ({n} in a line becomes ${squad}).\n`
        + t.shots.map((s, i) => `Shot ${i + 1} (${durs[i].toFixed(1)} s): ${s.prompt}\nOptions:\n${list(options[i])}`).join('\n\n')
        + `\n\nPost caption options:\n${list(bank.posts)}\nPick one id per shot and one post id.` }],
      schema,
      maxTokens: 600,
      effort: 'low',
      mock: () => ({ shot1: pickRandom(options[0]).id, shot2: pickRandom(options[1]).id, shot3: pickRandom(options[2]).id, post: pickRandom(bank.posts).id }),
    }));
    // never trust a pick blindly: anything not in this template's bank (or over budget) becomes a random valid line
    const ids = [1, 2, 3].map((n) => { const id = r.data[`shot${n}`]; return valid(id, 'caption', t.id, n) && options[n - 1].some((l) => l.id === id) ? id : pickRandom(options[n - 1]).id; });
    const postId = valid(r.data.post, 'post', t.id) ? r.data.post : pickRandom(bank.posts).id;
    res.json({ captions: ids.map((id) => pub.line(id, squad)), post: pub.line(postId, squad), budgets, source: sourceLabel(r), ms: Date.now() - t0 });
  });

  app.post('/hook', limits.guard(), async (req, res) => {
    const { t, squad } = readInput(req);
    if (!t) return res.status(400).json({ error: 'bad', message: MSG.bad });
    const hooks = BANKS[t.id].hooks.filter((l) => fits(l, 28, squad));
    const t0 = Date.now();
    const r = await demo.wrap(`hook_${t.id}`, { seed: `${t.id}:${squad}:${crypto.randomInt(0, 1000)}`, req }, () => claude.run({
      task: 'reel_hook',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Template: ${t.name} (${t.vibe}). Squad size: ${squad}. First shot: ${t.shots[0].prompt}.\nPick the opening on-screen hook (0-2 s) most likely to stop the scroll.\nOptions:\n${hooks.map((l) => `${l.id} [${l.style}]: ${l.text}`).join('\n')}` }],
      schema: { type: 'object', properties: { hook: { type: 'string', enum: hooks.map((l) => l.id) } }, required: ['hook'] },
      maxTokens: 300,
      effort: 'low',
      mock: () => ({ hook: pickRandom(hooks).id }),
    }));
    const id = valid(r.data.hook, 'hook', t.id) ? r.data.hook : pickRandom(hooks).id;
    const style = LINES.get(id).style;
    res.json({ hook: pub.line(id, squad), style: { id: style, text: STYLE_LABELS[style] }, source: sourceLabel(r), ms: Date.now() - t0 });
  });

  // share card text for a template, as publicText objects (makeShareCard drops plain strings in strict mode)
  app.get('/card', (req, res) => {
    const t = byId(String(req.query.template || ''));
    if (!t) return res.status(400).json({ error: 'bad', message: MSG.bad });
    res.json({ kicker: pub.publicText('orx', 'card_kicker'), title: pub.publicText('o_tpl', { tpl: t.name }), line: pub.publicText('orx', 'card_line') });
  });

  // ---------- render job ----------
  // Queue retries must not burn the visitor's rate limit (CHECK-04 F2), but only with a ticket this server issued to
  // this session on a 503 busy answer (CHECK-04b N2). A made-up or borrowed ticket is rate limited like any call.
  const rate = limits.rate();
  const tickets = new Map(); // ticket -> { sid, until }
  const TICKET_MS = 2 * 60_000; // valid while the phone keeps retrying (it retries every 3-15 s)
  setInterval(() => { const t = Date.now(); for (const [k, v] of tickets) if (v.until < t) tickets.delete(k); }, 60_000).unref();
  const issueTicket = (req) => {
    for (const [k, v] of tickets) if (v.sid === req.sid) { v.until = Date.now() + TICKET_MS; return k; }
    const k = `reel-${crypto.randomBytes(9).toString('hex')}`;
    tickets.set(k, { sid: req.sid, until: Date.now() + TICKET_MS });
    return k;
  };
  const ticketOk = (req) => {
    const v = tickets.get(String(req.get('x-queue-ticket') || ''));
    return !!v && v.sid === req.sid && v.until >= Date.now();
  };
  const renderRate = (req, res, next) => (ticketOk(req) ? next() : rate(req, res, next));
  app.post('/render', renderRate, async (req, res) => {
    const b = req.body || {};
    const t = byId(b.template);
    if (!t || !Array.isArray(b.clips) || b.clips.length !== 3 || !b.clips.every((c) => ID_RE.test(c))) return res.status(400).json({ error: 'bad', message: MSG.bad });
    // ids only: the text burned into the reel is resolved here from the vetted bank, never taken from the phone
    const ids = Array.isArray(b.captionIds) ? b.captionIds.slice(0, 3) : [];
    if (ids.length !== 3 || !ids.every((id, i) => valid(id, 'caption', t.id, i + 1)) || !valid(b.hookId, 'hook', t.id)) return res.status(400).json({ error: 'bad_lines', message: MSG.bad });
    const squad = Math.max(2, Math.min(5, Math.round(Number(b.squad)) || 3));
    const captions = ids.map((id) => pub.line(id, squad).text);
    const hook = pub.line(b.hookId, squad).text;
    const r = await relay(res, '/jobs', { method: 'POST', json: { template: t.id, clips: b.clips, captions, hook, demo: demo.isHero(req) } });
    if (!r) return;
    if (r.status === 503 && r.data.error === 'busy') {
      // kit.api shows its queue screen and retries
      return res.status(503).json({ error: 'busy', message: r.data.message, queue: { ticket: issueTicket(req), ahead: r.data.ahead || 1, retryMs: Math.min(15000, Math.max(3000, r.data.retryMs || 5000)) } });
    }
    if (r.status < 300) { tickets.delete(String(req.get('x-queue-ticket') || '')); analytics.count('reel_render', { tpl: t.id }); analytics.count('reel_squad', { n: squad }); }
    res.status(r.status).json(r.data);
  });

  app.get('/job/:id', async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const since = Math.max(0, Number(req.query.since) || 0);
    const r = await relay(res, `/jobs/${req.params.id}?since=${since}`, { timeoutMs: 8000 });
    if (r) res.status(r.status).json(r.data);
  });

  app.post('/repost/:id', limits.rate(), async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
    const on = req.body?.repost === true;
    const r = await relay(res, `/jobs/${req.params.id}/repost`, { method: 'POST', json: { repost: on } });
    if (!r) return;
    if (r.status === 200 && on) analytics.count('reel_repost_ok');
    res.status(r.status).json(r.data);
  });

  // ---------- files (Range passthrough so iOS Safari can play and seek) ----------
  async function streamFrom(req, res, path, { download = false } = {}) {
    let r;
    try {
      r = await worker(path, { headers: req.get('range') ? { range: req.get('range') } : {}, timeoutMs: 0 });
    } catch (e) {
      if (e.down) return down(res);
      throw e;
    }
    res.status(r.status);
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = r.headers.get(h);
      if (v) res.set(h, v);
    }
    res.set('Cache-Control', 'private, max-age=3600');
    if (download && r.status < 300) res.set('Content-Disposition', 'attachment; filename="zenith-squad-reel.mp4"');
    if (!r.body) return res.end();
    const body = Readable.fromWeb(r.body);
    req.on('close', () => body.destroy());
    await pipeline(body, res).catch(() => { /* client went away mid-video: normal */ });
  }
  app.get('/file/:id', async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
    await streamFrom(req, res, `/files/${req.params.id}`, { download: req.query.dl === '1' });
  });
  app.get('/cover/:id', async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
    await streamFrom(req, res, `/files/${req.params.id}/cover.jpg`);
  });

  // ---------- staff: reels the squad allowed Zenith to repost (ADMIN_KEY) ----------
  app.get('/staff/reposts', async (req, res) => {
    // core's ctx.admin.check (staff cookie or ADMIN_KEY); env fallback for an older core
    const want = process.env.ADMIN_KEY || '';
    const given = String(req.query.key || '');
    const ok = admin?.check ? admin.check(req) : want && given.length === want.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
    if (!ok) return res.status(403).json({ error: 'forbidden' });
    res.set('Cache-Control', 'no-store');
    const r = await relay(res, '/reposts');
    if (!r) return;
    res.json({ reels: (r.data.reels || []).map((x) => ({ ...x, url: `${config.publicUrl}/api/reel/file/${x.id}?dl=1` })) });
  });
}
