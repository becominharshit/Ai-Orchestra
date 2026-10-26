// npm test: the core suite plus every experience's own tests, then every Playwright suite.
//   1. node --test --test-concurrency=1 on test/core/*.test.js
//   2. the same for test/<id>/ of every experiences/<id> folder that exists (skipped when there are no tests)
//   3. playwright test for test/core/playwright.config.js and any test/<id>/playwright.config.{js,mjs}
// Each suite runs on its own, so one failing experience does not hide the others. Exit code 1 if any failed.
//   node test/core/run-all.mjs --only core,career     (run a subset)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// every suite and script it starts runs without the real .env (CHECK-20 F7)
process.env.PZ_NO_DOTENV = '1';
process.env.PZ_IN_TEST = '1';

// Fresh clone? Say so clearly instead of failing deep inside a suite.
{
  const { preflight } = await import('../../core/tools/packages.mjs');
  let browser = true;
  try { const { chromium } = await import('@playwright/test'); browser = fs.existsSync(chromium.executablePath()); } catch { browser = false; }
  const msg = preflight(ROOT, { browser });
  if (msg) { console.error(`\n${msg}\n`); process.exit(1); }
}
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
const want = (id) => !only || only.has(id);

const exps = fs.readdirSync(path.join(ROOT, 'experiences'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const ids = ['core', ...exps.filter((id) => fs.existsSync(path.join(ROOT, 'test', id)))];
const results = [];

function run(label, cmd, args) {
  console.log(`\n=== ${label}: ${cmd} ${args.join(' ')}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  results.push({ label, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
}

for (const id of ids.filter(want)) {
  const dir = path.join('test', id);
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.test\.(m?js|cjs)$/.test(f)).sort().map((f) => path.join(dir, f));
  if (!files.length) { console.log(`\n=== node:test ${id}: no *.test.js files, skipped`); continue; }
  run(`node:test ${id}`, process.execPath, ['--test', '--test-concurrency=1', ...files]);
}

const pwBin = path.join(ROOT, 'node_modules', '.bin', 'playwright');
for (const id of ids.filter(want)) {
  const cfg = ['playwright.config.js', 'playwright.config.mjs'].map((f) => path.join('test', id, f)).find((f) => fs.existsSync(path.join(ROOT, f)));
  if (cfg) run(`playwright ${id}`, pwBin, ['test', '--config', cfg]);
}

console.log('\n=== summary');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}  (${r.s}s)`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
