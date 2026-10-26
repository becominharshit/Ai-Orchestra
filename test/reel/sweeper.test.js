// Privacy rules with a fake clock: inputs go right after the render, reels after 48 h, unused clips after 45 min.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStore, createSweeper, newId, ID_RE } from '../../reel-worker/src/store.js';
import { tmpDir } from './helpers.js';

test('ids are letters only (TV-safe) and random', () => {
  const a = newId();
  assert.match(a, ID_RE);
  assert.notEqual(a, newId());
  assert.ok(!/\d/.test(a));
});

test('finished reels are deleted after 48 h, not before (fake clock)', () => {
  const store = createStore({ dir: tmpDir('sweep') });
  let clock = Date.UTC(2026, 9, 27, 10, 0, 0);
  const sweeper = createSweeper({ store, ttlHours: 48, now: () => clock });
  const id = newId();
  fs.mkdirSync(store.jobDir(id), { recursive: true });
  fs.writeFileSync(path.join(store.jobDir(id), 'reel.mp4'), 'x');
  store.saveJobMeta(id, { createdAt: clock, template: 'intro' });
  clock += 47 * 3600_000 + 59 * 60_000;
  assert.deepEqual(sweeper.sweep().reels, []);
  assert.ok(fs.existsSync(path.join(store.jobDir(id), 'reel.mp4')), 'still there at 47h59m');
  clock += 2 * 60_000;
  assert.deepEqual(sweeper.sweep().reels, [id]);
  assert.ok(!fs.existsSync(store.jobDir(id)), 'gone after 48h');
});

test('REEL_TTL_HOURS is respected (6 h)', () => {
  const store = createStore({ dir: tmpDir('sweep') });
  let clock = Date.now();
  const sweeper = createSweeper({ store, ttlHours: 6, now: () => clock });
  const id = newId();
  fs.mkdirSync(store.jobDir(id), { recursive: true });
  store.saveJobMeta(id, { createdAt: clock });
  clock += 6 * 3600_000 + 1;
  assert.deepEqual(sweeper.sweep().reels, [id]);
});

test('uploaded clips that never got rendered are deleted after 10 min (default); clips in use are kept', () => {
  const store = createStore({ dir: tmpDir('sweep') });
  let clock = Date.now();
  const busy = newId();
  const idle = newId();
  for (const id of [busy, idle]) { fs.writeFileSync(store.clipFile(id), 'v'); store.saveClipMeta(id, { createdAt: clock, duration: 5 }); }
  const sweeper = createSweeper({ store, now: () => clock, inUse: () => new Set([busy]) });
  clock += 9 * 60_000;
  assert.deepEqual(sweeper.sweep().clips, []);
  clock += 2 * 60_000;
  const r = sweeper.sweep();
  assert.deepEqual(r.clips, [idle]);
  assert.ok(fs.existsSync(store.clipFile(busy)));
  assert.ok(!fs.existsSync(store.clipFile(idle)));
});
