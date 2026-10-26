// Stage mode (CONTRACT 12): nicknames, leaderboards, big-screen queue, anchor / record card, reward token.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStage, makeNickname, NICK_RE, ANCHORS } from '../../core/server/stage.js';
import { createBus, checkEvent } from '../../core/server/bus.js';
import { createSafety } from '../../core/server/safety.js';
import { createAnalytics } from '../../core/server/analytics.js';
import { makeConfig } from '../../core/server/config.js';
import { staffToken } from '../../core/server/limits.js';
import { startServer, json, tmpDir } from './helpers.js';

const servers = [];
after(async () => { for (const s of servers) await s.close().catch(() => {}); });

function rig(o = {}) {
  let t = 1_000_000;
  const config = makeConfig({ DATA_DIR: tmpDir('stage'), ...o });
  const analytics = createAnalytics({ config });
  const safety = createSafety({ config, claude: null });
  const bus = createBus({ config, safety });
  const stage = createStage({ config, analytics, bus, safety, now: () => t });
  bus.setStage(stage);
  safety.setNicknameCheck((n) => stage.isKnownNickname(n)); // as core/server/index.js wires it
  stage.declare('shark', { boards: [{ id: 'total', title: 'Aaj ke top pitches', unit: '/40', order: 'desc', min: 0, max: 40 }], panels: { leaderboard: 'total' } });
  const nick = (sid) => stage.choose(sid, stage.offer(sid)[0].id);
  return { stage, bus, analytics, safety, config, nick, tick: (ms) => { t += ms; } };
}

test('nicknames: at most 12 characters, CamelCase, never an @handle, never phone-like, TV-safe', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const n = makeNickname();
    seen.add(n);
    assert.ok(n.length <= 12, n);
    assert.match(n, NICK_RE);
    assert.ok(!n.includes('@'));
    assert.ok((n.match(/\d/g) || []).length <= 2, n);
    assert.equal(checkEvent({ t: 'log', id: 'x', text: n }).ok, true, n);
  }
  assert.ok(seen.size > 300, 'plenty of variety');
});

test('no free-text nickname: only one of the 3 offered ids, for the same session', () => {
  const { stage } = rig();
  const offers = stage.offer('s1');
  assert.equal(offers.length, 3);
  assert.equal(stage.choose('s1', 'Priya Sharma'), null);
  assert.equal(stage.choose('s2', offers[0].id), null, 'another session cannot use my offer');
  assert.equal(stage.choose('s1', offers[1].id), offers[1].text);
  assert.equal(stage.nicknameOf('s1'), offers[1].text);
  assert.equal(stage.choose('s1', offers[2].id), null, 'offers are one-use');
});

test('leaderboard: server-side only, needs a nickname, validates score and extra text, ranks and persists', () => {
  const r = rig();
  const req = { sid: 'p1' };
  assert.equal(r.stage.post('shark', req, 'total', { score: 30 }).reason, 'no_nickname');
  const n1 = r.nick('p1');
  assert.equal(r.stage.post('shark', req, 'nope', { score: 3 }).reason, 'unknown_board');
  assert.equal(r.stage.post('shark', req, 'total', { score: 99 }).reason, 'bad_score');
  assert.equal(r.stage.post('shark', req, 'total', { score: 30, extra: { verdict: 'Priya ka idea best hai' } }).reason, 'bad_extra', 'free text in extra is refused');
  r.safety.template('shark', 'deal', '{n} Deal', { n: 'int:0..3' });
  assert.equal(r.stage.post('shark', req, 'total', { score: 30, extra: { verdict: '2 Deal', time: 41 } }).ok, true);
  r.nick('p2');
  assert.equal(r.stage.post('shark', { sid: 'p2' }, 'total', { score: 35 }).rank, 1);
  const b = r.stage.board('shark', 'total');
  assert.deepEqual(b.map((x) => x.score), [35, 30]);
  assert.equal(b[1].nickname, n1);
  r.stage.stop();
  const again = createStage({ config: r.config, analytics: r.analytics, bus: r.bus, safety: r.safety, now: () => 1_000_000 });
  assert.deepEqual(again.board('shark', 'total').map((x) => x.score), [35, 30], 'persisted in stage.json');
  again.stop();
});

test('queue: nickname first, max 10, one turn at a time, only that phone reaches the TV, token at the end, expiry', () => {
  const r = rig({ PUBLIC_TEXT_STRICT: '0' }); // synthetic TV text; the hold rule is under test
  assert.equal(r.stage.join('shark', 4, 'x').reason, 'no_nickname');
  const sids = Array.from({ length: 12 }, (_, i) => `q${i}`);
  sids.forEach((s) => r.nick(s));
  const joins = sids.map((s) => r.stage.join('shark', 4, s));
  assert.ok(joins.slice(0, 11).every((j) => j.ok), 'the first runs at once, 10 wait');
  assert.equal(joins[11].reason, 'full');
  assert.equal(r.stage.status(joins[0].ticket, 'q0').status, 'your_turn');
  assert.equal(r.stage.status(joins[1].ticket, 'q1').status, 'waiting');
  assert.equal(r.stage.status(joins[1].ticket, 'q1').ahead, 1);
  assert.equal(r.stage.status(joins[0].ticket, 'q5').status, 'expired', 'tickets are bound to the session');
  // only q0 reaches the TV now
  const ev = [{ t: 'init', orchestrator: { id: 'g', name: 'Host' }, agents: [] }, { t: 'log', id: 'g', text: '7' }];
  assert.equal(r.bus.publish('shark', 4, 'a', ev, { session: 'q3', ip: '1' }).held, true);
  assert.equal(r.bus.publish('shark', 4, 'b', ev, { session: 'q0', ip: '1' }).accepted, 2);
  // the turn ends with a post; q1 is next; q0 has a 4-character token (after at least 20 s of play)
  r.tick(21000);
  r.stage.post('shark', { sid: 'q0' }, 'total', { score: 20 });
  const done = r.stage.status(joins[0].ticket, 'q0');
  assert.equal(done.status, 'done');
  assert.match(done.token, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(r.stage.status(joins[1].ticket, 'q1').status, 'your_turn');
  // waiting entries that stop polling expire after 3 minutes; a running turn after 4
  for (let i = 2; i <= 10; i++) r.stage.status(joins[i].ticket, sids[i]);
  r.tick(3 * 60 * 1000 + 1000);
  assert.equal(r.stage.status(joins[5].ticket, 'q5').status, 'expired');
  r.stage.stop();
});

test('anchor: nothing exists without a played turn; consent and the fixed list are required; hide works; record card', () => {
  const r = rig();
  assert.equal(r.stage.anchor('shark', 4), null);
  assert.equal(r.stage.op('shark', 4, 'anchor', { name: 'Some Celebrity', consent: true }).reason, 'unknown_anchor');
  assert.equal(r.stage.op('shark', 4, 'anchor', { name: ANCHORS[1] }).reason, 'consent_required');
  assert.equal(r.stage.op('shark', 4, 'anchor', { name: ANCHORS[1], consent: true }).ok, true);
  assert.equal(r.stage.anchor('shark', 4), null, 'a pending guest star turn shows nothing');
  assert.equal(r.stage.tvData('shark', 4).anchor, null);
  r.nick('star');
  const j = r.stage.join('shark', 4, 'star');
  assert.equal(r.stage.status(j.ticket, 'star').status, 'waiting', 'a pending guest star waits for the operator');
  r.stage.op('shark', 4, 'next');
  assert.equal(r.stage.status(j.ticket, 'star').turn.anchor.name, ANCHORS[1]);
  r.stage.post('shark', { sid: 'star' }, 'total', { score: 33 });
  const a = r.stage.anchor('shark', 4);
  assert.equal(a.title, `Beat ${ANCHORS[1]} ka score`);
  assert.equal(a.score, 33);
  r.stage.op('shark', 4, 'hide', { hidden: true });
  assert.equal(r.stage.anchor('shark', 4), null, 'hidden in one tap');
  r.stage.op('shark', 4, 'hide', { hidden: false });
  assert.ok(r.stage.anchor('shark', 4));
  // record turn on another counter
  r.stage.op('shark', 5, 'record');
  r.nick('fy');
  r.stage.join('shark', 5, 'fy');
  r.stage.op('shark', 5, 'next');
  r.stage.post('shark', { sid: 'fy' }, 'total', { score: 28 });
  assert.equal(r.stage.anchor('shark', 5).title, 'Zenith ka record');
  r.stage.stop();
});

test('reward token: "Reward given" counts reward_given once; the token is not kept', () => {
  const r = rig();
  r.nick('w');
  const j = r.stage.join('shark', 4, 'w');
  r.tick(21000);
  r.stage.endTurn(r.stage.status(j.ticket, 'w').turn.id);
  const token = r.stage.status(j.ticket, 'w').token;
  assert.equal(r.stage.opView('shark', 4).lastToken, token);
  assert.equal(r.stage.op('shark', 4, 'reward', { token: 'ZZZZ' }).reason, 'unknown_token');
  assert.equal(r.stage.op('shark', 4, 'reward', { token }).ok, true);
  assert.equal(r.stage.op('shark', 4, 'reward', { token }).reason, 'unknown_token');
  assert.equal(r.analytics.totals().shark.reward_given, 1);
  assert.equal(r.stage.opView('shark', 4).lastToken, null);
  r.stage.stop();
});

test('flags default on; STAGE_QUEUE=0 switches the queue off', () => {
  assert.deepEqual(makeConfig({}).stage, { loop: true, queue: true, anchor: true, reward: true, minTurnMs: 20000 });
  assert.equal(makeConfig({ STAGE_MIN_TURN_S: '0' }).stage.minTurnMs, 0);
  const r = rig({ STAGE_QUEUE: '0' });
  r.nick('f');
  assert.equal(r.stage.join('shark', 4, 'f').reason, 'off');
  r.stage.stop();
});

test('HTTP: nickname, queue, TV stage data and the staff-only operator actions', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', STAGE_MIN_TURN_S: '0' });
  servers.push(s);
  const phone = { cookie: 'pz_sid=stage-phone-1' };
  assert.equal((await json(s.base, '/api/core/stage/nickname', { id: 'TurboJugnu' }, phone)).status, 400, 'no free text');
  const o = await (await fetch(`${s.base}/api/core/stage/nicknames`, { headers: phone })).json();
  const pick = await (await json(s.base, '/api/core/stage/nickname', { id: o.options[2].id }, phone)).json();
  assert.equal(pick.nickname, o.options[2].text);
  const j = await (await json(s.base, '/api/core/stage/queue', { exp: '_sample', c: 2 }, phone)).json();
  assert.equal(j.ok, true);
  const st = await (await fetch(`${s.base}/api/core/stage/queue/${j.ticket}`, { headers: phone })).json();
  assert.equal(st.status, 'your_turn');
  // the sample posts the score itself (server-side), which ends the turn
  await json(s.base, '/api/_sample/vibe', { word: 'swift', subject: 'coding' }, { ...phone, 'x-pz-counter': '2' });
  const d = await (await fetch(`${s.base}/api/core/stage/_sample/2`)).json();
  assert.equal(d.board.rows[0].nickname, pick.nickname);
  assert.equal(d.anchor, null);
  assert.equal(d.about, 'Zenith first-years ne AI agents ke saath banaye');
  assert.deepEqual(Object.keys(d.counters).sort(), ['followedAndSaw', 'played', 'shares']);
  assert.equal((await json(s.base, '/api/core/ops/_sample/2/stage/next', {})).status, 403, 'staff only');
  const staff = { cookie: `pz_staff=${staffToken('k')}` };
  const op = await (await fetch(`${s.base}/api/core/ops/_sample/2`, { headers: staff })).json();
  assert.ok(op.stage.lastToken);
  assert.equal((await (await json(s.base, '/api/core/ops/_sample/2/stage/reward', { token: op.stage.lastToken }, staff)).json()).ok, true);
  assert.equal((await json(s.base, '/api/core/stage/queue', { exp: 'nope', c: 2 }, phone)).status, 404);
});

test('tieBreak, count(), and server-side publishes may use any nickname core generated today', () => {
  const r = rig();
  r.stage.declare('asli', { boards: [{ id: 'live', title: 'Top', unit: '/10', order: 'desc', min: 0, max: 10, tieBreak: { key: 'time', order: 'asc' } }] });
  const nicks = ['a', 'b', 'c', 'd'].map((s) => r.nick(s));
  r.stage.post('asli', { sid: 'a' }, 'live', { score: 8, extra: { time: 50 } });
  r.stage.post('asli', { sid: 'b' }, 'live', { score: 8, extra: { time: 31 } });
  r.stage.post('asli', { sid: 'c' }, 'live', { score: 9, extra: { time: 70 } });
  r.stage.post('asli', { sid: 'd' }, 'live', { score: 8 });
  assert.deepEqual(r.stage.board('asli', 'live').map((e) => e.nickname), [nicks[2], nicks[1], nicks[0], nicks[3]], 'equal 8s: faster first, no time last');
  assert.equal(r.stage.count('asli', 'live'), 4);
  assert.equal(r.stage.count('asli', 'nope'), 0);
  // a duel TV line naming two players: server publish accepts generated nicknames, a phone post only its own
  r.safety.template('asli', 'vs', '{a} vs {b}', { a: 'nickname', b: 'nickname' });
  r.safety.bank('asli', 'names', { duel: 'duel' }); // the custom event name is TV text too
  const line = `${nicks[0]} vs ${nicks[1]}`;
  const init = { t: 'init', orchestrator: { id: 'host', name: 'Host' }, agents: [] };
  assert.equal(r.safety.isPublic('asli', line), true, 'server side: any nickname core generated today');
  assert.equal(r.safety.isPublic('asli', 'RahulSharma vs PriyaSingh7'), false);
  assert.equal(r.safety.isPublic('asli', line, { nickname: nicks[0] }), false, 'a phone post may only use its own nickname');
  assert.equal(r.bus.publish('asli', 6, 'srv', [{ t: 'custom', name: 'duel', data: { text: line } }]).accepted, 1);
  r.stage.stop();
});

// ---------- CHECK-12 fixes ----------
test('CHECK-12 WARN-A: one offer set per session, offers swept after 10 min, finished turns and tickets after 30 min, a hard cap', () => {
  const r = rig();
  for (let i = 0; i < 50; i++) r.stage.offer('same');
  assert.equal(r.stage.sizes().offers, 3, 'a new offer set replaces the old one');
  for (let i = 0; i < 2000; i++) r.stage.offer(`flood-${i}`);
  assert.ok(r.stage.sizes().offers <= 5000, 'capped');
  r.tick(10 * 60 * 1000 + 1);
  r.stage.sweepMemory();
  assert.equal(r.stage.sizes().offers, 0, 'old offers are gone');
  r.nick('m');
  const j = r.stage.join('shark', 4, 'm');
  r.tick(25000);
  r.stage.endTurn(r.stage.status(j.ticket, 'm').turn.id);
  r.tick(29 * 60 * 1000);
  r.stage.sweepMemory();
  assert.equal(r.stage.sizes().turns, 1, 'a token stays redeemable for 30 minutes');
  r.tick(2 * 60 * 1000);
  r.stage.sweepMemory();
  assert.deepEqual([r.stage.sizes().turns, r.stage.sizes().tickets], [0, 0]);
  r.stage.stop();
});

test('CHECK-12 WARN-B: a pending guest star goes only to the turn the operator starts with Next, expires after 5 min, Clear drops it', () => {
  const r = rig();
  ['a', 'b', 'c', 'd'].forEach((x) => r.nick(x));
  const ja = r.stage.join('shark', 4, 'a'); // running, a normal visitor
  assert.equal(r.stage.op('shark', 4, 'anchor', { name: ANCHORS[2], consent: true }).ok, true);
  const jb = r.stage.join('shark', 4, 'b');
  r.tick(25000);
  r.stage.endTurn(r.stage.status(ja.ticket, 'a').turn.id); // the visitor's turn ends by itself
  assert.equal(r.stage.status(jb.ticket, 'b').status, 'waiting', 'nobody inherits the guest star by just being next');
  assert.equal(r.stage.opView('shark', 4).pending.anchor, ANCHORS[2]);
  r.stage.op('shark', 4, 'next');
  assert.equal(r.stage.status(jb.ticket, 'b').turn.anchor.name, ANCHORS[2], 'the operator chose this turn');
  assert.equal(r.stage.opView('shark', 4).pending, null);
  // expiry: unused for 5 minutes, then the queue runs normally again
  r.stage.op('shark', 5, 'anchor', { name: ANCHORS[0], consent: true });
  const jc = r.stage.join('shark', 5, 'c');
  assert.equal(r.stage.status(jc.ticket, 'c').status, 'waiting');
  for (let i = 0; i < 6; i++) { r.tick(55000); r.stage.status(jc.ticket, 'c'); } // the phone keeps polling
  const st = r.stage.status(jc.ticket, 'c');
  assert.equal(st.status, 'your_turn');
  assert.equal(st.turn.anchor, null, 'an expired guest star is never applied');
  // Clear drops it
  r.stage.op('shark', 6, 'record');
  r.stage.op('shark', 6, 'clear');
  assert.equal(r.stage.opView('shark', 6).pending, null);
  const jd = r.stage.join('shark', 6, 'd');
  assert.equal(r.stage.status(jd.ticket, 'd').turn.record, false);
  r.stage.stop();
});

test('CHECK-12 WARN-C: a turn under 20 s earns no token; any token from the last 30 min can be redeemed by typing it', () => {
  const r = rig();
  ['s', 'u', 'v'].forEach((x) => r.nick(x));
  const js = r.stage.join('shark', 4, 's');
  r.tick(5000);
  r.stage.endTurn(r.stage.status(js.ticket, 's').turn.id);
  assert.equal(r.stage.status(js.ticket, 's').token, null, 'ending at once earns nothing');
  const ju = r.stage.join('shark', 4, 'u');
  r.tick(30000);
  r.stage.endTurn(r.stage.status(ju.ticket, 'u').turn.id);
  const tu = r.stage.status(ju.ticket, 'u').token;
  const jv = r.stage.join('shark', 4, 'v');
  r.tick(30000);
  r.stage.endTurn(r.stage.status(jv.ticket, 'v').turn.id);
  const tv = r.stage.status(jv.ticket, 'v').token;
  assert.match(tu, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(r.stage.opView('shark', 4).lastToken, tv);
  assert.equal(r.stage.opView('shark', 4).recentTokens, 2);
  assert.equal(r.stage.op('shark', 4, 'reward', { token: tu.toLowerCase() }).ok, true, 'an older token, typed in lower case');
  assert.equal(r.stage.op('shark', 5, 'reward', { token: tv }).reason, 'unknown_token', 'another counter');
  r.tick(31 * 60 * 1000);
  assert.equal(r.stage.op('shark', 4, 'reward', { token: tv }).reason, 'unknown_token', 'after 30 minutes');
  assert.equal(r.analytics.totals().shark.reward_given, 1);
  r.stage.stop();
});

test('CHECK-12 F1 + WARN-A: TV pin, clear and anchor-hide need a staff browser or the admin key, the channel token is not enough; nicknames are rate limited', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k' });
  servers.push(s);
  const ctrl = new AbortController();
  const r = await fetch(`${s.base}/api/core/bus/_sample/7/stream`, { signal: ctrl.signal });
  const reader = r.body.getReader();
  let buf = '';
  while (!buf.includes('"token"')) buf += new TextDecoder().decode((await reader.read()).value);
  const token = JSON.parse(buf.split('\n').find((l) => l.startsWith('data:') && l.includes('"token"')).slice(5)).token;
  ctrl.abort();
  const calls = [['/api/core/bus/_sample/7/pin', { token, pin: true }], ['/api/core/bus/_sample/7/clear', { token }], ['/api/core/stage/_sample/7/tv/hide', { token, hidden: true }]];
  for (const [u, body] of calls) assert.equal((await json(s.base, u, body)).status, 403, `token only: ${u}`);
  const staff = { cookie: `pz_staff=${staffToken('k')}` };
  for (const [u, body] of calls) assert.equal((await json(s.base, u, body, staff)).status, 200, `staff browser: ${u}`);
  for (const [u, body] of calls) assert.equal((await json(s.base, u, body, { 'x-admin-key': 'k' })).status, 200, `admin key: ${u}`);
  assert.equal((await json(s.base, '/api/core/bus/_sample/7/pin', { token: 'nope', pin: true }, staff)).status, 403, 'staff still needs the right channel token');
  // nicknames: 20 per session per minute
  const phone = { cookie: 'pz_sid=nick-flood' };
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await fetch(`${s.base}/api/core/stage/nicknames`, { headers: phone })).status;
  assert.equal(last, 429);
});

test('CHECK-12 F2: /api/core/track refuses server-only events (reward_given, care_shown, fallback, lead_*, wa_*, serverOnly extras)', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1' });
  servers.push(s);
  const t = async (exp, event) => (await json(s.base, '/api/core/track', { exp, event }, { cookie: 'pz_sid=track-f2' })).status;
  for (const ev of ['reward_given', 'care_shown', 'fallback']) assert.equal(await t('_sample', ev), 400, ev);
  assert.equal(await t('career', 'lead_submit'), 400);
  assert.equal(await t('career', 'wa_sent'), 400);
  for (const ev of ['start', 'complete', 'gate_view', 'gate_open_ig', 'gate_unlock', 'share', 'ref_visit', 'error']) assert.equal(await t('_sample', ev), 200, ev);
  const totals = s.analytics.totals()._sample || {};
  assert.equal(totals.reward_given || 0, 0);
  assert.equal(totals.care_shown || 0, 0);
  // an experience can mark its own extras server-only
  const a = createAnalytics({ config: makeConfig({ DATA_DIR: tmpDir('an') }) });
  a.allowExp?.('x');
  a.declare('x', ['pdf_made'], { serverOnly: true });
  a.declare('x', ['tab_open']);
  assert.equal(a.clientTrackable('x', 'pdf_made'), false);
  assert.equal(a.clientTrackable('x', 'tab_open'), true);
});

test('ctx.stage.end(req | sessionId): ends that session\'s running turn server-side, only for its own experience', async () => {
  const dir = tmpDir('pz-exp-end-');
  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(path.join(dir, 'zz_end'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zz_end', 'server.js'), `export default function register({ app, stage }) {
    app.post('/walkover', (req, res) => res.json(stage.end(req.body?.byId ? req.body.sid : req, 'walkover')));
  }`);
  const s = await startServer({ CLAUDE_MOCK: '1', STAGE_MIN_TURN_S: '0' }, { expDir: dir });
  servers.push(s);
  const phone = (sid) => ({ cookie: `pz_sid=${sid}` });
  const nick = async (sid) => { const o = await (await fetch(`${s.base}/api/core/stage/nicknames`, { headers: phone(sid) })).json(); await json(s.base, '/api/core/stage/nickname', { id: o.options[0].id }, phone(sid)); };
  await nick('end-host'); await nick('end-next'); await nick('end-other');
  const a = await (await json(s.base, '/api/core/stage/queue', { exp: 'zz_end', c: 3 }, phone('end-host'))).json();
  const b = await (await json(s.base, '/api/core/stage/queue', { exp: 'zz_end', c: 3 }, phone('end-next'))).json();
  assert.equal((await (await fetch(`${s.base}/api/core/stage/queue/${a.ticket}`, { headers: phone('end-host') })).json()).status, 'your_turn');
  // nothing to end for a session without a running turn
  assert.deepEqual(await (await json(s.base, '/api/zz_end/walkover', {}, phone('end-other'))).json(), { ok: true, ended: false });
  // by request (the host's own session)
  const r = await (await json(s.base, '/api/zz_end/walkover', {}, phone('end-host'))).json();
  assert.equal(r.ended, true);
  const done = await (await fetch(`${s.base}/api/core/stage/queue/${a.ticket}`, { headers: phone('end-host') })).json();
  assert.equal(done.status, 'done');
  assert.match(done.token, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal((await (await fetch(`${s.base}/api/core/stage/queue/${b.ticket}`, { headers: phone('end-next') })).json()).status, 'your_turn', 'the next turn starts');
  // by session id (e.g. the other player of a duel ends the host's turn)
  assert.equal((await (await json(s.base, '/api/zz_end/walkover', { byId: true, sid: 'end-next' }, phone('end-other'))).json()).ended, true);
  assert.equal((await (await fetch(`${s.base}/api/core/stage/queue/${b.ticket}`, { headers: phone('end-next') })).json()).status, 'done');
  // a turn of another experience is never ended
  const c = await (await json(s.base, '/api/core/stage/queue', { exp: 'jyotish', c: 3 }, phone('end-other'))).json();
  assert.equal((await (await json(s.base, '/api/zz_end/walkover', { byId: true, sid: 'end-other' }, phone('end-host'))).json()).ended, false);
  assert.equal((await (await fetch(`${s.base}/api/core/stage/queue/${c.ticket}`, { headers: phone('end-other') })).json()).status, 'your_turn');
});
