// AI ya Asli? server: full games over HTTP, anti-cheat, hero run, analytics (counts only), SSE leaderboard, 50 players.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { startServer } from '../core/helpers.js';

let s;
before(async () => { s = await startServer({ CLAUDE_MOCK: '1' }); });
after(async () => { await s.close(); });

const sidOf = (n) => `asli-test-session-${String(n).padStart(4, '0')}`;
function call(p, body, { sid = sidOf(0), headers = {} } = {}) {
  return fetch(s.base + p, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', cookie: `pz_sid=${sid}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const j = async (p, body, o) => { const r = await call(p, body, o); return { status: r.status, body: await r.json() }; };
/** Pick a generated nickname for this session (1 of 3), like the phone does. Returns it. */
const named = new Set();
export async function pickNick(sid, headers = {}) {
  const o = await j('/api/asli/nicknames', undefined, { sid, headers });
  const r = await j('/api/asli/nickname', { id: o.body.options[0].id }, { sid, headers });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  named.add(sid);
  return r.body.nickname;
}
async function start(sid, headers = {}) {
  if (!named.has(sid)) await pickNick(sid, headers);
  return j('/api/asli/start', { seen: [] }, { sid, headers });
}

/** Play a whole game. pick(i) decides the pick. Returns { start, answers, finish }. */
async function play({ sid = sidOf(0), pick = () => 'ai', headers = {} } = {}) {
  const st = await start(sid, headers);
  assert.equal(st.status, 200, JSON.stringify(st.body));
  const answers = [];
  for (let i = 0; i < st.body.count; i++) {
    const r = (await j('/api/asli/round', { game: st.body.game, i }, { sid, headers })).body;
    const a = await j('/api/asli/answer', { game: st.body.game, i: r.i, pick: pick(r.i) }, { sid, headers });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    answers.push(a.body);
  }
  const fin = await j('/api/asli/finish', { game: st.body.game }, { sid, headers });
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  return { start: st.body, answers, finish: fin.body };
}

/** Subscribe to the board SSE; resolves each message into an array, with arrival times. */
function sse(p) {
  const msgs = [];
  const req = http.get(s.base + p, (res) => {
    let buf = '';
    res.on('data', (d) => {
      buf += d;
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) msgs.push({ at: Date.now(), msg: JSON.parse(line.slice(6)) });
      }
    });
  req.on('socket', (s2) => s2.unref()); // a failed test never keeps the runner alive
  });
  return { msgs, close: () => req.destroy() };
}

test('a full game: rounds come one at a time, answers stay on the server until the visitor picks', async () => {
  const st = await start(sidOf(0));
  assert.equal(st.body.count, 10);
  assert.equal(st.body.rounds, undefined, '/start sends no round content');
  assert.ok(st.body.plan.ai >= 4 && st.body.plan.ai <= 6);
  const g = st.body.game;
  // answering before the round was issued, or skipping ahead, is refused
  assert.equal((await j('/api/asli/answer', { game: g, i: 0, pick: 'ai' })).status, 409);
  assert.equal((await j('/api/asli/round', { game: g, i: 3 })).status, 409);
  // another phone cannot touch this game
  assert.equal((await j('/api/asli/round', { game: g, i: 0 }, { sid: sidOf(9999) })).status, 404);
  // finishing early is refused
  assert.equal((await j('/api/asli/finish', { game: g })).status, 409);
  let total = 0;
  for (let i = 0; i < 10; i++) {
    const r = await j('/api/asli/round', { game: g, i });
    assert.equal(r.status, 200);
    const raw = JSON.stringify(r.body);
    for (const k of ['"answer"', 'reveal', 'credit', 'Public domain', 'AI (Claude)']) assert.ok(!raw.includes(k), `round leaks ${k}`);
    const a = await j('/api/asli/answer', { game: g, i, pick: 'real', ms: 1 });
    assert.ok(['ai', 'real'].includes(a.body.answer));
    assert.equal(a.body.correct, a.body.answer === 'real');
    assert.ok(a.body.reveal && a.body.credit);
    assert.ok(a.body.ms >= 250, 'server time, the client ms is ignored');
    if (a.body.correct) assert.ok(a.body.points >= 100 && a.body.points <= 150);
    total += a.body.points;
    assert.equal(a.body.total, total);
    // a retry of the same answer (lost response) returns the same reveal, it does not 409 or double count
    const again = await j('/api/asli/answer', { game: g, i, pick: 'ai' });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, a.body);
  }
  const fin = await j('/api/asli/finish', { game: g });
  assert.equal(fin.body.points, total);
  assert.ok(fin.body.rank >= 1 && fin.body.players >= 1);
  assert.ok(fin.body.badge);
  assert.equal(fin.body.top.length >= 1, true);
  // finishing twice does not add a second board entry
  const again = await j('/api/asli/finish', { game: g });
  assert.equal(again.body.players, fin.body.players);
});

test('/start is limited per session (12 per 10 min), with a friendly 429', async () => {
  const sid = sidOf(7777);
  await pickNick(sid);
  for (let k = 0; k < 12; k++) assert.equal((await call('/api/asli/start', {}, { sid })).status, 200, `start ${k + 1}`);
  const r = await call('/api/asli/start', {}, { sid });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  const b = await r.json();
  assert.equal(b.error, 'slow_down');
  assert.match(b.message, /break/);
  // the client's hero header alone is NOT an exemption (anyone can send it); a staff phone is (filming)
  assert.equal((await call('/api/asli/start', {}, { sid, headers: { 'x-pz-demo': 'hero' } })).status, 429);
  const { staffToken } = await import('../../core/server/limits.js');
  assert.equal((await call('/api/asli/start', {}, { sid, headers: { 'x-pz-demo': 'hero', cookie: `pz_sid=${sid}; pz_staff=${staffToken('test-admin-key')}` } })).status, 200);
});

test('nicknames: no game without a picked generated name; option ids are one-use; nothing typed is accepted', async () => {
  const sid = sidOf(1);
  const no = await j('/api/asli/start', { nick: 'Riya Sharma 9876543210' }, { sid });
  assert.equal(no.status, 409);
  assert.equal(no.body.error, 'no_nickname');
  const o = await j('/api/asli/nicknames', undefined, { sid });
  assert.equal(o.body.options.length, 3);
  for (const x of o.body.options) assert.match(x.text, /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/);
  assert.equal((await j('/api/asli/nickname', { id: 'made-up' }, { sid })).status, 400);
  const ok = await j('/api/asli/nickname', { id: o.body.options[2].id }, { sid });
  assert.equal(ok.body.nickname, o.body.options[2].text);
  assert.equal((await j('/api/asli/nickname', { id: o.body.options[1].id }, { sid })).status, 400, 'one-use');
  const st = await j('/api/asli/start', { nick: 'Riya Sharma' }, { sid });
  assert.equal(st.body.nick, o.body.options[2].text, 'the typed value is ignored');
});

test('analytics: game_complete, round_right / round_wrong per round, score_10 (counts only)', async () => {
  const sid = sidOf(2);
  const g = await play({ sid, pick: () => 'ai' });
  const r = await j('/admin/stats.json?key=test-admin-key');
  const c = r.body.todayCounts.asli;
  let right = 0; let wrong = 0;
  for (let n = 1; n <= 10; n++) { right += c[`round_right[round=${n}]`] || 0; wrong += c[`round_wrong[round=${n}]`] || 0; }
  assert.ok(right + wrong >= 10);
  assert.ok(c.game_complete >= 1);
  assert.ok(c[`game_score[score=${g.finish.right}]`] >= 1);
  const json = JSON.stringify(r.body);
  assert.ok(!json.includes(g.finish.nick), 'nicknames never reach analytics');
});

test('hero run (?demo=hero): fixed fictional rounds, planned 8/10, demo board, not counted', async () => {
  const hero = JSON.parse(fs.readFileSync(new URL('../../experiences/asli/demo/hero.json', import.meta.url), 'utf8'));
  const headers = { 'x-pz-demo': 'hero' };
  const statsBefore = (await j('/admin/stats.json?key=test-admin-key')).body.todayCounts.asli || {};
  const st = await start(sidOf(4), headers);
  const heroNick = st.body.nick; // a generated nickname, like any visitor (core only accepts nicknames it generated)
  assert.match(heroNick, /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/);
  const ids = [];
  for (let i = 0; i < st.body.count; i++) {
    const r = (await j('/api/asli/round', { game: st.body.game, i }, { sid: sidOf(4), headers })).body;
    ids.push(r.id);
    const a = await j('/api/asli/answer', { game: st.body.game, i, pick: 'hero', want: hero.profile.plan[i] }, { sid: sidOf(4), headers });
    assert.equal(a.body.correct, hero.profile.plan[i]);
  }
  assert.deepEqual(ids, hero.rounds);
  const fin = await j('/api/asli/finish', { game: st.body.game }, { sid: sidOf(4), headers });
  assert.equal(fin.body.right, 8);
  assert.equal(fin.body.board, 'demo');
  const live = await j('/api/asli/board');
  assert.ok(!live.body.top.some((e) => e.label === heroNick), 'hero never on the live board');
  const demo = await j('/api/asli/board?board=demo');
  assert.ok(demo.body.top.some((e) => e.label === heroNick));
  const statsAfter = (await j('/admin/stats.json?key=test-admin-key')).body.todayCounts.asli || {};
  assert.equal(statsAfter.game_complete || 0, statsBefore.game_complete || 0, 'hero not counted');
  // 'hero' picks are refused without the hero header
  const st2 = await start(sidOf(5));
  await j('/api/asli/round', { game: st2.body.game, i: 0 }, { sid: sidOf(5) });
  const a2 = await j('/api/asli/answer', { game: st2.body.game, i: 0, pick: 'hero', want: true }, { sid: sidOf(5) });
  assert.equal(a2.body.pick, null);
  assert.equal(a2.body.correct, false);
});

test('media: approved clips are served, unknown ids are not; teasers come with answers', async () => {
  const ok = await call('/api/asli/media/a001');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /audio\/mp4/);
  assert.equal((await call('/api/asli/media/a999')).status, 404);
  assert.equal((await call('/api/asli/media/t001')).status, 404);
  assert.equal((await call('/api/asli/media/..%2Fmanifest.json')).status, 404);
  const t = await j('/api/asli/teasers');
  assert.ok(t.body.length >= 2 && t.body.every((x) => x.answer && x.text));
});

test('TV leaderboard: SSE update arrives within 1 s of a finished game', async () => {
  const sub = sse('/api/asli/board/stream');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sub.msgs[0].msg.type, 'board');
  const g = await play({ sid: sidOf(6) });
  const finishedAt = Date.now();
  await new Promise((r) => setTimeout(r, 300));
  const upd = sub.msgs.find((m) => m.msg.last && m.msg.last.label === g.finish.nick && m.msg.last.score === g.finish.right);
  sub.close();
  assert.ok(upd, 'got the update');
  assert.ok(upd.at - finishedAt < 1000, `lag ${upd.at - finishedAt} ms`);
  for (const e of upd.msg.top) assert.deepEqual(Object.keys(e).sort(), ['label', 'rank', 'score', 'time']);
});

test('50 concurrent players: every game completes, board and TV stream keep up', async () => {
  const sub = sse('/api/asli/board/stream');
  await new Promise((r) => setTimeout(r, 200));
  const before = (await j('/api/asli/board')).body.players;
  const t0 = Date.now();
  const games = await Promise.all(Array.from({ length: 50 }, (_, k) => play({ sid: sidOf(100 + k), pick: (i) => ((i + k) % 2 ? 'ai' : 'real') })));
  const ms = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 400));
  sub.close();
  assert.equal(games.length, 50);
  const board = (await j('/api/asli/board')).body;
  assert.equal(board.players, before + 50);
  assert.equal(board.top.length, 10);
  const updates = sub.msgs.filter((m) => m.msg.last).length;
  assert.equal(updates, 50, 'one TV update per finished game');
  const best = Math.max(...games.map((g) => g.finish.right));
  assert.ok(board.top[0].score >= best);
  assert.ok(ms < 15000, `50 games took ${ms} ms`);
});
