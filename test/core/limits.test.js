import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimits, clientIp } from '../../core/server/limits.js';

const cfg = (o = {}) => ({ maxInFlight: 2, sessionLimit: 3, ipLimit: 100, limitWindowMs: 60000, ...o });
function fakeRes() {
  const r = { statusCode: 200, body: null, headers: {}, handlers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  r.on = (ev, fn) => { (r.handlers[ev] ||= []).push(fn); return r; };
  r.finish = () => (r.handlers.finish || []).forEach((f) => f());
  return r;
}
const req = (o = {}) => ({ sid: o.sid || 's1', headers: o.headers || {}, socket: { remoteAddress: o.ip || '10.0.0.1' } });

test('clientIp uses the LAST X-Forwarded-For entry (the one the load balancer appended), so phones cannot spoof it', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 49.36.1.2' }, socket: {} }), '49.36.1.2');
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '49.36.1.2' }, socket: {} }), '49.36.1.2');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
});

test('spoofed first XFF entries do not dodge the per-IP limit', () => {
  const l = createLimits({ config: cfg({ sessionLimit: 1000, ipLimit: 3 }) });
  let blocked = 0;
  for (let i = 0; i < 6; i++) if (!l.checkRate({ sid: `s${i}`, headers: { 'x-forwarded-for': `1.1.1.${i}, 49.36.1.2` }, socket: {} }).ok) blocked++;
  assert.equal(blocked, 3);
  l.close();
});

test('global in-flight cap returns a queue position, and a ticket keeps its place', () => {
  const l = createLimits({ config: cfg() });
  const a = l.acquire(null);
  const b = l.acquire(null);
  assert.ok(a.ok && b.ok);
  const c = l.acquire(null);
  const d = l.acquire(null);
  assert.equal(c.ok, false);
  assert.equal(c.ahead, 1);
  assert.equal(d.ahead, 2);
  a.release();
  // a newcomer without a ticket cannot jump the line
  assert.equal(l.acquire(null).ok, false);
  // the first ticket gets the free slot
  assert.equal(l.acquire(d.ticket).ok, false);
  assert.equal(l.acquire(c.ticket).ok, true);
  assert.equal(l.status().inFlight, 2);
  l.close();
});

test('guard(): 503 busy with queue info when full, 429 slow_down over the session limit, slot released on finish', () => {
  const l = createLimits({ config: cfg({ maxInFlight: 1 }) });
  const g = l.guard();
  const r1 = fakeRes(); let n1 = false; g(req(), r1, () => { n1 = true; });
  assert.ok(n1);
  const r2 = fakeRes(); g(req({ sid: 's2' }), r2, () => assert.fail('should queue'));
  assert.equal(r2.statusCode, 503);
  assert.equal(r2.body.error, 'busy');
  assert.ok(r2.body.queue.ticket && r2.body.queue.ahead >= 1 && r2.body.queue.retryMs > 0);
  assert.match(r2.body.message, /line/i);
  r1.finish();
  const r3 = fakeRes(); let n3 = false; g(req({ sid: 's2', headers: { 'x-queue-ticket': r2.body.queue.ticket } }), r3, () => { n3 = true; });
  assert.ok(n3, 'ticket holder admitted after release');
  r3.finish();
  // session limit 3 per window: 4th call from the same session is 429
  const rl = l.rate();
  const codes = [];
  for (let i = 0; i < 4; i++) { const r = fakeRes(); rl(req({ sid: 'busy-bee' }), r, () => codes.push(200)); if (r.statusCode !== 200) codes.push(r.statusCode); }
  assert.deepEqual(codes, [200, 200, 200, 429]);
  l.close();
});

test('429 waits exactly until the oldest call leaves the window; refused calls do not extend it; message matches', () => {
  let t = 1_000_000;
  const l = createLimits({ config: cfg({ sessionLimit: 2, limitWindowMs: 120000 }), now: () => t });
  const rl = l.rate();
  const call = (headers = {}) => { const r = fakeRes(); let ok = false; rl(req({ sid: 'v1', headers }), r, () => { ok = true; }); return { ok, r }; };
  assert.ok(call().ok);
  t += 30000;
  assert.ok(call().ok);
  t += 10000;
  const a = call();
  assert.equal(a.ok, false);
  assert.equal(a.r.statusCode, 429);
  assert.equal(a.r.headers['Retry-After'], '80'); // first call at t0 expires at t0+120s, now t0+40s
  assert.equal(a.r.body.retryMs, 80000);
  assert.match(a.r.body.message, /2 minute mein/);
  t += 30000; // tapping again while blocked does not push the wait further
  const b = call();
  assert.equal(b.r.headers['Retry-After'], '50');
  assert.match(b.r.body.message, /50 second mein/);
  t += 50000;
  assert.ok(call().ok, 'allowed right when Retry-After says');
  l.close();
});

test('staff cookie and hero demo requests skip the rate limit', async () => {
  const { staffToken } = await import('../../core/server/limits.js');
  const l = createLimits({ config: cfg({ sessionLimit: 1, adminKey: 'admin-secret' }) });
  const rl = l.rate();
  let passed = 0;
  for (let i = 0; i < 5; i++) rl(req({ sid: 'staff', headers: { cookie: `pz_staff=${staffToken('admin-secret')}` } }), fakeRes(), () => passed++);
  for (let i = 0; i < 5; i++) rl(req({ sid: 'hero', headers: { 'x-pz-demo': 'hero' } }), fakeRes(), () => passed++);
  assert.equal(passed, 10);
  const r = fakeRes();
  rl(req({ sid: 'faker', headers: { cookie: 'pz_staff=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } }), fakeRes(), () => {});
  rl(req({ sid: 'faker', headers: { cookie: 'pz_staff=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } }), r, () => {});
  assert.equal(r.statusCode, 429, 'a forged staff cookie is not exempt');
  l.close();
});
