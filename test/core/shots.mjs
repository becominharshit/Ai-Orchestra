// Screenshot tour for docs/shots/TASK-01 (phone 375x812, TV 1920x1080, TV portrait 1080x1920).
//   npm run shots            (starts its own mock-mode server on a free port)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-01');
let BASE = '';
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dataDir = path.join(ROOT, 'tmp', `shots-${Date.now()}`);
const srv = spawn(process.execPath, ['core/server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '2600', ADMIN_KEY: 'shots-key', DATA_DIR: dataDir, PZ_QUIET: '1', PZ_NO_DOTENV: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((res) => srv.stdout.on('data', (d) => { const m = String(d).match(/play-zenith on http:\/\/[^:]+:(\d+)/); if (m) { BASE = `http://127.0.0.1:${m[1]}`; res(); } }));

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };

try {
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  watch(tv, 'tv');
  await tv.goto(`${BASE}/tv/_sample?c=9`);
  await wait(1500);
  await shot(tv, 'tv-1-idle');

  const phoneCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  watch(phone, 'phone');
  await phone.goto(`${BASE}/`);
  await wait(600);
  await shot(phone, 'phone-0-hub');
  await phone.goto(`${BASE}/_sample?c=9`);
  await wait(500);
  await phone.fill('input[name=word]', 'curious');
  await phone.selectOption('select[name=subject]', 'science');
  await shot(phone, 'phone-1-form');
  await phone.click('button[type=submit]');
  await wait(1250);
  await shot(phone, 'phone-2-orchestra-working');
  await shot(tv, 'tv-2-orchestra-working');
  await wait(1500);
  await shot(tv, 'tv-3-orchestra-handoff');
  await phone.waitForSelector('.orx.is-finished', { timeout: 15000, state: 'attached' });
  await shot(phone, 'phone-3-orchestra-done');
  await wait(250);
  await shot(tv, 'tv-4-orchestra-done');
  await wait(2200);
  await shot(tv, 'tv-5-result-spotlight');
  await phone.waitForSelector('#s-result:not([hidden])');
  await wait(700);
  await shot(phone, 'phone-4-result');
  await phone.click('#unlock');
  await wait(600);
  await shot(phone, 'phone-5-gate');
  await phone.click('[data-pz=gate-unlock]');
  await wait(800);
  await phone.evaluate(() => document.getElementById('share-box').scrollIntoView({ block: 'center' }));
  await wait(300);
  await shot(phone, 'phone-6-share');
  // save the share card PNG itself
  const b64 = await phone.evaluate(async () => {
    const img = document.getElementById('card-img');
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    return cv.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, 'sharecard-1080x1920.png'), Buffer.from(b64, 'base64'));
  console.log('shot sharecard-1080x1920');

  // replay at half speed on the TV
  await tv.keyboard.press('2');
  await tv.keyboard.press('r');
  await wait(2600);
  await shot(tv, 'tv-6-replay-half-speed');

  // capture + portrait (filming layouts)
  const capCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const cap = await capCtx.newPage();
  watch(cap, 'tv-portrait');
  await cap.goto(`${BASE}/tv/_sample?c=9&capture=1&layout=portrait&replay=1&speed=1`);
  await wait(3200);
  await shot(cap, 'tv-7-portrait-capture-replay');
  await cap.goto(`${BASE}/tv/_sample?c=9&layout=portrait`);
  await wait(1200);
  await shot(cap, 'tv-8-portrait-idle');
  const land = await tvCtx.newPage();
  watch(land, 'tv-capture');
  await land.goto(`${BASE}/tv/_sample?c=9&capture=1&replay=1`);
  await wait(3200);
  await shot(land, 'tv-9-capture-replay');

  const adm = await tvCtx.newPage();
  await adm.goto(`${BASE}/admin?key=shots-key`);
  await shot(adm, 'admin-1920');
} finally {
  await browser.close();
  const exited = new Promise((r) => srv.once('exit', r));
  srv.kill();
  await exited;
  fs.rmSync(dataDir, { recursive: true, force: true });
}
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('no console errors');
