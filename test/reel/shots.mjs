// Squad Reel browser run (Playwright): phone 375x812 + TV 1920x1080 + portrait capture 1080x1920.
// Starts its own worker (PORT 8813) and play-web in mock mode (PORT 8803), uses generated test clips,
// asserts the follow gate hides everything (preview, save, download, share) until "Maine follow kar liya",
// checks TV text sizes and 0 console errors, and saves screenshots to docs/shots/TASK-04/.
//   node test/reel/shots.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, tmpDir, sampleClips } from './helpers.js';
import { createPublic } from '../../experiences/reel/public.js';

// CHECK_build 12/13: every string the phone sends to the TV must be registered public text (no free text, nothing typed)
const pub = createPublic();
const notPublic = [];
function checkBus(req) {
  if (!req.url().includes('/api/core/bus/reel/') || req.method() !== 'POST' || req.url().endsWith('/pin')) return;
  let body;
  try { body = JSON.parse(req.postData() || '{}'); } catch { return; }
  const walk = (v, key) => {
    if (typeof v === 'string') { if (!['t', 'id', 'from', 'to', 'state', 'icon', 'color', 'url', 'qr'].includes(key) && !pub.isPublic(v)) notPublic.push(`${key}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  for (const ev of body.events || []) walk(ev, ev.t);
}

const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-04');
fs.mkdirSync(OUT, { recursive: true });
// 8803 / 8813 by default (task ports); the next free port if another builder's run holds them
import net from 'node:net';
const free = (p) => new Promise((res) => { const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true))).listen(p, '0.0.0.0'); });
async function pickPort(p) { for (let i = 0; i < 40; i++) if (await free(p + i * 100)) return p + i * 100; throw new Error('no free port'); }
const WEB = await pickPort(Number(process.env.REEL_WEB_PORT) || 8803);
const WORKER = await pickPort(Number(process.env.REEL_WORKER_PORT) || 8813);
const BASE = `http://127.0.0.1:${WEB}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SECRET = 'shots-secret';
const procs = [];
function start(cmd, args, env, ready, cwd = ROOT) {
  const p = spawn(process.execPath, args, { cwd, env: { ...process.env, PZ_NO_DOTENV: '1', ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  procs.push(p);
  return new Promise((res) => p.stdout.on('data', (d) => { if (String(d).includes(ready)) res(p); }));
}
const stopAll = () => { for (const p of procs) { try { process.kill(p.pid, 'SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stopAll);

const storage = tmpDir('shots-store');
await start('worker', ['reel-worker/src/server.js'], { PORT: String(WORKER), REEL_SHARED_SECRET: SECRET, REEL_STORAGE_DIR: storage, PZ_QUIET: '1' }, 'play-reel worker on');
await start('web', ['core/server/index.js'], { PORT: String(WEB), CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1800', REEL_WORKER_URL: `http://127.0.0.1:${WORKER}`, REEL_SHARED_SECRET: SECRET, DATA_DIR: tmpDir('shots-data'), PUBLIC_URL: 'https://play.zenithschool.ai', /* the bus only takes https own links for TV QRs */ PZ_QUIET: '1', PUBLIC_TEXT_STRICT: '1' }, 'play-zenith on');
// wait for the worker's boot assets (beds, end card, hero clips)
for (let i = 0; i < 120; i++) { const h = await fetch(`http://127.0.0.1:${WORKER}/healthz`).then((r) => r.json()); if (h.assets === 'ready') break; await wait(1000); }
const clips = await sampleClips();

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on('request', checkBus);
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /rejected/.test(m.text()))) errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('shot', name); };
const timings = {};

async function tvSizes(tv) {
  return tv.evaluate(() => {
    const px = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
    return { name: px('.orx-node:not(.orx-node--lead) .orx-name'), lead: px('.orx-node--lead .orx-name'), chip: px('.orx-node:not(.orx-node--lead) .orx-chip'), log: px('.orx-lines'), role: px('.orx-node:not(.orx-node--lead) .orx-role') };
  });
}

try {
  // ---------- TV landscape + phone, real clips ----------
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  watch(tv, 'tv');
  await tv.goto(`${BASE}/tv/reel?c=6`);
  await wait(1500);
  await shot(tv, 'tv-1-idle');

  const phoneCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  watch(phone, 'phone');
  const t0 = Date.now();
  await phone.goto(`${BASE}/reel?c=6`);
  await phone.waitForSelector('#s-intro:not([hidden])');
  await wait(600);
  assert.equal(await phone.locator('#s-intro input:not([role=switch]), #s-intro select, #s-intro textarea').count(), 0, 'no form before the fun part');
  await shot(phone, 'phone-1-templates');
  await phone.click('[data-tpl="intro"]');
  await phone.waitForSelector('#s-shots:not([hidden])');
  await shot(phone, 'phone-3-shots-empty');
  await phone.click('#squad [data-n="4"]');
  for (let i = 0; i < 3; i++) {
    await phone.setInputFiles(`input[data-shot="${i + 1}"]`, clips[i]);
    await phone.waitForSelector(`.rl-shot[data-shot="${i + 1}"].is-ready`, { timeout: 30000 });
  }
  await wait(500);
  await shot(phone, 'phone-4-shots-ready');
  assert.equal(await phone.isEnabled('#make'), true);
  await phone.click('#make');
  await phone.waitForSelector('#s-run:not([hidden])');
  await wait(2600);
  await shot(phone, 'phone-5-orchestra-captions');
  await shot(tv, 'tv-2-orchestra-captions');
  timings.tvSizes = await tvSizes(tv);
  await phone.waitForFunction(() => [...document.querySelectorAll('.orx-node.is-working .orx-name')].some((e) => e.textContent === 'Editor'), null, { timeout: 30000 });
  await wait(900);
  await shot(phone, 'phone-6-orchestra-editor');
  await shot(tv, 'tv-3-orchestra-editor');
  await phone.waitForSelector('#s-result:not([hidden])', { timeout: 90000 });
  timings.phoneFlowS = (Date.now() - t0) / 1000;
  // CHECK-04 F1: the TV gets nothing of the result (no reel, no download QR) before the phone's follow gate
  const tvState = () => tv.evaluate(() => ({
    spot: !!document.querySelector('.rltv'),
    video: document.querySelector('.tv-spot video')?.getAttribute('src') || null,
    qr: !!document.querySelector('.tv-spot .rltv-qr, .tv-spot .tv-spot-qr'),
    anyReelUrl: document.documentElement.innerHTML.includes('/api/reel/file/'),
  }));
  await wait(2500);
  assert.deepEqual(await tvState(), { spot: false, video: null, qr: false, anyReelUrl: false }, 'TV shows no result before the gate');
  await shot(tv, 'tv-4a-before-unlock');

  // ---------- follow gate: nothing gated is reachable before "Maine follow kar liya" ----------
  const gated = () => phone.evaluate(() => ({
    unlockedHidden: document.getElementById('unlocked').hidden,
    unlockedShown: getComputedStyle(document.getElementById('unlocked')).display !== 'none',
    playerSrc: document.getElementById('player').getAttribute('src'),
    downloadHref: document.getElementById('download').getAttribute('href'),
    saveVisible: !!document.getElementById('save').offsetParent,
    friendsVisible: !!document.getElementById('friends').offsetParent,
    downloadVisible: !!document.getElementById('download').offsetParent,
    videos: [...document.querySelectorAll('video')].filter((v) => v.offsetParent && v.getAttribute('src')?.includes('/api/reel/file/')).length,
  }));
  let g = await gated();
  assert.deepEqual(g, { unlockedHidden: true, unlockedShown: false, playerSrc: null, downloadHref: null, saveVisible: false, friendsVisible: false, downloadVisible: false, videos: 0 }, 'result locked before the gate');
  await shot(phone, 'phone-7-result-locked');
  await phone.click('#unlock');
  await phone.waitForSelector('[data-pz=gate-unlock]');
  g = await gated();
  assert.equal(g.playerSrc, null, 'still locked while the gate sheet is open');
  assert.equal(g.friendsVisible, false);
  await phone.click('[data-pz=gate-ig]').catch(() => {}); // opens a new tab with the IG link (honour based, no API call)
  for (const p of phoneCtx.pages()) if (p !== phone) await p.close();
  await shot(phone, 'phone-8-gate');
  assert.deepEqual(await tvState(), { spot: false, video: null, qr: false, anyReelUrl: false }, 'still nothing on the TV while the gate sheet is open');
  await phone.click('[data-pz=gate-unlock]');
  await phone.waitForSelector('#unlocked:not([hidden])');
  // after unlock: TV shows the result + download QR, but NOT the reel until the squad turns on "Big screen pe reel chalao"
  await tv.waitForSelector('.rltv', { timeout: 10000 });
  await wait(1200);
  let tvs = await tvState();
  assert.equal(tvs.qr, true, 'QR after unlock');
  assert.equal(tvs.video, null, 'no reel on the TV while the reel toggle is off (default)');
  assert.equal(await phone.isChecked('#tv-reel'), false, 'reel toggle default off');
  await shot(tv, 'tv-4b-unlocked-reel-toggle-off');
  await phone.check('#tv-reel');
  await tv.waitForSelector('.tv-spot video[src^="/api/reel/file/"]', { timeout: 10000 });
  await wait(1200);
  await shot(tv, 'tv-4-result-spotlight');
  await phone.uncheck('#tv-reel');
  await tv.waitForFunction(() => !document.querySelector('.tv-spot video'), null, { timeout: 10000 });
  await phone.check('#tv-reel');
  g = await gated();
  assert.equal(g.saveVisible && g.friendsVisible && g.downloadVisible, true, 'unlocked after follow');
  assert.match(g.playerSrc, /^\/api\/reel\/file\/[a-z]{20}$/);
  await phone.waitForFunction(() => document.getElementById('player').readyState >= 2, null, { timeout: 15000 });
  const vinfo = await phone.evaluate(() => { const v = document.getElementById('player'); return { w: v.videoWidth, h: v.videoHeight, d: v.duration }; });
  assert.equal(vinfo.w, 1080); assert.equal(vinfo.h, 1920);
  timings.reel = vinfo;
  await wait(800);
  await shot(phone, 'phone-9-result-unlocked');
  await phone.check('#repost');
  await phone.evaluate(() => document.getElementById('friends').scrollIntoView({ block: 'center' }));
  await wait(300);
  await shot(phone, 'phone-10-consent-share');
  // Doston ko bhejo: the real button builds the card from publicText objects only (strict mode drops plain strings)
  await phone.evaluate(() => { window.open = () => null; });
  await phone.click('#friends');
  await phone.waitForFunction(() => (globalThis.__pzShareCards || []).length > 0, null, { timeout: 15000 });
  const cards = await phone.evaluate(() => globalThis.__pzShareCards);
  assert.equal(cards.at(-1).dropped, 0, 'no plain-string line on the share card');
  assert.ok(cards.at(-1).pt.length >= 3, `share card built from publicText: ${JSON.stringify(cards.at(-1))}`);
  timings.shareCardPt = cards.at(-1).pt;
  // save a copy of the same kind of card (server publicText objects) at 1080x1920
  const card = await phone.evaluate(async () => {
    const { makeShareCard } = await import('/core/sharecard.js');
    const c0 = await fetch('/api/reel/card?template=intro').then((r) => r.json());
    const cap = await fetch('/api/reel/captions', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pz-demo': 'hero' }, body: JSON.stringify({ template: 'intro', squad: 4 }) }).then((r) => r.json());
    const c = await makeShareCard({ exp: 'reel', kicker: c0.kicker, title: c0.title, lines: [...cap.captions.slice(0, 2), c0.line], footer: '' });
    const img = new Image(); img.src = c.url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0);
    return { w: c.width, h: c.height, b64: cv.toDataURL('image/png').split(',')[1] };
  });
  assert.equal(card.w, 1080); assert.equal(card.h, 1920);
  fs.writeFileSync(path.join(OUT, 'share-card.png'), Buffer.from(card.b64, 'base64'));
  // a friend scanning the TV QR lands on the same gated result
  const id = g.playerSrc.split('/').pop();
  const friend = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true })).newPage();
  watch(friend, 'friend');
  await friend.goto(`${BASE}/reel/?get=${id}`);
  await friend.waitForSelector('#s-result:not([hidden])');
  assert.equal(await friend.evaluate(() => document.getElementById('player').getAttribute('src')), null, 'friend view is gated too');
  await shot(friend, 'phone-11-friend-from-tv-qr');
  await phone.click('#again');

  // ---------- hero demo: portrait capture TV + landscape capture TV ----------
  const pCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const ptv = await pCtx.newPage();
  watch(ptv, 'tv-portrait');
  await ptv.goto(`${BASE}/tv/reel?c=7&capture=1&layout=portrait`);
  const lCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const ltv = await lCtx.newPage();
  watch(ltv, 'tv-capture');
  await ltv.goto(`${BASE}/tv/reel?c=7&capture=1`);
  await wait(1200);
  const hp = await (await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true })).newPage();
  watch(hp, 'hero');
  const h0 = Date.now();
  await hp.goto(`${BASE}/reel/?c=7&demo=hero`);
  await hp.waitForSelector('.rl-shot.is-ready', { timeout: 30000 });
  await wait(400);
  await shot(hp, 'hero-1-sample-shots');
  await hp.waitForFunction(() => [...document.querySelectorAll('.orx-node.is-working .orx-name')].some((e) => e.textContent === 'Editor'), null, { timeout: 40000 });
  await wait(1200);
  await shot(ptv, 'tv-portrait-capture-editor');
  await shot(ltv, 'tv-capture-editor');
  timings.portraitSizes = await tvSizes(ptv);
  await hp.waitForSelector('#s-result:not([hidden])', { timeout: 180000 }).catch(async (e) => { await shot(hp, 'debug-hero-timeout'); throw e; });
  timings.heroFlowS = (Date.now() - h0) / 1000;
  // hero (abstract footage) unlocks itself and turns the reel on for the TV
  await ptv.waitForSelector('.tv-spot video[src^="/api/reel/file/"]', { timeout: 20000 });
  await wait(1500);
  await shot(ptv, 'tv-portrait-capture-result');
  await shot(ltv, 'tv-capture-result');
  await shot(hp, 'hero-2-result');
  // queue screen: 3 renders at once on concurrency 1
  console.log('timings', JSON.stringify(timings));
  if (notPublic.length) { console.log('NOT PUBLIC TEXT ON THE BUS:\n' + [...new Set(notPublic)].join('\n')); process.exitCode = 1; } else console.log('all TV text is registered public text');
  if (errors.length) { console.log('CONSOLE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; } else console.log('no console errors');
} catch (e) {
  console.error(e);
  console.log('errors so far:', errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  stopAll();
}
