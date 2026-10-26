// A temp content dir where every item is AI makes "always AI" a perfect game. Used for:
// score_10 analytics, server-side round timing (the client's ms is ignored), late answers and the per-IP /start limit.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../core/helpers.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asli-s10-'));
fs.mkdirSync(path.join(dir, 'media'));
const items = Array.from({ length: 24 }, (_, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, type: 'text', answer: 'ai', approved: true, body: `Test line number ${i + 1}.`, reveal_line: 'AI tha!', credit: 'AI (Claude)' }));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ items }));
Object.assign(process.env, { ASLI_CONTENT_DIR: dir, ASLI_ROUND_GRACE_MS: '0', ASLI_START_PER_IP: '6' });
const s = await startServer({ CLAUDE_MOCK: '1' });
for (const k of ['ASLI_CONTENT_DIR', 'ASLI_ROUND_GRACE_MS', 'ASLI_START_PER_IP']) delete process.env[k];
after(async () => { await s.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const named = new Set();
const post = async (p, b, sid = 'asli-score10-session') => {
  if (p === '/api/asli/start' && !named.has(sid)) {
    named.add(sid);
    const o = await (await fetch(`${s.base}/api/asli/nicknames`, { headers: { cookie: `pz_sid=${sid}` } })).json();
    await fetch(`${s.base}/api/asli/nickname`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `pz_sid=${sid}` }, body: JSON.stringify({ id: o.options[0].id }) });
  }
  const r = await fetch(s.base + p, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `pz_sid=${sid}` }, body: JSON.stringify(b) });
  return { status: r.status, body: await r.json() };
};

test('a 10/10 game counts score_10, game_complete and round_right for rounds 1..10', async () => {
  const st = (await post('/api/asli/start', {})).body;
  for (let i = 0; i < st.count; i++) {
    await post('/api/asli/round', { game: st.game, i });
    assert.equal((await post('/api/asli/answer', { game: st.game, i, pick: 'ai' })).body.correct, true);
  }
  const fin = (await post('/api/asli/finish', { game: st.game })).body;
  assert.equal(fin.right, 10);
  assert.equal(fin.badge, 'AI Detective Supreme');
  const c = (await (await fetch(`${s.base}/admin/stats.json?key=test-admin-key`)).json()).todayCounts.asli;
  assert.equal(c.score_10, 1);
  assert.equal(c.game_complete, 1);
  assert.equal(c['game_score[score=10]'], 1);
  for (let n = 1; n <= 10; n++) assert.equal(c[`round_right[round=${n}]`], 1);
  assert.ok(Object.keys(c).every((k) => /^[a-z_0-9]+(\[[a-z]+=[a-z0-9_]+\])?$/.test(k)), 'counts only, no free text');
});

test('speed bonus comes from server time since the round was issued; client ms is ignored', async () => {
  const st = (await post('/api/asli/start', {}, 'asli-timing-session')).body;
  // round 0: answer at once but claim 6 s -> still the full speed bonus
  await post('/api/asli/round', { game: st.game, i: 0 }, 'asli-timing-session');
  const fast = (await post('/api/asli/answer', { game: st.game, i: 0, pick: 'ai', ms: 6000 }, 'asli-timing-session')).body;
  assert.ok(fast.points >= 145, `fast answer got ${fast.points}`);
  // round 1: wait 1.5 s but claim 1 ms -> the server counts the 1.5 s
  await post('/api/asli/round', { game: st.game, i: 1 }, 'asli-timing-session');
  await wait(1500);
  const slow = (await post('/api/asli/answer', { game: st.game, i: 1, pick: 'ai', ms: 1 }, 'asli-timing-session')).body;
  assert.ok(slow.ms >= 1450, `server ms ${slow.ms}`);
  assert.ok(slow.points <= 139, `slow answer got ${slow.points}`);
  // asking for the same round again does not restart its clock
  await post('/api/asli/round', { game: st.game, i: 2 }, 'asli-timing-session');
  await wait(700);
  await post('/api/asli/round', { game: st.game, i: 2 }, 'asli-timing-session');
  const r2 = (await post('/api/asli/answer', { game: st.game, i: 2, pick: 'ai' }, 'asli-timing-session')).body;
  assert.ok(r2.ms >= 650, `clock was restarted (${r2.ms} ms)`);
  // round 3: answering after the limit (+ grace, 0 in this test) counts as time up, even with the right pick
  await post('/api/asli/round', { game: st.game, i: 3 }, 'asli-timing-session');
  await wait(6200);
  const late = (await post('/api/asli/answer', { game: st.game, i: 3, pick: 'ai' }, 'asli-timing-session')).body;
  assert.equal(late.pick, null);
  assert.equal(late.correct, false);
  assert.equal(late.points, 0);
});

test('/start is limited per IP too (many cookie-less scripts from one machine)', async () => {
  // 2 starts above + 4 here = 6 allowed from 127.0.0.1 in this server (ASLI_START_PER_IP=6), then 429
  const codes = [];
  for (let k = 0; k < 6; k++) codes.push((await post('/api/asli/start', {}, `asli-ip-${k}-xxxxxxxx`)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 429, 429]);
});
