// HTTP tests against a real server on a random port (mock Claude, temp DATA_DIR).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, json, tmpDir } from './helpers.js';
import { staffToken } from '../../core/server/limits.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const servers = [];
async function server(o) { const s = await startServer(o); servers.push(s); return s; }
after(async () => { for (const s of servers) await s.close().catch(() => {}); });

test('healthz, status.json and security headers', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  const h = await fetch(`${s.base}/healthz`);
  assert.equal(h.status, 200);
  assert.match(h.headers.get('content-security-policy'), /default-src 'self'/);
  const st = await (await fetch(`${s.base}/status.json`)).json();
  for (const k of ['ok', 'version', 'commit', 'demo', 'offline', 'mock', 'spentUsd', 'capUsd', 'limits', 'experiences']) assert.ok(k in st, k);
  assert.equal(st.ok, true);
  assert.equal(st.capUsd, 300);
  assert.equal(st.reelWorker, null);
  assert.ok(st.experiences.includes('_sample'));
});

test('hub page and the 5 experiences (shark is "AI Sharks")', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  const hub = await fetch(`${s.base}/`);
  assert.equal(hub.status, 200);
  assert.match(await hub.text(), /<span id="hub-count">5<\/span> AI experiences/); // hub.js sets the real count from config
  const list = await (await fetch(`${s.base}/api/core/experiences`)).json();
  assert.deepEqual(list.map((e) => e.id), ['jyotish', 'shark', 'career', 'reel', 'asli']); // counter map v4 order
  assert.equal(list.find((e) => e.id === 'shark').name, 'AI Sharks');
  assert.ok(!JSON.stringify(list).includes('Shark Tank'));
  const r = await fetch(`${s.base}/_sample?c=9`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/_sample/?c=9');
  assert.equal((await fetch(`${s.base}/tv/_sample?c=9`)).status, 200);
  const meta = await (await fetch(`${s.base}/api/core/exp/_sample`)).json();
  assert.equal(meta.name, 'Vibe Scanner');
  assert.equal(meta.tvHook, true);
});

test('/admin needs the key; CSV and stats export', async () => {
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'right-key' });
  assert.equal((await fetch(`${s.base}/admin`)).status, 403);
  assert.equal((await fetch(`${s.base}/admin?key=wrong-key`)).status, 403);
  assert.equal((await fetch(`${s.base}/admin/export.csv?key=nope`)).status, 403);
  assert.equal((await fetch(`${s.base}/admin/stats.json`)).status, 403);
  await json(s.base, '/api/core/track', { exp: 'jyotish', event: 'start' });
  const ok = await fetch(`${s.base}/admin?key=right-key`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /live counts/);
  const csv = await (await fetch(`${s.base}/admin/export.csv?key=right-key`)).text();
  assert.match(csv.split('\n')[0], /^day,experience,start,complete,gate_view,gate_open_ig,gate_unlock,share,ref_visit,fallback,error/);
  assert.match(csv, /,jyotish,1,/);
  const off = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: '' });
  assert.equal((await fetch(`${off.base}/admin?key=`)).status, 403, 'admin is off without ADMIN_KEY');
});

test('track: standard, ref_visit and declared extra events only; counts persist across a restart', async () => {
  const dataDir = tmpDir('persist');
  const s = await server({ CLAUDE_MOCK: '1', DATA_DIR: dataDir, ADMIN_KEY: 'k' });
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'start' })).status, 200);
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'ref_visit' })).status, 200);
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'vibe_subject', dim: { subject: 'art' } })).status, 200);
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'vibe_subject', dim: { subject: 'Priya Sharma' } })).status, 400);
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'not_declared' })).status, 400);
  assert.equal((await json(s.base, '/api/core/track', { exp: '_sample', event: 'start', name: 'Priya' })).status, 200);
  await s.close();
  servers.splice(servers.indexOf(s), 1);
  const raw = fs.readFileSync(path.join(dataDir, 'analytics.json'), 'utf8');
  assert.ok(!/Priya/.test(raw), 'no personal data in the snapshot');
  const s2 = await server({ CLAUDE_MOCK: '1', DATA_DIR: dataDir, ADMIN_KEY: 'k' });
  const st = await (await fetch(`${s2.base}/admin/stats.json?key=k`)).json();
  assert.equal(st.totals._sample.start, 2);
  assert.equal(st.totals._sample.ref_visit, 1);
  assert.equal(st.totals._sample['vibe_subject[subject=art]'], 1);
});

test('sample route: mock answer, hero answer from fixtures without Claude', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  const r = await (await json(s.base, '/api/_sample/vibe', { word: 'curious', subject: 'art' })).json();
  assert.equal(r.source, 'mock');
  assert.equal(r.number, 7);
  assert.equal(r.vibe.lines.length, 3);
  const hero = await (await json(s.base, '/api/_sample/vibe', { word: 'x', subject: 'maths' }, { 'x-pz-demo': 'hero' })).json();
  assert.equal(hero.source, 'hero');
  assert.equal(hero.vibe.title, 'Curious Builder');
  const hp = await (await fetch(`${s.base}/api/core/hero/_sample`)).json();
  assert.equal(hp.profile.word, 'curious');
  assert.equal((await fetch(`${s.base}/api/core/hero/no-such-exp`)).status, 404);
});

test('no key and no mock: friendly fixture fallback, counted as fallback', async () => {
  const s = await server({ CLAUDE_MOCK: '0', ADMIN_KEY: 'k' });
  const r = await (await json(s.base, '/api/_sample/vibe', { word: 'bold', subject: 'art' })).json();
  assert.equal(r.source, 'fixture');
  assert.equal(r.reason, 'no_key');
  const st = await (await fetch(`${s.base}/admin/stats.json?key=k`)).json();
  assert.equal(st.totals._sample.fallback, 1);
});

test('global in-flight cap: a second call queues with a ticket, then gets in', async () => {
  const s = await server({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '400', MAX_IN_FLIGHT: '1' });
  const first = json(s.base, '/api/_sample/vibe', { word: 'a', subject: 'art' });
  await new Promise((r) => setTimeout(r, 50));
  const second = await json(s.base, '/api/_sample/vibe', { word: 'b', subject: 'art' });
  assert.equal(second.status, 503);
  const body = await second.json();
  assert.equal(body.error, 'busy');
  assert.ok(body.queue.ahead >= 1);
  assert.equal((await first).status, 200);
  const again = await json(s.base, '/api/_sample/vibe', { word: 'b', subject: 'art' }, { 'x-queue-ticket': body.queue.ticket });
  assert.equal(again.status, 200);
});

test('rate limit: 429 with a friendly message after SESSION_LIMIT calls', async () => {
  const s = await server({ CLAUDE_MOCK: '1', SESSION_LIMIT: '2' });
  const cookie = { cookie: 'pz_sid=test-session-123' };
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await json(s.base, '/api/_sample/vibe', { word: 'a', subject: 'art' }, cookie)).status);
  assert.deepEqual(codes, [200, 200, 429]);
});

test('live bus over SSE: phone events reach the TV, personal fields are rejected', async () => {
  const s = await server({ CLAUDE_MOCK: '1', PUBLIC_TEXT_STRICT: '0', ADMIN_KEY: 'k' }); // synthetic text: the bus itself is under test
  const ctrl = new AbortController();
  const res = await fetch(`${s.base}/api/core/bus/_sample/9/stream`, { signal: ctrl.signal });
  assert.equal(res.headers.get('content-type').split(';')[0], 'text/event-stream');
  const reader = res.body.getReader();
  const got = [];
  const reading = (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      buf += Buffer.from(value).toString();
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const m = chunk.match(/^data: (.*)$/m); if (m) got.push(JSON.parse(m[1])); }
    }
  })();
  await new Promise((r) => setTimeout(r, 100));
  const pub = await (await json(s.base, '/api/core/bus/_sample/9', { sid: 'phone-1', events: [
    { t: 'init', ts: 0, title: 'Vibe', orchestrator: { id: 'conductor', name: 'Conductor' }, agents: [{ id: 'number', name: 'Number Agent' }] },
    { t: 'log', ts: 5, id: 'number', text: '7 letters -> 7' },
    { t: 'result', ts: 9, payload: { title: 'Curious Builder', name: 'Priya' } },
  ] })).json();
  assert.equal(pub.accepted, 2);
  assert.match(pub.rejected[0].reason, /personal field/);
  await new Promise((r) => setTimeout(r, 150));
  ctrl.abort();
  await reading;
  assert.equal(got[0].type, 'hello');
  assert.ok(got.some((m) => m.type === 'session'));
  const evs = got.filter((m) => m.type === 'events').flatMap((m) => m.events);
  assert.deepEqual(evs.map((e) => e.t), ['init', 'log']);
  assert.ok(!JSON.stringify(got).includes('Priya'));
  // pin needs a staff TV (cookie or admin key) AND the TV token (CHECK-12 F1)
  assert.equal((await json(s.base, '/api/core/bus/_sample/9/pin', { token: got[0].token, pin: true })).status, 403, 'the public token alone is not enough');
  assert.equal((await json(s.base, '/api/core/bus/_sample/9/pin', { token: 'nope', pin: true }, { 'x-admin-key': 'k' })).status, 403);
  assert.equal((await json(s.base, '/api/core/bus/_sample/9/pin', { token: got[0].token, pin: true }, { 'x-admin-key': 'k' })).status, 200);
});

test('reelWorker status: ok when the worker answers /healthz, not ok when it is down', async () => {
  const worker = http.createServer((req, res) => { res.writeHead(req.url === '/healthz' ? 200 : 404); res.end('ok'); });
  await new Promise((r) => worker.listen(0, '127.0.0.1', r));
  const s = await server({ CLAUDE_MOCK: '1', REEL_WORKER_URL: `http://127.0.0.1:${worker.address().port}` });
  const st = await (await fetch(`${s.base}/status.json`)).json();
  assert.equal(st.reelWorker.ok, true);
  assert.equal(typeof st.reelWorker.ms, 'number');
  worker.close();
  const down = await server({ CLAUDE_MOCK: '1', REEL_WORKER_URL: 'http://127.0.0.1:1' });
  assert.equal((await (await fetch(`${down.base}/status.json`)).json()).reelWorker.ok, false);
});

// Files that matter for secrets: what git tracks, plus what `docker build` would send (the .dockerignore rules applied).
// The git-ignored local .env (the real keys, 0600) is in neither set, so it is never opened.
function dockerContext(root) {
  const rules = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const neg = l.startsWith('!'); const pat = (neg ? l.slice(1) : l).replace(/^\.?\//, '').replace(/\/$/, '');
      const re = new RegExp(`^${pat.split('**/').map((part) => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('(?:.*/)?')}(?:/.*)?$`);
      return { neg, re }; });
  const excluded = (rel) => { let ex = false; for (const r of rules) if (r.re.test(rel)) ex = !r.neg; return ex; };
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); const rel = path.relative(root, p).split(path.sep).join('/'); if (excluded(rel) && !(f.isDirectory() && rules.some((r) => r.neg && r.re.source.startsWith(`^${rel.replace(/[.]/g, '\\.')}`)))) continue; if (f.isDirectory()) walk(p); else out.push(p); } };
  walk(root);
  return out;
}
function hygieneFiles(root) {
  let tracked = [];
  if (fs.existsSync(path.join(root, '.git'))) tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean).map((f) => path.join(root, f)); // not a git checkout: the build context alone
  const all = [...new Set([...tracked, ...dockerContext(root)])].filter((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  // every TEXT file (no NUL byte in the first 8 KB, under 5 MB), whatever its name: config/prod.env, secrets, key.pem, .npmrc ... (N14)
  return all.filter((p) => { const st = fs.statSync(p); if (st.size > 5 * 1024 * 1024) return false; const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(Math.min(8192, st.size)); fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd); return !buf.includes(0); });
}
// secret shapes: Anthropic and AWS keys, private keys, npm tokens, and real-looking values of our secret settings
const SECRET_SHAPES = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic key'],
  [/AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16}/, 'AWS key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/, 'private key'],
  [/\/\/registry\.npmjs\.org\/:_authToken=[A-Za-z0-9-]{20,}/, 'npm token'],
  [/^\s*(?:export\s+)?(?:AISENSY_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|ADMIN_KEY|BUCKET_KEY_SECRET|PHONE_PEPPER|LINK_HMAC_SECRET|REEL_SHARED_SECRET)\s*[=:]\s*['"]?(?!(?:test|example|fake|dummy|changeme|change-me|replace|your|xxx|<|\$))[A-Za-z0-9_\-+/=.]{20,}/im, 'secret setting with a real-looking value'],
];

test('repo hygiene: no secrets in tracked files or the Docker build context, no CDN or third-party URLs in the web bundle, no em/en dashes', () => {
  const files = hygieneFiles(ROOT);
  assert.ok(!files.some((p) => path.relative(ROOT, p) === '.env'), 'the local .env is neither tracked nor in the image');
  assert.ok(files.some((p) => path.relative(ROOT, p) === path.join('core', 'server', 'index.js')), 'tracked files are scanned');
  assert.ok(files.some((p) => path.relative(ROOT, p) === '.env.example'), '.env.example is scanned');
  // the matcher itself: a secret file the .dockerignore does not exclude would be in the image
  const tmpRoot = tmpDir('hyg');
  fs.writeFileSync(path.join(tmpRoot, '.dockerignore'), '.env\n.env.*\n!.env.example\ntest\n');
  for (const f of ['.env', '.env.local', '.env.example', 'secret.json', 'test/x.js']) { fs.mkdirSync(path.dirname(path.join(tmpRoot, f)), { recursive: true }); fs.writeFileSync(path.join(tmpRoot, f), 'x'); }
  assert.deepEqual(dockerContext(tmpRoot).map((p) => path.relative(tmpRoot, p)).sort(), ['.dockerignore', '.env.example', 'secret.json']);
  for (const p of files) {
    if (p.endsWith('package-lock.json')) continue;
    if (path.relative(ROOT, p).startsWith(path.join('ops', 'test'))) continue; // TASK-07 tests use deliberate fake keys
    const t = fs.readFileSync(p, 'utf8');
    for (const [re, what] of SECRET_SHAPES) {
      if (what.startsWith('secret setting') && /\.(m?js|cjs|ts)$/.test(p)) continue; // code reads settings (s.ADMIN_KEY); values live in env-style files
      assert.ok(!re.test(t), `${what} in ${p}`); // AWS's documented example key is allowed
    }
  }
  const allowed = /(instagram\.com\/zenith_school_of_ai|play\.zenithschool\.ai|wa\.me|www\.w3\.org|d-project\.com|opensource\.org|denso-wave\.com|stackoverflow\.com|scripts\.sil\.org|openfontlicense\.org|github\.com)/;
  // browser bundle only: core/web and every experiences/<id>/web (server-side libs may call their own APIs)
  const web = files.filter((p) => { const r = path.relative(ROOT, p).split(path.sep); return (r[0] === 'core' && r[1] === 'web') || (r[0] === 'experiences' && r[2] === 'web'); });
  for (const p of web) {
    const t = fs.readFileSync(p, 'utf8');
    for (const m of t.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) assert.ok(allowed.test(m[0]), `external URL ${m[0]} in ${p}`);
  }
  const mine = files.filter((p) => { const r = path.relative(ROOT, p); return /^(core|test[\\/]core|experiences[\\/]_sample)[\\/]/.test(r) || r === '.env.example'; });
  for (const p of mine) assert.ok(!/[\u2013\u2014]/.test(fs.readFileSync(p, 'utf8')), `dash in ${p}`);
});

test('429 over HTTP: Retry-After and message agree; staff cookie from /admin/staff bypasses the limit', async () => {
  const s = await server({ CLAUDE_MOCK: '1', SESSION_LIMIT: '1', LIMIT_WINDOW_MS: '120000', ADMIN_KEY: 'boss-key' });
  const visitor = { cookie: 'pz_sid=visitor-abc-123' };
  assert.equal((await json(s.base, '/api/_sample/vibe', { word: 'a' }, visitor)).status, 200);
  const r = await json(s.base, '/api/_sample/vibe', { word: 'a' }, visitor);
  assert.equal(r.status, 429);
  const secs = Number(r.headers.get('retry-after'));
  const body = await r.json();
  assert.ok(secs > 100 && secs <= 120);
  assert.equal(body.retryMs, secs * 1000);
  assert.match(body.message, /2 minute mein/);
  assert.equal((await fetch(`${s.base}/admin/staff?key=nope`)).status, 403);
  const st = await fetch(`${s.base}/admin/staff?key=boss-key`, { redirect: 'manual' });
  assert.equal(st.status, 303, 'the fallback redirects at once, so the key leaves the URL');
  assert.equal(st.headers.get('location'), '/staff/done');
  const staffSet = st.headers.getSetCookie().find((c) => c.startsWith('pz_staff='));
  assert.match(staffSet, /HttpOnly/);
  const cookie = staffSet.split(';')[0];
  for (let i = 0; i < 5; i++) assert.equal((await json(s.base, '/api/_sample/vibe', { word: 'a' }, { cookie: `pz_sid=staff-phone-1; ${cookie}` })).status, 200);
  assert.equal(s.config.sessionLimit, 1);
});

test('staff pairing (CONTRACT 5): /admin makes a 6-digit code (10 min, single use), /staff takes it and sets the staff cookie; ?key= fallback strips the key', async () => {
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'boss-key', STAFF_PAIR_TTL_MS: '400' });
  const pair = async () => { const r = await fetch(`${s.base}/admin/pair?key=boss-key`, { method: 'POST' }); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); return (await r.text()).match(/data-pz="pair-code"[^>]*>(\d{6})</)[1]; };
  assert.equal((await fetch(`${s.base}/admin/pair?key=nope`, { method: 'POST' })).status, 403, 'only with the admin key');
  assert.match(await (await fetch(`${s.base}/admin?key=boss-key`)).text(), /Pair a staff device/);
  const form = await fetch(`${s.base}/staff`);
  assert.equal(form.status, 200);
  assert.equal(form.headers.get('cache-control'), 'no-store');
  assert.equal(form.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await form.text(), /name="code"/);
  const post = (code, ip = '10.1.1.1') => fetch(`${s.base}/staff`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip }, body: `code=${code}` });
  const code = await pair();
  assert.match(code, /^\d{6}$/);
  assert.equal((await post('000000' === code ? '000001' : '000000')).status, 403, 'a wrong code');
  const ok = await post(code);
  assert.equal(ok.status, 200);
  const cookie = ok.headers.getSetCookie().find((c) => c.startsWith('pz_staff='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Max-Age=345600/, '4 days');
  assert.equal(cookie.split(';')[0], `pz_staff=${staffToken('boss-key')}`);
  assert.equal(ok.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await post(code)).status, 403, 'single use');
  // expiry (TTL 400 ms in this test, 10 min by default)
  const late = await pair();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await post(late, '10.1.1.2')).status, 403, 'expired');
  // brute force: 10 tries per IP per 10 minutes
  let last;
  for (let i = 0; i < 11; i++) last = await post(String(100000 + i), '10.9.9.9');
  assert.equal(last.status, 429);
  // the staff cookie works (ops view), off removes it
  assert.equal((await fetch(`${s.base}/api/core/ops/_sample/2`, { headers: { cookie: cookie.split(';')[0] } })).status, 200);
  assert.ok((await fetch(`${s.base}/staff/off`)).headers.getSetCookie().some((c) => /^pz_staff=; Path=\/; Max-Age=0/.test(c)));
  // fallback: ?key= works but redirects at once, no-store, no referrer
  const fb = await fetch(`${s.base}/admin/staff?key=boss-key`, { redirect: 'manual' });
  assert.equal(fb.status, 303);
  assert.equal(fb.headers.get('location'), '/staff/done');
  assert.equal(fb.headers.get('cache-control'), 'no-store');
  assert.equal(fb.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(fb.headers.getSetCookie().some((c) => c.startsWith('pz_staff=') && c.includes('HttpOnly')));
  const off = await fetch(`${s.base}/admin/staff?key=boss-key&off=1`, { redirect: 'manual' });
  assert.ok(off.headers.getSetCookie().some((c) => /^pz_staff=;.*Max-Age=0/.test(c)));
});

test('all-counters safety panel: /admin/alerts + /api/core/ops/alerts need staff (cookie or admin key); time, counter, experience, kind only; dismissable', async () => {
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'boss-key' });
  await json(s.base, '/api/core/care', { exp: 'jyotish', c: 1 }, { cookie: 'pz_sid=al-1' });
  await json(s.base, '/api/core/care', { exp: 'shark', c: 4 }, { cookie: 'pz_sid=al-2' });
  await json(s.base, '/api/_sample/vibe', { word: 'chutiya' }, { cookie: 'pz_sid=al-3', 'x-pz-counter': '9' }); // degraded (mock): a language hit alerts too
  assert.equal((await fetch(`${s.base}/api/core/ops/alerts`)).status, 403);
  assert.equal((await fetch(`${s.base}/admin/alerts`)).status, 403);
  const staff = { cookie: `pz_staff=${staffToken('boss-key')}` };
  const page = await fetch(`${s.base}/admin/alerts`, { headers: staff });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await page.text(), /src="\/core\/alerts.js"/);
  const { alerts, safetyMode } = await (await fetch(`${s.base}/api/core/ops/alerts`, { headers: staff })).json();
  assert.equal(safetyMode, 'degraded');
  assert.deepEqual(alerts.map((a) => `${a.exp}:${a.c}:${a.kind}`).sort(), ['_sample:9:language', 'jyotish:1:care', 'shark:4:care']);
  for (const a of alerts) assert.deepEqual(Object.keys(a).sort(), ['at', 'c', 'exp', 'id', 'kind', 'name']);
  assert.equal(alerts.find((a) => a.exp === 'shark').name, 'AI Sharks');
  assert.ok(!JSON.stringify(alerts).includes('chutiya'));
  const j = alerts.find((a) => a.exp === 'jyotish');
  assert.equal((await fetch(`${s.base}/api/core/ops/jyotish/1/alerts/${j.id}/dismiss`, { method: 'POST', headers: { 'x-admin-key': 'boss-key' } })).status, 200);
  assert.equal((await (await fetch(`${s.base}/api/core/ops/alerts`, { headers: { 'x-admin-key': 'boss-key' } })).json()).alerts.length, 2);
});

test('default SESSION_LIMIT is 40', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  assert.equal(s.config.sessionLimit, 40);
});

test('bus publish: 429 per session cookie + IP, even when the body sid changes every time', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  let last = 200;
  for (let i = 0; i < 125; i++) last = (await json(s.base, '/api/core/bus/_sample/3', { sid: `spam-${i}`, events: [{ t: 'end' }] }, { cookie: 'pz_sid=spammer-cookie-1' })).status;
  assert.equal(last, 429);
  assert.equal((await json(s.base, '/api/core/bus/_sample/3', { sid: 'ok', events: [{ t: 'end' }] }, { cookie: 'pz_sid=another-phone-22' })).status, 200);
});


test('counter map v4: flags off = 1 Jyotish, 2 Jyotish, 3 Sharks, 4 Career, 5 Career, 6 Reel, 7 Asli, 8 Jyotish (API, hub data, admin labels)', async () => {
  const { COUNTER_MAP } = await import('../../core/server/config.js');
  assert.deepEqual({ ...COUNTER_MAP }, { 1: 'jyotish', 2: 'jyotish', 3: 'shark', 4: 'career', 5: 'career', 6: 'reel', 7: 'asli', 8: 'jyotish' });
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k' });
  const list = await (await fetch(`${s.base}/api/core/experiences`)).json();
  assert.deepEqual(Object.fromEntries(list.map((e) => [e.id, e.counters])), { jyotish: [1, 2, 8], shark: [3], career: [4, 5], reel: [6], asli: [7] });
  assert.ok(!list.some((e) => e.id === 'startup' || e.id === 'agent'), 'new experiences are listed only when their flag is on');
  assert.deepEqual((await (await fetch(`${s.base}/api/core/exp/shark`)).json()).counters, [3]);
  const admin = await (await fetch(`${s.base}/admin?key=k`)).text();
  assert.match(admin, /AI Sharks <small class="ctr">counter 3<\/small>/);
  assert.match(admin, /AI Jyotish <small class="ctr">counter 1 \+ 2 \+ 8<\/small>/);
  for (const c of [1, 2, 3, 4, 5, 6, 7, 8]) assert.match(admin, new RegExp(`Clear counter ${c}<small>`));
  assert.ok(!/Live Projects/.test(admin), 'Live Projects is not a counter');
});

test('counter map v4 flags: STARTUP_STUDIO takes counter 2, AGENT_BUILDER takes counter 4; a no-go reverts them; old ?c= values stay harmless', async () => {
  const { experiencesFor } = await import('../../core/server/config.js');
  const map = (f) => Object.fromEntries(experiencesFor(f).map((e) => [e.id, e.counters]));
  assert.deepEqual(map({ startupStudio: true, agentBuilder: true }), { jyotish: [1, 8], startup: [2], shark: [3], agent: [4], career: [5], reel: [6], asli: [7] });
  assert.deepEqual(map({ startupStudio: true }), { jyotish: [1, 8], startup: [2], shark: [3], career: [4, 5], reel: [6], asli: [7] });
  assert.deepEqual(map({ agentBuilder: true }), { jyotish: [1, 2, 8], shark: [3], agent: [4], career: [5], reel: [6], asli: [7] });
  // the server: hub list, admin labels, loader
  const dir = tmpDir('exps-flags');
  for (const id of ['startup', 'agent', 'shark']) { fs.mkdirSync(path.join(dir, id, 'web'), { recursive: true }); fs.writeFileSync(path.join(dir, id, 'server.js'), `export default function register({ app }) { app.get('/ping', (req, res) => res.json({ id: '${id}' })); }`); fs.writeFileSync(path.join(dir, id, 'web', 'index.html'), '<!doctype html><title>x</title>'); }
  const off = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k' }, { expDir: dir });
  servers.push(off);
  assert.equal((await fetch(`${off.base}/api/startup/ping`)).status, 404, 'flag off: not loaded');
  assert.equal((await fetch(`${off.base}/api/agent/ping`)).status, 404);
  assert.equal((await fetch(`${off.base}/api/shark/ping`)).status, 200);
  const on = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', STARTUP_STUDIO: '1', AGENT_BUILDER: '1' }, { expDir: dir });
  servers.push(on);
  assert.equal((await (await fetch(`${on.base}/api/startup/ping`)).json()).id, 'startup');
  assert.equal((await (await fetch(`${on.base}/api/agent/ping`)).json()).id, 'agent');
  const list = await (await fetch(`${on.base}/api/core/experiences`)).json();
  assert.deepEqual(list.map((e) => e.id), ['jyotish', 'startup', 'shark', 'agent', 'career', 'reel', 'asli']);
  assert.equal(list.find((e) => e.id === 'startup').name, 'AI Startup Studio');
  const admin = await (await fetch(`${on.base}/admin?key=k`)).text();
  assert.match(admin, /Clear counter 2<small>AI Startup Studio<\/small>/);
  assert.match(admin, /Clear counter 4<small>Build Your Own AI Agent<\/small>/);
  // old ?c= values: any counter works on any experience page; the path decides the experience
  assert.equal((await fetch(`${off.base}/shark/?c=4`)).status, 200);
  assert.equal((await json(off.base, '/api/core/bus/shark/4', { sid: 'old-c', events: [{ t: 'end' }] }, { cookie: 'pz_sid=old-c-1' })).status, 200);
});

test('CHECK-20 F4: a flagged experience that is off is 404 in the API, and its phone and TV URLs redirect (302, no-store) to the counter\'s fallback; ctx.counters reads the map', async () => {
  const dir = tmpDir('exps-f4');
  for (const id of ['startup', 'agent', 'jyotish', 'career', 'zz_count']) {
    fs.mkdirSync(path.join(dir, id, 'web'), { recursive: true });
    fs.writeFileSync(path.join(dir, id, 'web', 'index.html'), '<!doctype html><title>x</title>');
    fs.writeFileSync(path.join(dir, id, 'server.js'), id === 'zz_count'
      ? "export default function register({ app, counters }) { app.get('/c', (req, res) => res.json({ asli: counters.of('asli'), career: counters.of('career'), me: counters.of(), two: counters.map()[2] })); }"
      : 'export default function register() {}');
  }
  const off = await startServer({ CLAUDE_MOCK: '1' }, { expDir: dir });
  servers.push(off);
  assert.equal((await fetch(`${off.base}/api/core/exp/startup`)).status, 404);
  assert.equal((await fetch(`${off.base}/api/core/exp/agent`)).status, 404);
  const go = async (u) => { const r = await fetch(`${off.base}${u}`, { redirect: 'manual' }); return [r.status, r.headers.get('location'), r.headers.get('cache-control')]; };
  assert.deepEqual(await go('/tv/startup?c=2'), [302, '/tv/jyotish?c=2', 'no-store']);
  assert.deepEqual(await go('/tv/startup?c=2&capture=1&layout=portrait'), [302, '/tv/jyotish?c=2&capture=1&layout=portrait', 'no-store']);
  assert.deepEqual(await go('/startup?c=2'), [302, '/jyotish/?c=2', 'no-store']);
  assert.deepEqual(await go('/startup/'), [302, '/jyotish/?c=2', 'no-store'], 'no ?c=: its own counter (2)');
  assert.deepEqual(await go('/tv/agent?c=4'), [302, '/tv/career?c=4', 'no-store']);
  assert.deepEqual(await go('/agent/?c=4&demo=hero'), [302, '/career/?c=4&demo=hero', 'no-store']);
  assert.deepEqual(await go('/tv/agent?c=99'), [302, '/tv/career?c=4', 'no-store'], 'an odd ?c= falls back to the experience\'s own counter');
  const on = await startServer({ CLAUDE_MOCK: '1', STARTUP_STUDIO: '1', AGENT_BUILDER: '1' }, { expDir: dir });
  servers.push(on);
  assert.equal((await fetch(`${on.base}/api/core/exp/startup`)).status, 200);
  assert.equal((await fetch(`${on.base}/tv/startup?c=2`, { redirect: 'manual' })).status, 200, 'flag on: no redirect');
  // the counter helper for experiences and the phone config
  assert.deepEqual(await (await fetch(`${off.base}/api/zz_count/c`)).json(), { asli: [7], career: [4, 5], me: [], two: 'jyotish' });
  assert.deepEqual(await (await fetch(`${on.base}/api/zz_count/c`)).json(), { asli: [7], career: [5], me: [], two: 'startup' });
  assert.deepEqual((await (await fetch(`${off.base}/api/core/config`)).json()).counters.career, [4, 5]);
});

test('publicRoute: /p/:token and /stop reach the experience handler, never logged, no-store, no referrer', async () => {
  const dir = tmpDir('exps');
  const mk = (id, code) => { fs.mkdirSync(path.join(dir, id)); fs.writeFileSync(path.join(dir, id, 'server.js'), code); };
  mk('aa_links', `export default function register({ publicRoute, core }) {
    publicRoute('/p/:token', (req, res) => { if (req.params.token === 'boom') throw new Error('x'); res.type('text').send('pdf for ' + req.params.token.length); });
    core.publicRoute('/stop', (req, res) => res.json({ method: req.method, body: req.body || null }));
  }`);
  mk('bb_dupe', `export default function register({ publicRoute }) { publicRoute('/p/:token', (req, res) => res.send('second')); }`);
  mk('cc_bad', `export default function register({ publicRoute }) { publicRoute('/admin/evil', (req, res) => res.send('no')); }`);
  const logs = [];
  const s = await startServer({ CLAUDE_MOCK: '1' }, { expDir: dir, log: (o) => logs.push(JSON.stringify(o)) });
  servers.push(s);
  const r = await fetch(`${s.base}/p/SECRET-TOKEN-abc123?x=1`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'pdf for 19');
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  const stop = await fetch(`${s.base}/stop`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 't=SECRET-TOKEN-abc123' });
  assert.deepEqual(await stop.json(), { method: 'POST', body: { t: 'SECRET-TOKEN-abc123' } });
  assert.equal((await fetch(`${s.base}/stop`)).headers.get('cache-control').includes('no-store'), true);
  assert.equal((await fetch(`${s.base}/p/boom`)).status, 500);
  assert.equal((await fetch(`${s.base}/admin/evil`)).status, 404, 'only /p/:token and /stop can be registered');
  const all = logs.join('\n');
  assert.ok(!all.includes('SECRET-TOKEN') && !all.includes('boom'), 'tokens never reach the log');
  assert.ok(logs.some((l) => l.includes('"p":"/p/:token"')), 'errors are logged by route shape');
  assert.ok(logs.some((l) => l.includes('bb_dupe') && l.includes('already taken by aa_links')));
  assert.ok(logs.some((l) => l.includes('cc_bad') && l.includes('only /p/:token and /stop')));
  // case and trailing-slash variants get the same guard, and errors never log their raw path
  for (const p of ['/P/SECRET-UPPER-1', '/p/SECRET-SLASH-2/', '/STOP', '/stop/', '/Stop']) {
    const v = await fetch(`${s.base}${p}`);
    assert.equal(v.status, 200, p);
    assert.match(v.headers.get('cache-control'), /no-store/, p);
    assert.equal(v.headers.get('referrer-policy'), 'no-referrer', p);
  }
  assert.equal((await fetch(`${s.base}/P/boom/`)).status, 500);
  const all2 = logs.join('\n');
  assert.ok(!/SECRET-UPPER|SECRET-SLASH|boom/i.test(all2), 'no raw public path in any log line');
  assert.ok(logs.filter((l) => l.includes('"kind":"error"')).every((l) => l.includes('"p":"/p/:token"')));
});

test('access log: matched route shape or "unmatched" plus status, never a raw path, parameter or query string', async () => {
  const dir = tmpDir('pz-exp-');
  fs.mkdirSync(path.join(dir, 'zz_logs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zz_logs', 'server.js'), `export default function register({ app }) {
    app.get('/item/:secret', (req, res) => res.json({ n: req.params.secret.length }));
    app.post('/boom/:secret', () => { throw new Error('x'); });
  }`);
  const logs = [];
  const s = await startServer({ CLAUDE_MOCK: '1' }, { expDir: dir, log: (o) => logs.push(o) });
  servers.push(s);
  assert.equal((await fetch(`${s.base}/api/zz_logs/item/PRIVATE-Riya-2007?dob=2007-01-01`)).status, 200);
  assert.equal((await fetch(`${s.base}/api/zz_logs/nothing/PRIVATE-Aman?q=PRIVATE-q`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/PRIVATE-unknown-exp/x`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/zz_logs/boom/PRIVATE-err`, { method: 'POST' })).status, 500);
  assert.equal((await fetch(`${s.base}/api/core/stage/queue/PRIVATE-ticket`)).status >= 200, true);
  const hl = logs.filter((l) => l.kind === 'http');
  const all = JSON.stringify(logs);
  assert.ok(!/PRIVATE|Riya|2007|dob=/.test(all), 'no raw path, parameter or query in any log line');
  assert.ok(hl.some((l) => l.exp === 'zz_logs' && l.p === '/item/:secret' && l.s === 200), 'matched route logs its shape');
  assert.ok(hl.some((l) => l.p === 'unmatched' && l.s === 404), 'unmatched logs as unmatched + status');
  assert.ok(hl.some((l) => l.p === '/api/core/stage/queue/:ticket'), 'core routes log their shape');
  assert.ok(logs.some((l) => l.kind === 'error' && l.exp === 'zz_logs' && l.p === '/boom/:secret' && l.s === 500), 'errors log the route shape');
  assert.ok(hl.every((l) => l.exp === undefined || /^[a-z0-9_-]+$/.test(l.exp)));
  for (const l of hl) assert.match(l.p, /^(unmatched|route|\/[A-Za-z0-9/_:.\-]+)$/);
});

test('staff clear: /admin "Clear counter N" and the TV token wipe a channel; both are gated', async () => {
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', PUBLIC_TEXT_STRICT: '0' });
  await json(s.base, '/api/core/bus/jyotish/1', { sid: 'v1', events: [{ t: 'init', orchestrator: { id: 'g', name: 'Guru' }, agents: [] }, { t: 'log', id: 'g', text: 'hello' }] });
  const form = (key, body) => fetch(`${s.base}/admin/clear?key=${key}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  assert.equal((await form('wrong', 'exp=jyotish&c=1')).status, 403);
  assert.equal((await form('k', 'exp=nope&c=1')).status, 404);
  assert.equal((await form('k', 'exp=jyotish&c=77')).status, 404, 'a counter that does not exist is a 404');
  const ok = await form('k', 'exp=jyotish&c=1');
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location'), /cleared=jyotish%3A1/);
  const admin = await (await fetch(`${s.base}/admin?key=k`)).text();
  assert.match(admin, /Clear counter 3<small>AI Sharks<\/small>/);
  // the channel is empty now: a TV joining gets nothing to replay
  assert.equal(s.bus.status().find((x) => x.channel === 'jyotish:1').events, 0);
  assert.equal((await json(s.base, '/api/core/bus/jyotish/1/clear', { token: 'nope' })).status, 403);
});

test('favicon.ico is served (Zenith shield), so pages do not log a 404', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  const r = await fetch(`${s.base}/favicon.ico`);
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 4)], [0, 0, 1, 0], 'ICO header');
});


test('PUBLIC_TEXT_STRICT is on by default', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  assert.equal(s.config.publicTextStrict, true);
  assert.equal((await (await fetch(`${s.base}/api/core/config`)).json()).publicTextStrict, true);
});

test('copy (Avi 24 Oct): no who-coded-what claims on any served page, core file, bank or template; first-years only in the configured hero line', async () => {
  const s = await server({ CLAUDE_MOCK: '1' });
  const FORBIDDEN = /first[\s-]?years?|direct aur test|directed and tested|\b3 din\b|agents ke saath|zenith x ai agents|ai agents ne banaya|students? ne (?:hi |akele )?code kiya|students? (?:didn'?t|did not|never) code|students? coded (?:it )?(?:alone|themselves|everything)|bina agents ke/i;
  const hero = s.config.publicHeroLine;
  const clean = (t) => t.split(hero).join('').split(s.config.publicHeroLineHi).join('');
  const pages = ['/', '/tv/_sample?c=1', '/_sample/', '/api/core/config', '/api/core/stage/_sample/1', '/api/core/experiences'];
  for (const p of pages) assert.ok(!FORBIDDEN.test(clean(await (await fetch(s.base + p)).text())), `served ${p}`);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? (f.name === 'vendor' ? [] : walk(path.join(d, f.name))) : [path.join(d, f.name)]));
  for (const f of [...walk(path.join(ROOT, 'core', 'web')), ...walk(path.join(ROOT, 'experiences', '_sample'))]) if (/\.(js|css|html|json)$/.test(f)) {
    const served = await fetch(`${s.base}${f.includes(`${path.sep}core${path.sep}web`) ? '/core/' + path.relative(path.join(ROOT, 'core', 'web'), f) : '/_sample/' + path.relative(path.join(ROOT, 'experiences', '_sample', 'web'), f)}`);
    const body = served.ok ? await served.text() : fs.readFileSync(f, 'utf8');
    assert.ok(!FORBIDDEN.test(clean(body)), f);
  }
  for (const b of s.safety.registry().banks) for (const line of b.lines) assert.ok(!FORBIDDEN.test(clean(line)), `bank ${b.id}: ${line}`);
  for (const t of s.safety.registry().templates) assert.ok(!FORBIDDEN.test(t.text), `template ${t.id}`);
  assert.equal((await (await fetch(`${s.base}/api/core/stage/_sample/1`)).json()).about, 'Zenith first-years ne AI agents ke saath banaye');
  assert.equal((await (await fetch(`${s.base}/api/core/config`)).json()).heroLineHi, 'Zenith first-years x AI agents');
  for (const claim of ['Students ne code kiya', 'students didn\'t code', 'Students coded it alone']) assert.throws(() => s.safety.bank('_sample', `c${claim.length}`, { a: claim }), claim);
  // banks refuse the forbidden wording at registration
  assert.throws(() => s.safety.bank('_sample', 'bad1', { a: 'AI agents ne banaya, first-years ne direct aur test kiya' }));
  assert.throws(() => s.safety.bank('_sample', 'bad2', { a: 'Zenith ne AI agents ke saath 3 din mein 5 AI apps banaye' }));
  // a swap is one setting: a different configured line flows through without a code change
  const s2 = await server({ CLAUDE_MOCK: '1', PUBLIC_HERO_LINE: 'Naya hero line yahan', PUBLIC_HERO_LINE_HI: 'Naya Hinglish line' });
  assert.equal((await (await fetch(`${s2.base}/api/core/config`)).json()).heroLine, 'Naya hero line yahan');
  assert.equal((await (await fetch(`${s2.base}/api/core/stage/_sample/1`)).json()).about, 'Naya hero line yahan');
});

test('ops/admin-get.mjs: GETs a staff endpoint with ADMIN_KEY and prints the JSON with secrets and long numbers redacted, never the key', async () => {
  const s = await server({ CLAUDE_MOCK: '1', ADMIN_KEY: 'boss-key-SHOULD-NOT-PRINT' });
  await json(s.base, '/api/core/care', { exp: 'shark', c: 3 }, { cookie: 'pz_sid=ag-1' });
  const { main, redact } = await import('../../ops/admin-get.mjs');
  const lines = [];
  const orig = console.log;
  console.log = (x) => lines.push(String(x));
  const saved = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = 'boss-key-SHOULD-NOT-PRINT';
  try {
    assert.equal(await main(['/api/core/ops/alerts', '--url', s.base]), 0);
    assert.equal(await main(['/admin/stats.json', '--url', s.base]), 0);
  } finally { console.log = orig; if (saved === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = saved; }
  const out = lines.join('\n');
  assert.ok(!out.includes('SHOULD-NOT-PRINT'), 'the key is never printed');
  const first = JSON.parse(lines[0]);
  assert.equal(first.status, 200);
  assert.equal(first.body.alerts[0].exp, 'shark');
  assert.deepEqual(redact({ apiKey: 'abc', phone: 'call 98765 43210', n: 12345, nested: { token: 5 } }), { apiKey: '[redacted]', phone: 'call [number]', n: 12345, nested: { token: '[redacted]' } });
});
