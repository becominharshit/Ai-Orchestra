// AI ya Asli? duel (TASK-14): rooms, same rounds, server timing, live updates, winner, walkover, cleanup, load.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../core/helpers.js';
import { createDuels, CODE_CHARS, DONE_KEEP_MS } from '../../experiences/asli/lib/duel.js';

Object.assign(process.env, { ASLI_DUEL_COUNTDOWN_MS: '300', ASLI_DUEL_IDLE_MS: '1500' });
const s = await startServer({ CLAUDE_MOCK: '1' });
for (const k of ['ASLI_DUEL_COUNTDOWN_MS', 'ASLI_DUEL_IDLE_MS']) delete process.env[k];
after(async () => { await s.close(); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sid = (n) => `asli-duel-session-${String(n).padStart(4, '0')}`;
let base = null; // which server j() talks to (the load test uses its own with production idle settings)
async function j(p, body, who) {
  const r = await fetch((base || s.base) + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: `pz_sid=${who}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const named = new Map();
async function nickFor(who) {
  if (named.has(who)) return named.get(who);
  const o = await j('/api/asli/nicknames', undefined, who);
  const r = await j('/api/asli/nickname', { id: o.body.options[0].id }, who);
  named.set(who, r.body.nickname);
  return r.body.nickname;
}
function sse(p, who) {
  const msgs = [];
  const req = http.get(s.base + p, { headers: { cookie: `pz_sid=${who}` } }, (res) => {
    let buf = '';
    res.on('data', (d) => {
      buf += d;
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) msgs.push(JSON.parse(line.slice(6)));
      }
    });
  req.on('socket', (s2) => s2.unref()); // a failed test never keeps the runner alive
  });
  return { msgs, close: () => req.destroy() };
}
/** Play all 10 rounds of a room for one player. Returns the round ids. */
async function playRoom(code, who, pick = () => 'ai') {
  const ids = [];
  for (let i = 0; i < 10; i++) {
    let r = await j('/api/asli/duel/round', { code, i }, who);
    while (r.body.wait) { await wait(Math.min(200, r.body.wait)); r = await j('/api/asli/duel/round', { code, i }, who); }
    assert.equal(r.status, 200, JSON.stringify(r.body));
    ids.push(r.body.id);
    const a = await j('/api/asli/duel/answer', { code, i, pick: pick(i) }, who);
    assert.equal(a.status, 200, JSON.stringify(a.body));
  }
  return ids;
}
/** Join core's big-screen queue on counter 7 and wait for the turn. */
async function takeTurn(who) {
  const q = await j('/api/core/stage/queue', { exp: 'asli', c: 7 }, who);
  assert.ok(q.body.ticket, JSON.stringify(q.body));
  for (let k = 0; k < 50; k++) { const st = await j(`/api/core/stage/queue/${q.body.ticket}`, undefined, who); if (st.body.status === 'your_turn') return { ...st.body.turn, ticket: q.body.ticket }; await wait(100); }
  throw new Error('no turn');
}
const stats = async () => (await (await fetch(`${s.base}/admin/stats.json?key=test-admin-key`)).json()).todayCounts.asli || {};

test('room: needs a nickname, 4-character code from the safe alphabet, join link, join rules', async () => {
  const A = sid(1); const B = sid(2); const C = sid(3);
  assert.equal((await j('/api/asli/duel/create', { c: 7 }, A)).status, 409, 'no nickname yet');
  await nickFor(A);
  const cr = await j('/api/asli/duel/create', { c: 7 }, A);
  assert.equal(cr.status, 200);
  assert.match(cr.body.code, new RegExp(`^[${CODE_CHARS}]{4}$`));
  assert.ok(cr.body.url.endsWith(`/asli/?c=7&room=${cr.body.code}`));
  assert.equal(cr.body.room.state, 'waiting');
  assert.equal((await j('/api/asli/duel/create', { c: 7 }, A)).body.code, cr.body.code, 'one open room per phone');
  assert.equal((await j('/api/asli/duel/join', { code: 'ZZZZ' }, B)).status, 409, 'B has no nickname');
  await nickFor(B); await nickFor(C);
  assert.equal((await j('/api/asli/duel/join', { code: 'ZZZ9' }, B)).status, 404);
  const jn = await j('/api/asli/duel/join', { code: cr.body.code.toLowerCase() }, B);
  assert.equal(jn.status, 200, JSON.stringify(jn.body));
  assert.equal(jn.body.room.state, 'countdown');
  assert.equal((await j('/api/asli/duel/join', { code: cr.body.code }, B)).status, 200, 'joining again is fine');
  assert.equal((await j('/api/asli/duel/join', { code: cr.body.code }, C)).status, 409, 'max 2 players');
  assert.equal((await j('/api/asli/duel/round', { code: cr.body.code, i: 0 }, C)).status, 403, 'outsiders cannot play');
  const early = await j('/api/asli/duel/round', { code: cr.body.code, i: 0 }, A);
  assert.ok(early.body.wait > 0, 'rounds start together after the countdown');
  await j('/api/asli/duel/leave', { code: cr.body.code }, A);
});

test('a full duel: same 10 rounds, live scores over SSE, winner by right answers then time, both on the leaderboard', async () => {
  const A = sid(10); const B = sid(11);
  const nA = await nickFor(A); const nB = await nickFor(B);
  const before = await stats();
  const players0 = (await j('/api/asli/board')).body.players;
  const tvBus = sse('/api/core/bus/asli/7/stream', 'asli-duel-tv-screen');
  await wait(150);
  const code = (await j('/api/asli/duel/create', { c: 7 }, A)).body.code;
  // the room reaches the TV only through the host's big-screen turn (core queue)
  assert.equal((await j('/api/asli/duel/tv', { code }, A)).status, 409, 'no turn yet');
  await takeTurn(A);
  assert.equal((await j('/api/asli/duel/tv', { code }, A)).body.onTv, true);
  const evA = sse(`/api/asli/duel/${code}/stream`, A);
  await j('/api/asli/duel/join', { code }, B);
  const [idsA, idsB] = await Promise.all([playRoom(code, A, () => 'ai'), playRoom(code, B, () => 'real')]);
  assert.deepEqual(idsA, idsB, 'same rounds for both');
  const fA = await j('/api/asli/duel/finish', { code }, A);
  const fB = await j('/api/asli/duel/finish', { code }, B);
  const fA2 = fA.body.waiting ? await j('/api/asli/duel/finish', { code }, A) : fA;
  assert.equal(fB.body.room.state, 'done');
  const rA = fA2.body.room.result; const rB = fB.body.room.result;
  assert.equal(rA.me.right + rB.me.right, 10, 'ai vs real covers every round');
  assert.equal(rA.friend.nick, nB); assert.equal(rB.friend.nick, nA);
  const pair = [rA.outcome, rB.outcome].sort().join('/');
  assert.ok(['lost/won', 'tie/tie'].includes(pair), pair);
  if (rA.right !== rB.right) assert.equal(rA.outcome, rA.me.right > rB.me.right ? 'won' : 'lost');
  // winner card: the friend's generated nickname only, all public text
  const win = rA.outcome === 'won' ? fA2.body : fB.body;
  const loserNick = rA.outcome === 'won' ? nB : nA;
  if (pair === 'lost/won') assert.equal(win.share.title.text, `Maine ${loserNick} ko AI ya Asli mein haraya`);
  for (const l of [win.share.title, ...win.share.lines]) assert.ok(l.pt && typeof l.text === 'string');
  assert.ok(win.tv.title && win.tv.lines.length === 1);
  // live updates: the stream saw progress and the final state
  await wait(200);
  evA.close();
  assert.ok(evA.msgs.some((m) => m.players?.[1]?.n > 0 && m.state !== 'done'), 'live progress');
  assert.ok(evA.msgs.some((m) => m.state === 'done'));
  // the host's score waits until the result has been on the TV, then /turn-done posts it (ends the turn)
  assert.equal((await j('/api/asli/board')).body.players, players0 + 1, 'host post deferred during the big-screen turn');
  assert.equal((await j('/api/asli/turn-done', {}, A)).body.posted, true);
  const board = (await j('/api/asli/board')).body;
  assert.equal(board.players, players0 + 2, 'both duel scores on the leaderboard');
  // the counter TV got the duel from the server (strict public text): orchestra, both live scores, the result
  tvBus.close();
  const evs = tvBus.msgs.filter((m) => m.type === 'events').flatMap((m) => m.events);
  assert.ok(evs.some((e) => e.t === 'init' && e.title === 'AI ya Asli? duel'), 'init');
  const duelEv = evs.filter((e) => e.t === 'custom' && e.name === 'duel');
  assert.ok(duelEv.length >= 10, `live score events: ${duelEv.length}`);
  assert.deepEqual(duelEv.at(-1).data.items.map((x) => x.label).sort(), [nA, nB].sort());
  assert.ok(evs.some((e) => e.t === 'custom' && e.name === 'round' && e.data.state === 'ask'), 'host rounds on the TV');
  const res = evs.find((e) => e.t === 'result');
  assert.ok(res && /jeeta!|barabar takkar!/.test(res.payload.title), JSON.stringify(res?.payload));
  const after2 = await stats();
  assert.equal((after2.duel_start || 0) - (before.duel_start || 0), 1);
  assert.equal((after2.duel_complete || 0) - (before.duel_complete || 0), 1);
  assert.ok(!JSON.stringify(after2).includes(nA), 'counts only');
});

test('after a duel, a solo game that starts 5 s later keeps the TV (no late end from the duel: CHECK-14 F1)', async () => {
  const A = sid(30); const B = sid(31); const SOLO = 'asli-solo-after-duel-phone';
  await nickFor(A); await nickFor(B); await nickFor(SOLO);
  const tvBus = sse('/api/core/bus/asli/7/stream', 'asli-tv-screen-f1');
  const code = (await j('/api/asli/duel/create', { c: 7 }, A)).body.code;
  await takeTurn(A);
  await j('/api/asli/duel/tv', { code }, A);
  await j('/api/asli/duel/join', { code }, B);
  await Promise.all([playRoom(code, A), playRoom(code, B, () => 'real')]);
  await j('/api/asli/duel/finish', { code }, A);
  await j('/api/asli/duel/finish', { code }, B);
  await j('/api/asli/turn-done', {}, A); // the host's turn ends after the result
  await wait(5000);
  const init = { t: 'init', title: 'AI ya Asli?', orchestrator: { id: 'quiz', name: 'Quizmaster', role: 'Orchestrator', icon: 'crown' }, agents: [{ id: 'curator', name: 'Curator', role: 'Balanced 10 rounds', icon: 'search' }, { id: 'detector', name: 'Detector Agent', role: 'Apna guess + confidence', icon: 'eye' }, { id: 'score', name: 'Scorekeeper', role: 'Speed + accuracy', icon: 'chart' }] };
  const p1 = await j('/api/core/bus/asli/7', { sid: 'solo-play-after-duel', events: [init] }, SOLO);
  assert.equal(p1.body.accepted, 1, JSON.stringify(p1.body));
  await wait(300); // the solo game's own "session" message arrives just after the POST
  assert.ok(tvBus.msgs.some((m) => m.type === 'session'), 'the solo game took the TV');
  const mark = tvBus.msgs.length;
  await wait(17000); // past the old 20 s delayed end
  const p2 = await j('/api/core/bus/asli/7', { sid: 'solo-play-after-duel', events: [{ t: 'log', id: 'quiz', text: 'Round 1/10: text, 6s' }] }, SOLO);
  assert.equal(p2.body.accepted, 1, `solo event after 22 s: ${JSON.stringify(p2.body)}`);
  await wait(200);
  tvBus.close();
  const later = tvBus.msgs.slice(mark);
  assert.ok(!later.some((m) => m.type === 'session'), 'no session switch away from the solo game');
  assert.ok(later.some((m) => m.type === 'events' && m.events.some((e) => e.t === 'log' && e.text === 'Round 1/10: text, 6s')), 'the TV got the solo log');
  const duelEvents = tvBus.msgs.filter((m) => m.type === 'events').flatMap((m) => m.events);
  const resIdx = duelEvents.findIndex((e) => e.t === 'result');
  assert.equal(duelEvents[resIdx + 1]?.t, 'end', 'the duel ends in the same batch as its result');
}, { timeout: 60000 });

test('abandoned: a silent player loses by walkover, the room cleans up, counted as duel_abandoned', async () => {
  const A = sid(20); const B = sid(21);
  await nickFor(A); await nickFor(B);
  const before = await stats();
  const tvBus = sse('/api/core/bus/asli/7/stream', 'asli-tv-screen-walkover');
  const code = (await j('/api/asli/duel/create', { c: 7 }, A)).body.code;
  await takeTurn(A);
  await j('/api/asli/duel/tv', { code }, A);
  await j('/api/asli/duel/join', { code }, B);
  await playRoom(code, A);
  const f = await j('/api/asli/duel/finish', { code }, A);
  assert.equal(f.body.waiting, true);
  await wait(4200); // B never plays: idle 1.5 s + sweep every 2 s
  const f2 = await j('/api/asli/duel/finish', { code }, A);
  assert.equal(f2.body.room.result.outcome, 'walkover');
  assert.ok(f2.body.share.lines.some((l) => /chala gaya/.test(l.text)));
  assert.ok(!f2.body.share.lines.some((l) => /zyada tez/.test(l.text)) && !f2.body.tv.lines.some((l) => /zyada tez/.test(l)), 'walkover is not about speed (phone)');
  await j('/api/asli/turn-done', {}, A);
  tvBus.close();
  const res = tvBus.msgs.filter((m) => m.type === 'events').flatMap((m) => m.events).find((e) => e.t === 'result');
  assert.ok(res, 'walkover result on the TV');
  assert.ok(!res.payload.lines.some((l) => /zyada tez/.test(l)), `walkover is not about speed (TV): ${res.payload.lines}`);
  const after2 = await stats();
  assert.equal((after2.duel_abandoned || 0) - (before.duel_abandoned || 0), 1);
  // a waiting room whose creator leaves is gone at once
  const c2 = (await j('/api/asli/duel/create', { c: 7 }, B)).body.code;
  await j('/api/asli/duel/leave', { code: c2 }, B);
  assert.equal((await j('/api/asli/duel/join', { code: c2 }, A)).status, 404);
});

test('rooms expire: waiting rooms after 10 min, finished rooms after 3 min (unit, fake clock)', () => {
  let t = 1_000_000;
  const d = createDuels({ now: () => t, curate: () => Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, type: 'text', body: 'x', answer: 'ai' })) });
  const a = d.create('a', 'ChillMomo42', 6).room;
  t += 10 * 60 * 1000 + 1;
  d.sweep();
  assert.equal(d.get(a.code), null, 'waiting room expired');
  const b = d.create('a', 'ChillMomo42', 6).room;
  d.join(b.code, 'b', 'NeonChai12');
  d.leave(b, d.player(b, 'b'));
  assert.equal(b.state, 'done');
  t += DONE_KEEP_MS + 1;
  d.sweep();
  assert.equal(d.get(b.code), null, 'finished room dropped');
  assert.equal(d.rooms.size, 0);
  d.close();
});

test('load: 25 duel rooms (50 phones) and 50 solo players at the same time (TV publishing on)', async () => {
  const L = await startServer({ CLAUDE_MOCK: '1' }); // production idle (60 s) and countdown (4 s)
  base = L.base;
  named.clear();
  const t0 = Date.now();
  const players0 = (await j('/api/asli/board')).body.players;
  const solo = async (k) => {
    const who = sid(500 + k);
    await nickFor(who);
    const st = await j('/api/asli/start', {}, who);
    for (let i = 0; i < 10; i++) { await j('/api/asli/round', { game: st.body.game, i }, who); await j('/api/asli/answer', { game: st.body.game, i, pick: i % 2 ? 'ai' : 'real' }, who); }
    const f = await j('/api/asli/finish', { game: st.body.game }, who);
    assert.equal(f.status, 200);
  };
  const room = async (k) => {
    const A = sid(700 + k); const B = sid(800 + k);
    await nickFor(A); await nickFor(B);
    const code = (await j('/api/asli/duel/create', { c: 7 }, A)).body.code;
    assert.equal((await j('/api/asli/duel/join', { code }, B)).status, 200);
    await Promise.all([playRoom(code, A), playRoom(code, B, (i) => (i % 3 ? 'ai' : 'real'))]);
    await j('/api/asli/duel/finish', { code }, A);
    const fb = await j('/api/asli/duel/finish', { code }, B);
    const fa = await j('/api/asli/duel/finish', { code }, A);
    assert.equal(fb.body.room.state, 'done');
    assert.ok(fa.body.room.result && fb.body.room.result);
  };
  await Promise.all([...Array.from({ length: 50 }, (_, k) => solo(k)), ...Array.from({ length: 25 }, (_, k) => room(k))]);
  const ms = Date.now() - t0;
  const board = (await j('/api/asli/board')).body;
  assert.equal(board.players, players0 + 100, '50 solo + 50 duel scores');
  assert.ok(ms < 60000, `took ${ms} ms`); // correctness is the point; the wall time depends on what else runs on the machine
  console.log(`  load: 25 rooms + 50 solo in ${ms} ms`);
  base = null;
  await L.close();
});

test('duel rooms are capped per IP (open rooms), with a friendly 429', async () => {
  Object.assign(process.env, { ASLI_ROOMS_PER_IP: '3' });
  const L = await startServer({ CLAUDE_MOCK: '1' });
  delete process.env.ASLI_ROOMS_PER_IP;
  base = L.base;
  named.clear();
  try {
    const codes = [];
    for (let k = 0; k < 4; k++) { const who = sid(900 + k); await nickFor(who); codes.push((await j('/api/asli/duel/create', { c: 7 }, who))); }
    assert.deepEqual(codes.map((r) => r.status), [200, 200, 200, 429]);
    assert.equal(codes[3].body.error, 'slow_down');
    // the same phone asking again gets its own open room back (not counted twice)
    assert.equal((await j('/api/asli/duel/create', { c: 7 }, sid(900))).status, 200);
  } finally { base = null; named.clear(); await L.close(); }
});

test('a leave at 0-0: no "zyada tez" on either card or the TV, and the host\'s big-screen turn ends at once (CHECK-14b F5b, risk a)', async () => {
  const A = sid(40); const B = sid(41);
  await nickFor(A); await nickFor(B);
  const tvBus = sse('/api/core/bus/asli/7/stream', 'asli-tv-screen-left');
  const code = (await j('/api/asli/duel/create', { c: 7 }, A)).body.code;
  const turn = await takeTurn(A);
  await j('/api/asli/duel/tv', { code }, A);
  await j('/api/asli/duel/join', { code }, B);
  await wait(400); // countdown
  await j('/api/asli/duel/leave', { code }, B); // the friend leaves before anyone scores: walkover for the host
  const fA = (await j('/api/asli/duel/finish', { code }, A)).body;
  const fB = (await j('/api/asli/duel/finish', { code }, B)).body;
  assert.equal(fA.room.result.outcome, 'walkover');
  assert.equal(fB.room.result.outcome, 'left');
  for (const f of [fA, fB]) {
    assert.ok(!f.share.lines.some((l) => /zyada tez/.test(l.text)), `card: ${f.share.lines.map((l) => l.text)}`);
    assert.ok(!f.tv.lines.some((l) => /zyada tez/.test(l)), `tv lines: ${f.tv.lines}`);
  }
  // the host's turn is over within seconds (not core's 4 minutes)
  let st = null;
  for (let k = 0; k < 40; k++) { st = (await j(`/api/core/stage/queue/${turn.ticket}`, undefined, A)).body; if (st.status === 'done') break; await wait(200); }
  assert.equal(st.status, 'done', 'host turn ended after the walkover');
  tvBus.close();
  const res = tvBus.msgs.filter((m) => m.type === 'events').flatMap((m) => m.events).find((e) => e.t === 'result');
  assert.ok(res && !res.payload.lines.some((l) => /zyada tez/.test(l)), 'TV result');
}, { timeout: 30000 });

test('STAGE_QUEUE=0: the host\'s "Big screen pe dikhao" switch still puts the duel on the TV (risk c)', async () => {
  Object.assign(process.env, { STAGE_QUEUE: '0', ASLI_DUEL_COUNTDOWN_MS: '300' });
  const L = await startServer({ CLAUDE_MOCK: '1' });
  delete process.env.STAGE_QUEUE; delete process.env.ASLI_DUEL_COUNTDOWN_MS;
  base = L.base;
  named.clear();
  try {
    const tvBus = (() => { const msgs = []; const req = http.get(`${L.base}/api/core/bus/asli/7/stream`, (res) => { let buf = ''; res.on('data', (d) => { buf += d; let k; while ((k = buf.indexOf('\n\n')) >= 0) { const c = buf.slice(0, k); buf = buf.slice(k + 2); const line = c.split('\n').find((x) => x.startsWith('data: ')); if (line) msgs.push(JSON.parse(line.slice(6))); } }); }); req.on('socket', (s2) => s2.unref()); return { msgs, close: () => req.destroy() }; })();
    const on = [sid(60), sid(61)]; const off = [sid(62), sid(63)];
    for (const w of [...on, ...off]) await nickFor(w);
    const c1 = (await j('/api/asli/duel/create', { c: 7, tv: true }, on[0])).body.code;
    await j('/api/asli/duel/join', { code: c1 }, on[1]);
    await wait(300);
    const evs = () => tvBus.msgs.filter((m) => m.type === 'events').flatMap((m) => m.events);
    assert.ok(evs().some((e) => e.t === 'init' && e.title === 'AI ya Asli? duel'), 'switch on: the duel is on the TV');
    const n = evs().length;
    const c2 = (await j('/api/asli/duel/create', { c: 7, tv: false }, off[0])).body.code;
    await j('/api/asli/duel/join', { code: c2 }, off[1]);
    await wait(300);
    assert.equal(evs().length, n, 'switch off: nothing on the TV');
    tvBus.close();
  } finally { base = null; named.clear(); await L.close(); }
});
