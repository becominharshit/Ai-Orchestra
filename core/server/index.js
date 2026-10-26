// play-zenith server. One Node process serves the hub, the shared web kit, every experience and the TV views.
//   npm run dev       live Claude (needs ANTHROPIC_API_KEY in .env), restarts on server file changes
//   npm run mock      CLAUDE_MOCK=1: canned schema-shaped answers, no key needed
//   npm run offline   DEMO_MODE=1 OFFLINE=1: fixtures only, no outbound network at all
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { makeConfig, ROOT, FLAGGED } from './config.js';
import { createClaude, DemoFallback } from './claude.js';
import { createLimits, sessionCookie, staffToken, isStaff, clientIp } from './limits.js';
import { createAnalytics, EVENTS } from './analytics.js';
import { createBus } from './bus.js';
import { createDemo } from './demo.js';
import { adminPage } from './admin.js';
import { createSafety } from './safety.js';
import { createStage } from './stage.js';
import { createPages } from './pages.js';
import { createBucketStore } from './bucket.js';

const WEB = path.join(ROOT, 'core', 'web');
const DEFAULT_EXP_DIR = path.join(ROOT, 'experiences');

export const FRIENDLY = {
  oops: 'Kuch gadbad ho gayi. Ek baar phir try karo.',
  notFound: 'Yeh page abhi ban raha hai. Hub pe wapas jao.',
};

function makeLogger(quiet) {
  return (obj) => { if (!quiet) process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n'); };
}

// In offline mode nothing may leave this machine. Guard fetch (the SDKs use it) for non-local hosts.
function blockOutboundFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://localhost');
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
      return Promise.reject(new Error(`offline mode: blocked outbound request to ${url.hostname}`));
    }
    return real(input, init);
  };
}

function keyOk(given, want) {
  if (!want || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(want));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Route shape for logs: { exp, p } with p the matched route's own pattern (e.g. /reading, /turn/:id/end)
// and exp the experience whose router matched (mounts are static /api/<exp>, so no visitor value can
// appear). No route: { p: 'unmatched' }; a non-string pattern: 'route'. Never a raw path or query.
const SHAPE_OK = /^[A-Za-z0-9/_:.\-]{1,120}$/;
export function routeShape(req) {
  if (req.pzShape) return req.pzShape;
  const r = req.route;
  if (!r) return { p: 'unmatched' };
  const pat = typeof r.path === 'string' && SHAPE_OK.test(r.path) ? r.path : 'route';
  const exp = /^\/api\/([a-z0-9_-]{1,32})$/i.exec(req.baseUrl || '')?.[1];
  return exp ? { exp: exp.toLowerCase(), p: pat } : { p: pat };
}

export async function createServer(overrides = {}, { claudeClient = null, expDir = DEFAULT_EXP_DIR, log: logFn = null, spendStore = null } = {}) {
  const EXP_DIR = expDir; // tests may point this at a temp folder of fake experiences
  const config = makeConfig(overrides);
  const log = logFn || makeLogger(overrides.PZ_QUIET === '1' || process.env.PZ_QUIET === '1');
  if (config.offline) blockOutboundFetch();

  const analytics = createAnalytics({ config, log });
  if (!fs.existsSync(path.join(config.dataDir, 'analytics.json'))) await analytics.pullBucket();
  const claude = createClaude({ config, client: claudeClient, log, onEvent: (exp, ev) => analytics.inc(exp, ev) });
  // CHECK-21 L4: the spend meter (total, per IST day, per experience) lives in the bucket too, so the global cap and the
  // daily budgets hold across redeploys (the container disk does not survive one). Restored at boot, merged by max.
  const spendBucket = spendStore || createBucketStore(config, 'play-web/spend.json', { log });
  // N21b: if the bucket cannot be read at boot, spend does NOT silently start from the local disk: the cap drops to half of
  // what is left, nothing is pushed (it would overwrite the real totals), the read is retried, and after 60 s staff get
  // an alert. When the bucket answers, the totals are merged and the configured cap comes back.
  const fullCap = claude.spend.capUsd;
  let spendRestored = false;
  let restoreTimer = null;
  const bootAt = Date.now();
  let spendAlerted = false;
  const tryRestore = async () => {
    try {
      const remote = await spendBucket.get();
      if (remote) { claude.spend.merge(remote); log({ kind: 'claude', msg: 'spend restored from bucket' }); }
      spendRestored = true;
      claude.spend.capUsd = fullCap;
      if (restoreTimer) { clearInterval(restoreTimer); restoreTimer = null; }
      return true;
    } catch (e) {
      log({ kind: 'claude', msg: 'spend restore failed', err: e?.name });
      // no earlier total known (fresh disk): a fixed small cap, since real spend so far is unknown; else half of what is left
      claude.spend.capUsd = claude.spend.fromDisk
        ? Math.min(fullCap, claude.spend.totalUsd + Math.max(0, fullCap - claude.spend.totalUsd) * 0.5)
        : Math.min(fullCap, config.spendUnknownCapUsd ?? 75);
      if (!spendAlerted && Date.now() - bootAt >= (config.spendRestoreAlertMs ?? 60000)) { spendAlerted = true; safety.raise('core', 0, null, 'spend'); }
      return false;
    }
  };
  if (!(await tryRestore())) { restoreTimer = setInterval(tryRestore, config.spendRestoreRetryMs ?? 10000); restoreTimer.unref?.(); }
  let spendPushed = '';
  const pushSpend = async () => {
    if (!spendRestored) return; // never overwrite the bucket's totals with a partial local view
    const snap = claude.spend.snapshot(); const key = `${snap.totalUsd}:${snap.calls}`; if (key === spendPushed) return;
    try { if (await spendBucket.put(snap)) spendPushed = key; } catch (e) { log({ kind: 'claude', msg: 'spend push failed', err: e?.name }); }
  };
  const spendTimer = setInterval(pushSpend, Math.min(config.snapshotMs || 30000, 30000));
  spendTimer.unref?.();
  const limits = createLimits({ config });
  const safety = createSafety({ config, claude, analytics, log });
  const pages = createPages({ config, safety, log });
  const bus = createBus({ config, log, safety });
  const stage = createStage({ config, analytics, bus, safety, log });
  safety.setOnCare((sid, exp) => { bus.dropSession(sid); analytics.inc(exp, 'care_shown'); });
  safety.setNicknameCheck((n) => stage.isKnownNickname(n));
  bus.setStage(stage);
  const demo = createDemo({ config, analytics, log });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // exactly one hop: the Lightsail load balancer (limits.clientIp reads the last XFF entry)

  // Security headers. CSP = self only: no CDN, no third-party scripts, no Instagram calls from the page.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    next();
  });
  app.use(sessionCookie());

  // Access log: method, matched route shape (exp + pattern, e.g. /api/core/stage/turn/:id/end or jyotish /reading), status, ms.
  // Never a raw path, path parameter, query string or body: an unmatched request logs as 'unmatched'.
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path.endsWith('/stream')) return next();
    const t0 = Date.now();
    res.on('finish', () => log({ kind: 'http', m: req.method, ...routeShape(req), s: res.statusCode, ms: Date.now() - t0 }));
    next();
  });

  app.use('/api', express.json({ limit: '4mb' }));

  // ---------- health ----------
  const started = Date.now();
  const loaded = [];
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  // Reel worker health (TASK-04): GET <REEL_WORKER_URL>/healthz, 3 s timeout, cached 15 s. null when not configured.
  let reelCache = { at: 0, value: null, pending: null };
  async function reelWorkerStatus() {
    if (!config.reelWorkerUrl) return null;
    if (Date.now() - reelCache.at < 15000) return reelCache.value;
    reelCache.pending ||= (async () => {
      const t0 = Date.now();
      let ok = false;
      try {
        const r = await fetch(`${config.reelWorkerUrl}/healthz`, { signal: AbortSignal.timeout(3000) });
        ok = r.ok;
      } catch { ok = false; }
      reelCache = { at: Date.now(), value: { ok, ms: Date.now() - t0 }, pending: null };
      return reelCache.value;
    })();
    return reelCache.pending;
  }

  app.get('/status.json', async (req, res) => {
    const c = claude.status();
    const reelWorker = await reelWorkerStatus();
    res.json({
      ok: true, version: config.version, commit: config.commit,
      demo: config.demoMode, offline: config.offline, mock: config.mock, claude: c.mode, model: config.model,
      spentUsd: c.spentUsd, capUsd: c.capUsd, calls: c.calls,
      limits: limits.status(), experiences: loaded, uptimeS: Math.round((Date.now() - started) / 1000), reelWorker,
      safetyMode: safety.safetyMode(), careLive: safety.liveStats(), budgets: c.budgets, flags: config.flags,
    });
  });

  // ---------- core api ----------
  const publicCfg = () => ({
    publicUrl: config.publicUrl, demo: config.demoMode, offline: config.offline, mock: config.mock,
    igUrl: 'https://instagram.com/zenith_school_of_ai', handle: '@zenith_school_of_ai', site: 'play.zenithschool.ai',
    publicTextStrict: config.publicTextStrict,
    stage: config.stage,
    heroLine: config.publicHeroLine,
    heroLineHi: config.publicHeroLineHi,
    safetyMode: safety.safetyMode(), // 'live' | 'degraded' (no live AI crisis check): experiences can adapt
    counters: Object.fromEntries(config.experiences.map((e) => [e.id, e.counters])), // counter map v4 for phone labels
  });
  app.get('/api/core/config', (req, res) => res.set('Cache-Control', 'no-store').json(publicCfg()));
  app.get('/api/core/experiences', (req, res) => {
    res.json(config.experiences.map((e) => ({
      ...e,
      ready: fs.existsSync(path.join(EXP_DIR, e.id, 'web', 'index.html')),
      tvHook: fs.existsSync(path.join(EXP_DIR, e.id, 'web', 'tv.js')),
    })));
  });
  // CHANGE-02 flags (CHECK-20 F4): a flagged experience that is off does not exist anywhere: its meta is 404, and its
  // phone and TV URLs redirect to the experience the counter map gives that counter (Jyotish for 2, Career for 4), so a
  // counter TV set to /tv/startup?c=2 reverts on its own at a no-go.
  const flagIsOn = (id) => (id === 'startup' ? !!config.flags?.startupStudio : id === 'agent' ? !!config.flags?.agentBuilder : true);
  const FLAG_HOME = { startup: 2, agent: 4 };
  const fallbackFor = (id, cRaw) => {
    const asked = Number(cRaw);
    const c = Number.isInteger(asked) && asked >= 1 && asked <= 8 ? asked : FLAG_HOME[id];
    const owner = config.experiences.find((e) => e.counters.includes(c)) || config.experiences.find((e) => e.counters.includes(FLAG_HOME[id]));
    return { exp: owner.id, c };
  };
  const flagRedirect = (tv) => (req, res, next) => {
    const id = String(req.params.exp || '').toLowerCase();
    if (!FLAGGED[id] || flagIsOn(id)) return next();
    const { exp, c } = fallbackFor(id, req.query.c);
    const q = new URLSearchParams(req.query);
    q.set('c', String(c));
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).redirect(302, tv ? `/tv/${exp}?${q}` : `/${exp}/?${q}`);
  };
  app.get(['/:exp', '/:exp/', '/:exp/index.html'], flagRedirect(false));
  app.get('/tv/:exp', flagRedirect(true));
  app.get('/api/core/exp/:exp', (req, res) => {
    const id = req.params.exp;
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(id) || !fs.existsSync(path.join(EXP_DIR, id)) || (FLAGGED[id] && !flagIsOn(id))) return res.status(404).json({ error: 'not_found' });
    // Name/hook come from the hub list in config.js, else from experiences/<id>/meta.json, else the id.
    let own = {};
    try { own = JSON.parse(fs.readFileSync(path.join(EXP_DIR, id, 'meta.json'), 'utf8')); } catch { /* optional */ }
    const meta = { id, name: id, counters: [], hook: '', ...own, ...(config.experiences.find((e) => e.id === id) || {}) };
    res.json({ ...meta, tvHook: fs.existsSync(path.join(EXP_DIR, id, 'web', 'tv.js')), hero: !!demo.hero(id) });
  });

  // Anonymous counters: { exp, event } only. Max 60 per session per minute.
  const trackHits = new Map();
  setInterval(() => trackHits.clear(), 60000).unref();
  app.post('/api/core/track', (req, res) => {
    const { exp, event, dim } = req.body || {};
    const n = (trackHits.get(req.sid) || 0) + 1;
    trackHits.set(req.sid, n);
    if (n > 60) return res.status(429).json({ ok: false });
    if (typeof exp !== 'string' || typeof event !== 'string') return res.status(400).json({ ok: false, error: 'bad_event' });
    // Client-trackable events only (CHECK-12 F2): reward_given, care_shown, fallback, lead_*, wa_* and extras declared
    // { serverOnly: true } are counted by server code, never by a phone.
    if (!analytics.clientTrackable(exp, event)) return res.status(400).json({ ok: false, error: 'server_only' });
    // Standard events, or extra events the experience declared on the server (analytics.declare). Validated, counts only.
    const ok = EVENTS.includes(event) ? analytics.inc(exp, event) : analytics.count(exp, event, dim);
    res.status(ok ? 200 : 400).json({ ok });
  });

  // Live bus
  app.post('/api/core/bus/:exp/:c', (req, res) => {
    const { sid, events } = req.body || {};
    if (typeof sid !== 'string' || sid.length > 64) return res.status(400).json({ error: 'bad_sid' });
    const r = bus.publish(req.params.exp, req.params.c, sid, events, { session: req.sid, ip: clientIp(req) });
    if (r.limited) return res.status(429).set('Retry-After', '60').json({ ...r, error: 'slow_down', retryMs: 60000 });
    res.json(r);
  });
  app.get('/api/core/bus/:exp/:c/stream', (req, res) => {
    if (!config.experiences.some((e) => e.id === req.params.exp) && !loaded.includes(req.params.exp)) return res.status(404).end();
    bus.subscribe(req.params.exp, req.params.c, req, res);
  });
  // TV staff actions (pin, clear, hide anchor card) need a staff browser (pz_staff cookie from /admin/staff) or the
  // admin key in x-admin-key, AND the channel token. The token alone is public (every TV stream carries it).
  const staffOrKey = (req, res, next) => (isStaff(req, config.adminKey) || keyOk(req.headers['x-admin-key'], config.adminKey)
    ? next() : res.status(403).json({ ok: false, error: 'staff_only', message: 'Is TV pe ek baar /staff kholo aur pairing code daalo.' }));
  // Staff: wipe this TV now (key B on the TV page sends its channel token)
  app.post('/api/core/bus/:exp/:c/clear', staffOrKey, (req, res) => {
    const r = bus.clear(req.params.exp, req.params.c, req.body?.token);
    res.status(r.ok ? 200 : 403).json(r);
  });
  // ---------- stage mode (CONTRACT 12) ----------
  const knownChannel = (exp, c) => (config.experiences.some((e) => e.id === exp) || loaded.includes(exp)) && Number.isInteger(Number(c)) && Number(c) >= 0 && Number(c) <= 99;
  // WARN-A: offers cost memory, so the route is rate limited per session and per IP (a stall shares a few IPs)
  const nickHits = { sid: new Map(), ip: new Map() };
  setInterval(() => { nickHits.sid.clear(); nickHits.ip.clear(); }, 60000).unref();
  const NICK_PER_SESSION = 20;
  const NICK_PER_IP = 300;
  app.get('/api/core/stage/nicknames', (req, res) => {
    const ip = clientIp(req);
    const a = (nickHits.sid.get(req.sid) || 0) + 1; nickHits.sid.set(req.sid, a);
    const b = (nickHits.ip.get(ip) || 0) + 1; nickHits.ip.set(ip, b);
    if (a > NICK_PER_SESSION || b > NICK_PER_IP) return res.status(429).set('Retry-After', '60').json({ error: 'slow_down', retryMs: 60000, message: 'Itni speed! Ek minute mein phir naam chuno.' });
    res.json({ options: stage.offer(req.sid) });
  });
  app.post('/api/core/stage/nickname', (req, res) => {
    const nickname = stage.choose(req.sid, req.body?.id);
    if (!nickname) return res.status(400).json({ ok: false, error: 'pick_one', message: 'Teen naam mein se ek chuno.' });
    res.json({ ok: true, nickname });
  });
  app.post('/api/core/stage/queue', limits.rate(), (req, res) => {
    const { exp, c } = req.body || {};
    if (!knownChannel(exp, c)) return res.status(404).json({ ok: false, reason: 'unknown_counter' });
    const r = stage.join(exp, Number(c), req.sid);
    res.status(r.ok ? 200 : r.reason === 'full' ? 409 : 400).json(r);
  });
  app.get('/api/core/stage/queue/:ticket', (req, res) => res.json(stage.status(req.params.ticket, req.sid)));
  app.post('/api/core/stage/turn/:id/end', (req, res) => {
    const t = stage.turnOf(req.sid);
    if (!t || t.id !== req.params.id) return res.json({ ok: true });
    stage.endTurn(t.id, 'end');
    res.json({ ok: true });
  });
  app.get('/api/core/stage/:exp/:c', (req, res) => {
    if (!knownChannel(req.params.exp, req.params.c)) return res.status(404).json({ error: 'unknown_counter' });
    res.set('Cache-Control', 'no-store').json(stage.tvData(req.params.exp, req.params.c));
  });
  // the TV itself (staff key A): staff browser + its channel token
  app.post('/api/core/stage/:exp/:c/tv/hide', staffOrKey, (req, res) => {
    if (!bus.tokenOk(req.params.exp, req.params.c, req.body?.token)) return res.status(403).json({ ok: false });
    res.json(stage.op(req.params.exp, req.params.c, 'hide', { hidden: req.body?.hidden !== false }));
  });

  // ---------- care path (CONTRACT 13.3) ----------
  // The phone shows the support card and tells core: count it, raise the quiet operator alert, wipe the TV.
  const careRaise = (exp, c, sid) => { const fresh = safety.raise(exp, c, sid); bus.dropSession(sid); return fresh; };
  app.post('/api/core/care', (req, res) => {
    const exp = typeof req.body?.exp === 'string' && (config.experiences.some((e) => e.id === req.body.exp) || loaded.includes(req.body.exp)) ? req.body.exp : 'core';
    const c = Number(req.body?.c) || 0;
    if (careRaise(exp, c, req.sid)) analytics.inc(exp, 'care_shown');
    res.json({ ok: true });
  });
  const staffOnly = (req, res, next) => (isStaff(req, config.adminKey) ? next() : res.status(403).json({ error: 'staff_only', message: 'Staff phone chahiye: /staff pe pairing code daalo' }));
  app.get('/api/core/ops/:exp/:c', staffOnly, (req, res) => res.json({ alerts: safety.alertsFor(req.params.exp, req.params.c), stage: stage.opView(req.params.exp, req.params.c) }));
  app.post('/api/core/ops/:exp/:c/stage/:action', staffOnly, (req, res) => {
    if (!knownChannel(req.params.exp, req.params.c)) return res.status(404).json({ ok: false });
    const r = stage.op(req.params.exp, req.params.c, req.params.action, req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.post('/api/core/ops/:exp/:c/alerts/:id/dismiss', staffOrKey, (req, res) => { safety.dismiss(req.params.exp, req.params.c, req.params.id); res.json({ ok: true }); });
  // all-counters safety panel (one "safety lead" phone): care and filter alerts from every counter, time, counter,
  // experience and kind only. Staff browser (paired at /staff) or the admin key in x-admin-key.
  const expName = (id) => config.experiences.find((e) => e.id === id)?.name || id;
  app.get('/api/core/ops/alerts', staffOrKey, (req, res) => res.set('Cache-Control', 'no-store').json({ alerts: safety.allAlerts().map((a) => ({ id: a.id, at: a.at, kind: a.kind, exp: a.exp, name: expName(a.exp), c: a.c, ...(a.ref ? { ref: a.ref } : {}) })), safetyMode: safety.safetyMode() }));
  app.get('/admin/alerts', (req, res) => {
    staffHeaders(res);
    if (!isStaff(req, config.adminKey) && !keyOk(req.query.key, config.adminKey)) return res.status(403).type('html').send(staffPage('Staff only', '<p class="pz-dim">Pehle is phone ko staff banao: admin se pairing code lo aur <b>/staff</b> pe daalo.</p>', '<a class="pz-btn block" href="/staff">Code daalo</a>'));
    res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Safety alerts</title><link rel="stylesheet" href="/core/tokens.css"><link rel="stylesheet" href="/core/alerts.css"><body class="stage pz-alerts"><main><div class="pz-kicker">Safety lead</div><h1 class="pz-display">Alerts, every counter</h1><p class="pz-dim" data-pz="alerts-mode"></p><button class="pz-btn ghost" type="button" data-pz="alerts-sound">Sound + vibration: off</button><ul class="pz-alerts-list" data-pz="alerts-list"></ul><p class="pz-dim pz-alerts-empty" data-pz="alerts-empty">Abhi koi alert nahi.</p></main><script type="module" src="/core/alerts.js"></script></body>`);
  });

  app.post('/api/core/bus/:exp/:c/pin', staffOrKey, (req, res) => {
    const r = bus.pin(req.params.exp, req.params.c, req.body?.token, req.body?.pin);
    res.status(r.ok ? 200 : 403).json(r);
  });

  // Hero profile (fictional, for filming): only the profile, the fixtures stay server-side.
  app.get('/api/core/hero/:exp', (req, res) => {
    const h = demo.hero(req.params.exp);
    if (!h) return res.status(404).json({ error: 'no_hero' });
    res.json({ profile: h.profile || {}, label: h.label || 'Demo profile (fictional)' });
  });

  // ---------- admin ----------
  const needKey = (req, res, next) => {
    if (!config.adminKey) return res.status(403).type('text').send('Admin is off: set ADMIN_KEY in the environment.');
    if (!keyOk(req.query.key, config.adminKey)) return res.status(403).type('text').send('Wrong or missing key.');
    res.set('Cache-Control', 'no-store');
    next();
  };
  app.get('/admin', needKey, (req, res) => {
    res.type('html').send(adminPage({ snap: analytics.snapshot(), claude: claude.status(), limits: limits.status(), config, events: EVENTS, key: req.query.key, bus: bus.status(), staff: isStaff(req, config.adminKey), cleared: typeof req.query.cleared === 'string' ? req.query.cleared.slice(0, 40) : '' }));
  });
  // ---------- staff devices (CONTRACT 5): pairing codes, so the admin key never lands in a TV's or phone's history ----------
  // On /admin (with the key) "Pair a staff device" makes a 6-digit code (10 min, single use). The TV or phone opens
  // /staff and types it: it gets the same 4-day HttpOnly pz_staff cookie (no rate limit, TV keys P/B/A, op view).
  const pairCodes = new Map(); // code -> expires (ms)
  const PAIR_TTL = Number.isFinite(config.staffPairTtlMs) ? config.staffPairTtlMs : 10 * 60 * 1000;
  const pairTries = new Map(); // ip -> [ms]
  const PAIR_TRIES = 10; // wrong or right, per IP per 10 minutes
  const sweepPairs = () => { const t = Date.now(); for (const [c, exp] of pairCodes) if (exp <= t) pairCodes.delete(c); };
  const staffCookie = (req, off) => (off ? 'pz_staff=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    : `pz_staff=${staffToken(config.adminKey)}; Path=/; Max-Age=${60 * 60 * 24 * 4}; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
  const staffHeaders = (res) => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  const staffPage = (title, body, extra = '') => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff</title><link rel="stylesheet" href="/core/tokens.css"><body class="stage pz-center"><main class="pz-card" style="max-width:420px;width:calc(100% - 32px);text-align:center"><div class="pz-kicker">Staff</div><h1 class="pz-display" style="font-size:34px;margin:8px 0 12px">${title}</h1>${body}${extra}</main></body>`;
  app.post('/admin/pair', needKey, (req, res) => {
    sweepPairs();
    if (pairCodes.size >= 20) return res.status(429).type('html').send(staffPage('Thoda ruko', '<p class="pz-dim">20 codes abhi khule hain. 10 minute mein purane khatam ho jayenge.</p>'));
    let code;
    do code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); while (pairCodes.has(code));
    pairCodes.set(code, Date.now() + PAIR_TTL);
    staffHeaders(res).type('html').send(staffPage('Pair a staff device',
      `<p class="pz-dim">TV ya staff phone pe <b>/staff</b> kholo aur yeh code daalo. ${Math.round(PAIR_TTL / 60000)} minute tak, sirf ek baar.</p><div data-pz="pair-code" style="font-family:var(--font-mono);font-weight:800;font-size:56px;letter-spacing:0.18em;margin:18px 0">${code}</div>`,
      `<a class="pz-btn ghost block" href="/admin?key=${encodeURIComponent(req.query.key)}">Admin pe wapas</a>`));
  });
  const staffForm = (msg = '') => staffPage('Staff device', `<p class="pz-dim">Admin page pe "Pair a staff device" se mila 6-digit code daalo.</p>${msg}<form method="post" action="/staff" style="display:grid;gap:12px;margin-top:12px"><input class="pz-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-label="Pairing code" data-pz="staff-code" data-care-net="off" style="font-family:var(--font-mono);font-size:28px;letter-spacing:0.3em;text-align:center"><button class="pz-btn block" type="submit" data-pz="staff-pair">Pair karo</button></form>`);
  app.get('/staff', (req, res) => staffHeaders(res).type('html').send(staffForm()));
  app.post('/staff', express.urlencoded({ extended: false, limit: '1kb' }), (req, res) => {
    staffHeaders(res);
    const ip = clientIp(req);
    const t = Date.now();
    const tries = (pairTries.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (tries.length >= PAIR_TRIES) return res.status(429).set('Retry-After', '600').type('html').send(staffForm('<p class="pz-err" data-pz="staff-msg">Bahut koshish ho gayi. 10 minute baad phir try karo.</p>'));
    tries.push(t);
    pairTries.set(ip, tries);
    if (pairTries.size > 5000) pairTries.delete(pairTries.keys().next().value);
    sweepPairs();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    if (code.length !== 6 || !pairCodes.has(code)) return res.status(403).type('html').send(staffForm('<p class="pz-err" data-pz="staff-msg">Code galat hai ya expire ho gaya. Admin se naya code lo.</p>'));
    pairCodes.delete(code); // single use
    res.append('Set-Cookie', staffCookie(req, false));
    res.type('html').send(staffPage('Staff device ready', '<p class="pz-dim" data-pz="staff-msg">Is browser mein 4 din tak staff mode: rate limit nahi, TV keys P, B, A aur operator view chalenge.</p>', '<a class="pz-btn block" href="/">Hub pe jao</a>'));
  });
  app.get('/staff/off', (req, res) => {
    staffHeaders(res).append('Set-Cookie', staffCookie(req, true));
    res.type('html').send(staffPage('Staff mode off', '<p class="pz-dim">Yeh browser ab normal visitor jaisa hai.</p>', '<a class="pz-btn block" href="/">Hub pe jao</a>'));
  });
  app.get('/staff/done', (req, res) => staffHeaders(res).type('html').send(staffPage(isStaff(req, config.adminKey) ? 'Staff device ready' : 'Staff mode off', `<p class="pz-dim">${isStaff(req, config.adminKey) ? 'Is browser mein 4 din tak staff mode.' : 'Yeh browser ab normal visitor jaisa hai.'}</p>`, '<a class="pz-btn block" href="/">Hub pe jao</a>')));
  // Fallback: /admin/staff?key=... still works but redirects at once, so the key does not stay in the URL bar or
  // history entry for long and is never sent on as a referrer. ?off=1 removes the cookie.
  app.get('/admin/staff', needKey, (req, res) => {
    staffHeaders(res).append('Set-Cookie', staffCookie(req, req.query.off === '1'));
    res.redirect(303, '/staff/done');
  });
  // Staff: "Clear counter N" buttons on /admin (a plain form post, key-gated)
  app.post('/admin/clear', express.urlencoded({ extended: false, limit: '2kb' }), needKey, (req, res) => {
    const exp = String(req.body?.exp || '');
    const c = String(req.body?.c || '');
    const meta = config.experiences.find((e) => e.id === exp);
    const known = meta ? meta.counters.includes(Number(c)) : bus.status().some((x) => x.channel === `${exp}:${Number(c)}`);
    if (!known) return res.status(404).type('text').send('No such counter for this experience.');
    const r = bus.clear(exp, c, null, true);
    if (!r.ok) return res.status(404).type('text').send('No such counter for this experience.');
    res.redirect(303, `/admin?key=${encodeURIComponent(req.query.key)}&cleared=${encodeURIComponent(`${exp}:${c}`)}`);
  });
  app.get('/admin/public-text', needKey, (req, res) => res.json(safety.stats()));
  app.get('/admin/stats.json', needKey, (req, res) => res.json({ ...analytics.snapshot(), claude: claude.status() }));
  app.get('/admin/export.csv', needKey, (req, res) => {
    res.type('text/csv').set('Content-Disposition', 'attachment; filename="play-zenith-analytics.csv"').send(analytics.csv());
  });

  // ---------- pages ----------
  app.get('/', (req, res) => res.sendFile(path.join(WEB, 'hub.html')));
  // Zenith shield (from print/assets/logo/zenith_shield.png, 64x64) so pages stop logging a 404
  app.get('/favicon.ico', (req, res) => res.set('Cache-Control', 'public, max-age=86400').sendFile(path.join(WEB, 'favicon.ico')));
  app.get('/tv/:exp', (req, res) => res.sendFile(path.join(WEB, 'tv.html')));
  app.use('/core', express.static(WEB, { maxAge: config.production ? '10m' : 0, index: false }));

  // ---------- public short links (/p/:token, /stop) ----------
  // Experiences register top-level handlers with ctx.publicRoute(path, handler). These URLs carry private
  // tokens, so they are never written to any log (not even on error), never cached and never sent as a referrer.
  const PUBLIC_PATHS = ['/p/:token', '/stop'];
  const publicRouter = express.Router();
  publicRouter.use(express.json({ limit: '64kb' }), express.urlencoded({ extended: false, limit: '64kb' }));
  const publicOwners = new Map();
  // Match the way Express routes (case-insensitive, trailing slash optional): /P/x, /STOP and /stop/ count too.
  const pubShape = (p) => { const q = String(p).toLowerCase().replace(/\/+$/, ''); return q === '/stop' ? '/stop' : q.startsWith('/p/') ? '/p/:token' : null; };
  const isPublic = (p) => pubShape(p) !== null;
  app.use((req, res, next) => {
    if (!isPublic(req.path)) return next();
    req.pzPublic = true;
    res.set({ 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    next();
  }, publicRouter);
  function publicRoute(exp, routePath, ...handlers) {
    if (!PUBLIC_PATHS.includes(routePath)) throw new Error(`publicRoute: only ${PUBLIC_PATHS.join(' and ')} are available, not ${routePath}`);
    if (publicOwners.has(routePath)) throw new Error(`publicRoute: ${routePath} is already taken by ${publicOwners.get(routePath)}`);
    publicOwners.set(routePath, exp);
    publicRouter.all(routePath, ...handlers);
  }

  // ---------- public pages /<letter>/:code (CONTRACT 14) ----------
  const pageHeaders = (res, cache) => res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': cache });
  const pageMsg = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Ideas 4.0</title><link rel="stylesheet" href="/core/tokens.css"><body class="stage pz-center"><main class="pz-card" style="max-width:420px;width:calc(100% - 32px);text-align:center"><div class="pz-kicker">Zenith School of AI · Ideas 4.0</div><h1 class="pz-display" style="font-size:30px;margin:8px 0 12px">${title}</h1><p class="pz-dim">${body}</p><a class="pz-btn block" href="/">Khud try karo</a></main></body>`;
  const pageRoute = (req, res, next) => {
    const fam = pages.families.get(String(req.params.prefix || '').toLowerCase());
    if (!fam) return next();
    req.pzPage = { prefix: String(req.params.prefix).toLowerCase(), code: String(req.params.code || '').toUpperCase(), fam };
    next();
  };
  const pageReports = new Map(); // ip -> [ms]
  // guessing codes: at most 30 not-found answers per IP per 10 minutes, then 429
  const page404 = new Map(); // ip -> [ms]
  const notFound = (req, res) => {
    const ip = clientIp(req);
    const t = Date.now();
    const hits = (page404.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    hits.push(t);
    page404.set(ip, hits);
    if (page404.size > 5000) page404.delete(page404.keys().next().value);
    if (hits.length > 30) return pageHeaders(res, 'no-store').status(429).set('Retry-After', '600').type('html').send(pageMsg('Thoda ruko', 'Bahut saare galat links. 10 minute baad phir try karo.'));
    return pageHeaders(res, 'no-store').status(404).type('html').send(pageMsg('Yeh page nahi mila', 'Link check karo, ya stall pe apna khud ka banao.'));
  };
  app.get('/:prefix/:code', pageRoute, (req, res, next) => {
    if (!req.pzPage) return next();
    const { prefix, code } = req.pzPage;
    // every stored field is checked (code, prefix, experience, dates, counter); a bad entry is a clean 404, never a 500
    const { state, p } = pages.lookup(prefix, code);
    if (state === 'expired') return pageHeaders(res, 'no-store').status(410).type('html').send(pageMsg('Yeh page expire ho gaya', 'Ideas 4.0 ke pages kuch din ke liye live rehte hain.'));
    if (state !== 'ok') return notFound(req, res);
    const html = pages.render(p);
    if (!html) return notFound(req, res);
    // short cache so a takedown is visible quickly
    pageHeaders(res, 'private, max-age=15').type('html').send(html);
  });
  app.post('/:prefix/:code/report', express.urlencoded({ extended: false, limit: '1kb' }), pageRoute, (req, res, next) => {
    if (!req.pzPage) return next();
    const { prefix, code } = req.pzPage;
    const { state, p } = pages.lookup(prefix, code);
    if (state !== 'ok') return notFound(req, res); // removed, expired or bad: no alert; misses share the GET not-found budget (N11)
    pageHeaders(res, 'no-store');
    const ip = clientIp(req);
    const t = Date.now();
    const hits = (pageReports.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (hits.length < 5) {
      hits.push(t);
      pageReports.set(ip, hits);
      if (pageReports.size > 5000) pageReports.delete(pageReports.keys().next().value);
      // a staff alert: time, counter, experience, kind and the page path only (never who reported)
      safety.raise(p.exp, p.c, `report:${prefix}:${code}`, 'report', `/${prefix}/${code}`);
    }
    res.type('html').send(pageMsg('Shukriya', 'Staff is page ko dekhega. Zaroorat hui toh hata dega.'));
  });
  // staff: take a page down at once (after a report)
  app.post('/api/core/ops/pages/:prefix/:code/remove', staffOrKey, (req, res) => {
    if (!pages.families.has(req.params.prefix) || !pages.removePage(req.params.prefix, req.params.code)) return res.status(404).json({ ok: false });
    res.json({ ok: true });
  });

  // ---------- experiences ----------
  const dirs = fs.existsSync(EXP_DIR) ? fs.readdirSync(EXP_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const safeConfig = Object.freeze({ ...config, apiKey: undefined, adminKey: undefined, bucketKeyId: undefined, bucketKeySecret: undefined });
  for (const id of dirs) {
    if (!/^[a-z_][a-z0-9_-]{0,30}$/.test(id)) continue;
    if (FLAGGED[id] && !flagIsOn(id)) { log({ kind: 'boot', exp: id, skipped: `${FLAGGED[id]} is off` }); continue; } // CHANGE-02: behind a flag, default off
    const dir = path.join(EXP_DIR, id);
    analytics.allowExp(id);
    bus.allowExp(id);
    demo.loadDir(id, dir);
    const router = express.Router();
    // CHECK-21 L3: core's order is care first, then everything else. Every POST/PUT/PATCH body to an experience runs
    // the care rules before any of its routes (and before any mode gate, chips-only refusal or validation), so a
    // crisis line always gets the care card, in every mode.
    router.use((req, res, next) => {
      if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !req.body || typeof req.body !== 'object') return next();
      if (!safety.care.detectDeep(req.body)) return next();
      const c = Number(req.headers['x-pz-counter'] ?? req.body?.c ?? 0) || 0;
      if (careRaise(id, c, req.sid)) analytics.inc(id, 'care_shown');
      return safety.careResponse(res);
    });
    const ctx = {
      exp: id,
      dir,
      app: router,
      config: safeConfig,
      log: (o) => log({ exp: id, ...o }),
      claude: { run: (args) => claude.run({ ...args, exp: id }), image: claude.image, mode: claude.mode, budget: () => claude.budgetOf(id), DemoFallback },
      analytics: {
        inc: (event, n) => analytics.inc(id, event, n),
        // Extra count-only events: declare once (lets the browser count them too), then count(event, { dim: 3 }).
        declare: (names, opts) => analytics.declare(id, names, opts),
        count: (event, dim) => {
          if (!EVENTS.includes(event) && !analytics.declared(id).includes(event)) analytics.declare(id, [event]);
          return analytics.count(id, event, dim);
        },
      },
      bus: { publish: (c, sid, events) => bus.publish(id, c, sid, events), allowKeys: (keys) => bus.allowKeys(id, keys), numbers: (spec) => bus.numbers(id, spec), serverOnly: (types) => bus.serverOnlyTypes(id, types) },
      demo: {
        pick: (set, seed) => demo.pick(id, set, seed),
        register: (set, fixtures) => demo.register(id, set, fixtures),
        wrap: (set, opts, fn) => demo.wrap({ exp: id, set, seed: opts?.seed, req: opts?.req }, fn),
        hero: () => demo.hero(id),
        isHero: (req) => demo.isHero(req),
      },
      limits: { guard: limits.guard, rate: limits.rate },
      // Shared safety (CONTRACT section 13): public text banks/templates, judge, care path
      safety: {
        bank: (bankId, entries) => safety.bank(id, bankId, entries),
        list: (name, values) => safety.list(id, name, values),
        template: (tplId, text, slots) => safety.template(id, tplId, text, slots),
        publicText: (bankOrTpl, keyOrSlots) => safety.publicText(id, bankOrTpl, keyOrSlots),
        ideaLabel: (req, word) => safety.ideaLabel(req, word),
        agents: (ids) => safety.agents(id, ids), // optional: the only agent ids your TV events may use
        judge: (lines) => safety.judge(id, lines),
        input: (req, ...values) => { const hit = safety.input(id, req, ...values); if (hit) { bus.dropSession(req?.sid); analytics.inc(id, 'care_shown'); } return hit; },
        // true = crisis (care card), 'unchecked' = the live check timed out: fail closed (truthy, so `if (hit) return careResponse(res)` refuses the text)
        inputLive: async (req, ...values) => { const hit = await safety.inputLive(id, req, ...values); if (hit === true) { bus.dropSession(req?.sid); analytics.inc(id, 'care_shown'); } return hit; },
        // 'live' | 'degraded': the same rule as /status.json (no key, mock, demo, offline, spend cap, or a live check failed in the last minute)
        safetyMode: () => safety.safetyMode(),
        careResponse: (res) => safety.careResponse(res),
        uncheckedResponse: (res) => safety.uncheckedResponse(res),
        isCrisis: (r) => r === true,
        isUnchecked: (r) => r === 'unchecked',
        care: { detect: safety.care.detect },
      },
      // Stage mode (CONTRACT section 12): leaderboards, big-screen turns, the anchor / record card
      stage: {
        core: true, // feature check for experiences: core stage mode is present
        declare: (spec) => stage.declare(id, spec),
        post: (req, boardId, data) => stage.post(id, req, boardId, data),
        board: (boardId, opts) => stage.board(id, boardId, opts),
        count: (boardId, opts) => stage.count(id, boardId, opts),
        turn: (req) => { const t = stage.turnOf(req?.sid); return t ? { id: t.id, counter: t.counter, nickname: t.nickname, anchor: t.anchor ? { name: t.anchor.name } : null, record: !!t.record } : null; },
        anchor: (c) => stage.anchor(id, c),
        // end that session's running big-screen turn (e.g. a duel walkover), server-side; only turns of this experience
        end: (reqOrSid, why = 'end') => {
          const sid = typeof reqOrSid === 'string' ? reqOrSid : reqOrSid?.sid;
          const t = sid ? stage.turnOf(sid) : null;
          if (!t || t.exp !== id) return { ok: true, ended: false };
          stage.endTurn(t.id, typeof why === 'string' && /^[a-z_]{1,16}$/.test(why) ? why : 'end');
          return { ok: true, ended: true, id: t.id };
        },
        // server-side nickname helpers (same rules as /api/core/stage/nicknames, for experiences with their own picker)
        nicknames: (req) => stage.offer(req?.sid),
        pickNickname: (req, offerId) => { const n = stage.choose(req?.sid, offerId); return n ? { ok: true, nickname: n } : { ok: false, reason: 'pick_one' }; },
        nickname: (req) => stage.nicknameOf(req?.sid),
      },
      // Staff or admin? (admin key in ?key= or x-admin-key, or the staff cookie from /admin/staff)
      admin: { check: (req) => isStaff(req, config.adminKey) || keyOk(req?.query?.key || req?.headers?.['x-admin-key'], config.adminKey) },
      // Top-level link routes, e.g. publicRoute('/p/:token', handler). See CONTRACT.md Clarification 7.
      publicRoute: (routePath, ...handlers) => publicRoute(id, routePath, ...handlers),
      // Counter numbers from the counter map (v4, flag-driven): never hard-code a counter (CHECK-20 F5)
      counters: { of: (expId = id) => [...(config.experiences.find((e) => e.id === expId)?.counters || [])], map: () => Object.fromEntries(config.experiences.flatMap((e) => e.counters.map((c) => [c, e.id]))) },
      // Public pages /<letter>/:code rendered by core from a vetted template (CONTRACT 14)
      publicPage: (spec) => pages.register(id, dir, spec),
    };
    ctx.core = { publicRoute: ctx.publicRoute };
    const serverFile = path.join(dir, 'server.js');
    if (fs.existsSync(serverFile)) {
      try {
        const mod = await import(pathToFileURL(serverFile).href);
        const register = mod.register || mod.default;
        if (typeof register === 'function') await register(ctx);
      } catch (e) {
        log({ kind: 'boot', exp: id, err: `server.js failed: ${e.message}` });
        continue;
      }
    }
    // keep the full route shape for the error log (the mount path is gone once the error leaves the router)
    // eslint-disable-next-line no-unused-vars
    router.use((err, req, res, next) => { req.pzShape = routeShape(req); next(err); });
    app.use(`/api/${id}`, router);
    const web = path.join(dir, 'web');
    if (fs.existsSync(web)) {
      // /jyotish?c=1 -> /jyotish/?c=1 so relative imports in the page resolve.
      app.use(`/${id}`, (req, res, next) => {
        if (req.originalUrl.split('?')[0] === `/${id}`) {
          const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
          return res.redirect(302, `/${id}/${q}`);
        }
        next();
      }, express.static(web, { maxAge: config.production ? '5m' : 0 }));
    }
    loaded.push(id);
  }

  // ---------- errors ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: FRIENDLY.notFound }));
  app.use((req, res) => res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/core/tokens.css"><body class="stage pz-center"><main class="pz-card"><h1 class="pz-display">404</h1><p>${FRIENDLY.notFound}</p><a class="pz-btn" href="/">Hub pe jao</a></main></body>`));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_big', message: 'File thodi badi hai. Chhoti photo try karo.' });
    // log only the route shape, never a raw path (public link paths carry tokens)
    const where = req.pzPublic || pubShape(req.path) ? { p: pubShape(req.path) || '/p/:token' } : routeShape(req);
    log({ kind: 'error', ...where, s: status, err: err.name || 'Error' });
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'oops', message: FRIENDLY.oops });
  });

  analytics.start();
  let server = null;
  const stop = async () => {
    limits.close();
    await analytics.stop();
    stage.stop();
    pages.stop();
    try { claude.spend.save(); } catch { /* ignore */ }
    clearInterval(spendTimer);
    if (restoreTimer) clearInterval(restoreTimer);
    await pushSpend();
    if (server) await new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); });
  };
  const start = (port = config.port, host = config.host) => new Promise((resolve) => {
    server = app.listen(port, host, () => resolve(server));
  });

  return { app, start, stop, config, analytics, claude, limits, bus, demo, safety, stage, loaded };
}

// Run directly: node core/server/index.js
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const s = await createServer();
  const srv = await s.start();
  const { port } = srv.address();
  const mode = s.config.offline ? 'OFFLINE (fixtures only, no network)' : s.config.demoMode ? 'DEMO (fixtures)' : s.config.mock ? 'MOCK Claude' : s.claude.mode() === 'live' ? 'LIVE Claude' : 'no API key: demo fixtures';
  console.log(`play-zenith on http://localhost:${port}  mode: ${mode}  experiences: ${s.loaded.join(', ') || 'none'}`);
  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
    if (stopping) process.exit(1);
    stopping = true;
    await s.stop();
    process.exit(0);
  });
}
