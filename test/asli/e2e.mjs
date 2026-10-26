// AI ya Asli? end-to-end tour: phone 375x812 + TV 1920x1080, mock and offline, hero run, portrait capture.
//   node test/asli/e2e.mjs            spawns its own servers on PORT 8805 (mock) and 8806 (offline), screenshots to docs/shots/TASK-06
//   ASLI_BASE=http://127.0.0.1:8805 node test/asli/e2e.mjs --quick     use a running server, mock pass only
// Checks: full 10-round game, duration, no console errors, nothing gated before "Maine follow kar liya",
// share card 1080x1920, TV leaderboard update latency, voice rounds (with stand-in "real" clips in a temp content dir).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-06');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const quick = process.argv.includes('--quick');
const results = [];
const fail = (m) => { results.push(`FAIL ${m}`); console.log(`FAIL ${m}`); };
const pass = (m) => { results.push(`PASS ${m}`); console.log(`PASS ${m}`); };

// Voice test content: the real manifest + 4 stand-in "real" clips (a different say voice through a noisy path).
// TEST ONLY, in a temp dir, never committed: the real ones come from students.
function voiceContent() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asli-content-'));
  const src = path.join(ROOT, 'experiences', 'asli', 'content');
  fs.cpSync(src, dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}inbox`) });
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const lines = [['E1', 'Hi! I just built my first chatbot, and it actually works.'], ['E3', "My favourite subject is maths. Don't tell anyone."], ['E4', 'The canteen chai today was really good.'], ['E6', 'Our robot team meets every Friday after class.']];
  // Stand-in clips are copies of shipped AI clips (no speech synthesis needed, so a stalled macOS speech service
  // cannot hang the tour). They only exercise the voice-round UI; they are never shipped.
  lines.forEach(([line, text], k) => {
    const id = `a${String(90 + k).padStart(3, '0')}`;
    fs.copyFileSync(path.join(dir, 'media', `a00${k + 1}.m4a`), path.join(dir, 'media', `${id}.m4a`));
    m.items.push({ id, type: 'audio', lang: 'en', style: 'voice', answer: 'real', approved: true, consent: true, group: `voice-${line}`, src: `${id}.m4a`, transcript: text, reveal_line: 'Asli! (test stand-in clip)', credit: 'Test stand-in (not shipped)' });
  });
  // keep answers balanced with the extra real clips
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  return dir;
}

async function startServer(port, env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asli-data-'));
  const srv = spawn(process.execPath, ['core/server/index.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, PZ_QUIET: '1', PZ_NO_DOTENV: '1', ADMIN_KEY: 'e2e-key', PUBLIC_TEXT_STRICT: '1', ...env }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 15000); srv.stdout.on('data', (d) => { if (String(d).includes('play-zenith on')) { clearTimeout(t); res(); } }); });
  return { base: `http://127.0.0.1:${port}`, stop: () => srv.kill('SIGTERM'), pid: srv.pid };
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' }).catch(() => chromium.launch());
const errors = [];
// core has no /favicon.ico yet (Request for core in DONE-06); the browser asks for it and logs a 404 we do not own
const watch = (page, tag) => {
  page.route('**/favicon.ico', (r) => r.fulfill({ status: 204, body: '' }));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
    // PUBLIC_TEXT_STRICT: any TV event or share line the server would not accept is a failure here
    if (m.type() === 'warning' && /rejected by TV-safety|not publicText|PUBLIC_TEXT/i.test(m.text())) errors.push(`${tag}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
};

async function phone(base, query = '?c=7') {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  watch(p, `phone${query}`);
  await p.goto(`${base}/asli/${query}`);
  await pickNick(p);
  return p;
}
async function tv(base, query = '?c=7', viewport = { width: 1920, height: 1080 }) {
  const ctx = await browser.newContext({ viewport });
  const t = await ctx.newPage();
  watch(t, `tv${query}`);
  await t.goto(`${base}/tv/asli${query}`);
  await t.waitForFunction(() => window.__asliTv && window.__asliTv.board, null, { timeout: 8000 });
  return t;
}

/** Play one full game. opts.shots = prefix for screenshots; opts.pace = ms before tapping. Returns stats. */
/** Pick the first generated nickname (hero mode picks by itself). */
async function pickNick(p) {
  await until(p, () => document.querySelectorAll('.ax-nickopt').length > 0, null, 8000);
  if (await p.evaluate(() => document.getElementById('start').disabled)) await p.click('.ax-nickopt');
  await until(p, () => !document.getElementById('start').disabled, null, 8000);
}

let current = null;
// Poll with evaluate (waitForFunction's rAF/interval polling stalled in some runs while a second page was busy).
async function until(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() - t0 > timeout) throw new Error(`until: timeout after ${timeout} ms (${fn.toString().slice(0, 80)})`);
    await wait(80);
  }
}
async function playGame(p, t, { shots = null, tapNext = true, bigScreen = false, pace = () => 2800, pickFn = (k) => (k % 3 === 0 ? 'real' : 'ai') } = {}) {
  const shot = async (page, name) => { if (shots) { const t1 = Date.now(); await page.screenshot({ path: path.join(OUT, `${shots}-${name}.png`) }); console.log('  shot', `${shots}-${name}`, Date.now() - t1, 'ms'); } };
  current = p;
  const t0 = Date.now();
  // the TV only shows big-screen turns (core queue); other games stay on the phone
  await p.click(bigScreen && await p.isVisible('#bigscreen') ? '#bigscreen' : '#start');
  await wait(900);
  await shot(p, 'phone-2-orchestra');
  if (t) await shot(t, 'tv-2-orchestra');
  if (t) await t.evaluate(() => { const before = window.__asliTv.board?.players || 0; window.__boardAt = 0; const iv = setInterval(() => { if ((window.__asliTv.board?.players || 0) > before) { window.__boardAt = Date.now(); clearInterval(iv); } }, 10); });
  let finishAt = 0;
  // a big-screen run posts to the leaderboard when the phone ends its turn (/turn-done), a normal run at /finish
  const finP = p.waitForResponse((r) => r.url().endsWith('/api/asli/finish'), { timeout: 120000 }).then((r) => { if (!bigScreen) finishAt = Date.now(); return r; });
  if (bigScreen) p.waitForResponse((r) => r.url().endsWith('/api/asli/turn-done'), { timeout: 120000 }).then(() => { finishAt = Date.now(); }).catch(() => {});
  const types = [];
  for (let k = 0; k < 10; k++) {
    await until(p, (n) => !document.getElementById('s-round').hidden && document.getElementById('rn').textContent === `${n}/10` && document.getElementById('reveal').hidden && /\bt-\w+/.test(document.getElementById('card').className), k + 1, 20000);
    types.push(await p.evaluate(() => document.getElementById('card').className.match(/t-(\w+)/)[1]));
    await wait(pace(k));
    if (k === 0 || (types[k] === 'audio' && !types.slice(0, k).includes('audio')) || (types[k] === 'code' && !types.slice(0, k).includes('code'))) {
      await shot(p, `phone-3-round-${types[k]}`);
      if (t) await shot(t, `tv-3-round-${types[k]}`);
    }
    await p.click(`.ax-pick[data-pick=${pickFn(k)}]`);
    await until(p, () => !document.getElementById('reveal').hidden, null, 12000);
    if (k === 0 || k === 4) { await wait(500); await shot(p, `phone-4-reveal-${k + 1}`); if (t) await shot(t, `tv-4-reveal-${k + 1}`); }
    await wait(800); if (tapNext && await p.isVisible('#next')) await p.click('#next', { timeout: 400 }).catch(() => {});
  }
  // finish -> TV leaderboard latency
  const finishRes = await finP;
  const finishedAt = finishAt;
  await p.waitForSelector('#s-result:not([hidden])', { timeout: 15000 });
  const duration = (Date.now() - t0) / 1000;
  let lagMs = null;
  if (t) {
    await t.waitForFunction(() => window.__boardAt > 0, null, { timeout: bigScreen ? 12000 : 3000 }).catch(() => {});
    const at = await t.evaluate(() => window.__boardAt);
    lagMs = at && finishAt ? Math.max(0, at - finishAt) : null;
  }
  await wait(600);
  await shot(p, 'phone-5-locked');
  if (t) { await wait(1500); await shot(t, 'tv-5-result-spotlight'); }
  // gate: nothing gated is reachable before "Maine follow kar liya"
  const leak = await p.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
    return { unlocked: vis('unlocked'), friends: vis('friends'), story: vis('story'), cardImg: vis('card-img'), score: document.getElementById('res-score').textContent, src: document.getElementById('card-img').getAttribute('src') };
  });
  await p.click('#unlock');
  // the gate remembers an unlock for this session, so a second game on the same phone skips it
  await until(p, () => !!document.querySelector('[data-pz=gate-unlock]') || !document.getElementById('unlocked').hidden, null, 8000);
  let leak2 = '';
  if (await p.$('[data-pz=gate-unlock]')) {
    await wait(400);
    await shot(p, 'phone-6-gate');
    leak2 = await p.evaluate(() => document.getElementById('res-score').textContent);
    await p.click('[data-pz=gate-unlock]');
  }
  await p.waitForSelector('#unlocked:not([hidden])', { timeout: 10000 });
  await p.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0, null, { timeout: 10000 });
  // big-screen players get core's reward token sheet ("Counter pe dikhao")
  let token = null;
  if (bigScreen) {
    await p.waitForSelector('[data-pz=token]', { timeout: 8000 }).catch(() => {});
    token = await p.$eval('[data-pz=token]', (e) => e.textContent).catch(() => null);
    if (token) { await wait(300); await shot(p, 'phone-9-reward-token'); await p.click('.pz-stage-sheet button').catch(() => {}); }
  }
  await wait(500);
  await shot(p, 'phone-7-result');
  await p.evaluate(() => document.getElementById('card-img').scrollIntoView({ block: 'center' }));
  await wait(300);
  await shot(p, 'phone-8-share');
  const dims = await p.evaluate(() => { const i = document.getElementById('card-img'); return [i.naturalWidth, i.naturalHeight]; });
  if (shots) {
    const b64 = await p.evaluate(async () => { const img = document.getElementById('card-img'); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return cv.toDataURL('image/png').split(',')[1]; });
    fs.writeFileSync(path.join(OUT, `${shots}-share-card.png`), Buffer.from(b64, 'base64'));
  }
  if (t) { await wait(200); await shot(t, 'tv-6-leaderboard'); }
  return { duration, lagMs, types, leak, leak2, dims, token, finish: await finishRes.json() };
}

/**
 * Mid-game failures: /answer loses the network twice (kit shows "Network thoda slow hai", tap retries, game goes on),
 * /finish answers 500 twice ("Oops" retry screen), and a lost game (404) shows "Game reset ho gaya" then the intro.
 * Network errors are injected on purpose here, so this page is not part of the console-error check; page exceptions are.
 */
async function failureRun(base) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const exceptions = [];
  p.on('pageerror', (e) => exceptions.push(e.message));
  await p.route('**/favicon.ico', (r) => r.fulfill({ status: 204, body: '' }));
  await p.goto(`${base}/asli/?c=7`);
  await pickNick(p);
  await p.click('#start');
  const roundReady = (n) => until(p, (k) => !document.getElementById('s-round').hidden && document.getElementById('rn').textContent === `${k}/10` && document.getElementById('reveal').hidden, n, 20000);
  const answer = async () => { await wait(900); await p.click('.ax-pick[data-pick=ai]'); };
  const retryBtn = () => until(p, () => !!document.querySelector('[data-pz=retry] button'), null, 10000);
  for (let n = 1; n <= 10; n++) {
    await roundReady(n);
    if (n === 3) {
      await p.route('**/api/asli/answer', (r) => r.abort('internetdisconnected'));
      await answer();
      await retryBtn();
      await wait(300);
      await p.screenshot({ path: path.join(OUT, 'fail-1-answer-network.png') });
      const t = await p.evaluate(() => document.querySelector('[data-pz=retry] h2').textContent);
      t.includes('Network') ? pass(`/answer network loss mid-game: friendly screen "${t}"`) : fail(`answer failure screen: ${t}`);
      await p.unroute('**/api/asli/answer');
      await p.click('[data-pz=retry] button');
    } else await answer();
    await until(p, () => !document.getElementById('reveal').hidden, null, 12000);
    if (n === 3) pass('round 3 revealed after "Dobara try karo", game continues');
    if (n === 10) await p.route('**/api/asli/finish', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"oops"}' }));
  }
  await retryBtn();
  await wait(300);
  await p.screenshot({ path: path.join(OUT, 'fail-2-finish-500.png') });
  const t2 = await p.evaluate(() => document.querySelector('[data-pz=retry] h2').textContent);
  await p.unroute('**/api/asli/finish');
  await p.click('[data-pz=retry] button');
  await p.waitForSelector('#s-result:not([hidden])', { timeout: 15000 });
  pass(`/finish 500 twice: friendly screen "${t2}", then the result after the retry`);

  // a lost game (server restarted): 404 on /answer -> "Game reset ho gaya" -> intro
  await p.click('#again');
  await p.waitForSelector('#s-intro:not([hidden])');
  await p.click('#start');
  await roundReady(1);
  await p.route('**/api/asli/answer', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no_game","message":"Yeh game purana ho gaya."}' }));
  await answer();
  await retryBtn();
  await wait(300);
  await p.screenshot({ path: path.join(OUT, 'fail-3-game-lost.png') });
  const t3 = await p.evaluate(() => document.querySelector('[data-pz=retry] h2').textContent);
  await p.unroute('**/api/asli/answer');
  await p.click('[data-pz=retry] button');
  await p.waitForSelector('#s-intro:not([hidden])', { timeout: 8000 });
  t3.includes('reset') ? pass(`lost game (404): "${t3}", back to the intro`) : fail(`lost game screen: ${t3}`);
  exceptions.length ? fail(`page exceptions in failure run: ${exceptions.join('; ')}`) : pass('failure run: no page exceptions');
  await ctx.close();
}

/**
 * Idle TV layout check (lead, staging smoke test): in every idle stage-loop panel, no visible block may overlap another
 * (QR block, "Scan karo, khelo", the panel content, our leaderboard, header and footer). Returns a list of problems.
 */
async function idleOverlaps(base, query, viewport, tag) {
  const ctx = await browser.newContext({ viewport });
  const t = await ctx.newPage();
  watch(t, `idle${query}`);
  await t.goto(`${base}/tv/asli${query}`);
  await t.waitForFunction(() => window.__stage && window.__asliTv, null, { timeout: 8000 });
  await wait(1500);
  const panels = await t.evaluate(() => window.__stage.panels);
  const problems = [];
  let rowsSeen = 0;
  for (let k = 0; k < panels.length; k++) {
    await t.evaluate(() => window.__stage.rotate());
    await wait(900);
    const r = await t.evaluate(() => {
      const vis = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; o *= Number(cs.opacity); } return o > 0.2; };
      const sel = ['.tv-top', '.tv-foot', '.tv-handle', '.tv-idle-title', '.tv-qr-wrap', '.tv-scan', '.tv-panel.on:not(:has(.tv-qr-wrap)) .tv-panel-in', '.asli-board'];
      const boxes = [];
      for (const s of sel) for (const el of document.querySelectorAll(s)) { const b = el.getBoundingClientRect(); if (b.width > 2 && b.height > 2 && vis(el)) boxes.push({ s, el, b: [b.left, b.top, b.right, b.bottom] }); }
      const out = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue; // the handle sits inside the footer
        const [a, b] = [boxes[i].b, boxes[j].b];
        const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
        const iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
        if (ix > 2 && iy > 2) out.push(`${boxes[i].s} x ${boxes[j].s} (${Math.round(ix)}x${Math.round(iy)} px)`);
      }
      // full board (CHECK-14 F2): every visible row inside the leaderboard panel and clear of the handle
      const board = document.querySelector('.asli-board')?.getBoundingClientRect();
      const handle = [...document.querySelectorAll('.tv-handle')].find(vis)?.getBoundingClientRect();
      const rows = [...document.querySelectorAll('.asli-row')].filter(vis);
      for (const [k, row] of rows.entries()) {
        const b = row.getBoundingClientRect();
        if (board && (b.bottom > board.bottom - 2 || b.top < board.top)) out.push(`row ${k + 1} outside the leaderboard panel`);
        if (handle && b.bottom > handle.top && b.top < handle.bottom && b.right > handle.left && b.left < handle.right) out.push(`row ${k + 1} on the handle`);
      }
      // the footnote sits inside the panel (CHECK-14b F2b)
      const foot = document.querySelector('.asli-board-foot');
      if (board && foot && vis(foot)) { const f = foot.getBoundingClientRect(); if (f.bottom > board.bottom - 1 || f.top < board.top) out.push(`board footnote outside the panel (${(f.bottom - board.bottom).toFixed(1)} px)`); }
      return { panel: document.getElementById('tv')?.dataset.panel || document.querySelector('.tv-frame')?.dataset.panel, out, rows: rows.length };
    });
    if (k < 6) await t.screenshot({ path: path.join(OUT, `idle-${tag}-${k}-${r.panel}.png`) });
    for (const o of r.out) problems.push(`${tag} panel ${r.panel}: ${o}`);
    rowsSeen = r.rows;
  }
  await ctx.close();
  return { problems, panels, rows: rowsSeen };
}

/** Fill the live board with n finished games over HTTP (generated nicknames, mixed scores). */
async function seedBoard(base, n) {
  for (let k = 0; k < n; k++) {
    const who = `asli-e2e-seed-${String(k).padStart(4, '0')}`;
    const req = async (p, body) => (await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: `pz_sid=${who}` }, body: body === undefined ? undefined : JSON.stringify(body) })).json();
    const o = await req('/api/asli/nicknames');
    await req('/api/asli/nickname', { id: o.options[0].id });
    const st = await req('/api/asli/start', {});
    for (let i = 0; i < 10; i++) { await req('/api/asli/round', { game: st.game, i }); await req('/api/asli/answer', { game: st.game, i, pick: (i + k) % 3 ? 'ai' : 'real' }); }
    await req('/api/asli/finish', { game: st.game });
  }
}

let mock = null;
let off = null;
process.on('exit', () => { mock?.stop(); off?.stop(); }); // never leave servers on 8805/8806 behind
const contentDir = quick ? null : voiceContent();
try {
  mock = process.env.ASLI_BASE ? { base: process.env.ASLI_BASE, stop: () => {} } : await startServer(8805, { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '300', ...(contentDir ? { ASLI_CONTENT_DIR: contentDir } : {}) });
  console.log('mock server', mock.base);
  // a busy day: 10 players on the live board before the idle layout checks
  await seedBoard(mock.base, 10);
  for (const [q, vp, tag] of [['?c=7', { width: 1920, height: 1080 }, 'landscape'], ['?c=7&capture=1', { width: 1920, height: 1080 }, 'capture'], ['?c=7&layout=portrait', { width: 1080, height: 1920 }, 'portrait'], ['?c=7&layout=portrait&capture=1', { width: 1080, height: 1920 }, 'portrait-capture']]) {
    const o = await idleOverlaps(mock.base, q, vp, tag);
    o.problems.length ? fail(`idle TV overlap (${tag}):\n  ${o.problems.join('\n  ')}`) : pass(`idle TV ${tag}: no overlaps in ${o.panels.length} stage-loop panels (${o.panels.join(', ')}), full board shows ${o.rows} rows inside the panel`);
  }
  const T = await tv(mock.base);
  await wait(2500);
  await T.screenshot({ path: path.join(OUT, 'mock-tv-1-idle.png') });
  const P = await phone(mock.base);
  await P.screenshot({ path: path.join(OUT, 'mock-phone-1-intro.png') });
  const g = await playGame(P, T, { shots: 'mock', tapNext: false, bigScreen: true, pace: (k) => 2200 + ((k * 7) % 5) * 300 });
  g.token ? pass(`big-screen turn: reward token ${g.token} shown after the result`) : fail('no reward token after the big-screen turn');
  console.log(`  game: ${g.duration.toFixed(1)} s, types ${g.types.join(',')}, ${g.finish.right}/10, rank ${g.finish.rank}, TV board lag ${g.lagMs} ms`);
  (g.duration >= 45 && g.duration <= 80) ? pass(`full game in ${g.duration.toFixed(1)} s (target about 60-75 s)`) : fail(`game took ${g.duration.toFixed(1)} s`);
  (g.lagMs !== null && g.lagMs < 1000) ? pass(`TV leaderboard updated ${g.lagMs} ms after finish`) : fail(`TV leaderboard lag ${g.lagMs}`);
  (!g.leak.unlocked && !g.leak.friends && !g.leak.story && !g.leak.cardImg && !g.leak.score && !g.leak.src && !g.leak2) ? pass('nothing gated visible or in the DOM before "Maine follow kar liya"') : fail(`gate leak ${JSON.stringify(g.leak)} ${g.leak2}`);
  (g.dims[0] === 1080 && g.dims[1] === 1920) ? pass('share card 1080x1920') : fail(`share card ${g.dims}`);
  if (!quick) g.types.includes('audio') ? pass(`voice rounds played (${g.types.filter((x) => x === 'audio').length})`) : fail('no voice round in the game with voice content');

  // second game quickly, then a third: board grows, phone reuse
  if (!quick) {
    await P.click('#again');
    await P.waitForSelector('#s-intro:not([hidden])');
    const g2 = await playGame(P, T, { pace: () => 900, pickFn: () => 'real' });
    pass(`second game on the same phone, ${g2.finish.right}/10 in ${g2.duration.toFixed(1)} s`);
    await T.screenshot({ path: path.join(OUT, 'mock-tv-7-leaderboard-2-players.png') });

    // hero run for filming: TV in capture + demo board, landscape and portrait
    const TH = await tv(mock.base, '?c=7&capture=1&board=demo');
    const TP = await tv(mock.base, '?c=7&capture=1&layout=portrait&board=demo', { width: 1080, height: 1920 });
    await wait(1200);
    await TP.screenshot({ path: path.join(OUT, 'hero-tv-portrait-0-idle.png') });
    const H = await phone(mock.base, '?c=7&demo=hero');
    await H.waitForSelector('#s-round:not([hidden])', { timeout: 15000 });
    await wait(1200);
    await TH.screenshot({ path: path.join(OUT, 'hero-tv-capture-1-round.png') });
    await TP.screenshot({ path: path.join(OUT, 'hero-tv-portrait-1-round.png') });
    await H.screenshot({ path: path.join(OUT, 'hero-phone-1-round.png') });
    await H.waitForSelector('#unlocked:not([hidden])', { timeout: 90000 });
    const hr = await H.evaluate(() => window.__asli.result);
    await wait(1500);
    await TH.screenshot({ path: path.join(OUT, 'hero-tv-capture-2-result.png') });
    await TP.screenshot({ path: path.join(OUT, 'hero-tv-portrait-2-result.png') });
    await H.screenshot({ path: path.join(OUT, 'hero-phone-2-result.png') });
    hr.right === 8 && hr.board === 'demo' ? pass(`?demo=hero ran by itself: ${hr.right}/10 on the demo board`) : fail(`hero result ${JSON.stringify(hr)}`);
    await wait(23000);
    await TH.screenshot({ path: path.join(OUT, 'hero-tv-capture-3-idle-board.png') });
  }

  if (!quick) await failureRun(mock.base);

  // offline pass: fixtures only, no network
  if (!quick) {
    off = await startServer(8806, { DEMO_MODE: '1', OFFLINE: '1' });
    const T2 = await tv(off.base, '?c=7');
    const P2 = await phone(off.base);
    const g3 = await playGame(P2, T2, { pace: () => 1200 });
    pass(`offline mode game complete: ${g3.finish.right}/10 in ${g3.duration.toFixed(1)} s, TV lag ${g3.lagMs} ms`);
  }
  errors.length ? fail(`console errors:\n  ${errors.join('\n  ')}`) : pass('no console errors (phone + TV, all runs)');
} catch (e) {
  fail(`crashed: ${e.stack || e.message}`);
  if (current) { await current.screenshot({ path: path.join(OUT, 'crash-phone.png') }).catch(() => {}); console.log(await current.evaluate(() => [document.getElementById('rn').textContent, document.getElementById('s-round').hidden, document.getElementById('reveal').hidden, document.body.innerText.slice(0, 300)]).catch(() => '')); }
  console.log(errors.join('\n'));
} finally {
  await browser.close();
  mock?.stop();
  off?.stop();
  if (contentDir) fs.rmSync(contentDir, { recursive: true, force: true });
}
fs.writeFileSync(path.join(OUT, 'e2e-results.txt'), results.join('\n') + '\n');
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
