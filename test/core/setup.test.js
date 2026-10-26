// npm run setup / npm test preflight on a fresh clone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { packages, missing, preflight } from '../../core/tools/packages.mjs';
import { tmpDir } from './helpers.js';

test('the repo lists its nested packages and is set up here', () => {
  const dirs = packages().map((p) => p.dir);
  assert.ok(dirs.includes('.'));
  for (const d of ['experiences/career', 'reel-worker', 'print']) if (fs.existsSync(path.join(process.cwd(), d, 'package.json'))) assert.ok(dirs.includes(d), d);
  assert.deepEqual(missing().map((p) => p.dir), []);
  assert.equal(preflight(undefined, { browser: true }), null);
});

test('a fresh clone gets a clear "run npm run setup" message', () => {
  const root = tmpDir('clone');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { express: '^5' } }));
  fs.mkdirSync(path.join(root, 'reel-worker'));
  fs.writeFileSync(path.join(root, 'reel-worker', 'package.json'), JSON.stringify({ dependencies: { 'ffmpeg-static': '^5' } }));
  const msg = preflight(root, { browser: false });
  assert.match(msg, /Setup has not run/);
  assert.match(msg, /missing in: \., reel-worker/);
  assert.match(msg, /Playwright Chromium is not installed/);
  assert.match(msg, /npm run setup/);
});

test('CHECK-20 F7 guard: no test process loads the repo .env (core config and Career ops refuse it under node --test)', async () => {
  const { dotenvLoaded, IN_TEST } = await import('../../core/server/config.js');
  assert.equal(IN_TEST, true, 'node --test marks this process as a test');
  assert.equal(dotenvLoaded, false, 'core config did not read the repo .env');
  // Career ops: even with PZ_NO_DOTENV unset, a test process never loads a .env (a throwaway file stands in for it)
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-env-guard-'));
  const file = path.join(tmp, '.env');
  fs.writeFileSync(file, 'PZ_GUARD_SENTINEL=loaded\n');
  const saved = process.env.PZ_NO_DOTENV;
  delete process.env.PZ_NO_DOTENV;
  try {
    const { loadEnv } = await import('../../experiences/career/ops/common.mjs');
    loadEnv(file);
    assert.equal(process.env.PZ_GUARD_SENTINEL, undefined, 'career loadEnv refused inside a test process');
  } finally {
    if (saved !== undefined) process.env.PZ_NO_DOTENV = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
