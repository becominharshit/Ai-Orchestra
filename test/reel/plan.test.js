// Director plan + text helpers + template agreement (web side vs render side).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planCut, MAX_TOTAL_S, MIN_SHOT_BEATS } from '../../reel-worker/src/plan.js';
import { TEMPLATES as R, TEMPLATE_IDS } from '../../reel-worker/src/templates.js';
import { TEMPLATES as WEB } from '../../experiences/reel/templates.js';
import { cleanText, wrapLines } from '../../reel-worker/src/text.js';
import { bedExpr } from '../../reel-worker/src/assets.js';

test('web and worker templates agree on ids and shot targets', () => {
  assert.deepEqual(WEB.map((t) => t.id), TEMPLATE_IDS);
  for (const t of WEB) {
    assert.deepEqual(t.shots.map((s) => s.seconds), R[t.id].shots, t.id);
    assert.equal(t.bpm, R[t.id].bpm, t.id);
    assert.equal(t.name, R[t.id].name);
    const total = t.shots.reduce((a, s) => a + s.seconds, 0);
    assert.ok(total >= 18 && total <= 22, `${t.id} total about 20 s`);
  }
});

test('cuts land on the beat and never run past a clip', () => {
  for (const id of TEMPLATE_IDS) {
    for (const lens of [[8, 9, 7.5], [12, 12, 12], [6.4, 8.1, 6.2], [30, 30, 30], [3, 3, 3]]) {
      const p = planCut(id, lens);
      const beat = 60 / R[id].bpm;
      let start = 0;
      for (const [i, s] of p.shots.entries()) {
        assert.ok(Number.isInteger(s.beats) && s.beats >= MIN_SHOT_BEATS, `${id} whole beats`);
        assert.ok(Math.abs(s.dur - s.beats * beat) < 0.002, `${id} dur = beats x beat`);
        assert.ok(s.in + s.dur <= lens[i] + 1e-6, `${id} shot ${i + 1} inside its clip`);
        assert.ok(Math.abs(s.start - start) < 0.003, 'starts add up');
        start += s.dur;
      }
      assert.ok(p.total <= MAX_TOTAL_S + 0.01, `${id} total ${p.total} within ${MAX_TOTAL_S}`);
      assert.ok(Math.abs(p.total - (p.shotsTotal + 2)) < 0.002, 'end card is 2 s');
    }
  }
  const p = planCut('intro', [12, 12, 12]);
  assert.ok(Math.abs(p.shots[0].dur - 6.207) < 0.01, 'intro shot 1 = 12 beats at 116 BPM');
});

test('too short clips and bad input are refused with a code', () => {
  assert.throws(() => planCut('intro', [1, 8, 8]), (e) => e.code === 'too_short' && e.shot === 1);
  assert.throws(() => planCut('nope', [8, 8, 8]), (e) => e.code === 'bad_template');
  assert.throws(() => planCut('intro', [8, 8]), (e) => e.code === 'bad_clips');
});

test('caption text: no dashes, no emoji, ASCII only, wrapped', () => {
  assert.equal(cleanText('Squad \u2014 ready \u{1F525}'), 'Squad, ready');
  assert.equal(cleanText('café \u2013 2am'), 'cafe, 2am');
  assert.ok(!/[\u2013\u2014]/.test(cleanText('a\u2014b\u2013c')));
  const lines = wrapLines('Har ek ka apna signature style, full swag aur full energy wala', 20, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length <= 20));
  assert.ok(lines[1].endsWith('...'));
});

test('music bed expressions are well formed', () => {
  for (const id of TEMPLATE_IDS) {
    const e = bedExpr(R[id].bpm, R[id].bed);
    assert.ok(!e.includes("'"), 'no quotes inside');
    assert.equal((e.match(/\(/g) || []).length, (e.match(/\)/g) || []).length, `${id} balanced`);
    assert.ok(e.includes('sin(2*PI*'), 'has tones');
  }
});

test('burned-in text: ASS file with hook, 3 captions, watermark; colours; no tag injection', async () => {
  const { reelAss, assColor } = await import('../../reel-worker/src/subs.js');
  assert.equal(assColor('white'), '&H00FFFFFF');
  assert.equal(assColor('0x4E308D@0.88'), '&H1F8D304E');
  const plan = planCut('heist', [8, 9, 7.5]);
  const ass = reelAss({ template: 'heist', plan, captions: ['Plan ready. Squad ready.', 'Crew {\\pos(0,0)} in position', 'Mission complete'], hook: 'Operation Zenith shuru' });
  const ev = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert.equal(ev.length, 5, 'watermark + hook + 3 captions');
  assert.ok(ass.includes('ZR JetBrains Bold'));
  assert.ok(!ass.includes('\\pos(0,0)'), 'braces and backslashes from text are stripped');
  assert.ok(ev[1].includes('0:00:00.00,0:00:02.00'), 'hook 0-2 s');
});

test('ffmpeg binary is executable (else: run npm run setup)', async () => {
  const { assertFfmpeg } = await import('./helpers.js');
  assert.doesNotThrow(() => assertFfmpeg());
});
