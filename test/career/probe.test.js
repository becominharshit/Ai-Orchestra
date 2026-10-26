// N1 (CHECK-03b): a stranger must not tell a new number from one that was already sent (24 h) or is on the stop
// list. Runs the exact /lead pipeline (lib/intake.js) against a bucket-like store (30 ms per request) and a fake
// AiSensy (400-900 ms), then tries the checker's classifiers: response time, job state sequence, end state, time to
// the end state, and the answer once a cap is reached. Dummy numbers only; nothing real is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { tmp, careerServer, post, postLead, lead as leadBody, testKeys, fakeAiSensy } from './helpers.js';
import { createStore } from '../../experiences/career/lib/store.js';
import { readSettings } from '../../experiences/career/lib/settings.js';
import { createWhatsApp } from '../../experiences/career/lib/whatsapp.js';
import { submitLead } from '../../experiences/career/lib/intake.js';
import { AGE_BANDS } from '../../experiences/career/lib/leads.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => sleep(ms * (0.8 + Math.random() * 0.4));

function harness(env = {}) {
  const base = createStore({ dataDir: tmp('pzprobe') });
  const store = { ...base, kind: 'local', get: async (k) => { await jitter(30); return base.get(k); }, put: async (k, b, t) => { await jitter(30); return base.put(k, b, t); } };
  const settings = readSettings({ WHATSAPP_PDF_ON: 'on', AISENSY_API_KEY: 'x'.repeat(24), LINK_HMAC_SECRET: 's'.repeat(40), PHONE_PEPPER: 'p'.repeat(40), WHATSAPP_IP_LIVE_CAP: '1000', ...env });
  const sent = [];
  const send = async (body) => { sent.push(body.destination); await sleep(400 + Math.random() * 500); return { msgId: 'm' }; };
  const wa = createWhatsApp({ settings, store, send });
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const band = AGE_BANDS.find((b) => b.id === 'college');
  let n = 0;
  async function submit(phone) {
    n += 1;
    const t0 = performance.now();
    const r = await submitLead({ wa, store, publicKey, lead: { first: 'Aarav', phone, band, area: 'computers-coding' }, sid: `sid-${n}-${Math.random()}`, ip: `10.0.${n >> 8}.${n & 255}` });
    return { ...r, ms: performance.now() - t0 };
  }
  async function watch(job) {
    const t0 = performance.now();
    const seq = [];
    for (;;) {
      const s = wa.status(job)?.state;
      if (s && seq[seq.length - 1] !== s) seq.push(s);
      if (s === 'sent' || s === 'batch') return { seq: seq.join('>'), end: s, ms: performance.now() - t0 };
      await sleep(10);
    }
  }
  return { wa, submit, watch, sent };
}

/** Best threshold on the training half, accuracy on the other half (a fair "can it be told apart" check). */
function holdout(samples) {
  const train = samples.filter((_, i) => i % 2 === 0);
  const testS = samples.filter((_, i) => i % 2 === 1);
  let best = { acc: 0, t: 0, dir: 1 };
  for (const { v } of train) for (const dir of [1, -1]) {
    const acc = train.filter((s) => (dir * (s.v - v) > 0) === s.isNew).length / train.length;
    if (acc > best.acc) best = { acc, t: v, dir };
  }
  // balanced accuracy on the held-out half (new numbers are a third of the probes)
  const tp = testS.filter((s) => s.isNew && best.dir * (s.v - best.t) > 0).length / Math.max(1, testS.filter((s) => s.isNew).length);
  const tn = testS.filter((s) => !s.isNew && !(best.dir * (s.v - best.t) > 0)).length / Math.max(1, testS.filter((s) => !s.isNew).length);
  return (tp + tn) / 2;
}

test('N1: 48 probes (16 new, 16 recent, 16 stopped) against a 30 ms store: same path, states, end state; timing no better than chance', async () => {
  const h = harness();
  const recent = Array.from({ length: 16 }, (_, i) => `91000${String(i).padStart(5, '0')}`);
  const stopped = Array.from({ length: 16 }, (_, i) => `92000${String(i).padStart(5, '0')}`);
  const fresh = Array.from({ length: 16 }, (_, i) => `93000${String(i).padStart(5, '0')}`);
  for (const p of recent) { const r = await h.submit(p); await h.watch(r.job); } // really sent earlier
  for (const p of stopped) await h.wa.stop(p);
  const probes = [...fresh.map((p) => [p, 'new']), ...recent.map((p) => [p, 'recent']), ...stopped.map((p) => [p, 'stopped'])].sort(() => Math.random() - 0.5);
  const sentBefore = h.sent.length;
  const res = [];
  for (const [phone, kind] of probes) {
    const r = await h.submit(phone);
    const w = await h.watch(r.job);
    res.push({ kind, shown: r.shown, hasJob: typeof r.job === 'string', jobLen: r.job?.length, ...w, lead: r.ms });
  }
  assert.equal(h.sent.length - sentBefore, 16, 'only the new numbers were really sent');
  for (const r of res) {
    assert.equal(r.shown, 'live', `${r.kind}: same path`);
    assert.equal(r.hasJob, true);
    assert.equal(r.jobLen, 24);
    assert.equal(r.end, 'sent', `${r.kind}: same end state`);
    assert.equal(r.seq, 'sending>sent', `${r.kind}: same state sequence`);
  }
  const accLead = holdout(res.map((r) => ({ v: r.lead, isNew: r.kind === 'new' })));
  const accEnd = holdout(res.map((r) => ({ v: r.ms, isNew: r.kind === 'new' })));
  const med = (k, f) => { const a = res.filter((r) => (k === 'new' ? r.kind === 'new' : r.kind !== 'new')).map(f).sort((x, y) => x - y); return a[a.length >> 1]; };
  const info = `lead ms median new ${med('new', (r) => r.lead).toFixed(0)} vs known ${med('known', (r) => r.lead).toFixed(0)}; end ms ${med('new', (r) => r.ms).toFixed(0)} vs ${med('known', (r) => r.ms).toFixed(0)}; holdout accuracy lead ${accLead.toFixed(2)}, end ${accEnd.toFixed(2)}`;
  console.log(`# ${info}`);
  assert.ok(Math.abs(med('new', (r) => r.lead) - med('known', (r) => r.lead)) < 25, info);
  assert.ok(accLead <= 0.8, info);
  assert.ok(accEnd <= 0.8, info);
});

test('N1: once a cap is reached, new, recent and stopped numbers all get batch with no job', async () => {
  for (const env of [{ WHATSAPP_DAILY_CAP: '1' }, { WHATSAPP_TOTAL_CAP: '1' }]) {
    const h = harness(env);
    const first = await h.submit('9400000001');
    await h.watch(first.job); // uses the only cap unit; 9400000001 is now "recent"
    await h.wa.stop('9400000002');
    const answers = [];
    for (const p of ['9400000003', '9400000001', '9400000002']) { const r = await h.submit(p); answers.push({ shown: r.shown, job: r.job }); }
    assert.deepEqual(answers, [{ shown: 'batch', job: null }, { shown: 'batch', job: null }, { shown: 'batch', job: null }], JSON.stringify(env));
  }
  // session cap and IP cap: same rule (decided for a new number first)
  const h = harness({ WHATSAPP_IP_LIVE_CAP: '1' });
  const a = await submitLike(h, '9400000011', '1.1.1.1');
  await h.watch(a.job);
  await h.wa.stop('9400000012');
  const b = await submitLike(h, '9400000011', '1.1.1.1');
  const c = await submitLike(h, '9400000012', '1.1.1.1');
  const d = await submitLike(h, '9400000013', '1.1.1.1');
  assert.deepEqual([b, c, d].map((r) => [r.shown, r.job]), [['batch', null], ['batch', null], ['batch', null]]);
});
async function submitLike(h, phone, ip) {
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const store = createStore({ dataDir: tmp('pzprobe2') });
  return submitLead({ wa: h.wa, store, publicKey, lead: { first: 'A', phone, band: AGE_BANDS[3], area: 'computers-coding' }, sid: `s-${Math.random()}`, ip });
}

test('staff: the three per-IP caps can be raised at the stall (admin endpoint + /career/staff/), persisted, validated', async () => {
  const keys = testKeys();
  const fake = await fakeAiSensy();
  const dataDir = tmp();
  const s = await careerServer({ WHATSAPP_PDF_ON: 'on', AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url, LEADS_PUBLIC_KEY: keys.pubEnv, LEAD_IP_LIMIT: '2' }, { DATA_DIR: dataDir });
  try {
    assert.equal((await postLead(s.base, leadBody('9000000501'))).status, 200);
    assert.equal((await postLead(s.base, leadBody('9000000502'))).status, 200);
    assert.equal((await postLead(s.base, leadBody('9000000503'))).status, 429, 'limit 2 per 10 min');
    const admin = { headers: { 'x-admin-key': 'test-admin-key' } };
    assert.equal((await post(s.base, '/api/career/admin/whatsapp', { ipCaps: { lead: 0 } }, admin)).status, 400);
    assert.equal((await post(s.base, '/api/career/admin/whatsapp', { ipCaps: { lead: 500 } })).status, 403, 'needs the key');
    const st = await (await post(s.base, '/api/career/admin/whatsapp', { ipCaps: { lead: 500, live: 400, stop: 50 } }, admin)).json();
    assert.deepEqual(st.ipCaps, { lead: 500, live: 400, stop: 50 });
    assert.equal((await postLead(s.base, leadBody('9000000503'))).status, 200, 'raised at runtime');
    const page = await fetch(`${s.base}/career/staff/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Per-IP limits/);
  } finally { await s.close(); }
  const again = await careerServer({ LEADS_PUBLIC_KEY: keys.pubEnv, LEAD_IP_LIMIT: '2' }, { DATA_DIR: dataDir });
  try {
    const st = await (await fetch(`${again.base}/api/career/admin/whatsapp`, { headers: { 'x-admin-key': 'test-admin-key' } })).json();
    assert.deepEqual(st.ipCaps, { lead: 500, live: 400, stop: 50 }, 'kept across a restart');
  } finally { await again.close(); await fake.close(); }
});
