// Screenshot tour for docs/shots/TASK-03: phone 375x812, TV 1920x1080, TV portrait capture 1080x1920, the hero
// run (?demo=hero), the share card PNG and the WhatsApp PDF pages.
//   node test/career/shots.mjs        (starts its own mock server on port 8802 with a fake AiSensy and test keys)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { tmp, testKeys, fakeAiSensy } from './helpers.js';
import { playFlow } from './flow.mjs';
import { buildPdf } from '../../experiences/career/lib/pdf.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-03');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = Number(process.env.SHOTS_PORT || 8802); // SHOTS_PORT overrides (8802 = this task's local port)
const BASE = `http://127.0.0.1:${PORT}`;

const fake = await fakeAiSensy();
const keys = testKeys();
const srv = spawn(process.execPath, ['core/server/index.js'], {
  cwd: ROOT,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, PZ_NO_DOTENV: '1', PZ_QUIET: '1', PORT: String(PORT), DATA_DIR: tmp('pzshots'), CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1800',
    WHATSAPP_PDF_ON: 'on', WHATSAPP_ALLOWLIST: '9000000001', AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url, LEADS_PUBLIC_KEY: keys.pubEnv, PHONE_PEPPER: 'p'.repeat(40), LINK_HMAC_SECRET: 's'.repeat(40) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((res) => srv.stdout.on('data', (d) => { if (String(d).includes('play-zenith on')) res(); }));
try {
  const a = await playFlow({ base: BASE, out: OUT, job: 'marketing', phoneNumber: '9000000001' });
  console.log('landscape run', a.errors.length ? a.errors : 'no console errors', a.timings, 'TV For fun only px:', a.tvForFunPx);
  const portraitDir = path.join(OUT, 'portrait');
  const b = await playFlow({ base: BASE, out: portraitDir, job: 'software', portrait: true, forecast: false, counter: 4 });
  for (const f of fs.readdirSync(portraitDir)) { if (f.startsWith('tv-')) fs.renameSync(path.join(portraitDir, f), path.join(OUT, `portrait-${f}`)); else fs.unlinkSync(path.join(portraitDir, f)); }
  fs.rmdirSync(portraitDir);
  console.log('portrait run', b.errors.length ? b.errors : 'no console errors', 'TV For fun only px:', b.tvForFunPx, 'card:', b.tvCardBg);
  const d = await playFlow({ base: BASE, out: null, job: 'doctor', tv: false, forecast: false });
  console.log('doctor run', d.errors.length ? d.errors : 'no console errors');

  // hero run (?demo=hero) on phone + TV, and the share card at full size
  const browser = await chromium.launch();
  const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await tv.goto(`${BASE}/tv/career?c=3&capture=1`);
  const ph = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const errs = [];
  ph.on('pageerror', (e) => errs.push(e.message));
  ph.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await ph.goto(`${BASE}/career/?c=3&demo=hero`);
  await ph.waitForSelector('#s-r1:not([hidden])', { timeout: 15000 });
  await wait(2500);
  await ph.screenshot({ path: path.join(OUT, 'hero-1-round1.png') });
  await ph.waitForSelector('#s-r2:not([hidden])', { timeout: 40000 });
  await wait(4000);
  await ph.screenshot({ path: path.join(OUT, 'hero-2-orchestra.png') });
  await tv.screenshot({ path: path.join(OUT, 'hero-tv-capture-orchestra.png') });
  await ph.waitForSelector('#s-result:not([hidden])', { timeout: 40000 });
  await ph.waitForFunction(() => document.querySelector('#res-card').src.startsWith('blob:'));
  await wait(3000);
  await ph.screenshot({ path: path.join(OUT, 'hero-3-result.png') });
  await tv.screenshot({ path: path.join(OUT, 'hero-tv-capture-result.png') });
  const png = await ph.evaluate(async () => {
    const img = document.querySelector('#res-card');
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(OUT, 'sharecard-1080x1920.png'), Buffer.from(png.split(',')[1], 'base64'));
  console.log('hero run', errs.length ? errs : 'no console errors');
  await browser.close();

  // the WhatsApp PDF, rendered to PNG pages (needs pdftoppm; skipped if missing)
  const pdf = await buildPdf({ areaId: 'business-managing', stopText: 'play.zenithschool.ai/career/stop' });
  const pdfFile = path.join(OUT, 'whatsapp-pdf-business-managing.pdf');
  fs.writeFileSync(pdfFile, pdf);
  try { execFileSync('pdftoppm', ['-r', '80', '-png', pdfFile, path.join(OUT, 'whatsapp-pdf-page')]); } catch { console.log('pdftoppm missing: PDF pages not rendered'); }
  console.log('fake AiSensy received', fake.bodies.length, 'request(s)');
} finally {
  srv.kill();
  await fake.close();
}
