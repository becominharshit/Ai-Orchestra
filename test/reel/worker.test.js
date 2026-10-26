// Reel worker end to end: secret, upload limits with friendly errors, a full render from 3 generated clips
// (1080x1920 H.264/AAC, yuv420p, faststart, under 30 s render), inputs deleted after render, Range for iOS,
// and logs that hold only ids and timings.
process.env.REEL_MAX_CLIP_MB = '12'; // small limit so the size test is quick (read when server.js loads)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startWorker, sampleClips, makeClip, uploadFile, waitJob, logCollector } from './helpers.js';
import { inspect } from '../../reel-worker/src/render.js';

const logs = logCollector();
let w;
let clips;
test.before(async () => {
  clips = await sampleClips();
  w = await startWorker({ log: logs.log });
  await w.assets.ready;
});
test.after(async () => { await w?.close(); });

test('healthz is open, everything else needs the shared secret', async () => {
  const h = await fetch(`${w.base}/healthz`).then((r) => r.json());
  assert.equal(h.ok, true);
  assert.equal(h.assets, 'ready');
  assert.equal((await fetch(`${w.base}/reposts`)).status, 401);
  assert.equal((await fetch(`${w.base}/reposts`, { headers: { 'x-reel-secret': 'wrong-secret' } })).status, 401);
  assert.equal((await fetch(`${w.base}/reposts`, { headers: w.H })).status, 200);
});

test('production without a secret refuses work', async () => {
  const p = await startWorker({ secret: '', production: true });
  try {
    assert.equal((await fetch(`${p.base}/healthz`)).status, 200);
    assert.equal((await fetch(`${p.base}/reposts`)).status, 503);
  } finally { await p.close(); }
});

test('upload limits: type, size, duration, not a video; friendly Hinglish messages', async () => {
  const bad = await uploadFile(`${w.base}/clips`, clips[0], w.H, 'image/png');
  assert.equal(bad.status, 415);
  assert.equal(bad.data.error, 'bad_type');
  assert.match(bad.data.message, /record karo/);

  const big = Buffer.alloc(13 * 1048576, 1);
  const r = await fetch(`${w.base}/clips`, { method: 'POST', headers: { ...w.H, 'content-type': 'video/mp4' }, body: big });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error, 'too_big');

  const notVideo = await fetch(`${w.base}/clips`, { method: 'POST', headers: { ...w.H, 'content-type': 'video/mp4' }, body: Buffer.from('hello, not a video') });
  assert.equal(notVideo.status, 422);
  assert.equal((await notVideo.json()).error, 'not_video');

  const long = await makeClip('long', { w: 160, h: 284, dur: 34, audio: false });
  const l = await uploadFile(`${w.base}/clips`, long, w.H);
  assert.equal(l.status, 422);
  assert.equal(l.data.error, 'too_long');
  assert.match(l.data.message, /max 30s/);
  assert.match((await uploadFile(`${w.base}/clips`, await makeClip('short1', { w: 160, h: 284, dur: 1, audio: false }), w.H)).data.message, /Kam se kam 2 second/);

  // CHECK-04b N1: the copy says "2 second", so a 2.0 s clip is accepted and the Director can plan it for every template
  const two = await makeClip('two', { w: 160, h: 284, dur: 2, audio: false });
  const t2 = await uploadFile(`${w.base}/clips`, two, w.H);
  assert.equal(t2.status, 200, JSON.stringify(t2.data));
  for (const tpl of ['intro', 'trailer', 'roast', 'heist']) {
    const ids2 = [t2.data.clipId, t2.data.clipId, t2.data.clipId];
    const pr = await fetch(`${w.base}/plan`, { method: 'POST', headers: { ...w.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: tpl, clips: ids2 }) });
    assert.equal(pr.status, 200, `${tpl} plans 2.0 s clips`);
  }
  w.store.deleteClip(t2.data.clipId);
  const short = await makeClip('short', { w: 160, h: 284, dur: 1, audio: false });
  const s = await uploadFile(`${w.base}/clips`, short, w.H);
  assert.equal(s.data.error, 'too_short');
  assert.equal(fs.readdirSync(w.store.inDir).length, 0, 'refused uploads leave no file behind');
});

test('full render: 3 clips -> 1080x1920 H.264/AAC MP4, faststart, 30 s target (fails > 90 s); inputs deleted', async () => {
  const ids = [];
  for (const c of clips) {
    const r = await uploadFile(`${w.base}/clips`, c, w.H, 'video/quicktime');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    ids.push(r.data.clipId);
  }
  assert.equal(fs.readdirSync(w.store.inDir).filter((f) => f.endsWith('.bin')).length, 3);

  const plan = await fetch(`${w.base}/plan`, { method: 'POST', headers: { ...w.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: 'heist', clips: ids }) }).then((r) => r.json());
  assert.equal(plan.shots.length, 3);

  const secretCaption = 'Codename Squad Zenith test line';
  const t0 = Date.now();
  const sub = await fetch(`${w.base}/jobs`, { method: 'POST', headers: { ...w.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: 'heist', clips: ids, captions: [secretCaption, 'Crew in position \u2014 ready', 'Mission complete'], hook: 'Operation Zenith shuru' }) });
  assert.equal(sub.status, 202);
  const { id } = await sub.json();
  const v = await waitJob(w.base, id, w.H);
  const wall = Date.now() - t0;
  assert.equal(v.state, 'done', JSON.stringify(v.error));
  // target is under 30 s on a quiet laptop (printed above); fail only above 90 s so a loaded CI box is not flaky
  if (v.result.renderMs >= 30000) console.log(`# NOTE render ${v.result.renderMs} ms is over the 30 s target (machine busy?)`);
  assert.ok(v.result.renderMs < 90000, `render ${v.result.renderMs} ms`);
  console.log(`# render ${v.result.renderMs} ms, wall ${wall} ms, ${(v.result.bytes / 1048576).toFixed(1)} MB`);

  const out = path.join(w.store.jobDir(id), 'reel.mp4');
  const info = await inspect(out);
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1920);
  assert.equal(info.vcodec, 'h264');
  assert.equal(info.acodec, 'aac');
  assert.equal(info.pixfmt, 'yuv420p');
  assert.equal(info.faststart, true, `atoms ${info.atoms}`);
  assert.ok(info.duration > 17 && info.duration < 30, `duration ${info.duration}`);
  assert.ok(Math.abs(info.duration - plan.total) < 0.2, 'matches the Director plan');
  assert.ok(fs.existsSync(path.join(w.store.jobDir(id), 'cover.jpg')));
  assert.deepEqual(fs.readdirSync(w.store.jobDir(id)).sort(), ['cover.jpg', 'meta.json', 'reel.mp4'], 'only the reel, cover and meta stay');
  assert.equal(fs.readdirSync(w.store.inDir).length, 0, 'uploaded inputs deleted right after the render');

  // orchestra events: real agents, short lines, every event shape the TV accepts
  const agents = new Set(v.events.map((e) => e.id || e.from).filter(Boolean));
  for (const a of ['director', 'editor', 'thumbnail']) assert.ok(agents.has(a), a);
  assert.ok(v.events.some((e) => e.t === 'progress' && e.value === 1));
  for (const e of v.events) {
    assert.ok(['assign', 'status', 'log', 'handoff', 'progress'].includes(e.t));
    if (e.text) assert.ok(e.text.length <= 140, `log line too long: ${e.text}`);
    if (e.text) assert.ok(!/[\u2013\u2014]/.test(e.text));
  }

  // download with Range (iOS Safari needs 206)
  const rr = await fetch(`${w.base}/files/${id}`, { headers: { ...w.H, range: 'bytes=0-99' } });
  assert.equal(rr.status, 206);
  assert.equal((await rr.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${w.base}/files/${id}/cover.jpg`, { headers: w.H })).headers.get('content-type'), 'image/jpeg');

  // repost consent defaults off, can be set, shows in the staff list
  assert.equal((await fetch(`${w.base}/reposts`, { headers: w.H }).then((r) => r.json())).reels.length, 0);
  await fetch(`${w.base}/jobs/${id}/repost`, { method: 'POST', headers: { ...w.H, 'content-type': 'application/json' }, body: '{"repost":true}' });
  assert.equal((await fetch(`${w.base}/reposts`, { headers: w.H }).then((r) => r.json())).reels[0].id, id);

  // logs: ids and timings only. Never captions, hooks, file names or paths.
  const all = logs.lines.join('\n');
  assert.ok(!all.includes(secretCaption) && !all.includes('Operation Zenith'), 'no caption text in logs');
  assert.ok(!all.includes('.mp4') && !all.includes('/'.repeat(1) + 'tmp') && !all.includes(w.storageDir), 'no paths in logs');
  for (const line of logs.lines) {
    const o = JSON.parse(line);
    for (const k of Object.keys(o)) assert.ok(['kind', 'job', 'clip', 'state', 'ahead', 'renderMs', 'totalMs', 'bytes', 's', 'm', 'p', 'ms', 'ok', 'err', 'reels', 'clips', 'warn'].includes(k), `log key ${k}`);
  }
});

test('busy: a full queue answers 503 busy with a friendly message', async () => {
  const q = await startWorker({ queueMax: 0 });
  try {
    const up = await uploadFile(`${q.base}/clips`, clips[0], q.H);
    const r = await fetch(`${q.base}/jobs`, { method: 'POST', headers: { ...q.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: 'intro', clips: [up.data.clipId, up.data.clipId, up.data.clipId] }) });
    assert.equal(r.status, 400, 'same clip three times is refused');
    const ids = [];
    for (const c of clips) ids.push((await uploadFile(`${q.base}/clips`, c, q.H)).data.clipId);
    const b = await fetch(`${q.base}/jobs`, { method: 'POST', headers: { ...q.H, 'content-type': 'application/json' }, body: JSON.stringify({ template: 'intro', clips: ids }) });
    assert.equal(b.status, 503);
    const j = await b.json();
    assert.equal(j.error, 'busy');
    assert.match(j.message, /reels ban rahi/);
  } finally { await q.close(); }
});
