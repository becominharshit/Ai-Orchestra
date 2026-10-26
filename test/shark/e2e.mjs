// AI Sharks end-to-end check + screenshot tour (Playwright, no test runner needed).
//   node test/shark/e2e.mjs                 v1 is free text only, so it plays only in LIVE safety mode: runs against
//                                           test/shark/fake-live.mjs (a fake live Claude client), plus a degraded
//                                           (mock) check that /shark/v1/ goes to the v2 chips. --no-shots skips shots.
// Starts its own server on PORT 8804 (stopped at the end). Exit code 1 on any failed check.
// Paths: text (prompt chip + chips + typed + pass), voice (fake Web Speech API), unsafe pitch redirect,
//        gate (nothing gated in the DOM before "Maine follow kar liya"), share card 1080x1920, ?demo=hero, TV.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-05');
const PORT = Number(process.env.SHARK_PORT || 8804);
const BASE = `http://127.0.0.1:${PORT}`;
const argv = process.argv.slice(2);
const MODES = ['live'];
const SHOTS = !argv.includes('--no-shots');
const C = 4; // AI Sharks counter
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

function startServer(mode) {
  const env = { ...process.env, PORT: String(PORT), PZ_NO_DOTENV: '1', PZ_QUIET: '1', ADMIN_KEY: 'shark-e2e', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'shark-e2e-')), ANTHROPIC_API_KEY: '' };
  if (mode === 'mock') Object.assign(env, { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1200' });
  else if (mode === 'offline') Object.assign(env, { DEMO_MODE: '1', OFFLINE: '1' });
  const script = mode === 'live' ? 'test/shark/fake-live.mjs' : 'core/server/index.js';
  const srv = spawn(process.execPath, [script], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 15000);
    srv.stdout.on('data', (d) => { if (String(d).includes('play-zenith on')) { clearTimeout(t); resolve(srv); } });
  });
}

// Fake Web Speech API: "speaks" the next scripted line word by word, like Chrome's interim results.
const FAKE_SPEECH = () => {
  const lines = [
    'Mera idea hai ek hostel laundry app. Students pickup book karenge aur hum 24 ghante mein kapde dhoke denge, 99 rupaye ka bag.',
    'Har hostel mein 300 students hain, pehle 5 hostels',
    'Exam week wale busy students, reel banayenge',
    'Cost 55 rupaye, price 99',
  ];
  let n = 0;
  class FakeSR {
    start() {
      const words = (lines[n++] || 'theek hai').split(' ');
      let i = 0;
      this._t = setInterval(() => {
        i += 1;
        const res = [{ transcript: words.slice(0, i).join(' ') }];
        res.isFinal = i === words.length;
        this.onresult?.({ resultIndex: 0, results: [res] });
        if (res.isFinal) clearInterval(this._t);
      }, 90);
    }
    stop() { clearInterval(this._t); setTimeout(() => this.onend?.(), 20); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
};

async function stats() { return (await fetch(`${BASE}/admin/stats.json?key=shark-e2e`)).json(); }

function watch(page, tag, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.errors.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => sink.errors.push(`${tag}: ${e.message}`));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !/^(blob|data):/.test(u.protocol)) sink.external.push(r.url()); });
}

async function phonePage(browser, sink, tag, { voice = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (voice) await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  watch(page, tag, sink);
  return { ctx, page };
}

const screen = (page) => page.evaluate(() => window.__shark?.screen);
async function waitScreen(page, id, timeout = 30000) { await page.waitForFunction((s) => window.__shark?.screen === s, id, { timeout }); }

async function gatedChecks(page, label) {
  // Before unlock: no score, no in/out, no verdict, no share card, no lesson in the DOM.
  const g = await page.evaluate(() => ({
    after: document.getElementById('after').hidden,
    afterVisible: getComputedStyle(document.getElementById('after')).display !== 'none',
    img: document.getElementById('card-img').getAttribute('src'),
    stamp: document.getElementById('stamp').textContent,
    cards: document.getElementById('cards').textContent,
    lesson: document.getElementById('r-lesson-title').textContent,
  }));
  ok(g.after && !g.afterVisible, `${label}: share box + lesson hidden before unlock`);
  ok(!g.img, `${label}: share card image not set before unlock`);
  ok(g.stamp === '?' && !/DEAL|out hoon/i.test(g.cards) && !/\b\d+\s*\/10/.test(g.cards.replace(/\?\/10/g, '')) && !/\bIN\b|\bOUT\b/.test(g.cards), `${label}: no score / verdict text in the DOM before unlock`);
  ok(!g.lesson, `${label}: no lesson text before unlock`);
  // F5: script clicks on the hidden share buttons do nothing, no card is drawn, no verdict on window.
  const leak = await page.evaluate(async () => {
    let downloads = 0;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { downloads += 1; };
    const origOpen = window.open; window.open = () => { downloads += 1; return null; };
    document.getElementById('share').click();
    document.getElementById('friends').click();
    await new Promise((r) => setTimeout(r, 600));
    HTMLAnchorElement.prototype.click = origClick; window.open = origOpen;
    return { downloads, verdict: window.__shark?.verdict, img: document.getElementById('card-img').getAttribute('src') };
  });
  ok(leak.downloads === 0 && !leak.img, `${label}: programmatic share/friends click before unlock does nothing`);
  ok(leak.verdict === undefined, `${label}: window.__shark does not expose the verdict before unlock`);
}

async function unlockAndReveal(page, shot) {
  await page.click('#unlock');
  await page.waitForSelector('[data-pz="gate-unlock"]');
  if (shot) await shot('phone-7-gate');
  ok(await page.evaluate(() => document.getElementById('after').hidden && !document.getElementById('card-img').getAttribute('src')), 'gate open: result still locked until "Maine follow kar liya"');
  await page.click('[data-pz="gate-unlock"]');
  await page.waitForSelector('#stamp.slam', { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById('card-img').naturalWidth > 0, null, { timeout: 15000 });
}

async function runMode(mode) {
  console.log(`\n== ${mode} ==`);
  const srv = await startServer(mode);
  const browser = await chromium.launch();
  const sink = { errors: [], external: [] };
  const tag = (n) => `${mode}-${n}`;
  try {
    const before = await stats();
    // TV
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    watch(tv, 'tv', sink);
    await tv.goto(`${BASE}/tv/shark?c=${C}`);
    await wait(1400);
    const shoot = (page, name) => (SHOTS && mode === 'live' ? page.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => console.log('  shot', name)) : Promise.resolve());
    await shoot(tv, 'tv-1-idle');

    // ---- text path ----
    const { page } = await phonePage(browser, sink, tag('text'));
    const t0 = Date.now();
    await page.goto(`${BASE}/shark/v1/?c=${C}&test=1`);
    await page.waitForSelector('#intro-bench .sk-av');
    await wait(500);
    await shoot(page, 'phone-1-intro');
    await page.click('#go-text');
    await page.waitForSelector('#prompts .sk-chip');
    await page.click('#prompts .sk-chip >> nth=1'); // "App for hostel laundry"
    await shoot(page, 'phone-2-pitch-text');
    await page.click('#send-pitch');
    await wait(900);
    await shoot(page, 'phone-3-orchestra');
    await shoot(tv, 'tv-2-orchestra');
    await waitScreen(page, 's-tank');
    await page.waitForSelector('#answer-chips .sk-chip');
    await shoot(page, 'phone-4-tank-q1');
    await wait(600);
    await shoot(tv, 'tv-3-tank-q1');
    await page.click('#answer-chips .sk-chip >> nth=0'); // q1: chip
    await page.waitForFunction(() => document.getElementById('bubble-who').textContent === 'Shark Marketing');
    await page.waitForSelector('#answer-chips .sk-chip');
    await page.fill('#answer', 'Exam week wale students, Insta reel se'); // q2: typed
    await wait(1400);
    await shoot(tv, 'tv-4-tank-q2');
    await shoot(page, 'phone-5-tank-q2-typed');
    await page.click('#send-answer');
    await page.waitForFunction(() => document.getElementById('bubble-who').textContent === 'Shark Finance');
    await page.waitForSelector('#answer-chips .sk-chip');
    await page.click('#skip'); // q3: pass
    await waitScreen(page, 's-run');
    await wait(700);
    await shoot(tv, 'tv-5-scoring');
    await waitScreen(page, 's-result', 30000);
    await shoot(page, 'phone-6-result-locked');
    await gatedChecks(page, `${mode} text`);
    const tvSpotBefore = await tv.evaluate(() => document.querySelector('.tv-spot')?.classList.contains('show'));
    ok(!tvSpotBefore, `${mode}: TV shows no verdict before the phone unlocks`);
    await unlockAndReveal(page, (n) => shoot(page, n));
    await wait(1200);
    await shoot(page, 'phone-8-verdict');
    const dims = await page.evaluate(() => { const i = document.getElementById('card-img'); return [i.naturalWidth, i.naturalHeight]; });
    ok(dims[0] === 1080 && dims[1] === 1920, `${mode}: share card is 1080x1920 (${dims.join('x')})`);
    const res = await page.evaluate(() => ({ v: window.__shark.verdict, src: window.__shark.source, stamp: document.getElementById('stamp').textContent, lesson: document.getElementById('r-lesson-z').textContent, ff: document.body.textContent.includes('For fun only') }));
    ok(['deal', 'out'].includes(res.v), `${mode}: verdict ${res.v} (${res.src})`);
    ok(/mini-MBA/.test(res.lesson) && res.ff, `${mode}: mini-MBA lesson + For fun only label`);
    ok(res.src === 'claude', `${mode}: answer source is ${res.src} (fake live client)`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(400);
    await shoot(page, 'phone-9-lesson-share');
    const fullMs = Date.now() - t0;
    ok(fullMs < 180000, `${mode}: text flow took ${(fullMs / 1000).toFixed(0)}s (< 180s)`);
    await wait(4500);
    await shoot(tv, 'tv-6-reveal');
    const tvState = await tv.evaluate(() => ({ stamp: document.querySelector('.sk-tv-stamp')?.textContent, banner: document.querySelector('.sk-tv-banner-main')?.textContent, scores: [...document.querySelectorAll('.sk-tv-rscore .n')].map((n) => n.textContent) }));
    ok(/DEAL|MAIN OUT HOON/.test(tvState.stamp || '') && tvState.scores.every((s) => /^\d+$/.test(s)), `${mode}: TV reveal shows scores ${tvState.scores.join('/')} + ${tvState.stamp}`);
    ok(tvState.banner === 'AI SHARKS. ASLI PAISA NAHI.', `${mode}: TV banner "AI SHARKS. ASLI PAISA NAHI."`);
    const tvText = await tv.evaluate(() => document.body.innerText);
    ok(!/Exam week wale students, Insta reel se/.test(tvText), `${mode}: typed answer never reaches the TV`);
    ok(!/shark tank/i.test(tvText + await page.evaluate(() => document.body.innerText)), `${mode}: no "Shark Tank" anywhere on phone or TV`);

    // ---- voice path ----
    const vp = await phonePage(browser, sink, tag('voice'), { voice: true });
    const v0 = Date.now();
    await vp.page.goto(`${BASE}/shark/v1/?c=${C}&test=1`);
    await vp.page.click('#go-voice');
    await vp.page.waitForSelector('#mic');
    await vp.page.click('#mic');
    await vp.page.waitForFunction(() => document.getElementById('pitch').value.length > 60, null, { timeout: 10000 });
    await wait(400);
    await shoot(vp.page, 'phone-2b-pitch-voice');
    await vp.page.click('#mic');
    ok((await vp.page.inputValue('#pitch')).startsWith('Mera idea hai ek hostel laundry app'), `${mode} voice: live transcript filled the pitch box`);
    await vp.page.click('#send-pitch');
    for (const who of ['Shark VC', 'Shark Marketing', 'Shark Finance']) {
      await waitScreen(vp.page, 's-tank');
      await vp.page.waitForFunction((w) => document.getElementById('bubble-who').textContent === w, who, { timeout: 30000 });
      await vp.page.waitForSelector('#answer-chips .sk-chip');
      await vp.page.waitForFunction(() => document.getElementById('answer').value.length > 8, null, { timeout: 10000 }); // auto-mic in voice mode
      await vp.page.click('#send-answer');
      await wait(300);
    }
    await waitScreen(vp.page, 's-result', 30000);
    await gatedChecks(vp.page, `${mode} voice`);
    await unlockAndReveal(vp.page);
    ok(Date.now() - v0 < 180000, `${mode} voice: flow took ${((Date.now() - v0) / 1000).toFixed(0)}s (< 180s)`);

    // ---- unsafe pitch: polite redirect, no Claude call ----
    const up = await phonePage(browser, sink, tag('unsafe'));
    await up.page.goto(`${BASE}/shark/v1/?c=${C}&test=1`);
    await up.page.click('#go-text');
    await up.page.fill('#pitch', 'Exam paper leak karke students ko bechne ka app, 500 rupaye mein');
    await up.page.click('#send-pitch');
    await waitScreen(up.page, 's-redirect', 15000);
    await up.page.waitForSelector('#redirect-prompts .sk-chip');
    await shoot(up.page, 'phone-10-redirect');
    const msg = await up.page.textContent('#redirect-msg');
    ok(/smart idea|honestly/i.test(msg), `${mode}: unsafe pitch gets a kind redirect ("${msg.slice(0, 50)}...")`);
    await up.page.click('#redirect-prompts .sk-chip >> nth=0');
    ok(await screen(up.page) === 's-pitch' && (await up.page.inputValue('#pitch')).length > 40, `${mode}: redirect prompt chip fills a fresh pitch`);

    // ---- self-harm: caring line, "Kisi bade se baat karo", no chips, no game, no score ----
    await up.page.fill('#pitch', 'Mujhe end it all karna hai, kal subah not wake up');
    await up.page.click('#send-pitch');
    // Core's care card (CONTRACT 13.3, Tele-MANAS 14416) when the kit has it, else our own care screen.
    await up.page.waitForFunction(() => document.querySelector('[data-pz="care"]') || window.__shark?.screen === 's-redirect', null, { timeout: 15000 });
    await wait(400);
    await shoot(up.page, 'phone-11-care');
    const care = await up.page.evaluate(() => { const c = document.querySelector('[data-pz="care"]'); return { core: !!c, text: c ? c.textContent : document.getElementById('redirect-msg').textContent, chips: document.querySelectorAll('#redirect-prompts .sk-chip').length, tank: window.__shark?.screen === 's-tank' }; });
    ok((care.core ? /14416/.test(care.text) : /Kisi bade se baat karo/.test(care.text) && care.chips === 0) && !care.tank, `${mode}: self-harm pitch gets the care card (${care.core ? 'core, Tele-MANAS 14416' : 'shark fallback'}), no game`);
    // ---- Devanagari pitch plays (no "too short") ----
    if (care.core) { await up.page.evaluate(() => { const c = document.querySelector('[data-pz="care"]'); const back = [...c.querySelectorAll('button, a')].find((b) => /wapas/i.test(b.textContent)); back ? back.click() : c.remove(); }); await up.page.goto(`${BASE}/shark/v1/?c=${C}&test=1`); }
    else await up.page.click('#redirect-again');
    await up.page.click('#go-text');
    await up.page.fill('#pitch', 'मेरा आइडिया एक चाय की दुकान है जो कॉलेज के बाहर होगी');
    await up.page.click('#send-pitch');
    await waitScreen(up.page, 's-tank', 20000);
    ok(true, `${mode}: Devanagari pitch reaches the tank`);
    await up.ctx.close(); // stop this half-played session so it does not keep talking to counter 3

    // ---- hero demo: runs by itself ----
    if (mode === 'live') {
      const hp = await phonePage(browser, sink, tag('hero'));
      const tvP = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
      watch(tvP, 'tv-portrait', sink);
      await tvP.goto(`${BASE}/tv/shark?c=${C}&capture=1&layout=portrait`);
      await wait(800);
      const h0 = Date.now();
      await hp.page.goto(`${BASE}/shark/v1/?c=${C}&demo=hero&test=1`);
      await waitScreen(hp.page, 's-tank', 60000);
      await wait(2600);
      await shoot(tvP, 'tv-7a-portrait-capture-tank');
      const ov = await tvP.evaluate(() => {
        const b = document.querySelector('.sk-tv-banner').getBoundingClientRect();
        return [...document.querySelectorAll('.sk-tv-seat.active .sk-tv-plate small, .sk-tv-status')].map((e) => e.getBoundingClientRect()).some((r) => r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right);
      });
      ok(!ov, 'portrait capture: banner does not cover the role or status line');
      await hp.page.waitForSelector('#stamp.slam', { timeout: 120000 });
      ok(true, `hero: ran end to end by itself in ${((Date.now() - h0) / 1000).toFixed(0)}s, verdict ${await hp.page.evaluate(() => window.__shark.verdict)}`);
      await wait(5500);
      await shoot(tvP, 'tv-7-portrait-capture-hero-reveal');
      const px = await tvP.evaluate(() => ({ name: Math.min(...[...document.querySelectorAll('.sk-tv-rname')].map((e) => parseFloat(getComputedStyle(e).fontSize))), pill: parseFloat(getComputedStyle(document.querySelector('.sk-tv-banner .pz-forfun')).fontSize) }));
      ok(px.name >= 36 && px.pill >= 22, `portrait reveal: shark names ${px.name}px (>= 36), For fun pill ${px.pill}px (>= 22)`);
      await tv.keyboard.press('r');
      await wait(9000);
      await shoot(tv, 'tv-8-replay-tank');
      const card = await hp.page.evaluate(async () => {
        const i = document.getElementById('card-img');
        await new Promise((r) => (i.complete && i.naturalWidth ? r() : i.addEventListener('load', r, { once: true })));
        const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
        return c.toDataURL('image/png');
      });
      fs.writeFileSync(path.join(OUT, 'sharecard-1080x1920.png'), Buffer.from(card.split(',')[1], 'base64'));
    }

    // ---- analytics: counts only ----
    await wait(400);
    const after = await stats();
    const d = (k) => (after.totals?.shark?.[k] || 0) - (before.totals?.shark?.[k] || 0);
    ok(d('verdict_deal') + d('verdict_out') === 2, `${mode}: verdict_deal + verdict_out counted 2 (deal ${d('verdict_deal')}, out ${d('verdict_out')}; hero not counted)`);
    ok(d('start') >= 3 && d('complete') === 2 && d('gate_unlock') >= 1, `${mode}: start ${d('start')}, complete ${d('complete')}, gate_unlock ${d('gate_unlock')}`);
    ok(d('safety_redirect[kind=cheating]') >= 1 && (d('safety_redirect[kind=care]') + d('care_shown')) >= 1 && d('pitch_mode[mode=voice]') === 1, `${mode}: safety_redirect[kind=cheating] ${d('safety_redirect[kind=cheating]')} + pitch_mode[mode=voice] ${d('pitch_mode[mode=voice]')} counted`);
    ok(!JSON.stringify(after).includes('laundry'), `${mode}: analytics hold no free text`);
  } finally {
    ok(sink.errors.length === 0, `${mode}: no console errors${sink.errors.length ? `: ${sink.errors.slice(0, 3).join(' | ')}` : ''}`);
    ok(sink.external.length === 0, `${mode}: no external requests${sink.external.length ? `: ${sink.external.slice(0, 3).join(' ')}` : ''}`);
    await browser.close();
    srv.kill('SIGTERM');
    await new Promise((r) => srv.once('exit', r));
  }
}

/** Degraded (mock): v1 is free text only, so the phone goes straight to v2's chips. */
async function degradedRedirect() {
  console.log('\n== degraded (mock) ==');
  const srv = await startServer('mock');
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
    await page.goto(`${BASE}/shark/v1/?c=${C}&test=1`);
    await page.waitForURL(/\/shark\/v2\//, { timeout: 10000 });
    ok(true, 'degraded: /shark/v1/ goes to /shark/v2/ (chips only)');
    const r = await fetch(`${BASE}/api/shark/questions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pitch: 'Hostel laundry app, pickup aur delivery' }) });
    ok(r.status === 409, 'degraded: v1 /questions refuses free text (409 chips_only)');
  } finally { await browser.close(); srv.kill('SIGTERM'); await new Promise((r) => srv.once('exit', r)); }
}

try {
  for (const m of MODES) await runMode(m);
  await degradedRedirect();
} catch (e) {
  fails.push(`crashed: ${e.message}`);
  console.error(e);
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
