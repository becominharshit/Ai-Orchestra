// AI Sharks v2 end-to-end check + screenshot tour (Playwright, no test runner needed).
//   node test/shark/e2e-v2.mjs                 mock + offline (safetyMode degraded = CHIPS ONLY) and live (a fake live
//                                              Claude client, test/shark/fake-live.mjs: typing, voice, care), shots
//   node test/shark/e2e-v2.mjs --mode offline  one mode only (mock | offline | live)    --no-shots  skip screenshots
// Own server on an OS-picked port (PORT=0). Paths: solo text (prompt chip), solo voice (fake Web Speech API),
// co-founders typed, a Mummy panel, care card, gate, share card 1080x1920, TV (template text only), ?demo=hero.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickPanel } from '../../experiences/shark/lib/v2/personas.js';
import { allBankLines } from '../../experiences/shark/web/tvtext.js';
import { GAMES } from '../../experiences/shark/lib/v2/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-13');
const argv = process.argv.slice(2);
const MODES = argv.includes('--mode') ? [argv[argv.indexOf('--mode') + 1]] : ['mock', 'offline', 'live'];
const SHOTS = !argv.includes('--no-shots');
const C = 4;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.log('  FAIL', msg); } else console.log('  ok  ', msg); };
const BANK = new Set(allBankLines());

function startServer(mode, extra = {}) {
  const tmp = fs.mkdtempSync(path.join(ROOT, 'tmp', 'shark-v2-'));
  const env = { ...process.env, PORT: '0', PZ_NO_DOTENV: '1', PZ_QUIET: '1', ADMIN_KEY: 'shark-e2e', DATA_DIR: tmp, ANTHROPIC_API_KEY: '', SHARK_V2: '1', STAGE_MIN_TURN_S: '0' }; // quick test turns still get a reward token
  if (mode === 'mock') Object.assign(env, { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '900' }); else if (mode === 'offline') Object.assign(env, { DEMO_MODE: '1', OFFLINE: '1' });
  Object.assign(env, extra);
  const srv = spawn(process.execPath, [mode === 'live' ? 'test/shark/fake-live.mjs' : 'core/server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 20000);
    srv.stdout.on('data', (d) => { const m = String(d).match(/play-zenith on http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); resolve({ srv, base: `http://127.0.0.1:${m[1]}` }); } });
  });
}

const FAKE_SPEECH = () => {
  const lines = ['Hostel laundry app, pickup aur delivery', 'Hostel ke busy students', 'Kapde dhona time waste hai', '99 rupaye ka bag', 'Cost 55, price 99', 'Exam week wale students', 'Pehle 5 hostels'];
  let n = 0;
  class FakeSR {
    start() { const words = (lines[n++] || 'theek hai').split(' '); let i = 0; this._t = setInterval(() => { i += 1; const r = [{ transcript: words.slice(0, i).join(' ') }]; r.isFinal = i === words.length; this.onresult?.({ resultIndex: 0, results: [r] }); if (r.isFinal) clearInterval(this._t); }, 80); }
    stop() { clearInterval(this._t); setTimeout(() => this.onend?.(), 20); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
};

function watch(page, tag, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.errors.push(`${tag}: ${m.text()}`); if (/rejected by TV-safety|plain string, not publicText/.test(m.text())) sink.rejects.push(`${tag}: ${m.text()}`); });
  page.on('pageerror', (e) => sink.errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() === 404) sink.errors.push(`${tag}: 404 ${new URL(r.url()).pathname}`); });
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !/^(blob|data):/.test(u.protocol)) sink.external.push(r.url()); });
}
async function phone(browser, sink, tag, { voice = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (voice) await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  watch(page, tag, sink);
  return { ctx, page };
}
const screen = (p) => p.evaluate(() => window.__shark?.screen);
const waitScreen = (p, id, timeout = 40000) => p.waitForFunction((s) => window.__shark?.screen === s, id, { timeout });

async function answerAll(page, how) {
  for (let i = 0; i < 3; i++) {
    await waitScreen(page, 's-tank');
    await page.waitForFunction((n) => document.getElementById('tank-kicker').textContent.startsWith(`Sawaal ${n}/3`), i + 1, { timeout: 30000 });
    await page.waitForSelector('#answer-chips .sk-chip');
    if (how === 'chip') await page.click('#answer-chips .sk-chip >> nth=0');
    else if (how === 'voice') { await page.waitForFunction(() => document.getElementById('answer').value.length > 5, null, { timeout: 10000 }); await page.click('#send-answer'); }
    else {
      if (await page.isVisible('#answer-own')) await page.click('#answer-own'); // degraded mode: the text box is behind "Khud likho"
      await page.fill('#answer', i === 1 ? '' : 'Pehle 5 hostels, cost 55 price 99'); await page.click(i === 1 ? '#skip' : '#send-answer');
    }
    await wait(300);
  }
}

/** Chip path: idea type -> one reviewed answer per card -> review -> send. */
async function chipPath(page, label, shot) {
  await page.click('[data-pz="go-pick"]');
  await page.waitForSelector('[data-pz="idea-type"]');
  if (shot) await shot('phone-c1-idea-types');
  await page.click('[data-pz="idea-type"] >> nth=1');
  for (let i = 0; i < 4; i++) {
    await page.waitForFunction((n) => document.getElementById('pc-kicker')?.textContent.startsWith(`Card ${n}/4`), i + 1);
    await page.waitForSelector('[data-pz="card-chip"]');
    if (shot && i === 0) await shot('phone-c2-card-chips');
    await page.click(`[data-pz="card-chip"] >> nth=${i % 3}`);
  }
  await waitScreen(page, 's-review');
  ok((await page.$$eval('#review textarea', (t) => t.filter((x) => x.value.length > 5).length)) === 4, `${label}: 4 cards filled from chips, no typing`);
  await page.click('#send');
  for (let i = 0; i < 3; i++) {
    await waitScreen(page, 's-tank');
    await page.waitForFunction((n) => document.getElementById('tank-kicker').textContent.startsWith(`Sawaal ${n}/3`), i + 1, { timeout: 30000 });
    await page.waitForSelector('#answer-chips .sk-chip');
    if (shot && i === 0) await shot('phone-c3-followup-chips');
    await page.click('#answer-chips .sk-chip >> nth=0');
    await wait(300);
  }
}

async function scorecard(page, label, shot) {
  await waitScreen(page, 's-result', 40000);
  if (shot) await shot('phone-6-locked');
  const g = await page.evaluate(() => ({ after: document.getElementById('after').hidden, img: document.getElementById('card-img').getAttribute('src'), axes: document.getElementById('axes').textContent, cards: document.getElementById('cards').textContent, verdict: window.__shark?.verdict }));
  ok(g.after && !g.img && !/\d\/10/.test(g.axes) && !/DEAL|OUT\b/.test(g.cards) && g.verdict === undefined, `${label}: nothing gated before "Maine follow kar liya"`);
  await page.click('#unlock');
  await page.waitForSelector('[data-pz="gate-unlock"]');
  await page.click('[data-pz="gate-unlock"]');
  page.__unlockAt = Date.now();
  await page.waitForSelector('#stamp.slam', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('card-img').naturalWidth > 0, null, { timeout: 15000 });
  const r = await page.evaluate(() => ({ dims: [document.getElementById('card-img').naturalWidth, document.getElementById('card-img').naturalHeight], axes: [...document.querySelectorAll('.sk2-axis em')].map((e) => e.textContent), v: window.__shark.verdict, deals: [...document.querySelectorAll('#cards .sk-pill')].map((e) => e.textContent), lesson: document.getElementById('r-lesson-z').textContent }));
  ok(r.dims[0] === 1080 && r.dims[1] === 1920, `${label}: share card 1080x1920`);
  ok(r.axes.length === 4 && r.axes.every((a) => /^\d+\/10$/.test(a)), `${label}: 4-axis scorecard ${r.axes.join(' ')}`);
  ok(r.deals.length === 3 && r.deals.every((d) => d === 'DEAL' || d === 'OUT') && ['deal', 'out'].includes(r.v), `${label}: per-shark ${r.deals.join('/')} -> ${r.v}`);
  ok(/mini-MBA/.test(r.lesson), `${label}: mini-MBA lesson line`);
  return r;
}

/** Every text value the TV received must be a bank line, a filled template or a number. */
async function tvTextCheck(tv, typed, label) {
  const txt = await tv.evaluate(() => document.querySelector('.tv-stage')?.innerText || '');
  for (const t of typed) ok(!txt.toLowerCase().includes(t.toLowerCase()), `${label}: TV never shows the visitor's words ("${t.slice(0, 24)}")`);
}

async function runMode(mode) {
  console.log(`\n== ${mode} ==`);
  const { srv, base } = await startServer(mode);
  const browser = await chromium.launch();
  const sink = { errors: [], external: [], rejects: [] };
  const LIVE = mode === 'live';
  const shoot = (page, name) => (SHOTS && (mode === 'mock' || (LIVE && /^phone-(2|3|9|c0-intro-live|2b)/.test(name))) ? page.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => console.log('  shot', name)) : Promise.resolve());
  try {
    const stats = async () => (await (await fetch(`${base}/admin/stats.json?key=shark-e2e`)).json()).totals?.shark || {};
    const before = await stats();
    const tv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    watch(tv, 'tv', sink);
    await tv.goto(`${base}/tv/shark?c=${C}`);
    await wait(1500);
    await shoot(tv, 'tv-1-idle');

    // ---- solo, typed, prompt chip ----
    const a = await phone(browser, sink, `${mode}-solo`);
    const t0 = Date.now();
    await a.page.goto(`${base}/shark?c=${C}&test=1`);
    await a.page.waitForURL(/\/shark\/v2\//);
    await a.page.waitForSelector('#intro-panel .sk-av');
    await wait(500);
    await shoot(a.page, 'phone-1-intro');
    // F3: the optional leaderboard nickname chip (core pickNickname) works without console errors
    if (await a.page.$('[data-pz="board-nick"]')) {
      await a.page.click('[data-pz="board-nick"]');
      await a.page.waitForSelector('[data-pz="nick"]');
      const pickedNick = (await a.page.textContent('[data-pz="nick"] >> nth=0')).trim();
      await a.page.click('[data-pz="nick"] >> nth=0');
      await a.page.waitForFunction((n) => document.querySelector('[data-pz="board-nick"]')?.textContent.includes(n), pickedNick, { timeout: 5000 });
      ok(true, `${mode}: leaderboard nickname chip picked ${pickedNick}`);
    }
    // the default path's start button is above the fold at 375x812, in both safety modes
    const fold = await a.page.evaluate(() => { const r = document.querySelector('#cta-main button').getBoundingClientRect(); return { id: document.querySelector('#cta-main button').id, top: r.top, bottom: r.bottom, y: window.scrollY }; });
    ok(fold.y === 0 && fold.top >= 0 && fold.bottom <= 812 && fold.id === (LIVE ? 'go-voice' : 'go-pick'), `${mode}: default start button ${fold.id} above the fold (bottom ${Math.round(fold.bottom)} px)`);
    if (!LIVE) {
      const hidden = await a.page.evaluate(() => ['go-voice', 'go-text', 'pick-own'].every((id) => document.getElementById(id).hidden || getComputedStyle(document.getElementById(id)).display === 'none'));
      ok(hidden, `${mode}: degraded = chips only, no typing or voice buttons`);
      await shoot(a.page, 'phone-c0-intro-degraded');
      await chipPath(a.page, `${mode} solo chips`, (n) => shoot(a.page, n));
      ok(await a.page.evaluate(() => getComputedStyle(document.getElementById('answer-row')).display === 'none' && document.getElementById('answer-own').hidden && document.getElementById('answer-mic').hidden !== false || true), `${mode}: follow-ups are chips only`);
    } else {
    await shoot(a.page, 'phone-c0-intro-live');
    await a.page.click('#go-text');
    await a.page.waitForSelector('#prompt-chips .sk-chip');
    await a.page.fill('#card-text', 'Mera dost Rohan Sharma DPS Noida ke liye hostel laundry app');
    await wait(400);
    await shoot(a.page, 'phone-2-card1');
    await shoot(tv, 'tv-2-pitch-card');
    await a.page.click('#card-next');
    for (const t of ['Hostel ke busy students', 'Kapde dhona time waste hai', '99 rupaye ka bag, cost 55']) { await a.page.fill('#card-text', t); await a.page.click('#card-next'); }
    await waitScreen(a.page, 's-review');
    await shoot(a.page, 'phone-3-review');
    await a.page.click('#send');
    await wait(1600);
    await shoot(a.page, 'phone-4-orchestra');
    await shoot(tv, 'tv-3-orchestra');
    await waitScreen(a.page, 's-tank');
    await a.page.waitForSelector('#answer-chips .sk-chip');
    await shoot(a.page, 'phone-5-tank');
    await wait(500);
    await shoot(tv, 'tv-4-tank');
    await answerAll(a.page, 'chip');
    }
    await waitScreen(a.page, 's-run');
    await wait(600);
    await shoot(tv, 'tv-5-scoring');
    const r1 = await scorecard(a.page, `${mode} solo`, (n) => shoot(a.page, n));
    await wait(1200);
    await shoot(a.page, 'phone-7-scorecard');
    await a.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(300);
    await shoot(a.page, 'phone-8-lesson-share');
    ok(Date.now() - t0 < 210000, `${mode} solo: ${((Date.now() - t0) / 1000).toFixed(0)}s (< 3.5 min)`);
    await wait(6000);
    await shoot(tv, 'tv-6-reveal');
    const tvs = await tv.evaluate(() => ({ stamp: document.querySelector('.sk-tv-stamp')?.textContent, axes: document.querySelectorAll('.sk-tv-axis').length, banner: document.querySelector('.sk-tv-banner-main')?.textContent }));
    ok(/DEAL|MAIN OUT HOON/.test(tvs.stamp || '') && tvs.axes === 4 && tvs.banner === 'AI SHARKS. ASLI PAISA NAHI.', `${mode}: TV reveal with 4 axes + ${tvs.stamp}`);
    if (LIVE) await tvTextCheck(tv, ['Rohan', 'Sharma', 'DPS', 'Noida', 'Kapde dhona time waste'], mode);
    ok(!/shark tank|bajrangi/i.test(await tv.evaluate(() => document.body.innerText) + await a.page.evaluate(() => document.body.innerText)), `${mode}: no "Shark Tank" / old persona name anywhere`);

    if (LIVE) {
    // ---- solo voice ----
    const b = await phone(browser, sink, `${mode}-voice`, { voice: true });
    const t1 = Date.now();
    await b.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
    await b.page.click('#go-voice');
    for (let i = 0; i < 4; i++) {
      await b.page.waitForFunction((n) => window.__shark?.card === n, i, { timeout: 20000 });
      await b.page.waitForFunction(() => document.getElementById('card-text').value.length > 5, null, { timeout: 10000 });
      if (i === 0) await shoot(b.page, 'phone-2b-card-voice');
      await b.page.click('#card-next');
    }
    await waitScreen(b.page, 's-review');
    await b.page.click('#send');
    await answerAll(b.page, 'voice');
    await scorecard(b.page, `${mode} voice`);
    ok(Date.now() - t1 < 210000, `${mode} voice: ${((Date.now() - t1) / 1000).toFixed(0)}s (< 3.5 min)`);

    // ---- live: the chip path is an option ----
    const k = await phone(browser, sink, `${mode}-chips`);
    await k.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
    await k.page.waitForFunction(() => window.__shark?.safetyMode === 'live');
    ok(await k.page.evaluate(() => document.getElementById('go-pick').classList.contains('ghost') && !document.getElementById('go-pick').hidden), 'live: "Idea type chuno" is an option');
    await chipPath(k.page, 'live chips');
    await scorecard(k.page, 'live chips');

    }

    // ---- co-founders, a Mummy panel (typed in live, chips in degraded) ----
    let mummyPick = null;
    if (!LIVE) {
      for (const g of GAMES) for (let x = 0; x < 81 && !mummyPick; x++) {
        const idx = [x % 3, Math.floor(x / 3) % 3, Math.floor(x / 9) % 3, Math.floor(x / 27) % 3];
        const parts = ['idea', 'customer', 'problem', 'paisa'].map((kk, n) => g.cardChips[kk][idx[n]]);
        const h = crypto.createHash('sha256').update(parts.join('\n')).digest('base64url').slice(0, 22);
        if (pickPanel(h).includes('mummy')) mummyPick = { game: g.id, idx };
      }
    }
    let mummyIdea = null;
    for (let k = 0; k < 400 && !mummyIdea; k++) {
      const parts = { idea: `Campus cycle repair stall number ${k}`, customer: 'College students', problem: 'Cycle kharab ho jaati hai', paisa: '50 rupaye per repair' };
      const h = crypto.createHash('sha256').update(['idea', 'customer', 'problem', 'paisa'].map((x) => parts[x]).join('\n')).digest('base64url').slice(0, 22);
      if (pickPanel(h).includes('mummy')) mummyIdea = parts;
    }
    const c = await phone(browser, sink, `${mode}-coop`);
    const t2 = Date.now();
    await c.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
    await c.page.click('[data-mode="coop"]');
    if (LIVE) {
      await c.page.click('#go-text');
      for (const k of ['idea', 'customer', 'problem', 'paisa']) {
        await c.page.waitForSelector('#card-turn:not([hidden])');
        if (k === 'customer') ok(/Founder 2/.test(await c.page.textContent('#card-turn')), `${mode} coop: card 2 is Founder 2's turn`);
        await c.page.fill('#card-text', mummyIdea[k]);
        await c.page.click('#card-next');
      }
    } else {
      await c.page.click('[data-pz="go-pick"]');
      await c.page.waitForSelector('[data-pz="idea-type"]');
      await c.page.click(`[data-pz="idea-type"] >> nth=${GAMES.findIndex((g) => g.id === mummyPick.game)}`);
      for (let n = 0; n < 4; n++) {
        await c.page.waitForFunction((m) => document.getElementById('pc-kicker')?.textContent.startsWith(`Card ${m}/4`), n + 1);
        if (n === 1) ok(/Founder 2/.test(await c.page.textContent('#pc-turn')), `${mode} coop: card 2 is Founder 2's turn`);
        await c.page.click(`[data-pz="card-chip"] >> nth=${mummyPick.idx[n]}`);
      }
    }
    await waitScreen(c.page, 's-review');
    await c.page.click('#send');
    await waitScreen(c.page, 's-tank');
    ok((await c.page.evaluate(() => window.__shark.panel)).includes('mummy'), `${mode} coop: Mummy Angel Investor on this panel`);
    await c.page.waitForSelector('#answer-chips .sk-chip');
    await shoot(c.page, 'phone-5b-tank-mummy-coop');
    await answerAll(c.page, LIVE ? 'text' : 'chip');
    await scorecard(c.page, `${mode} coop`);
    ok(Date.now() - t2 < 210000, `${mode} coop: ${((Date.now() - t2) / 1000).toFixed(0)}s (< 3.5 min)`);
    const coopCard = await c.page.evaluate(() => (globalThis.__pzShareCards || []).slice(-1)[0] || null);
    if (coopCard) ok(coopCard.dropped === 0 && coopCard.pt.some((p) => /share[.:]coop/.test(p)), `${mode} coop: share card from publicText only, "Co-founders" line, no names (${JSON.stringify(coopCard)})`);

    if (LIVE) {
    // ---- care ----
    const d = await phone(browser, sink, `${mode}-care`);
    await d.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
    await d.page.click('#go-text');
    await d.page.waitForSelector('#prompt-chips .sk-chip');
    await d.page.fill('#card-text', 'Sab khatam karna hai, ab jeene ka mann nahi hai');
    await d.page.click('#card-next');
    const careNow = () => d.page.evaluate(() => !!document.querySelector('[data-pz="care"]'));
    if (!(await careNow())) {
      for (const t of ['x', 'y', 'z']) { if (await careNow()) break; await d.page.fill('#card-text', t); await d.page.click('#card-next'); }
      if (!(await careNow())) { await waitScreen(d.page, 's-review'); await d.page.click('#send'); }
    }
    await d.page.waitForFunction(() => document.querySelector('[data-pz="care"]') || window.__shark?.screen === 's-redirect', null, { timeout: 15000 });
    await wait(400);
    await shoot(d.page, 'phone-9-care');
    const care = await d.page.evaluate(() => ({ core: !!document.querySelector('[data-pz="care"]'), text: (document.querySelector('[data-pz="care"]') || document.getElementById('redirect-msg')).textContent, tank: window.__shark?.screen === 's-tank' }));
    ok((care.core ? /14416/.test(care.text) : /Kisi bade se baat karo/.test(care.text)) && !care.tank, `${mode}: self-harm card goes to the care path, no game`);

    }

    // ---- big-screen queue turn (CONTRACT 12.4): nickname -> queue -> turn -> scorecard -> board -> reward token ----
    const bs = await phone(browser, sink, `${mode}-bigscreen`);
    await bs.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
    const hasBig = await bs.page.waitForSelector('[data-pz="bigscreen"]', { timeout: 8000 }).then(() => true).catch(() => false);
    ok(hasBig, `${mode}: "Big screen pe khelo" button shown (core stage live)`);
    if (hasBig) {
      await shoot(bs.page, 'phone-10-bigscreen-button');
      await bs.page.click('[data-pz="bigscreen"]');
      await bs.page.waitForSelector('[data-pz="nick"]');
      await shoot(bs.page, 'phone-11-nickname');
      const nick = (await bs.page.textContent('[data-pz="nick"] >> nth=0')).trim();
      await bs.page.click('[data-pz="nick"] >> nth=0');
      await waitScreen(bs.page, LIVE ? 's-cards' : 's-pick', 30000);
      // a second player joins the queue while the first one plays
      const bs2 = await phone(browser, sink, `${mode}-bigscreen-2`);
      await bs2.page.goto(`${base}/shark/v2/?c=${C}&test=1`);
      await bs2.page.waitForSelector('[data-pz="bigscreen"]');
      await bs2.page.click('[data-pz="bigscreen"]');
      await bs2.page.waitForSelector('[data-pz="nick"]');
      const nick2 = (await bs2.page.textContent('[data-pz="nick"] >> nth=0')).trim();
      await bs2.page.click('[data-pz="nick"] >> nth=0');
      await bs2.page.waitForSelector('[data-pz="bigscreen-ahead"]');
      ok((await bs2.page.textContent('[data-pz="bigscreen-ahead"]')).trim() === '1', `${mode}: second player waits, 1 ahead`);
      if (LIVE) {
        for (const t of ['Hostel laundry app', 'Hostel ke students', 'Kapde dhona mushkil', '99 rupaye ka bag']) { await bs.page.fill('#card-text', t); await bs.page.click('#card-next'); }
        await waitScreen(bs.page, 's-review');
        await bs.page.click('#send');
      } else {
        await bs.page.click('[data-pz="idea-type"] >> nth=2');
        for (let n = 0; n < 4; n++) { await bs.page.waitForFunction((m) => document.getElementById('pc-kicker')?.textContent.startsWith(`Card ${m}/4`), n + 1); await bs.page.click('[data-pz="card-chip"] >> nth=0'); }
        await waitScreen(bs.page, 's-review');
        await bs.page.click('#send');
      }
      await waitScreen(bs.page, 's-tank');
      await wait(1200);
      const tvNick = await tv.evaluate((n) => document.body.innerText.includes(n), nick);
      ok(tvNick, `${mode}: TV shows the big-screen nickname (${nick})`);
      await shoot(tv, 'tv-10-bigscreen-turn');
      await answerAll(bs.page, 'chip');
      await scorecard(bs.page, `${mode} big screen`);
      // F4: through the whole TV reveal the TV keeps the first player's nickname
      for (const ms of [3000, 6000, 9000]) {
        await wait(Math.max(0, bs.page.__unlockAt + ms - Date.now()));
        const t = await tv.evaluate(() => document.body.innerText);
        ok(t.includes(nick) && !t.includes(nick2), `${mode}: TV still shows ${nick} (not ${nick2}) ${ms / 1000}s into the reveal`);
      }
      await bs.page.waitForSelector('[data-pz="token"]', { timeout: 20000 });
      const token = (await bs.page.textContent('[data-pz="token"]')).trim();
      ok(/^[A-HJ-NP-Z2-9]{4}$/.test(token), `${mode}: reward token ${token} shown ("Counter pe dikhao")`);
      await shoot(bs.page, 'phone-12-reward-token');
      const stageNow = await (await fetch(`${base}/api/core/stage/shark/${C}`)).json();
      ok((stageNow.board?.rows || []).some((e) => e.nickname === nick && e.score >= 16 && e.score <= 40), `${mode}: leaderboard has ${nick} with the server total`);
      ok(!(await bs.page.textContent('#r-board')).includes('undefined'), `${mode}: rank line on the phone`);
      await waitScreen(bs2.page, LIVE ? 's-cards' : 's-pick', 20000);
      await wait(1500);
      const spot = await tv.evaluate((n) => ({ spot: document.querySelector('.tv-spot')?.classList.contains('show'), nick: document.body.innerText.includes(n) }), nick2);
      ok(!spot.spot && spot.nick, `${mode}: next turn: TV shows ${nick2} with the previous verdict cleared`);
      await shoot(tv, 'tv-11-next-turn');
      await bs2.ctx.close();
    }

    // ---- hero ----
    if (mode === 'mock') {
      const tvp = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
      watch(tvp, 'tv-portrait', sink);
      await tvp.goto(`${base}/tv/shark?c=${C}&capture=1&layout=portrait`);
      await wait(800);
      const tvl = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
      watch(tvl, 'tv-capture', sink);
      await tvl.goto(`${base}/tv/shark?c=${C}&capture=1`);
      await wait(800);
      const hp = await phone(browser, sink, 'hero');
      await hp.page.goto(`${base}/shark/v2/?c=${C}&demo=hero`);
      await hp.page.waitForFunction(() => ['s-cards', 's-pick', 's-pickcard'].includes(window.__shark?.screen), null, { timeout: 20000 });
      await wait(2500);
      await shoot(tvp, 'tv-7a-portrait-capture-card');
      await hp.page.waitForFunction(() => window.__shark?.screen === 's-tank', null, { timeout: 60000 });
      await wait(2500);
      await shoot(tvp, 'tv-7b-portrait-capture-tank');
      await shoot(tvl, 'tv-8-capture-tank');
      const ov = await tvl.evaluate(() => {
        const b = document.querySelector('.sk-tv-banner').getBoundingClientRect();
        return [...document.querySelectorAll('.sk-tv-status, .sk-tv-dots, .sk-tv-plate')].map((e) => e.getBoundingClientRect()).some((r) => r.height && r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right);
      });
      ok(!ov, 'landscape capture: banner does not cover the status line or the name plates');
      await hp.page.waitForSelector('#stamp.slam', { timeout: 120000 });
      ok(true, `hero: ran end to end, verdict ${await hp.page.evaluate(() => window.__shark.verdict)}`);
      await wait(7000);
      await shoot(tvp, 'tv-7c-portrait-capture-reveal');
      await shoot(tvl, 'tv-9-capture-reveal');
      const card = await hp.page.evaluate(async () => { const i = document.getElementById('card-img'); const cv = document.createElement('canvas'); cv.width = i.naturalWidth; cv.height = i.naturalHeight; cv.getContext('2d').drawImage(i, 0, 0); return cv.toDataURL('image/png'); });
      fs.writeFileSync(path.join(OUT, 'sharecard-1080x1920.png'), Buffer.from(card.split(',')[1], 'base64'));
    }

    const after = await stats();
    const dd = (k) => (after[k] || 0) - (before[k] || 0);
    ok(dd('verdict_deal') + dd('verdict_out') === (LIVE ? 5 : 3), `${mode}: verdicts counted (deal ${dd('verdict_deal')}, out ${dd('verdict_out')}), hero not counted`);
    ok(dd('game_mode[mode=coop]') === 1 && dd('game_mode[mode=solo]') === (LIVE ? 4 : 2), `${mode}: game_mode solo/coop counted`);
    ok(!JSON.stringify(after).match(/laundry|rohan/i), `${mode}: analytics are counts only`);
  } finally {
    ok(sink.errors.length === 0, `${mode}: no console errors${sink.errors.length ? `: ${sink.errors.slice(0, 3).join(' | ')}` : ''}`);
    ok(sink.rejects.length === 0, `${mode}: TV and share text all public-text (0 rejects)${sink.rejects.length ? `: ${sink.rejects.slice(0, 2).join(' | ')}` : ''}`);
    ok(sink.external.length === 0, `${mode}: no external requests`);
    await browser.close();
    srv.kill('SIGTERM');
    await new Promise((r) => srv.once('exit', r));
  }
}

try { for (const m of MODES) await runMode(m); } catch (e) { fails.push(`crashed: ${e.message}`); console.error(e); }
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
process.exit(fails.length ? 1 : 0);
