// Fixes after CHECK-07: bucket keys (R1), dirty tree (R2), --image prefix (R4), account check (R5), no AWS_* (R7).
// No AWS and no docker: the AWS, git and docker calls are fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketKeys, dirtyImageFiles, imageSourceCommit, imageCommit, guardArgs, allowWrites, CONF } from '../aws/lightsail.mjs';

allowWrites(); // only the fake AWS below is ever called in this file

const WEB = { name: 'web', ...CONF.web };
const REEL = { name: 'reel', ...CONF.reel };

/** A fake Lightsail with a bucket key store (max 2, like the real one) and a list of deployments. */
function fakeAws({ keys = [], deployments = [] } = {}) {
  const calls = [];
  let n = 0;
  const call = (args) => {
    guardArgs(args); // the real guard still runs: play-* names only
    calls.push(args[1]);
    const sub = args[1];
    if (sub === 'get-bucket-access-keys') return { accessKeys: keys.map((k) => ({ accessKeyId: k.id, createdAt: k.createdAt })) };
    if (sub === 'get-container-service-deployments') return { deployments };
    if (sub === 'delete-bucket-access-key') { const id = args[args.indexOf('--access-key-id') + 1]; keys = keys.filter((k) => k.id !== id); return {}; }
    if (sub === 'create-bucket-access-key') {
      if (keys.length >= 2) throw new Error('limit: a bucket can have only 2 access keys');
      const k = { id: `AKIANEW${++n}`, createdAt: new Date().toISOString() };
      keys.push(k);
      return { accessKey: { accessKeyId: k.id, secretAccessKey: `secret-${n}` } };
    }
    throw new Error(`unexpected ${sub}`);
  };
  return { call, calls, keys: () => keys };
}
const opts = (f) => ({ bucket: 'play-zenith-data', service: 'play-web', call: f.call, log: () => {} });

test('R1: the live key is kept, nothing is listed or made', () => {
  const f = fakeAws();
  assert.deepEqual(bucketKeys({ BUCKET_KEY_ID: 'AKIALIVE', BUCKET_KEY_SECRET: 's' }, opts(f)), { BUCKET_KEY_ID: 'AKIALIVE', BUCKET_KEY_SECRET: 's' });
  assert.deepEqual(f.calls, []);
});

test('R1: no keys yet -> one key is made', () => {
  const f = fakeAws();
  const k = bucketKeys({}, opts(f));
  assert.equal(k.BUCKET_KEY_ID, 'AKIANEW1');
  assert.equal(f.keys().length, 1);
});

test('R1: a key from a FAILED earlier deployment is reused, not made again', () => {
  const f = fakeAws({ keys: [{ id: 'AKIAOLD1', createdAt: '2026-10-24T08:00:00Z' }], deployments: [{ version: 1, state: 'FAILED', containers: { app: { environment: { BUCKET_KEY_ID: 'AKIAOLD1', BUCKET_KEY_SECRET: 'kept' } } } }] });
  assert.deepEqual(bucketKeys({}, opts(f)), { BUCKET_KEY_ID: 'AKIAOLD1', BUCKET_KEY_SECRET: 'kept' });
  assert.ok(!f.calls.includes('create-bucket-access-key'));
});

test('R1: 2 keys exist and none is in use -> the oldest is deleted, then one is made (never a third)', () => {
  const f = fakeAws({ keys: [{ id: 'AKIAB', createdAt: '2026-10-24T09:00:00Z' }, { id: 'AKIAA', createdAt: '2026-10-24T08:00:00Z' }] });
  const k = bucketKeys({}, opts(f));
  assert.deepEqual(f.keys().map((x) => x.id), ['AKIAB', k.BUCKET_KEY_ID]);
  assert.equal(f.keys().length, 2);
  assert.deepEqual(f.calls, ['get-bucket-access-keys', 'get-container-service-deployments', 'delete-bucket-access-key', 'get-bucket-access-keys', 'create-bucket-access-key']);
});

test('R1: repeated failed first deploys never pile up keys', () => {
  const f = fakeAws();
  for (let i = 0; i < 5; i++) bucketKeys({}, opts(f)); // each attempt "fails" and keeps no record of the key
  assert.ok(f.keys().length <= 2);
});

test('R1: dry run lists but never deletes or makes', () => {
  const f = fakeAws({ keys: [{ id: 'AKIAA', createdAt: '2026-10-24T08:00:00Z' }, { id: 'AKIAB', createdAt: '2026-10-24T09:00:00Z' }] });
  const k = bucketKeys({}, { ...opts(f), dry: true });
  assert.match(k.BUCKET_KEY_ID, /would be made; 2 of 2/);
  assert.ok(!f.calls.some((c) => /^(create|delete)-/.test(c)));
});

test('R2: only files that go into the image count as dirty', () => {
  const porcelain = ['?? core/server/index.js', ' M package.json', '?? ops/monitor.mjs', '?? docs/x.pdf', '?? print/a.pdf', '?? .env', '?? .env.example', '?? test/core/a.test.js',
    '?? experiences/jyotish/web/index.html', '?? experiences/jyotish/test/a.test.mjs', '?? reel-worker/Dockerfile', 'R  core/old.js -> core/new.js', '?? data/analytics.json'].join('\n');
  assert.deepEqual(dirtyImageFiles(WEB, porcelain), ['core/server/index.js', 'package.json', '.env.example', 'experiences/jyotish/web/index.html', 'core/new.js']);
  assert.deepEqual(dirtyImageFiles(REEL, porcelain), ['reel-worker/Dockerfile']);
});

test('R2: dirty tree refused unless --allow-dirty; then GIT_COMMIT says dirty', () => {
  const git = (st) => (args) => (args[0] === 'rev-parse' ? 'abcdef1234567890abcdef1234567890abcdef12\n' : st);
  const saved = process.env.GIT_COMMIT; delete process.env.GIT_COMMIT;
  assert.equal(imageSourceCommit(WEB, false, { git: git('?? ops/x.mjs\n') }), 'abcdef1234567890abcdef1234567890abcdef12');
  assert.throws(() => imageSourceCommit(WEB, false, { git: git('?? core/server/index.js\n') }), /Not deploying: 1 file.*core\/server\/index\.js.*--allow-dirty/);
  const c = imageSourceCommit(WEB, true, { git: git('?? core/server/index.js\n') });
  assert.equal(c, 'abcdef-dirty');
  assert.ok(c.length <= 12, 'fits in the 12 characters /status.json shows');
  if (saved !== undefined) process.env.GIT_COMMIT = saved;
});

test('R4: --image must be this service\'s own play- image, with its commit label', () => {
  const inspect = () => 'abc1234def';
  for (const bad of ['zenith-prod:latest', 'field-prod:1', 'node:22', 'play-reel:abc', 'play-web-evil:1', 'play-web:../x', 'xplay-web:1', '']) {
    assert.throws(() => imageCommit(WEB, bad, { inspect }), /Refusing --image/, bad);
  }
  assert.deepEqual(imageCommit(WEB, 'play-web:abc1234', { inspect }), { tag: 'play-web:abc1234', commit: 'abc1234def' });
  assert.throws(() => imageCommit(WEB, 'play-web:old', { inspect: () => '<no value>' }), /no play\.commit label/);
  assert.doesNotThrow(() => imageCommit(REEL, 'play-reel:x', { inspect }));
});

const SRC = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'aws', 'lightsail.mjs'), 'utf8');
const body = (name) => { const i = SRC.search(new RegExp(`export (async )?function ${name}\\(`)); return SRC.slice(i, SRC.indexOf('\n}\n', i)); };

test('R5: every command that can change AWS checks the account before allowWrites()', () => {
  for (const fn of ['create', 'cert', 'deploy', 'redeployWithSettings', 'rollback', 'connect', 'teardown']) {
    const b = body(fn);
    assert.ok(b.includes('checkAccount()'), `${fn} calls checkAccount()`);
    assert.ok(b.indexOf('checkAccount()') < b.indexOf('allowWrites()'), `${fn}: checkAccount() before allowWrites()`);
  }
});

test('R7: no AWS_* credential settings are sent any more', () => {
  assert.ok(!/AWS_ACCESS_KEY_ID:|AWS_SECRET_ACCESS_KEY:/.test(body('settingsFor').replace(/^.*\/\/.*$/gm, '')));
});
