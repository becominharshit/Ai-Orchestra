// AI ya Asli?: content, Curator, Detector, nicknames, leaderboard (no server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadManifest, validate, curate, isPlayable, statsFor, tvRoundData, TV_KEYS, MEDIA_DIR, HERE } from '../../experiences/asli/lib/content.js';
import { accuracy, detectText } from '../../experiences/asli/lib/detector.js';
import { makeNick, isNick, nickOptions } from '../../experiences/asli/lib/nick.js';
import { createLocalStage, dayKey } from '../../experiences/asli/lib/stage.js';
import { checkEvent } from '../../core/server/bus.js';

const manifest = loadManifest();
const tvKeys = new Set(TV_KEYS);

test('shipped manifest passes the validator (credits, balance, lengths, dashes, TV-safe)', () => {
  const v = validate(manifest, { tvCheck: (ev) => checkEvent(ev, tvKeys) });
  assert.deepEqual(v.errors, []);
  const s = statsFor(manifest.items);
  assert.ok(s.byType.text.ai + s.byType.text.real + s.byType.code.ai + s.byType.code.real >= 40, '40+ text and code items');
  assert.ok(s.byType.audio.ai >= 8, 'AI voice clips made with say');
  for (const it of manifest.items.filter((x) => x.approved)) assert.ok(it.credit && it.credit.length > 3, `${it.id} credit`);
});

test('every approved media file exists and is small', () => {
  for (const it of manifest.items.filter((x) => x.approved && x.src)) {
    const f = path.join(MEDIA_DIR, it.src);
    assert.ok(fs.existsSync(f), it.src);
    assert.ok(fs.statSync(f).size < 400_000, `${it.src} size`);
  }
});

test('no em-dash or en-dash anywhere in the experience, its tests or its docs', () => {
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['media', 'inbox', 'node_modules'].includes(e.name)) walk(p); continue; }
      if (!/\.(js|mjs|json|html|css|md|txt)$/.test(e.name)) continue;
      if (/[\u2013\u2014]/.test(fs.readFileSync(p, 'utf8'))) bad.push(p);
    }
  };
  walk(HERE);
  walk(path.join(HERE, '..', '..', 'test', 'asli'));
  assert.deepEqual(bad, []);
});

test('validator catches the mistakes it should', () => {
  const base = { type: 'text', answer: 'real', approved: true, reveal_line: 'Asli!', credit: 'Kabir (15th century). Public domain.', body: 'Ek chhoti si line.' };
  const v = validate({ items: [
    { ...base, id: 't001', credit: '' },
    { ...base, id: 't002', body: 'Ek line \u2014 dash ke saath' },
    { ...base, id: 't003', body: 'x'.repeat(200) },
    { ...base, id: 't004', body: 'Election ka joke' },
    { ...base, id: 'ai01' },
    { ...base, id: 't005', answer: 'ai', credit: 'Some person' },
    { ...base, id: 'c001', type: 'code', body: Array(12).fill('x = 1').join('\n') },
    { ...base, id: 'a001', type: 'audio', src: 'a001.m4a', consent: false },
  ] }, { mediaDir: os.tmpdir() });
  const has = (id, re) => assert.ok(v.errors.some((e) => e.startsWith(`${id}:`) && re.test(e)), `${id} ${re}`);
  has('t001', /credit/);
  has('t002', /em-dash/);
  has('t003', /too long/);
  has('t004', /blocked word/);
  has('ai01', /neutral/);
  has('t005', /AI \(/);
  has('c001', /lines/);
  has('a001', /consent/);
  assert.ok(v.errors.some((e) => /playable items/.test(e)));
  const lop = validate({ items: Array.from({ length: 30 }, (_, i) => ({ ...base, id: `t${String(i + 1).padStart(3, '0')}`, answer: i < 25 ? 'ai' : 'real', credit: i < 25 ? 'AI (Claude)' : base.credit })) });
  assert.ok(lop.errors.some((e) => /not balanced/.test(e)));
});

test('Curator: always 10, 4-6 AI, no repeats, text first, balanced types (1000 seeds)', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const { items, plan } = curate(manifest.items, { seed });
    assert.equal(items.length, 10);
    assert.equal(new Set(items.map((x) => x.id)).size, 10);
    assert.ok(plan.ai >= 4 && plan.ai <= 6, `seed ${seed}: ${plan.ai} AI`);
    assert.equal(items[0].type, 'text');
    assert.ok(items.every(isPlayable), 'only approved, non-teaser items');
    assert.equal(plan.byType.code, 2);
    assert.equal(plan.byType.audio, 0, 'no voice rounds while there are no real voices');
    for (let i = 3; i < 10; i++) assert.ok(!(items[i].answer === items[i - 1].answer && items[i].answer === items[i - 2].answer && items[i].answer === items[i - 3].answer), 'no 4 in a row');
  }
});

test('Curator: voice rounds switch on once real voices exist, never the same line twice', () => {
  const extra = ['E1', 'E3', 'E4', 'E6'].map((line, k) => ({ id: `a09${k}`, type: 'audio', answer: 'real', approved: true, consent: true, group: `voice-${line}`, src: `a09${k}.m4a`, reveal_line: 'x', credit: 'Zenith student' }));
  const items = [...manifest.items, ...extra];
  for (let seed = 1; seed <= 300; seed++) {
    const { items: g, plan } = curate(items, { seed });
    assert.equal(plan.byType.audio, 2);
    const groups = g.filter((x) => x.group).map((x) => x.group);
    assert.equal(new Set(groups).size, groups.length, 'same voice line twice');
    for (let i = 1; i < 10; i++) assert.ok(!(g[i].type === 'audio' && g[i - 1].type === 'audio'), 'two voice rounds back to back');
  }
});

test('Curator prefers items this phone has not seen', () => {
  const first = curate(manifest.items, { seed: 7 }).items.map((x) => x.id);
  const second = curate(manifest.items, { seed: 8, seen: first }).items.map((x) => x.id);
  const overlap = second.filter((id) => first.includes(id));
  assert.ok(overlap.length <= 2, `overlap ${overlap.length}`);
});

test('Detector is good but beatable (55-95% offline), and explains itself', () => {
  const a = accuracy(manifest.items.filter(isPlayable));
  assert.ok(a.pct >= 55 && a.pct <= 95, `accuracy ${a.pct}%`);
  const d = detectText('Absolutely loved it! Highly recommend!');
  assert.equal(d.guess, 'ai');
  assert.ok(d.confidence > 0.5 && d.confidence < 1);
  assert.ok(d.clues.length > 0);
});

test('every round and reveal is TV-safe (bus check) and code goes as short lines', () => {
  for (const it of manifest.items.filter((x) => x.approved)) {
    const d = tvRoundData(it, 3, 'ask');
    assert.ok(checkEvent({ t: 'custom', name: 'round', data: d }, tvKeys).ok, it.id);
    for (const v of [d.text, ...(d.lines || []).map((l) => l.text)].filter(Boolean)) assert.ok(v.length <= 140, `${it.id} TV text over 140`);
    for (const l of d.lines || []) assert.ok(Number.isInteger(l.x) && !/\s{2,}/.test(l.text), `${it.id} code line shape`);
  }
  const result = { kicker: 'AI ya Asli?', title: '8/10', label: 'ChillMomo42', lines: ['AI Detective', '1130 points · aaj ka rank #3', 'Detector Agent: 7/10'], score: 8, of: 10, rank: 3, points: 1130 };
  assert.ok(checkEvent({ t: 'result', payload: result }, tvKeys).ok);
});

test('nicknames: core shape (CamelCase, 12 chars max), 3 different options, typed names never validate', () => {
  const CORE = /^[A-Z][a-z]+[A-Z][a-z]+\d{0,2}$/;
  for (let i = 0; i < 2000; i++) { const n = makeNick(); assert.ok(isNick(n), n); assert.ok(n.length <= 12 && CORE.test(n), n); }
  const o = nickOptions(3);
  assert.equal(new Set(o).size, 3);
  for (const s2 of ['RahulSharma', 'Cosmic Samosa 42', 'chillmomo42', 'ChillMomo123', '<b>x</b>', 'ChillMomo42 ', '@riya', 'BadWord99']) assert.equal(isNick(s2), false, s2);
});

test('local stage: pick 1 of 3 (one-use ids), board by score then time, rank, no_nickname, bad_extra, midnight IST reset', () => {
  let t = Date.parse('2026-10-27T10:00:00+05:30');
  const st = createLocalStage({ now: () => t });
  st.declare({ boards: [{ id: 'score', min: 0, max: 10 }], panels: { leaderboard: 'score' } });
  const reqs = Array.from({ length: 15 }, (_, i) => ({ sid: `s${i}` }));
  assert.deepEqual(st.post(reqs[0], 'score', { score: 5 }), { ok: false, reason: 'no_nickname' });
  for (const r of reqs) { const o = st.nicknames(r); assert.equal(o.length, 3); assert.ok(st.pickNickname(r, o[1].id).ok); assert.equal(st.pickNickname(r, o[1].id).ok, false, 'ids are one-use'); }
  const out = reqs.map((r, i) => st.post(r, 'score', { score: i % 11, extra: { time: 60 - i } }));
  assert.equal(out[10].rank, 1, '10/10 is top');
  assert.equal(st.post(reqs[1], 'score', { score: 10, extra: { time: 30 } }).rank, 1, 'same score, faster time ranks higher');
  assert.equal(st.post(reqs[2], 'score', { score: 11 }).reason, 'bad_score');
  assert.equal(st.post(reqs[2], 'score', { score: 3, extra: { line: 'free text' } }).reason, 'bad_extra');
  const top = st.board('score', { limit: 10 });
  assert.equal(top.length, 10);
  assert.equal(top[0].nickname, st.nickname(reqs[1]));
  assert.deepEqual(Object.keys(top[0]).sort(), ['at', 'extra', 'nickname', 'rank', 'score']);
  assert.equal(st.count('score'), 16);
  t = Date.parse('2026-10-28T00:00:30+05:30');
  assert.equal(dayKey(t), '2026-10-28');
  assert.equal(st.count('score'), 0, 'reset after midnight IST');
  st.close();
});
