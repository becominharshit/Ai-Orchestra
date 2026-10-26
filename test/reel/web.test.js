// play-web side of Squad Reel: templates, Captions + Hook in mock and offline mode (fixtures per template),
// hero fixtures, upload proxy limits, the full flow through /api/reel/* against a real worker, Range passthrough,
// repost consent (default off) and the staff list behind ADMIN_KEY.
process.env.REEL_SHARED_SECRET = 'web-test-secret';
process.env.ADMIN_KEY = 'test-admin-key'; // the reel staff route reads ADMIN_KEY from the environment (ctx.config has no admin key)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer, json } from '../core/helpers.js';
import { startWorker, sampleClips, waitJob } from './helpers.js';
import { TEMPLATES } from '../../experiences/reel/templates.js';
import { LINES } from '../../experiences/reel/public.js';

let w; let s; let off; let clips;
test.before(async () => {
  clips = await sampleClips();
  w = await startWorker({ secret: 'web-test-secret' });
  await w.assets.ready;
  s = await startServer({ CLAUDE_MOCK: '1', REEL_WORKER_URL: w.base, PZ_NO_DOTENV: '1', PUBLIC_TEXT_STRICT: '1' });
  off = await startServer({ DEMO_MODE: '1', OFFLINE: '1', REEL_WORKER_URL: w.base, PZ_NO_DOTENV: '1', PUBLIC_TEXT_STRICT: '1' });
});
test.after(async () => { await s?.close(); await off?.close(); await w?.close(); });

const post = (base, p, body, headers) => json(base, `/api/reel/${p}`, body, headers).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const fixture = (set) => JSON.parse(fs.readFileSync(new URL(`../../experiences/reel/fixtures/${set}.json`, import.meta.url)));
const DASH = /[\u2013\u2014]/;

test('reel loads, page and templates are served', async () => {
  assert.ok(s.loaded.includes('reel'));
  const page = await fetch(`${s.base}/reel/?c=6`);
  assert.equal(page.status, 200);
  const t = await fetch(`${s.base}/api/reel/templates`).then((r) => r.json());
  assert.deepEqual(t.templates.map((x) => x.name), ['Squad Intro', 'Movie Trailer', 'Hostel Roast', 'Zenith Heist']);
  assert.equal(t.limits.maxS, 30);
});

test('fixtures: 6+ per template, schema shaped (bank ids of the right template and shot)', () => {
  for (const t of TEMPLATES) {
    const caps = fixture(`captions_${t.id}`);
    const hooks = fixture(`hook_${t.id}`);
    assert.ok(caps.length >= 6 && hooks.length >= 6, t.id);
    for (const c of caps) for (const n of [1, 2, 3]) assert.ok(LINES.get(c[`shot${n}`])?.shot === n && LINES.get(c[`shot${n}`]).tpl === t.id);
    for (const c of caps) assert.equal(LINES.get(c.post).kind, 'post');
    for (const h of hooks) assert.equal(LINES.get(h.hook).kind, 'hook');
  }
});

test('Captions + Hook: Claude (mock) only picks bank ids; text comes from the bank, within budget', async () => {
  for (const t of TEMPLATES) {
    const c = await post(s.base, 'captions', { template: t.id, squad: 4, durations: [6.2, 8.3, 6.2] });
    assert.equal(c.status, 200);
    assert.equal(c.data.source, 'Mock');
    assert.equal(c.data.captions.length, 3);
    for (const [i, x] of c.data.captions.entries()) {
      const l = LINES.get(x.id);
      assert.ok(l && l.tpl === t.id && l.shot === i + 1, `${t.id} caption ${x.id}`);
      assert.equal(x.text, l.text.replaceAll('{n}', '4'));
      assert.ok(x.text.length <= c.data.budgets[i]);
      assert.ok(x.pt, 'public text token');
    }
    assert.equal(LINES.get(c.data.post.id).kind, 'post');
    const h = await post(s.base, 'hook', { template: t.id, squad: 4 });
    assert.equal(h.status, 200);
    assert.equal(LINES.get(h.data.hook.id).tpl, t.id);
    assert.ok(h.data.style.text.endsWith('hook') || h.data.style.text.includes('hook'));
  }
  assert.equal((await post(s.base, 'captions', { template: 'nope' })).status, 400);
});

test('offline mode: fixtures only, no network', async () => {
  const c = await post(off.base, 'captions', { template: 'roast', squad: 3, durations: [7, 7, 6] });
  assert.equal(c.status, 200);
  assert.equal(c.data.source, 'Offline');
  assert.ok(c.data.captions.every((x, i) => LINES.get(x.id)?.shot === i + 1));
  const h = await post(off.base, 'hook', { template: 'roast' });
  assert.equal(h.data.source, 'Offline');
});

test('hero demo: hero fixture, sample clips only with ?demo=hero', async () => {
  const h = await post(s.base, 'hook', { template: 'heist', squad: 4 }, { 'x-pz-demo': 'hero' });
  assert.equal(h.data.source, 'Demo');
  assert.equal(h.data.hook.id, fixture('hook_heist')[0].hook);
  assert.equal((await post(s.base, 'hero-clips', {})).status, 403);
  const r = await post(s.base, 'hero-clips', {}, { 'x-pz-demo': 'hero' });
  assert.equal(r.status, 200);
  assert.equal(r.data.clips.length, 3);
  const v = await fetch(`${s.base}/api/reel/sample/1`);
  assert.equal(v.headers.get('content-type'), 'video/mp4');
  await v.arrayBuffer();
});

test('upload proxy: wrong type refused before the worker; friendly message', async () => {
  const r = await fetch(`${s.base}/api/reel/upload?shot=1`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('x') });
  assert.equal(r.status, 415);
  assert.match((await r.json()).message, /record karo/);
});

test('worker down: friendly 503, no crash', async () => {
  const d = await startServer({ CLAUDE_MOCK: '1', REEL_WORKER_URL: 'http://127.0.0.1:9', PZ_NO_DOTENV: '1' });
  try {
    const r = await post(d.base, 'plan', { template: 'intro', clips: ['a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20)] });
    assert.equal(r.status, 503);
    assert.match(r.data.message, /warm up/);
  } finally { await d.close(); }
});

test('full flow through play-web: upload x3, plan, captions, hook, render, poll, file with Range, repost, staff list', async () => {
  const ids = [];
  for (const [i, c] of clips.entries()) {
    const r = await fetch(`${s.base}/api/reel/upload?shot=${i + 1}`, { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: fs.readFileSync(c) });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    ids.push(d.clipId);
  }
  const plan = await post(s.base, 'plan', { template: 'intro', clips: ids });
  assert.equal(plan.status, 200);
  const cap = await post(s.base, 'captions', { template: 'intro', squad: 3, durations: plan.data.shots.map((x) => x.dur) });
  const hook = await post(s.base, 'hook', { template: 'intro', squad: 3 });
  // free text is never accepted for the burn-in: unknown ids, other templates' ids or missing ids are refused
  assert.equal((await post(s.base, 'render', { template: 'intro', clips: ids, captions: ['any text'], hook: 'free text' })).status, 400);
  assert.equal((await post(s.base, 'render', { template: 'intro', clips: ids, captionIds: ['he-c1-01', 'in-c2-01', 'in-c3-01'], hookId: 'in-h-01' })).status, 400);
  const job = await post(s.base, 'render', { template: 'intro', clips: ids, captionIds: cap.data.captions.map((x) => x.id), hookId: hook.data.hook.id, squad: 3, captions: ['ignored free text'] });
  assert.equal(job.status, 202, JSON.stringify(job.data));
  const v = await waitJob(s.base, job.data.id, {}, { path: '/api/reel/job/' });
  assert.equal(v.state, 'done');
  // strict bus (core ctx.safety): every orchestra event of this real render is accepted as public text
  const evs = v.events.map(({ seq, ...e }) => e);
  const init = { t: 'init', title: 'Squad Reel: Squad Intro', orchestrator: { id: 'director', name: 'Director', role: 'Beat cut plan', icon: 'film' },
    agents: [['captions', 'Captions', 'Claude captions'], ['hook', 'Hook', 'Claude opener'], ['editor', 'Editor', 'ffmpeg 9:16 cut'], ['thumbnail', 'Thumbnail', 'Cover pick']].map(([id, name, role]) => ({ id, name, role, icon: 'chat' })) };
  const phone = [
    { t: 'log', id: 'director', text: 'Squad Intro: 3 clips mile (8.0s, 9.0s, 7.5s), squad of 3' },
    { t: 'log', id: 'director', text: `Shot 1: ${plan.data.shots[0].beats} beats = ${plan.data.shots[0].dur.toFixed(1)}s from ${plan.data.shots[0].in.toFixed(1)}s @ 116 BPM` },
    { t: 'handoff', from: 'director', to: 'captions', label: plan.data.shots.map((x) => `${x.dur.toFixed(1)}s`).join(' / ') },
    { t: 'assign', id: 'captions', task: 'Har shot ke liye Hinglish caption' },
    { t: 'log', id: 'captions', text: `${cap.data.source}: 3 captions from the Squad Intro bank` },
    ...cap.data.captions.map((c, i) => ({ t: 'log', id: 'captions', text: `Shot ${i + 1}: "${c.text}"` })),
    { t: 'log', id: 'hook', text: `${hook.data.source}: "${hook.data.hook.text}"` },
    { t: 'log', id: 'hook', text: `Style: ${hook.data.style.text}` },
    { t: 'done', summary: `Reel ready: ${v.result.duration.toFixed(1)}s, 1080x1920, ${(v.result.bytes / 1048576).toFixed(1)} MB, 12s total` },
    { t: 'result', payload: { kicker: 'Squad Reel ready', title: 'Squad Intro', hook: hook.data.hook.text, captions: cap.data.captions.map((c) => c.text), bpm: 116, seconds: v.result.duration, url: `/api/reel/file/${job.data.id}`, qr: `https://play.zenithschool.ai/reel/?get=${job.data.id}` } },
  ];
  const all = [init, ...evs, ...phone];
  const bus = await json(s.base, '/api/core/bus/reel/6', { sid: 'reel-strict', events: all }).then((x) => x.json());
  assert.deepEqual(bus.rejected, [], JSON.stringify(bus.rejected));
  assert.equal(bus.accepted, all.length);
  const bad = await json(s.base, '/api/core/bus/reel/6', { sid: 'reel-strict', events: [{ t: 'log', id: 'captions', text: 'Shot 1: "free text from a model"' }] }).then((x) => x.json());
  assert.equal(bad.accepted, 0, 'strict bus drops unregistered text');
  // share card text comes from the server as publicText objects
  const card = await fetch(`${s.base}/api/reel/card?template=intro`).then((r) => r.json());
  for (const k of ['kicker', 'title', 'line']) assert.ok(card[k].pt && card[k].text, k);
  // target is under 30 s on a quiet laptop (printed); fail only above 90 s so a loaded CI box is not flaky
  console.log(`# web flow render ${v.result.renderMs} ms (target < 30000)`);
  assert.ok(v.result.renderMs < 90000, `render ${v.result.renderMs} ms`);

  const part = await fetch(`${s.base}/api/reel/file/${job.data.id}`, { headers: { range: 'bytes=0-1023' } });
  assert.equal(part.status, 206);
  assert.match(part.headers.get('content-range'), /^bytes 0-1023\//);
  assert.equal((await part.arrayBuffer()).byteLength, 1024);
  const dl = await fetch(`${s.base}/api/reel/file/${job.data.id}?dl=1`);
  assert.match(dl.headers.get('content-disposition'), /attachment/);
  const body = Buffer.from(await dl.arrayBuffer());
  assert.equal(body.toString('latin1', 4, 8), 'ftyp');
  assert.equal((await fetch(`${s.base}/api/reel/cover/${job.data.id}`)).headers.get('content-type'), 'image/jpeg');

  assert.equal((await fetch(`${s.base}/api/reel/staff/reposts`)).status, 403);
  assert.equal((await fetch(`${s.base}/api/reel/staff/reposts?key=test-admin-key`).then((r) => r.json())).reels.length, 0, 'consent is off by default');
  assert.equal((await post(s.base, `repost/${job.data.id}`, { repost: true })).status, 200);
  const list = await fetch(`${s.base}/api/reel/staff/reposts?key=test-admin-key`).then((r) => r.json());
  assert.equal(list.reels[0].id, job.data.id);
  assert.match(list.reels[0].url, /\/api\/reel\/file\/[a-z]{20}\?dl=1$/);
});

test('TV safety: the result payload the phone sends passes the bus check', async () => {
  const payload = { kicker: 'Squad Reel ready', title: 'Zenith Heist', hook: 'Operation Zenith shuru', captions: ['Plan ready. Squad ready.', 'Crew in position', 'Mission complete, crew legendary'], bpm: 100, seconds: 22,
    url: `/api/reel/file/${'q'.repeat(20)}`, qr: `https://play.zenithschool.ai/reel/?get=${'q'.repeat(20)}` };
  const r = await json(s.base, '/api/core/bus/reel/6', { sid: 'reel-test', events: [{ t: 'result', ts: 1, payload }] }).then((x) => x.json());
  assert.equal(r.accepted, 1, JSON.stringify(r.rejected));
});

test('queue retries carrying the ticket never burn the rate limit (CHECK-04 F2)', async () => {
  const full = await startWorker({ secret: 'web-test-secret', queueMax: 0 });
  const q = await startServer({ CLAUDE_MOCK: '1', REEL_WORKER_URL: full.base, PZ_NO_DOTENV: '1', PUBLIC_TEXT_STRICT: '1', SESSION_LIMIT: '20' });
  try {
    const ids = [];
    for (const [i, c] of clips.entries()) {
      const r = await fetch(`${q.base}/api/reel/upload?shot=${i + 1}`, { method: 'POST', headers: { 'content-type': 'video/mp4', cookie: 'pz_sid=queueretrytest01' }, body: fs.readFileSync(c) });
      ids.push((await r.json()).clipId);
    }
    const body = { template: 'intro', clips: ids, captionIds: ['in-c1-01', 'in-c2-01', 'in-c3-01'], hookId: 'in-h-01' };
    const first = await post(q.base, 'render', body, { cookie: 'pz_sid=queueretrytest01' });
    assert.equal(first.status, 503);
    const ticket = first.data.queue.ticket;
    assert.match(ticket, /^reel-[0-9a-f]{18}$/, 'a random ticket issued by the server');
    const seen = new Set();
    for (let i = 0; i < 80; i++) seen.add((await post(q.base, 'render', body, { cookie: 'pz_sid=queueretrytest01', 'x-queue-ticket': ticket })).status);
    assert.deepEqual([...seen], [503], 'only busy answers while queued, never 429');
    // controls (CHECK-04b N2): no ticket, a made-up ticket, or another session's ticket are all still rate limited
    for (const [sid, hdr] of [['queueretrytest02', {}], ['queueretrytest03', { 'x-queue-ticket': 'reel' }], ['queueretrytest04', { 'x-queue-ticket': ticket }]]) {
      const got = new Set();
      for (let i = 0; i < 25; i++) got.add((await post(q.base, 'render', body, { cookie: `pz_sid=${sid}`, ...hdr })).status);
      assert.ok(got.has(429), `rate limit still applies for ${sid} ${JSON.stringify(hdr)}`);
    }
  } finally { await q.close(); await full.close(); }
});
