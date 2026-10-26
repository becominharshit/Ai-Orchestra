// AI ya Asli? duel tour (TASK-14): two phones (375x812) + the counter TV (1920x1080 and portrait capture),
// mock and offline, PUBLIC_TEXT_STRICT=1. Screenshots to docs/shots/TASK-14, results to e2e-duel-results.txt.
//   node test/asli/e2e-duel.mjs        (spawns its own servers on 8805 mock and 8806 offline)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-14');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const pass = (m) => { results.push(`PASS ${m}`); console.log(`PASS ${m}`); };
const fail = (m) => { results.push(`FAIL ${m}`); console.log(`FAIL ${m}`); };

async function startServer(port, env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asli-duel-data-'));
  const srv = spawn(process.execPath, ['core/server/index.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, PZ_QUIET: '1', PZ_NO_DOTENV: '1', ADMIN_KEY: 'e2e-key', PUBLIC_TEXT_STRICT: '1', ...env }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 15000); srv.stdout.on('data', (d) => { if (String(d).includes('play-zenith on')) { clearTimeout(t); res(); } }); });
  return { base: `http://127.0.0.1:${port}`, stop: () => srv.kill('SIGTERM') };
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' }).catch(() => chromium.launch());
const errors = [];
function watch(page, tag) {
  page.route('**/favicon.ico', (r) => r.fulfill({ status: 204, body: '' }));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
    if (m.type() === 'warning' && /rejected by TV-safety|not publicText|PUBLIC_TEXT/i.test(m.text())) errors.push(`${tag}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag}: HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
}
async function until(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() - t0 > timeout) throw new Error(`until: timeout ${timeout} ms (${fn.toString().slice(0, 90)})`);
    await wait(80);
  }
}
async function phone(base, query, tag) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  watch(p, tag);
  await p.goto(`${base}/asli/${query}`);
  await until(p, () => document.querySelectorAll('.ax-nickopt').length > 0, null, 8000);
  await p.click('.ax-nickopt');
  await until(p, () => !document.getElementById('duel-new').disabled, null, 8000);
  return p;
}
async function tv(base, query, viewport = { width: 1920, height: 1080 }) {
  const ctx = await browser.newContext({ viewport });
  const t = await ctx.newPage();
  watch(t, `tv${query}`);
  await t.goto(`${base}/tv/asli${query}`);
  await t.waitForFunction(() => window.__asliTv && window.__asliTv.board, null, { timeout: 8000 });
  return t;
}
/**
 * One phone plays its 10 rounds at a human pace. It follows the page's own round number, so a slow screenshot that
 * lets a round time out never puts the test out of step with the game.
 */
async function playRounds(p, { pace = () => 2600, pick = () => 'ai', onRound = null } = {}) {
  const done = new Set();
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 150000) throw new Error('playRounds: game did not finish');
    const st = await p.evaluate(() => ({ round: !document.getElementById('s-round').hidden, n: parseInt(document.getElementById('rn').textContent, 10), rv: !document.getElementById('reveal').hidden, after: !document.getElementById('s-wait').hidden || !document.getElementById('s-result').hidden }));
    if (st.after || (!st.round && done.size >= 10)) return;
    if (st.round && !st.rv && !done.has(st.n)) {
      done.add(st.n);
      const k = st.n - 1;
      const t = Date.now();
      if (onRound) await onRound(k); // screenshots right when the round shows, inside the human think time
      await wait(Math.max(200, pace(k) - (Date.now() - t)));
      await p.click(`.ax-pick[data-pick=${pick(k)}]`, { timeout: 1500 }).catch(() => {}); // timed out already: fine
      continue;
    }
    if (!st.round && done.size >= 10) return;
    await wait(80);
  }
}
async function closeToken(p) {
  const t = await p.waitForSelector('[data-pz=token]', { timeout: 6000 }).then(() => p.$eval('[data-pz=token]', (e) => e.textContent)).catch(() => null);
  if (t) await p.click('.pz-stage-sheet button').catch(() => {});
  return t;
}
async function unlock(p) {
  await p.waitForSelector('#s-result:not([hidden])', { timeout: 60000 });
  const leak = await p.evaluate(() => ({ score: document.getElementById('res-score').textContent, src: document.getElementById('card-img').getAttribute('src'), vis: document.getElementById('unlocked').offsetParent !== null }));
  await p.click('#unlock');
  await until(p, () => !!document.querySelector('[data-pz=gate-unlock]') || !document.getElementById('unlocked').hidden, null, 8000);
  if (await p.$('[data-pz=gate-unlock]')) await p.click('[data-pz=gate-unlock]');
  await p.waitForSelector('#unlocked:not([hidden])', { timeout: 10000 });
  await p.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0, null, { timeout: 10000 });
  return leak;
}
async function saveCard(p, name) {
  const b64 = await p.evaluate(async () => { const img = document.getElementById('card-img'); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return cv.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
  return p.evaluate(() => [document.getElementById('card-img').naturalWidth, document.getElementById('card-img').naturalHeight]);
}

async function duelRun(base, tag, { shots = true, portrait = false } = {}) {
  const shot = async (page, name) => { if (shots) await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  const T = await tv(base, '?c=7');
  const TP = portrait ? await tv(base, '?c=7&capture=1&layout=portrait', { width: 1080, height: 1920 }) : null;
  const A = await phone(base, '?c=7', `${tag}-A`);
  live.A = A;
  await shot(A, 'phone-A-1-intro');
  await A.click('#duel-new');
  await A.waitForSelector('#room-host:not([hidden])');
  const code = await A.evaluate(() => document.getElementById('room-code').textContent);
  // the host puts the duel on the counter TV through core's big-screen queue
  await A.click('#room-tv');
  await until(A, () => !document.getElementById('room-tv-note').hidden, null, 10000);
  await wait(400);
  await shot(A, 'phone-A-2-room-code');
  // the friend opens the QR link
  const B = await phone(base, `?c=7&room=${code}`, `${tag}-B`);
  live.B = B;
  await until(B, () => !document.getElementById('room-join').hidden, null, 8000);
  await shot(B, 'phone-B-1-join-prefilled');
  const t0 = Date.now();
  await B.click('#room-join button[type=submit]');
  await until(A, () => !document.getElementById('s-brief').hidden || !document.getElementById('s-round').hidden, null, 10000);
  await wait(900);
  await shot(A, 'phone-A-3-countdown');
  await shot(T, 'tv-1-duel-start');
  let tvShot = false;
  let strip = null;
  const onRoundA = async (k) => {
    if (k === 2 && !tvShot) {
      tvShot = true;
      // CHECK-14 F3: duel strip names at least 28 px and not cut, scores at least 40 px (TV 1920x1080)
      strip = await T.evaluate(() => [...document.querySelectorAll('.asli-duel-side')].map((s) => { const b = s.querySelector('b'); const sc = s.querySelector('.asli-duel-score'); return { name: b.textContent, namePx: parseFloat(getComputedStyle(b).fontSize), cut: b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > s.getBoundingClientRect().right, scorePx: parseFloat(getComputedStyle(sc).fontSize) }; }));
      await shot(A, 'phone-A-4-round-duelbar'); await shot(T, 'tv-2-duel-round'); if (TP) await TP.screenshot({ path: path.join(OUT, `${tag}-tv-portrait-1-round.png`) }); }
  };
  await Promise.all([
    playRounds(A, { pace: (k) => 2100 + (k % 3) * 400, pick: (k) => (k % 2 ? 'ai' : 'real'), onRound: onRoundA }),
    playRounds(B, { pace: (k) => 2600 + (k % 2) * 500, pick: () => 'ai' }),
  ]);
  // A usually finishes first: the wait screen
  if (await A.evaluate(() => !document.getElementById('s-wait').hidden)) await shot(A, 'phone-A-5-wait-friend');
  const [leakA, leakB] = await Promise.all([unlock(A), unlock(B)]);
  const duration = (Date.now() - t0) / 1000;
  const token = await closeToken(A);
  await wait(600);
  await shot(A, 'phone-A-6-result');
  await shot(B, 'phone-B-2-result');
  await A.evaluate(() => document.getElementById('card-img').scrollIntoView({ block: 'center' }));
  await wait(300);
  await shot(A, 'phone-A-7-share');
  const dimsA = await saveCard(A, `${tag}-share-card-A.png`);
  await saveCard(B, `${tag}-share-card-B.png`);
  await wait(1200);
  await shot(T, 'tv-3-duel-result');
  if (TP) await TP.screenshot({ path: path.join(OUT, `${tag}-tv-portrait-2-result.png`) });
  const rA = await A.evaluate(() => window.__asli.result);
  const rB = await B.evaluate(() => window.__asli.result);
  const titleA = await A.evaluate(() => window.__asli.result.share.title.text);
  const titleB = await B.evaluate(() => window.__asli.result.share.title.text);
  await wait(23000); // TV back to idle: leaderboard shows both
  await shot(T, 'tv-4-idle-board');
  const board = await T.evaluate(() => window.__asliTv.board);
  return { duration, rA, rB, titleA, titleB, leakA, leakB, dimsA, board, token, strip };
}

let mock = null; let off = null;
process.on('exit', () => { mock?.stop(); off?.stop(); }); // never leave servers on 8805/8806 behind
const live = {}; // phones of the current run, for crash diagnostics
try {
  mock = await startServer(8805, { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '300' });
  const d = await duelRun(mock.base, 'mock', { portrait: true });
  console.log(`  duel ${d.duration.toFixed(1)} s · A ${d.rA.right}/10 ${d.rA.outcome} · B ${d.rB.right}/10 ${d.rB.outcome} · "${d.titleA}" / "${d.titleB}"`);
  (d.duration >= 50 && d.duration <= 90) ? pass(`duel complete on two 375x812 phones in ${d.duration.toFixed(1)} s (target about 75 s)`) : fail(`duel took ${d.duration.toFixed(1)} s`);
  const outcomes = [d.rA.outcome, d.rB.outcome].sort().join('/');
  ['lost/won', 'tie/tie'].includes(outcomes) ? pass(`one winner per room (${outcomes})`) : fail(`outcomes ${outcomes}`);
  const winTitle = d.rA.outcome === 'won' ? d.titleA : d.titleB;
  const loserNick = d.rA.outcome === 'won' ? d.rB.nick : d.rA.nick;
  if (outcomes === 'lost/won') (winTitle === `Maine ${loserNick} ko AI ya Asli mein haraya`) ? pass(`winner card: "${winTitle}"`) : fail(`winner card "${winTitle}"`);
  (!d.leakA.score && !d.leakA.src && !d.leakA.vis && !d.leakB.score && !d.leakB.src) ? pass('result hidden on both phones before "Maine follow kar liya"') : fail(`gate leak ${JSON.stringify([d.leakA, d.leakB])}`);
  (d.dimsA[0] === 1080 && d.dimsA[1] === 1920) ? pass('winner share card 1080x1920') : fail(`share card ${d.dimsA}`);
  const labels = d.board.top.map((e) => e.label);
  (labels.includes(d.rA.nick) && labels.includes(d.rB.nick)) ? pass('both duel players on the TV leaderboard (score + time, generated nicknames)') : fail(`board ${labels}`);
  d.token ? pass(`host's big-screen turn ended with reward token ${d.token}`) : fail('no reward token for the host');
  const okStrip = d.strip?.length === 2 && d.strip.every((x) => x.namePx >= 28 && !x.cut && x.scorePx >= 40);
  okStrip ? pass(`duel strip on the TV: names ${d.strip.map((x) => `${x.name} ${x.namePx}px`).join(', ')} not cut, scores ${d.strip[0].scorePx}px`) : fail(`duel strip ${JSON.stringify(d.strip)}`);

  off = await startServer(8806, { DEMO_MODE: '1', OFFLINE: '1' });
  const o = await duelRun(off.base, 'offline', { shots: false });
  pass(`offline duel complete in ${o.duration.toFixed(1)} s (${o.rA.outcome}/${o.rB.outcome})`);
  errors.length ? fail(`console errors / strict rejections:\n  ${errors.join('\n  ')}`) : pass('no console errors and no public-text rejections (PUBLIC_TEXT_STRICT=1), phones + TV');
} catch (e) {
  fail(`crashed: ${e.stack || e.message}`);
  for (const [k, p] of Object.entries(live)) {
    await p.screenshot({ path: path.join(OUT, `crash-${k}.png`) }).catch(() => {});
    console.log(k, await p.evaluate(() => [document.querySelector('.ax-screen:not([hidden])')?.id, document.getElementById('rn').textContent, document.querySelector('.pz-overlay')?.innerText || '', JSON.stringify(window.__asli?.duel)]).catch(() => ''));
  }
  console.log(errors.join('\n'));
} finally {
  await browser.close();
  mock?.stop();
  off?.stop();
}
fs.writeFileSync(path.join(OUT, 'e2e-duel-results.txt'), results.join('\n') + '\n');
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
