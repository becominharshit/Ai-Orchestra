// npm run setup: install every nested package of the repo on a fresh clone (root, experiences/*, reel-worker,
// print), with `npm ci` where a lockfile exists, then the Playwright Chromium the e2e tests use.
//   npm run setup               install what is missing
//   npm run setup -- --all      reinstall everything
//   npm run setup -- --no-browser   skip the Playwright browser download
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, packages, missing } from './packages.mjs';

const all = process.argv.includes('--all');
const todo = all ? packages() : missing();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let failed = 0;
if (!todo.length) console.log('All npm packages are installed.');
for (const p of todo) {
  const cmd = p.lock ? 'ci' : 'install';
  console.log(`\n=== ${p.dir}: npm ${cmd}`);
  const r = spawnSync(npm, [cmd, '--no-audit', '--no-fund'], { cwd: path.join(ROOT, p.dir), stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.error(`npm ${cmd} failed in ${p.dir}`); }
}

if (!process.argv.includes('--no-browser')) {
  let have = false;
  try {
    const { chromium } = await import('@playwright/test');
    have = fs.existsSync(chromium.executablePath());
  } catch { /* root not installed yet */ }
  if (!have) {
    console.log('\n=== Playwright Chromium: npx playwright install chromium');
    const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.error('Playwright browser install failed'); }
  } else console.log('Playwright Chromium is installed.');
}
console.log(failed ? `\nSetup finished with ${failed} problem(s).` : '\nSetup done. Run: npm test');
process.exitCode = failed ? 1 : 0;
