// AI ya Asli? public text (CONTRACT 13, CHECK_build 12 + 13): every line the phone or server puts on the TV or a
// share card is a registered bank line or template. Checked against core's real safety module in strict mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafety } from '../../core/server/safety.js';
import { loadManifest, tvRoundData, curate } from '../../experiences/asli/lib/content.js';
import { registerPublic, ORX, BADGES, TEMPLATES } from '../../experiences/asli/lib/public.js';
import { curatorLine, detectorReady, detLine, scoreLine, roundLog, readyLine, doneLine, tvLine } from '../../experiences/asli/web/lines.js';
import { makeNick } from '../../experiences/asli/lib/nick.js';

const safety = createSafety({ config: { publicTextStrict: true }, claude: { mode: () => 'mock' }, analytics: { inc() {}, count() {} }, log: () => {} });
// In the server, core's stage tells safety which nicknames it generated; here our own generator stands in.
safety.setNicknameCheck?.((n) => /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/.test(n));
const approved = loadManifest().items.filter((it) => it.approved);
const { badItems } = registerPublic({
  bank: (id, e) => safety.bank('asli', id, e), template: (id, t, s) => safety.template('asli', id, t, s), publicText: (id, a) => safety.publicText('asli', id, a),
}, approved);
const pub = (s) => safety.isPublic('asli', s);
const pt = (id, a) => safety.publicText('asli', id, a);

test('every approved item registers as public text (none blocked by core copy rules)', () => {
  assert.deepEqual(badItems, []);
  assert.ok(Object.keys(TEMPLATES).length >= 30);
});

test('every TV round payload string is public (ask + reveal, all items)', () => {
  for (const it of approved) {
    const d = tvRoundData(it, 4, 'ask');
    for (const s of [d.type, d.state, d.text, ...(d.lines || []).map((l) => l.text)].filter((x) => typeof x === 'string')) assert.ok(pub(s), `${it.id}: ${s}`);
    for (const s of [it.reveal_line, it.credit, it.answer, 'none', 'reveal', 'round', 'duel', 'playing', 'done']) assert.ok(pub(s), `${it.id} reveal: ${s}`);
  }
  // the phone builds code lines the same way the server registers them
  for (const it of approved.filter((x) => x.type === 'code')) for (const l of it.body.split('\n')) assert.ok(pub(tvLine(l).text), `${it.id} phone line: ${l}`);
});

test('every phone orchestra line shape matches a template', () => {
  const nick = makeNick();
  const plans = [{ text: 8, code: 2, audio: 0, image: 0, ai: 5, real: 5 }, { text: 6, code: 2, audio: 2, image: 0, ai: 4, real: 6 }, { text: 4, code: 2, audio: 2, image: 2, ai: 6, real: 4 }];
  const lines = [
    ...plans.map(curatorLine),
    detectorReady({ ready: 10, claude: 0 }, 0), detectorReady({ ready: 10, claude: 7 }, 0), detectorReady({ ready: 8, claude: 0 }, 2), detectorReady({ ready: 8, claude: 3 }, 2),
    detLine({ guess: 'ai', confidence: 0.87, right: true }), detLine({ guess: 'real', confidence: 0.55, right: true }), detLine({ guess: 'ai', confidence: 0.9, right: false }), detLine(null),
    scoreLine(1, { correct: true, points: 143, ms: 2310, total: 143 }), scoreLine(10, { correct: false, points: 0, ms: 6000, total: 1200 }),
    roundLog(3, 'text', 6000), roundLog(4, 'audio', 8000), roundLog(5, 'code', 7000), roundLog(6, 'image', 6000),
    readyLine(nick), doneLine(61.4), `${10} items`, 'R7',
    ...Object.values(ORX), ...Object.values(BADGES), nick,
  ];
  for (const s of lines) assert.ok(pub(s), s);
  // and things that must NOT pass
  for (const s of ['Rahul ready. Round 1 shuru!', 'Detector Agent: 87% AI. lol', 'hello', 'R11']) assert.equal(pub(s), false, s);
});

test('result, share card and duel lines come out of publicText with core nicknames only', () => {
  const me = makeNick();
  const fr = makeNick();
  const all = [
    pt('frac', { r: 8, of: 10 }), pt('res_pts', { points: 1130, rank: 3 }), pt('res_det', { d: 7, of: 10 }), pt('share_hi', { r: 8 }), pt('share_lo', { r: 3 }),
    pt('share_rank', { rank: 12 }), pt('share_det', { d: 7 }), pt('duel_win_card', { friend: fr }), pt('duel_lose_card', { friend: fr }), pt('duel_tie', { a: me, b: fr }),
    pt('duel_score', { a: me, x: 7, b: fr, y: 6 }), pt('duel_won', { nick: me }), pt('duel_me', { x: 7 }), pt('duel_friend', { friend: fr, y: 6 }), pt('duel_walkover', { friend: fr }),
  ];
  for (const r of all) { assert.ok(r.pt && pub(r.text), r.text); assert.ok(!/[\u2013\u2014]/.test(r.text)); }
  assert.equal(pt('duel_win_card', { friend: 'ChillMomo42' }).text, 'Maine ChillMomo42 ko AI ya Asli mein haraya');
  assert.throws(() => pt('duel_win_card', { friend: 'Rahul Sharma' }), /rejects/);
  assert.throws(() => pt('share_hi', { r: 11 }), /rejects/);
});

test('a curated game only uses registered items', () => {
  const g = curate(approved, { seed: 5 }).items;
  for (const it of g) assert.ok(!badItems.includes(it.id));
});
