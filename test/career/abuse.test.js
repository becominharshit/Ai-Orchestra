// CHECK-03 regressions: abuse without OTP (play tokens, per-IP caps), atomic 24 h guard, allow-list fails closed,
// /stop hard cap (hero header is no exemption), typed inputs, hero runs never count, no number probing.
// FAKE AiSensy only; dummy numbers only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DUMMY, testKeys, fakeAiSensy, careerServer, post, postLead, playToken, lead, jobState, tmp } from './helpers.js';
import { createWhatsApp } from '../../experiences/career/lib/whatsapp.js';
import { createStore } from '../../experiences/career/lib/store.js';
import { readSettings, parseAllowlist } from '../../experiences/career/lib/settings.js';
import { createPlayTokens, createWindow } from '../../experiences/career/lib/play.js';

const keys = testKeys();
const cleanups = [];
after(async () => { for (const c of cleanups.reverse()) await c().catch(() => {}); });
async function setup(env = {}, opts = {}) {
  const fake = await fakeAiSensy(opts);
  const s = await careerServer({ WHATSAPP_PDF_ON: 'on', AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url, LEADS_PUBLIC_KEY: keys.pubEnv, ...env });
  cleanups.push(() => fake.close(), () => s.close());
  return { s, fake };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('F1 attack: 450 posts from one IP, no cookie, a fresh play token each time: no more than the caps get through', async () => {
  const { s, fake } = await setup();
  let accepted = 0; let live = 0; let refused = 0;
  for (let i = 0; i < 450; i++) {
    const phone = `90000${String(100 + i).padStart(5, '0')}`;
    const pr = await fetch(`${s.base}/api/career/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ area: 'computers-coding' }) });
    const token = pr.ok ? (await pr.json()).playToken : undefined;
    const r = await fetch(`${s.base}/api/career/lead`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...lead(phone), playToken: token }) });
    if (r.status === 200) { accepted += 1; if ((await r.json()).path === 'live') live += 1; } else refused += 1;
  }
  await sleep(1500);
  assert.ok(accepted <= 30, `accepted ${accepted} leads (cap 30 per IP per 10 min)`);
  assert.ok(live <= 30, `live ${live}`);
  assert.ok(fake.bodies.length <= 30, `fake AiSensy got ${fake.bodies.length}`);
  assert.ok(refused >= 420);
});

test('F1 play token: required, single use, signed, not before nbf, 30 min', async () => {
  const { s } = await setup();
  const none = await post(s.base, '/api/career/lead', lead(DUMMY[0]));
  assert.equal(none.status, 403);
  assert.equal((await none.json()).error, 'play_needed');
  const t = await playToken(s.base);
  assert.equal((await post(s.base, '/api/career/lead', { ...lead(DUMMY[0]), playToken: t })).status, 200);
  const again = await post(s.base, '/api/career/lead', { ...lead(DUMMY[1]), playToken: t });
  assert.equal(again.status, 403, 'one play buys one lead');
  assert.equal((await again.json()).reason, 'used');
  const forged = `${t.split('.')[0]}.${'A'.repeat(32)}`;
  assert.equal((await (await post(s.base, '/api/career/lead', { ...lead(DUMMY[1]), playToken: forged })).json()).reason, 'bad');
  // the Job Time Machine round hands out one too
  const ag = await (await post(s.base, '/api/career/agents', { job: 'marketing' })).json();
  assert.equal((await post(s.base, '/api/career/lead', { ...lead(DUMMY[2]), playToken: ag.playToken })).status, 200);
  // unit: nbf and expiry
  let now = 1000;
  const p = createPlayTokens({ secret: 'k'.repeat(40), now: () => now });
  const tok = p.issue('fc', { minMs: 5000 });
  assert.equal(p.consume(tok), 'early');
  now += 31 * 60000;
  assert.equal(p.consume(tok), 'expired');
  now = 1000 + 6000;
  assert.equal(p.consume(tok), null);
  assert.equal(p.consume(tok), 'used');
});

test('F1 per-IP live-send cap (30 an hour) sends the rest to the batch; other IPs are not affected', async () => {
  const { s, fake } = await setup({ WHATSAPP_IP_LIVE_CAP: '3', LEAD_IP_LIMIT: '100' });
  const paths = [];
  for (let i = 0; i < 5; i++) paths.push((await (await postLead(s.base, lead(`90000002${String(i).padStart(2, '0')}`), { sid: `ipcap-sess-${i}00` })).json()).path);
  assert.deepEqual(paths, ['live', 'live', 'live', 'batch', 'batch']);
  const other = { headers: { 'x-forwarded-for': '203.0.113.9' }, sid: 'ipcap-other-01' };
  assert.equal((await (await postLead(s.base, lead('9000000299'), other)).json()).path, 'live');
  await sleep(800);
  assert.equal(fake.bodies.length, 4);
  assert.equal(readSettings({}).ipLiveCap, 30);
  assert.equal(readSettings({}).leadIpLimit, 30);
});

test('F2 atomic: 6 parallel decides for one number with a slow (bucket-like) store give exactly 1 live send', async () => {
  const base = createStore({ dataDir: tmp() });
  const slow = { ...base, kind: 'local', get: async (k) => { await sleep(80); return base.get(k); }, put: async (k, b, t) => { await sleep(80); return base.put(k, b, t); } };
  const settings = readSettings({ WHATSAPP_PDF_ON: 'on', AISENSY_API_KEY: 'x'.repeat(24), LINK_HMAC_SECRET: 's'.repeat(40), PHONE_PEPPER: 'p'.repeat(40) });
  const sent = [];
  const wa = createWhatsApp({ settings, store: slow, send: async (b) => { sent.push(b); return { msgId: 'm' }; } });
  const ds = await Promise.all(Array.from({ length: 6 }, (_, i) => wa.decide({ phone: DUMMY[0], sid: `s${i}`, ip: '198.51.100.1' })));
  assert.equal(ds.filter((d) => d.path === 'live').length, 1);
  assert.equal(ds.filter((d) => d.path === 'decoy').length, 5, 'the others look like a send but are decoys');
  // the same session: 6 parallel decides for 6 numbers, session cap 2
  const ss = await Promise.all(DUMMY.map((n) => wa.decide({ phone: n.replace(/^9000/, '9100'), sid: 'one-session', ip: '198.51.100.2' })));
  assert.equal(ss.filter((d) => d.path === 'live').length, 2);
  assert.equal((await wa.ledger.counter()).total, 3, 'exactly 3 cap units spent');
});

test('F2 through the server: 6 parallel leads for the same number send exactly 1 message', async () => {
  const { s, fake } = await setup();
  const tokens = await Promise.all(Array.from({ length: 6 }, () => playToken(s.base)));
  const rs = await Promise.all(tokens.map((t, i) => post(s.base, '/api/career/lead', { ...lead(DUMMY[3]), playToken: t }, { sid: `par-sess-${i}000` }).then((r) => r.json())));
  assert.ok(rs.every((r) => r.ok && r.path === 'live'), 'every answer looks the same');
  await Promise.all(rs.map((r) => jobState(s.base, r.job)));
  assert.equal(fake.bodies.length, 1);
});

test('F3 allow-list: +91, spaces and dashes are fine; one bad entry means nobody (fails closed) with a count-only warning', async () => {
  assert.deepEqual(parseAllowlist('+919000000001, +91 90000-00002'), { list: ['9000000001', '9000000002'], deny: false, invalid: 0 });
  assert.equal(parseAllowlist('9000000001,12345').deny, true);
  assert.equal(parseAllowlist('off').deny, false);
  const a = await setup({ WHATSAPP_ALLOWLIST: '+919000000001, +91 90000-00002' });
  assert.equal((await (await postLead(a.s.base, lead(DUMMY[1]))).json()).path, 'live');
  assert.equal((await (await postLead(a.s.base, lead('9000000044'))).json()).path, 'batch');
  const b = await setup({ WHATSAPP_ALLOWLIST: '9000000001,98765' });
  assert.equal((await (await postLead(b.s.base, lead(DUMMY[0]))).json()).path, 'batch', 'even a listed number: the list is broken');
  await sleep(400);
  assert.equal(b.fake.bodies.length, 0);
  const warn = b.s.logs.lines.find((l) => l.includes('WHATSAPP_ALLOWLIST'));
  assert.ok(warn && warn.includes('"invalid":1'));
  assert.ok(!warn.includes('9000000001') && !warn.includes('98765'), 'the warning holds a count, not the value');
  const st = await (await fetch(`${b.s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(st.allowlistMode, true);
});

test('F10 /stop: hard per-IP cap of 10 an hour, the hero header is no exemption; public /stop works too', async () => {
  const { s } = await setup();
  let ok = 0;
  for (let i = 0; i < 60; i++) {
    const r = await post(s.base, i % 2 ? '/stop' : '/api/career/stop', { phone: `90000003${String(i).padStart(2, '0')}` }, { headers: { 'x-pz-demo': 'hero' } });
    if (r.status === 200) ok += 1;
  }
  assert.equal(ok, 10);
  const st = await (await fetch(`${s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(st.stopListSize, 10);
  const g = await fetch(`${s.base}/stop`, { redirect: 'manual' });
  assert.equal(g.status, 302);
  assert.equal(g.headers.get('location'), '/career/stop/');
});

test('F11 firstName and phone must be strings', async () => {
  const { s } = await setup();
  for (const bad of [{ firstName: { a: 1 } }, { phone: ['9800000004'] }, { phone: 9800000004 }, { firstName: ['Aarav'] }]) {
    const r = await postLead(s.base, lead(DUMMY[4], bad));
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
});

test('F7 hero runs never count (agents, lead)', async () => {
  const { s } = await setup();
  const before = JSON.stringify(s.analytics.snapshot().todayCounts.career || {});
  await post(s.base, '/api/career/agents', { job: 'marketing' }, { headers: { 'x-pz-demo': 'hero' } });
  await post(s.base, '/api/career/lead', lead(DUMMY[0]), { headers: { 'x-pz-demo': 'hero' } });
  assert.equal(JSON.stringify(s.analytics.snapshot().todayCounts.career || {}), before);
});

test('privacy: new, recent and stopped numbers get the same answer (no probing)', async () => {
  const { s, fake } = await setup();
  const first = await (await postLead(s.base, lead(DUMMY[0]), { sid: 'probe-sess-01' })).json();
  await jobState(s.base, first.job);
  await post(s.base, '/api/career/stop', { phone: DUMMY[1] });
  const fresh = await (await postLead(s.base, lead(DUMMY[2]), { sid: 'probe-sess-02' })).json();
  const recent = await (await postLead(s.base, lead(DUMMY[0]), { sid: 'probe-sess-03' })).json();
  const stopped = await (await postLead(s.base, lead(DUMMY[1]), { sid: 'probe-sess-04' })).json();
  const shape = (r) => ({ keys: Object.keys(r).sort(), path: r.path, copy: r.copy, job: typeof r.job });
  assert.deepEqual(shape(recent), shape(fresh));
  assert.deepEqual(shape(stopped), shape(fresh));
  await Promise.all([fresh, recent, stopped].map((r) => jobState(s.base, r.job)));
  assert.equal(fake.bodies.length, 2, 'only the first and the new number were really sent');
});

test('windows: take/giveBack', () => {
  const w = createWindow({ max: 2, windowMs: 1000 });
  assert.equal(w.take('a'), true); assert.equal(w.take('a'), true); assert.equal(w.take('a'), false);
  w.giveBack('a'); assert.equal(w.take('a'), true);
  assert.equal(w.take('b'), true);
});
