// AI Startup Studio end to end (Playwright, phone 375x812 + TV 1920x1080), in mock, offline and fake-live modes.
//   node test/startup/e2e.mjs            run every check
//   node test/startup/e2e.mjs --shots    also save screenshots to docs/shots/TASK-18/
// Checks: flow under 2 min, 0 console errors, 0 TV-bus rejections, TV spotlight from bank text, typed line never on the TV
// or the page, gate before the website, share card, care card on a crisis line, hero runs alone, page speed on slow 4G.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { startServer } from '../core/helpers.js';
import { fakeClient } from './fake-live.mjs';

const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('docs/shots/TASK-18');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }); };
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

const browser = await chromium.launch();

async function phone(base, q = '') {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const log = { errors: [], rejected: [], external: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); if (/rejected by TV-safety/.test(m.text())) log.rejected.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) log.external.push(r.url()); });
  await page.goto(`${base}/startup/?c=2&test=1${q}`);
  return { page, ctx, log };
}
async function tvPage(base, q = '') {
  const portrait = q.includes('layout=portrait');
  const ctx = await browser.newContext({ viewport: portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/tv/startup?c=2${q}`);
  await page.waitForTimeout(800);
  return { page, ctx, errors };
}

async function flow(base, mode, { idea = '', area = 'tiffin', who = 'hostel', vibe = 'eco', shots = false } = {}) {
  const tv = await tvPage(base);
  const { page, log } = await phone(base);
  const t0 = Date.now();
  if (shots) await shot(page, 'phone-1-intro');
  await page.click('#go');
  if (shots) { await page.waitForTimeout(500); await shot(page, 'phone-2-area', { fullPage: true }); }
  await page.click(`[data-pz=area][data-id=${area}]`);
  await page.click(`[data-pz=who][data-id=${who}]`);
  await page.click(`[data-pz=vibe][data-id=${vibe}]`);
  const ideaVisible = await page.isVisible('#idea');
  check(mode === 'live' ? ideaVisible : !ideaVisible, `${mode}: one-liner box ${mode === 'live' ? 'shown (live)' : 'hidden (degraded = chips only)'}`);
  if (idea) await page.fill('#idea', idea);
  if (shots) { await page.waitForTimeout(500); await shot(page, 'phone-3-brief'); }
  await page.click('#build');
  if (shots) { await page.waitForTimeout(5200); await shot(page, 'phone-4-orchestra'); await shot(tv.page, 'tv-1-orchestra-live'); }
  await page.waitForFunction(() => window.__startup?.screen === 's-result', null, { timeout: 60000 });
  const secs = (Date.now() - t0) / 1000;
  check(secs < 120, `${mode}: chips to result in ${secs.toFixed(1)} s (< 120 s)`);
  const res = await page.evaluate(() => window.__startup.res);
  await page.waitForTimeout(1000);
  if (shots) await shot(page, 'phone-5-result', { fullPage: true });
  // TV spotlight shows the generated name; nothing typed
  await tv.page.waitForFunction((n) => document.querySelector('.stv-name')?.textContent === n, res.public.name.text, { timeout: 15000 }).catch(() => {});
  const tvText = await tv.page.evaluate(() => document.body.innerText);
  check(tvText.includes(res.public.name.text), `${mode}: TV spotlight shows the generated name (${res.public.name.text})`);
  if (idea) for (const tok of idea.split(/\W+/).filter((t) => t.length >= 4)) check(!tvText.includes(tok), `${mode}: typed "${tok}" is not on the TV`);
  if (shots) { await tv.page.waitForTimeout(4500); await shot(tv.page, 'tv-2-spotlight'); }
  // gate before the website
  check(await page.isHidden('#site-box'), `${mode}: website link hidden before the follow gate`);
  await page.click('#unlock');
  await page.waitForSelector('[data-pz=gate-unlock]');
  if (shots) await shot(page, 'phone-6-gate');
  await page.click('[data-pz=gate-unlock]');
  await page.waitForSelector('#site-box:not([hidden])');
  await page.waitForFunction(() => document.getElementById('card-img').naturalWidth > 0);
  const card = await page.evaluate(() => ({ w: document.getElementById('card-img').naturalWidth, h: document.getElementById('card-img').naturalHeight }));
  check(card.w === 1080 && card.h === 1920, `${mode}: share card 1080x1920`);
  if (shots) await shot(page, 'phone-7-unlocked', { fullPage: true });
  const href = await page.getAttribute('#site-open', 'href');
  const html = await (await fetch(href)).text();
  check(html.includes(res.public.name.text), `${mode}: the website ${new URL(href).pathname} renders`);
  if (idea) for (const tok of idea.split(/\W+/).filter((t) => t.length >= 4)) check(!html.includes(tok), `${mode}: typed "${tok}" is not on the website`);
  const sharkHref = await page.getAttribute('#shark', 'href');
  check(/^\/shark\/\?(c=\d+&)?idea=[a-z]+$/.test(sharkHref), `${mode}: AI Sharks link carries chip ids only (${sharkHref})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, `${mode}: no horizontal scroll at 375 px`);
  check(log.errors.length === 0 && tv.errors.length === 0, `${mode}: 0 console errors (phone ${log.errors.length}, TV ${tv.errors.length}) ${log.errors.concat(tv.errors).join(' | ')}`);
  check(log.rejected.length === 0, `${mode}: 0 TV-bus rejections ${log.rejected.join(' | ')}`);
  check(log.external.length === 0, `${mode}: 0 external requests ${log.external.join(' ')}`);
  await page.click('#again');
  await page.context().close();
  await tv.ctx.close();
  return res;
}

// ---------- mock ----------
{
  const s = await startServer({ CLAUDE_MOCK: '1', STARTUP_STUDIO: '1', STAGE_MIN_TURN_S: '0' });
  const res = await flow(s.base, 'mock', { shots: true });
  // the website, phone and desktop, and its speed on slow 4G (150 ms RTT, 1.6 Mbit/s)
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const site = await ctx.newPage();
  const cdp = await ctx.newCDPSession(site);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await site.goto(`${s.base}${res.page.path}`, { waitUntil: 'load' });
  const timing = await site.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { load: Math.round(n.loadEventEnd), dcl: Math.round(n.domContentLoadedEventEnd), bytes: performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), n.transferSize || 0) }; });
  check(timing.load < 1500, `website on slow 4G: DOMContentLoaded ${timing.dcl} ms, load ${timing.load} ms (< 1500 ms), ${Math.round(timing.bytes / 1024)} KB`);
  await site.waitForTimeout(300);
  await shot(site, 'site-1-phone', { fullPage: true });
  await ctx.close();
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desk.goto(`${s.base}${res.page.path}`);
  await desk.waitForTimeout(400);
  await shot(desk, 'site-2-desktop', { fullPage: true });
  await desk.context().close();
  // TV idle loop: "Aaj ki startups" (generated names only)
  const tv = await tvPage(s.base);
  await tv.page.waitForTimeout(600);
  for (let i = 0; i < 8; i++) { const p = await tv.page.evaluate(() => { window.__stage.rotate(); return document.documentElement.dataset.panel || document.querySelector('.tv-frame')?.dataset.panel; }); if (p === 'hook-today') break; }
  await tv.page.waitForTimeout(1200);
  const board = await tv.page.evaluate(() => document.querySelector('.stv-today')?.innerText || '');
  check(board.includes(res.public.name.text), 'TV idle loop: "Aaj ki startups" lists the generated name');
  await shot(tv.page, 'tv-3-idle-board');
  await tv.ctx.close();
  // hero: runs by itself, then the portrait capture view for filming
  const tvP = await tvPage(s.base, '&capture=1&layout=portrait');
  const tvL = await tvPage(s.base, '&capture=1');
  const { page } = await phone(s.base, '&demo=hero');
  await page.waitForFunction(() => window.__startup?.screen === 's-result', null, { timeout: 60000 });
  const hero = await page.evaluate(() => window.__startup.res);
  check(hero.source === 'hero' && hero.public.name.text === 'ThaliDost', 'hero: ?demo=hero runs by itself (ThaliDost)');
  await tvP.page.waitForTimeout(5000);
  await shot(tvP.page, 'tv-4-hero-portrait-capture');
  await shot(tvL.page, 'tv-5-hero-landscape-capture');
  for (const [lbl, t] of [['portrait', tvP], ['landscape', tvL]]) {
    const fit = await t.page.evaluate(() => { const c = document.querySelector('.stv-card')?.getBoundingClientRect(); const st = document.querySelector('.tv-stage').getBoundingClientRect(); return c && c.top >= st.top - 1 && c.bottom <= st.bottom + 1 && c.left >= st.left - 1 && c.right <= st.right + 1; });
    check(fit, `TV ${lbl} capture: the spotlight card fits inside the stage`);
  }
  // camera floors: every visible text in the spotlight is at least 22 px
  const small = await tvL.page.evaluate(() => [...document.querySelectorAll('.stv-card *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 22).map((e) => `${e.className}:${getComputedStyle(e).fontSize}`));
  check(small.length === 0, `TV spotlight text >= 22 px at 1080p ${small.join(' ')}`);
  await page.context().close(); await tvP.ctx.close(); await tvL.ctx.close();
  await s.close();
}

// ---------- offline ----------
{
  const s = await startServer({ DEMO_MODE: '1', OFFLINE: '1', STARTUP_STUDIO: '1' });
  const res = await flow(s.base, 'offline', { area: 'cricket', who: 'students', vibe: 'bold' });
  check(res.source === 'composed', 'offline: composed from the banks (no model call)');
  await s.close();
}

// ---------- fake live (typing allowed, live crisis check) ----------
{
  const s = await startServer({ STARTUP_STUDIO: '1' }, { claudeClient: fakeClient() });
  const res = await flow(s.base, 'live', { idea: 'Rahul Sharma 9876543210 canteen', area: 'hostel_food', who: 'students', vibe: 'tech' });
  check(res.source === 'claude', 'live: answered by the (fake) live model');
  // care: a crisis line shows the care card, no orchestra, nothing on the TV
  const tv = await tvPage(s.base);
  const { page } = await phone(s.base);
  await page.click('#go');
  await page.click('[data-pz=area][data-id=exam_stress]');
  await page.click('[data-pz=who][data-id=students]');
  await page.click('[data-pz=vibe][data-id=desi]');
  await page.fill('#idea', 'mujhe ab jeena nahi hai');
  await page.click('#build');
  await page.waitForTimeout(800);
  const care = await page.evaluate(() => document.body.innerText.includes('14416'));
  const screen = await page.evaluate(() => window.__startup.screen);
  check(care && screen !== 's-run', 'live: a crisis line shows the care card (Tele-MANAS 14416), no orchestra');
  await shot(page, 'phone-8-care');
  const tvMode = await tv.page.evaluate(() => document.querySelector('.tv-frame')?.dataset.mode || document.documentElement.dataset.mode);
  check(tvMode !== 'live', `live: the TV stays idle after the care card (${tvMode})`);
  await page.context().close(); await tv.ctx.close();
  await s.close();
}

// ---------- slow live crisis check (2.5 s, like a real one): the TV must stay idle until the server answers (CHECK-18 F2) ----------
{
  const s = await startServer({ STARTUP_STUDIO: '1' }, { claudeClient: fakeClient({ careDelayMs: 2500 }) });
  const tv = await tvPage(s.base);
  const { page, log } = await phone(s.base);
  await page.click('#go');
  await page.click('[data-pz=area][data-id=exam_stress]');
  await page.click('[data-pz=who][data-id=students]');
  await page.click('[data-pz=vibe][data-id=desi]');
  await page.fill('#idea', 'SENTINELCRISIS bas ab aur nahi');
  await page.click('#build');
  const modes = [];
  for (const ms of [250, 350, 600, 800, 1500]) { await tv.page.waitForTimeout(ms); modes.push(await tv.page.evaluate(() => document.getElementById('tv')?.dataset.mode)); }
  await page.waitForTimeout(500);
  const care = await page.evaluate(() => document.body.innerText.includes('14416'));
  const phoneOrx = await page.evaluate(() => !!document.querySelector('#orx .orx, #orx [class*="orx"]'));
  check(care, 'slow live: a crisis only the live check catches gets the care card');
  check(modes.every((m) => m === 'idle'), `slow live: the TV never left idle during the 2.5 s check (${modes.join(',')})`);
  check(!phoneOrx, 'slow live: no orchestra was started on the phone');
  const toast = await tv.page.evaluate(() => document.body.innerText.includes('TV cleared'));
  check(!toast, 'slow live: no "TV cleared" toast on the TV');
  await page.context().close();
  // a safe typed line still plays normally after the wait, and the revenue line reads as a playful estimate on the TV
  const p2 = await phone(s.base);
  await p2.page.click('#go');
  await p2.page.click('[data-pz=area][data-id=tiffin]');
  await p2.page.click('[data-pz=who][data-id=hostel]');
  await p2.page.click('[data-pz=vibe][data-id=desi]');
  await p2.page.fill('#idea', 'naye shehar mein ghar ka khana');
  await p2.page.click('#build');
  await p2.page.waitForFunction(() => window.__startup?.screen === 's-result', null, { timeout: 60000 });
  await tv.page.waitForSelector('.stv-rev', { timeout: 15000 }).catch(() => {});
  const rev = await tv.page.evaluate(() => document.querySelector('.stv-rev')?.textContent || '');
  check(/rough andaaza/.test(rev), `slow live: a safe line plays normally; TV revenue line is labelled (${rev})`);
  check(p2.log.errors.length === 0 && log.errors.length === 0 && tv.errors.length === 0, 'slow live: 0 console errors');
  await p2.ctx.close(); await tv.ctx.close();
  await s.close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
