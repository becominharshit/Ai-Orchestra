// Build Your Own AI Agent: end-to-end check + screenshot tour (Playwright, no test runner needed).
//   node test/agent/e2e.mjs                  mock, offline and live (fake live client) + screenshots to docs/shots/TASK-19
//   node test/agent/e2e.mjs --mode offline   one mode only (mock | offline | live)     --no-shots  skip screenshots
// Own server per mode on an OS-picked port, AGENT_BUILDER=1. Checks: full design + run on a 375x812 phone under
// 3 minutes, 0 console errors, no external requests, no TV-safety rejections, TV mirror shows only registered text,
// gate before the cards, story card 1080x1920, Agent card 1080x1350, ?demo=hero, TV landscape/portrait/capture shots.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-19');
const argv = process.argv.slice(2);
const MODES = argv.includes('--mode') ? [argv[argv.indexOf('--mode') + 1]] : ['mock', 'offline', 'live'];
const SHOTS = !argv.includes('--no-shots');
const C = 4; // counter map v4 (core config); any ?c= works, the path decides the experience
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

function startServer(mode) {
  const tmp = fs.mkdtempSync(path.join(ROOT, 'tmp', 'agent-e2e-'));
  const env = { ...process.env, PORT: '0', PZ_NO_DOTENV: '1', PZ_QUIET: '1', ADMIN_KEY: 'agent-e2e', DATA_DIR: tmp, ANTHROPIC_API_KEY: '', AGENT_BUILDER: '1' };
  if (mode === 'mock') Object.assign(env, { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '900' }); else if (mode === 'offline') Object.assign(env, { DEMO_MODE: '1', OFFLINE: '1' });
  const srv = spawn(process.execPath, [mode === 'live' ? 'test/agent/fake-live.mjs' : 'core/server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 120000);
    srv.stdout.on('data', (d) => { const m = String(d).match(/play-zenith on http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); resolve({ srv, base: `http://127.0.0.1:${m[1]}`, tmp }); } });
  });
}
function watch(page, tag, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.errors.push(`${tag}: ${m.text()}`); if (/rejected by TV-safety|plain string, not publicText/.test(m.text())) sink.rejects.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => sink.errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() === 404) sink.errors.push(`${tag}: 404 ${new URL(r.url()).pathname}`); });
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !/^(blob|data):/.test(u.protocol)) sink.external.push(r.url()); });
}
const screen = (p) => p.evaluate(() => window.__agent?.screen);
const waitScreen = (p, id, timeout = 40000) => p.waitForFunction((s) => window.__agent?.screen === s, id, { timeout });
const shot = async (p, name, opts = {}) => { if (SHOTS) { await wait(700); await p.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }); } };

async function design(page, mode) {
  // template: JEE Prep Tutor
  await page.click('[data-job="jee"]');
  await waitScreen(page, 's-task');
  await page.click('[data-item="maths"]');
  await page.click('[data-param="cls:c12"]');
  await page.click('[data-param="weak:p_elec"]');
  await page.click('[data-param="perDay:180"]');
  await page.click('[data-param="start:16:00"]');
  if (mode === 'mock') await shot(page, 'phone-2-task', { fullPage: true });
  await page.click('#to-persona');
  await waitScreen(page, 's-persona');
  await page.fill('[data-slider="strict"]', '1');
  await page.fill('[data-slider="funny"]', '3');
  await page.fill('[data-slider="detail"]', '4');
  await page.click('[data-voice="coach"]');
  if (mode === 'mock') await shot(page, 'phone-3-personality', { fullPage: true });
  await page.click('#to-tools');
  await waitScreen(page, 's-tools');
  await page.fill('#first-name', 'Riya');
  if (mode === 'mock') await shot(page, 'phone-4-tools', { fullPage: true });
}

async function runMode(browser, mode) {
  console.log(`\n== ${mode}`);
  const { srv, base } = await startServer(mode);
  const sink = { errors: [], rejects: [], external: [] };
  try {
    const cfg = await (await fetch(`${base}/api/core/config`)).json();
    ok(cfg.safetyMode === (mode === 'live' ? 'live' : 'degraded'), `${mode}: safetyMode ${cfg.safetyMode}`);
    // TV first, so it mirrors the run
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    watch(tv, 'tv', sink);
    await tv.goto(`${base}/tv/agent?c=${C}`);
    await wait(1500);
    if (mode === 'mock') await shot(tv, 'tv-1920-idle');

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, 'phone', sink);
    const t0 = Date.now();
    await page.goto(`${base}/agent/?c=${C}`);
    await waitScreen(page, 's-job');
    if (mode === 'mock') await shot(page, 'phone-1-job', { fullPage: true });
    ok(await page.$$eval('input:not([type=range]):not([type=checkbox]), textarea, [contenteditable]', (x) => x.map((e) => e.id).join(',')) === 'first-name', `${mode}: the only text box is the optional first name`);
    await design(page, mode);
    await page.click('#go');
    await waitScreen(page, 's-run');
    await wait(mode === 'offline' ? 2500 : 3500);
    if (mode === 'mock') { await shot(page, 'phone-5-run'); await shot(tv, 'tv-1920-live'); await wait(4000); await shot(tv, 'tv-1920-live-tools'); await shot(page, 'phone-5b-run-tools'); }
    if (mode === 'live') await shot(tv, 'tv-1920-live-fake-live');
    await waitScreen(page, 's-result', 60000);
    const secs = (Date.now() - t0) / 1000;
    ok(secs < 180, `${mode}: design + run done in ${secs.toFixed(1)} s (< 180 s)`);
    await wait(1200);
    const res = await page.evaluate(() => ({ src: document.getElementById('r-src').textContent, slots: document.querySelectorAll('.ag-slot').length, plan: document.querySelectorAll('#r-plan li').length, sections: document.querySelectorAll('#r-sections .ag-sec').length, tip: document.getElementById('r-tip').textContent, share: document.getElementById('share-box').hidden, kicker: document.querySelector('#r-agent .pz-kicker').textContent }));
    ok(res.slots > 0 && res.plan >= 2 && res.sections >= 2, `${mode}: result has ${res.sections} template sections, ${res.plan} plan steps and ${res.slots} calendar slots`);
    ok(mode === 'live' ? res.kicker === 'Riya ka JEE Prep Tutor' : res.kicker === 'Tumhara AI agent', `${mode}: first name ${mode === 'live' ? 'shown on the phone after the live check' : 'not used in degraded mode'} (${res.kicker})`);
    ok(res.share === true, `${mode}: cards hidden before the follow gate`);
    // no name in use (degraded modes): the friendly nickname picker, never a word about a rejected name
    const pageText = await page.evaluate(() => document.body.innerText);
    ok(!/invalid|reject|not allowed|galat naam|naam theek nahi|nahi chalega|blocked/i.test(pageText), `${mode}: no rejection wording on the page`);
    if (mode !== 'live') {
      const pick = await page.$('#nick-opts .ag-chip');
      ok(!!pick && /Apne agent ke liye ek naam chuno/.test(pageText), `${mode}: nickname picker shown`);
      const nick = await pick.textContent();
      await pick.click();
      await page.waitForFunction((n) => document.querySelector('#r-agent .pz-kicker')?.textContent.startsWith(n), nick, { timeout: 5000 });
      ok(true, `${mode}: picked nickname "${nick}" on the phone`);
    }
    ok(!/100%|guarantee/i.test(res.tip), `${mode}: risky tip replaced (${res.tip})`);
    if (mode === 'mock') await shot(page, 'phone-6-result', { fullPage: true });
    await page.screenshot({ path: path.join(ROOT, 'tmp', `agent-${mode}-result.png`) });
    // TV spotlight
    await wait(1500);
    const tvText = await tv.evaluate(() => document.querySelector('.tv-spot')?.innerText || '');
    ok(/Pehla task/i.test(tvText), `${mode}: TV spotlight shows the agent card and task`);
    const tvAll = await tv.evaluate(() => document.body.innerText + (window.__tv?.dump() || ''));
    ok(!/Riya/.test(tvAll), `${mode}: the first name never reaches the TV`);
    if (mode === 'mock') await shot(tv, 'tv-1920-result');
    if (mode === 'live') await shot(tv, 'tv-1920-result-fake-live');
    // gate -> cards
    await page.click('#unlock');
    await page.waitForSelector('text=Maine follow kar liya', { timeout: 10000 });
    if (mode === 'mock') await shot(page, 'phone-7-gate');
    await page.click('text=Maine follow kar liya');
    await page.waitForFunction(() => !document.getElementById('share-box').hidden && document.getElementById('card-img').naturalWidth > 0 && document.getElementById('agent-img').naturalWidth > 0, null, { timeout: 15000 });
    const dims = await page.evaluate(() => ({ s: [document.getElementById('card-img').naturalWidth, document.getElementById('card-img').naturalHeight], a: [document.getElementById('agent-img').naturalWidth, document.getElementById('agent-img').naturalHeight], dropped: (globalThis.__pzShareCards || []).reduce((n, c) => n + c.dropped, 0) }));
    ok(dims.s[0] === 1080 && dims.s[1] === 1920, `${mode}: story card ${dims.s.join('x')}`);
    ok(dims.a[0] === 1080 && dims.a[1] === 1350, `${mode}: agent card ${dims.a.join('x')}`);
    ok(dims.dropped === 0, `${mode}: share card used only publicText lines`);
    if (mode === 'mock') {
      await shot(page, 'phone-8-cards', { fullPage: true });
      for (const [id, name] of [['card-img', 'card-story-1080x1920'], ['agent-img', 'card-agent-1080x1350']]) {
        const data = await page.evaluate((i) => { const img = document.getElementById(i); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return cv.toDataURL('image/png').split(',')[1]; }, id).catch(() => null);
        if (data && SHOTS) fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
      }
      // the 17 saal variant only when picked
      await page.click('#kicker-pick .ag-chip:nth-child(2)');
      await wait(1500);
      await shot(page, 'phone-9-cards-17', { fullPage: false });
    }
    await page.click('#again');
    await waitScreen(page, 's-job');
    await ctx.close();

    // hero
    const hctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true });
    const hp = await hctx.newPage();
    watch(hp, 'hero', sink);
    await hp.goto(`${base}/agent/?c=${C}&demo=hero`);
    await waitScreen(hp, 's-result', 60000);
    const heroSrc = await hp.evaluate(() => document.getElementById('r-src').textContent);
    ok(/fictional/.test(heroSrc), `${mode}: ?demo=hero runs by itself (${heroSrc})`);
    await hctx.close();

    if (mode === 'mock' && SHOTS) {
      for (const [q, name, vp] of [['&layout=portrait', 'tv-portrait-result', { width: 1080, height: 1920 }], ['&capture=1', 'tv-1920-capture-result', { width: 1920, height: 1080 }]]) {
        const c2 = await browser.newContext({ viewport: vp });
        const t2 = await c2.newPage();
        watch(t2, name, sink);
        await t2.goto(`${base}/tv/agent?c=${C}${q}`);
        await wait(1200);
        const p2 = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
        watch(p2, `${name}-phone`, sink);
        await p2.goto(`${base}/agent/?c=${C}&demo=hero`);
        await wait(9000);
        await shot(t2, `${name.replace('-result', '-live')}`);
        await p2.waitForFunction(() => window.__agent?.screen === 's-result', null, { timeout: 60000 });
        await wait(2500);
        await shot(t2, name);
        await c2.close();
      }
    }
    // TV text: every string the TV received is registered text (the phone saw no rejections)
    const dump = await tv.evaluate(() => window.__tv?.dump() || '[]');
    ok(dump.length > 10 && !/Riya/.test(dump), `${mode}: TV got the server's session events (no name)`);
    await tvCtx.close();
  } finally {
    srv.kill('SIGTERM');
  }
  ok(sink.errors.length === 0, `${mode}: 0 console errors${sink.errors.length ? `: ${sink.errors.slice(0, 5).join(' | ')}` : ''}`);
  ok(sink.rejects.length === 0, `${mode}: 0 TV-safety or share-card rejections${sink.rejects.length ? `: ${sink.rejects.slice(0, 3).join(' | ')}` : ''}`);
  ok(sink.external.length === 0, `${mode}: no external requests${sink.external.length ? `: ${sink.external.slice(0, 3).join(' ')}` : ''}`);
}

const browser = await chromium.launch();
try {
  for (const m of MODES) await runMode(browser, m);
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
process.exitCode = fails.length ? 1 : 0;
