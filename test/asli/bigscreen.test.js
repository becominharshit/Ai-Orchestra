// AI ya Asli? on core's big-screen queue (CONTRACT 12.4 / 12.5): turns, deferred posting, reward token, anchor card.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../core/helpers.js';
import { staffToken } from '../../core/server/limits.js';

// STAGE_MIN_TURN_S=0: core gives no reward token for turns under 20 s; these test turns take a fraction of a second
const s = await startServer({ CLAUDE_MOCK: '1', ASLI_TURN_POST_MS: '60000', STAGE_MIN_TURN_S: '0' });
after(async () => { await s.close(); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cookie = (who, extra = '') => `pz_sid=${who}${extra}`;
async function j(p, body, who, extra = '') {
  const r = await fetch(s.base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: cookie(who, extra) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function nick(who) { const o = await j('/api/asli/nicknames', undefined, who); return (await j('/api/asli/nickname', { id: o.body.options[0].id }, who)).body.nickname; }
async function queue(who) {
  const q = await j('/api/core/stage/queue', { exp: 'asli', c: 7 }, who);
  assert.ok(q.body.ticket, JSON.stringify(q.body));
  return q.body.ticket;
}
async function status(who, ticket) { return (await j(`/api/core/stage/queue/${ticket}`, undefined, who)).body; }
async function soloGame(who) {
  const st = await j('/api/asli/start', {}, who);
  for (let i = 0; i < 10; i++) { await j('/api/asli/round', { game: st.body.game, i }, who); await j('/api/asli/answer', { game: st.body.game, i, pick: 'ai' }, who); }
  return (await j('/api/asli/finish', { game: st.body.game }, who)).body;
}

test('solo big-screen turn: queue order, score posted only after /turn-done, then the next turn and a reward token', async () => {
  const A = 'asli-bs-session-aaaa'; const B = 'asli-bs-session-bbbb';
  const nA = await nick(A); await nick(B);
  const tA = await queue(A); const tB = await queue(B);
  assert.equal((await status(A, tA)).status, 'your_turn');
  assert.equal((await status(B, tB)).status, 'waiting');
  const before = (await j('/api/asli/board')).body.players;
  const fin = await soloGame(A);
  assert.equal(fin.deferred, true, 'post deferred while the result is on the TV');
  assert.ok(fin.rank >= 1, 'estimated rank for the phone');
  assert.equal((await j('/api/asli/board')).body.players, before, 'not on the board yet');
  assert.equal((await status(A, tA)).status, 'your_turn', 'turn still running');
  assert.equal((await j('/api/asli/turn-done', {}, A)).body.posted, true);
  const board = (await j('/api/asli/board')).body;
  assert.equal(board.players, before + 1);
  assert.ok(board.top.some((e) => e.label === nA));
  const sA = await status(A, tA);
  assert.equal(sA.status, 'done');
  assert.match(sA.token, /^[A-HJ-NP-Z2-9]{4}$/, 'reward token');
  assert.equal((await status(B, tB)).status, 'your_turn', 'the queue moved on');
  assert.equal((await j('/api/asli/turn-done', {}, A)).body.posted, false, 'only once');
  // a run without a turn posts at once
  const C = 'asli-bs-session-cccc';
  await nick(C);
  const f2 = await soloGame(C);
  assert.ok(!f2.deferred);
  await j('/api/core/stage/turn/x/end', {}, B);
});

test('anchor turn (staff, consent): the posted score pins "Beat <anchor> ka score" on counter 7', async () => {
  const staffCookie = `; pz_staff=${staffToken('test-admin-key')}`; // what /admin/staff?key= sets on a staff phone
  const S = 'asli-bs-staff-session';
  assert.equal((await j('/api/core/ops/asli/7/stage/clear', {}, S, staffCookie)).status, 200);
  assert.equal((await j('/api/core/ops/asli/7/stage/anchor', { name: 'Gaurav Taneja', consent: false }, S, staffCookie)).body.reason, 'consent_required');
  assert.equal((await j('/api/core/ops/asli/7/stage/anchor', { name: 'Gaurav Taneja', consent: true }, S, staffCookie)).body.ok, true);
  const G = 'asli-bs-anchor-phone';
  await nick(G);
  const t = await queue(G);
  // a pending guest star applies only to the turn the operator starts with Next
  assert.equal((await j('/api/core/ops/asli/7/stage/next', {}, S, staffCookie)).status, 200);
  const st = await status(G, t);
  assert.equal(st.status, 'your_turn');
  assert.equal(st.turn.anchor?.name, 'Gaurav Taneja');
  await soloGame(G);
  await j('/api/asli/turn-done', {}, G);
  const tv = (await j('/api/core/stage/asli/7', undefined, G)).body;
  assert.equal(tv.anchor?.kind, 'anchor');
  assert.equal(tv.anchor?.title, 'Beat Gaurav Taneja ka score');
  await wait(50);
});
