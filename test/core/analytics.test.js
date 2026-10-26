import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAnalytics, EVENTS, istDay } from '../../core/server/analytics.js';
import { makeConfig } from '../../core/server/config.js';
import { tmpDir } from './helpers.js';

test('counters persist across a restart (snapshot file)', async () => {
  const config = makeConfig({ DATA_DIR: tmpDir('an') });
  const a = createAnalytics({ config });
  a.inc('jyotish', 'start'); a.inc('jyotish', 'start'); a.inc('jyotish', 'complete'); a.inc('shark', 'share');
  await a.stop();
  const b = createAnalytics({ config });
  const t = b.totals();
  assert.equal(t.jyotish.start, 2);
  assert.equal(t.jyotish.complete, 1);
  assert.equal(t.shark.share, 1);
});

test('only known experiences and whitelisted events count; the file holds counts only', () => {
  const config = makeConfig({ DATA_DIR: tmpDir('an') });
  const a = createAnalytics({ config });
  assert.equal(a.inc('jyotish', 'name'), false);
  assert.equal(a.inc('not-an-exp', 'start'), false);
  assert.equal(a.inc('jyotish', 'gate_unlock'), true);
  a.save();
  const raw = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'analytics.json'), 'utf8'));
  // shape: { days: { YYYY-MM-DD: { exp: { event: number } } } }
  for (const [day, exps] of Object.entries(raw.days)) {
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
    for (const ev of Object.values(exps)) for (const [k, v] of Object.entries(ev)) { assert.ok(EVENTS.includes(k) || /^[a-z0-9_]+(\[[a-z_]+=[a-z0-9_]+\])?$/.test(k)); assert.equal(typeof v, 'number'); }
  }
  assert.ok(!JSON.stringify(raw).match(/sid|ip|name|dob|phone/i));
});

test('extra count-only events with one small dimension; free text rejected; CSV has a column per event', () => {
  const config = makeConfig({ DATA_DIR: tmpDir('an') });
  const a = createAnalytics({ config });
  a.declare('shark', ['verdict_deal']);
  a.declare('asli', ['round_right']);
  assert.equal(a.count('shark', 'verdict_deal'), true);
  assert.equal(a.count('asli', 'round_right', { round: 3 }), true);
  assert.equal(a.count('asli', 'round_right', { round: 3 }), true);
  assert.equal(a.count('asli', 'round_right', { round: 'Priya Sharma' }), false, 'free text');
  assert.equal(a.count('asli', 'round_right', { round: 500 }), false, 'int out of range');
  assert.equal(a.count('asli', 'round_right', { a: 1, b: 2 }), false, 'one dimension only');
  assert.equal(a.count('asli', 'undeclared'), false);
  assert.throws(() => a.declare('asli', ['Bad Name!']));
  a.inc('shark', 'ref_visit');
  const csv = a.csv().trim().split('\n');
  const head = csv[0].split(',');
  assert.deepEqual(head.slice(0, 2 + EVENTS.length), ['day', 'experience', ...EVENTS]);
  assert.ok(head.includes('verdict_deal') && head.includes('round_right[round=3]') && head.includes('ref_visit'));
  const asli = csv.find((r) => r.split(',')[1] === 'asli').split(',');
  assert.equal(asli[head.indexOf('round_right[round=3]')], '2');
  assert.equal(csv[1].split(',')[0], istDay());
});
