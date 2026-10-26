// AI Jyotish end-to-end flow with Playwright: phone 375x812 + counter TV 1920x1080 (+ portrait capture),
// mock and offline modes. Asserts the acceptance criteria that need a browser and saves screenshots.
//   node test/jyotish/e2e.mjs            assertions only
//   node test/jyotish/e2e.mjs --shots    also write docs/shots/TASK-02/*.png
// Starts its own servers on random ports (mock, then offline). Exit code 1 on any failure.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMatcher } from '../../experiences/jyotish/lib/public.js';
import { dostBanks, DOST_TEMPLATES } from '../../experiences/jyotish/lib/dost.js';

// every string the TV can show must be registered public text (CONTRACT 13.2), same extraction as core's bus
const isPublic = makeMatcher(dostBanks(), DOST_TEMPLATES);
const CORE_OK = new Set(['', 'For fun only', 'Agent Orchestra', 'Orchestrator']);
function tvStrings(ev) {
  const out = [];
  const deep = (v, k) => { if (k === 'qr' || k === 'url' || k === 'image') return; if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => deep(x)); else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) deep(x, kk); };
  if (ev.t === 'init') { deep(ev.title); for (const a of [ev.orchestrator, ...(ev.agents || [])]) { deep(a?.name); deep(a?.role); deep(a?.label); } }
  for (const k of ['task', 'text', 'label', 'summary']) deep(ev[k]);
  if (ev.t === 'result') deep(ev.payload);
  if (ev.t === 'custom') { deep(ev.name); deep(ev.data); }
  return out;
}

// overlap between orchestra node text (names, chips) and the Mission Log panel, in px (0 = clear)
const LOG_OVERLAP = () => {
  const log = document.querySelector('.orx-log')?.getBoundingClientRect();
  if (!log || !log.height) return 0;
  let worst = 0;
  for (const n of document.querySelectorAll('.orx-node .orx-name, .orx-node .orx-chip, .orx-node .orx-orb')) {
    const r = n.getBoundingClientRect();
    if (!r.width || getComputedStyle(n).visibility === 'hidden') continue;
    const ox = Math.min(r.right, log.right) - Math.max(r.left, log.left);
    const oy = Math.min(r.bottom, log.bottom) - Math.max(r.top, log.top);
    if (ox > 0 && oy > 0) worst = Math.max(worst, oy);
  }
  return Math.round(worst);
};
function unregistered(rawMessages) {
  const bad = new Set();
  for (const raw of rawMessages) {
    let m; try { m = JSON.parse(raw); } catch { continue; }
    const evs = m.type === 'events' ? m.events : m.type === 'hello' ? [...(m.active || []), ...(m.last || [])] : [];
    for (const ev of evs) for (const t of tvStrings(ev)) if (!CORE_OK.has(t) && !/^-?\d+(\.\d+)?%?$/.test(t) && !isPublic(t)) bad.add(t);
  }
  return [...bad];
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'TASK-02');
const SHOTS = process.argv.includes('--shots');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails.push(msg); };
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

async function startServer(env) {
  const dataDir = path.join(ROOT, 'tmp', `jy-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const srv = spawn(process.execPath, ['core/server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir, PZ_NO_DOTENV: '1', ANTHROPIC_API_KEY: '', PUBLIC_TEXT_STRICT: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  srv.stdout.on('data', (d) => { logs += d; });
  srv.stderr.on('data', (d) => { logs += d; });
  const port = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start')), 45000);
    const on = () => { const m = logs.match(/play-zenith on http:\/\/localhost:(\d+)/); if (m) { clearTimeout(t); srv.stdout.off('data', on); res(Number(m[1])); } };
    srv.stdout.on('data', on);
  });
  return { base: `http://127.0.0.1:${port}`, dataDir, logs: () => logs, stop: () => new Promise((r) => { if (srv.exitCode !== null) return r(); const k = setTimeout(() => srv.kill('SIGKILL'), 4000); srv.once('exit', () => { clearTimeout(k); r(); }); srv.kill('SIGTERM'); }) };
}

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`);
    else if (m.type() === 'warning') { console.log(`  [${tag} warn] ${m.text()}`); if (/rejected by TV-safety|not a \{ ?pt/.test(m.text())) errors.push(`${tag}: ${m.text()}`); }
  });
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
};
const shot = async (page, name, opts = {}) => { if (SHOTS) { await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts }); console.log('  shot', name); } };
const phoneCtx = () => browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

// A palm "photo": the illustrated palm rendered to a JPEG, so the real upload + downscale path runs.
async function palmJpeg() {
  const p = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const svg = fs.readFileSync(path.join(ROOT, 'experiences/jyotish/web/assets/hero-palm.svg'), 'utf8');
  await p.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg style="width:900px;height:1200px" ')}</body>`);
  const buf = await p.screenshot({ type: 'jpeg', quality: 88 });
  await p.close();
  return buf;
}
const PALM = await palmJpeg();

async function fillForm(page, { name = 'Riya', dob = '2007-07-30', place = 'Gurugram', time = '07:15' } = {}) {
  await page.fill('input[name=name]', name);
  await page.fill('input[name=dob]', dob);
  await page.fill('input[name=place]', place);
  await page.fill('input[name=time]', time);
}

async function mockRun() {
  const S = await startServer({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1800' });
  try {
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    watch(tv, 'tv');
    const tvEvents = [];
    await tv.exposeFunction('__jyEv', (s) => tvEvents.push(s));
    await tv.addInitScript(() => {
      const ES = window.EventSource;
      window.EventSource = class extends ES { constructor(...a) { super(...a); this.addEventListener('message', (m) => window.__jyEv?.(m.data)); } };
    });
    await tv.goto(`${S.base}/tv/jyotish?c=1`);
    await wait(1500);
    await shot(tv, 'tv-1-idle');

    const ctx = await phoneCtx();
    const phone = await ctx.newPage();
    watch(phone, 'phone');
    const igCalls = [];
    phone.on('request', (r) => { if (/instagram\.com|graph\.facebook|cdninstagram/.test(r.url())) igCalls.push(r.url()); });
    await phone.goto(`${S.base}/jyotish?c=1`);
    await wait(600);
    await fillForm(phone);
    await shot(phone, 'phone-1-form');
    await phone.click('#form button[type=submit]');
    await phone.waitForSelector('#s-palm:not([hidden])');
    await wait(400);
    await shot(phone, 'phone-2-palm-step');
    await phone.setInputFiles('#palm-input', { name: 'palm.jpg', mimeType: 'image/jpeg', buffer: PALM });
    await phone.waitForSelector('#go:not([hidden])');
    await wait(400);
    await shot(phone, 'phone-3-palm-preview');

    const sentBodies = [];
    phone.on('request', (r) => { if (r.url().includes('/api/jyotish/')) sentBodies.push(r.postData() || ''); });
    const t0 = Date.now();
    await phone.click('#go');
    await wait(1700);
    await shot(phone, 'phone-4-orchestra-scan');
    await shot(tv, 'tv-2-orchestra-palm-scan');
    const dsz = await tv.evaluate(() => ['.jt-dock-s', '.jt-dock .jp-status', '.jt-row b', '.jt-row-v'].map((q) => parseFloat(getComputedStyle(document.querySelector(q)).fontSize)));
    ok(dsz[0] >= 24 && dsz[1] >= 24 && dsz[2] >= 22 && dsz[3] >= 22, `TV dock: SCANNING ${dsz[0]} px, scan label ${dsz[1]} px, rows ${dsz[2]}/${dsz[3]} px`);
    await tv.waitForSelector('.jt-dock .jp-line', { timeout: 20000, state: 'attached' });
    await wait(1400);
    await shot(tv, 'tv-3-palm-lines-drawing');
    await wait(1600);
    await shot(tv, 'tv-4-palm-traced');
    await phone.waitForSelector('#s-result:not([hidden])', { timeout: 60000 });
    const flowS = (Date.now() - t0) / 1000;
    ok(flowS < 60, `phone flow from "Reading shuru karo" to result in ${flowS.toFixed(1)}s (target < 90s total)`);
    await wait(600);
    await shot(phone, 'phone-5-result-top');
    await shot(phone, 'phone-5b-result-full', { fullPage: true });

    // privacy: what the phone sent never contains the name or the DOB
    const sent = sentBodies.join('\n');
    ok(!/Riya/.test(sent) && !/2007-07-30/.test(sent) && !/Gurugram/.test(sent), 'requests to /api/jyotish never contain the name, the DOB or the birth place');

    // follow gate: future lines and the share card are not reachable before "Maine follow kar liya"
    const pre = await phone.evaluate(() => ({
      futureText: document.getElementById('r-future').innerText.trim(),
      locked: document.querySelectorAll('#r-future li.locked').length,
      shareHidden: document.getElementById('share-box').hidden,
      shareVisible: !!document.getElementById('share-box').offsetParent,
      friendsVisible: !!document.getElementById('friends').offsetParent,
      cardSrc: document.getElementById('card-img').getAttribute('src') || '',
      forFun: [...document.querySelectorAll('#s-result .pz-forfun')].some((e) => e.offsetParent && /for fun only/i.test(e.textContent)),
    }));
    ok(pre.futureText === '' && pre.locked === 3, 'future: 3 locked placeholders, no future text in the page before unlock');
    ok(pre.shareHidden && !pre.shareVisible && !pre.friendsVisible && !pre.cardSrc, 'share card + "Doston ko bhejo" not visible and no card generated before unlock');
    ok(pre.forFun, '"For fun only" label visible on the result screen');

    // TV spotlight typing the reading
    await tv.waitForSelector('.jt-spot', { timeout: 15000 });
    await wait(2500);
    await shot(tv, 'tv-5-reading-typing');
    await wait(9000);
    await shot(tv, 'tv-6-reading-typed');
    const tvText = await tv.evaluate(() => document.body.innerText);
    ok(!/Riya|Gurugram|2007|30\/07|07:15/.test(tvText), 'TV never shows name, DOB, birth place or time');
    ok(!/month\s*\d|day\s*\d|year\s*\d/i.test(tvText) && !tvEvents.some((e) => /month \d|day \d|year \d/.test(e)), 'TV and bus never show the DOB digit maths (Ank log)');
    const sizes = await tv.evaluate(() => {
      const px = (sel) => [...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { chip: px('.jt-spot .jp-chip-k'), num: px('.jt-num small'), badge: px('.jt-badge'), foot: px('.jt-demo') };
    });
    const hintPx = await tv.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.jt-hint')).fontSize));
    ok(hintPx >= 22, `TV future hint ${hintPx} px (>= 22)`);
    ok(Math.min(...sizes.chip) >= 22 && Math.min(...sizes.num) >= 22 && Math.min(...sizes.badge) >= 22 && Math.min(...sizes.foot) >= 22, `TV labels >= 22 px (chips ${sizes.chip[0]}, life path ${sizes.num[0]}, badge ${sizes.badge[0]})`);
    ok(/SIRF MAZE KE LIYE\. AI DEMO\./.test(tvText), 'TV shows "SIRF MAZE KE LIYE. AI DEMO."');
    ok(!/Dating|Health|Rizz|superfood/i.test(tvText) && !tvEvents.some((e) => /dating|health|rizz|superfood/i.test(e)), 'Dating and Health never reach the TV');
    const unreg = unregistered(tvEvents);
    ok(unreg.length === 0, `every string in the TV stream is a registered bank line or template (strict mode)${unreg.length ? `: ${unreg.slice(0, 4).join(' | ')}` : ''}`);
    const tvImgOk = await tv.evaluate(() => [...document.querySelectorAll('.jt-spot img')].some((i) => i.src.startsWith('data:image/jpeg') && i.naturalWidth > 0));
    ok(tvImgOk, 'TV shows the visitor palm photo (inline picture on the bus, TV switch on by default)');
    const scanSizes = tvEvents.map((e) => { try { return JSON.parse(e); } catch { return null; } }).filter((m) => m?.type === 'events').flatMap((m) => m.events).filter((e) => e.t === 'custom' && e.data?.image).map((e) => JSON.stringify(e).length);
    ok(scanSizes.length > 0 && Math.max(...scanSizes) < 8000, `scan thumbnail fits a custom event (${scanSizes.join(', ')} bytes)`);

    // unlock
    await phone.click('#unlock');
    await wait(600);
    await shot(phone, 'phone-6-gate');
    await phone.click('[data-pz=gate-unlock]');
    await wait(900);
    const post = await phone.evaluate(() => ({ futureN: document.querySelectorAll('#r-future li:not(.locked)').length, share: !!document.getElementById('share-box').offsetParent }));
    ok(post.futureN === 3 && post.share, 'after "Maine follow kar liya": 3 future lines + share card visible');
    await phone.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0, null, { timeout: 15000 });
    await phone.evaluate(() => document.getElementById('future-card').scrollIntoView({ block: 'start' }));
    await wait(500);
    await shot(phone, 'phone-7-future-unlocked');
    await phone.evaluate(() => document.getElementById('share-box').scrollIntoView({ block: 'center' }));
    await wait(300);
    await shot(phone, 'phone-8-share');
    const card = await phone.evaluate(async () => {
      const img = document.getElementById('card-img');
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext('2d').drawImage(img, 0, 0);
      return { w: img.naturalWidth, h: img.naturalHeight, png: cv.toDataURL('image/png').split(',')[1] };
    });
    ok(card.w === 1080 && card.h === 1920, `share card is ${card.w}x${card.h}`);
    if (SHOTS) fs.writeFileSync(path.join(OUT, 'sharecard-1080x1920.png'), Buffer.from(card.png, 'base64'));
    await wait(6000);
    await shot(tv, 'tv-7-future-unlocked');
    const unreg2 = unregistered(tvEvents);
    ok(unreg2.length === 0, `after unlock: TV stream still only registered text${unreg2.length ? `: ${unreg2.slice(0, 4).join(' | ')}` : ''}`);

    // tabs
    for (const t of ['career', 'dating', 'health']) {
      await phone.click(`#tabs [data-tab=${t}]`);
      await wait(400);
      await phone.evaluate(() => document.getElementById('tabs').scrollIntoView({ block: 'start' }));
      await wait(300);
      await shot(phone, `phone-9-tab-${t}`);
    }
    const health = await phone.evaluate(() => document.getElementById('tab-health').innerText);
    ok(/Not medical advice\. Just for fun\./.test(health), 'Health tab shows "Not medical advice. Just for fun."');
    const careerLink = await phone.evaluate(() => document.querySelector('#tab-career a.pz-btn')?.getAttribute('href'));
    ok(careerLink === '/career', 'Career tab links to Career Studio (/career)');
    ok(igCalls.length === 0, 'no Instagram requests from the page');

    await phone.click('#again');
    await wait(800);

    // privacy: palm bytes never on disk or in logs
    await wait(500);
    const files = [];
    const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else files.push(p); } };
    walk(S.dataDir);
    const disk = files.map((f) => fs.readFileSync(f, 'latin1')).join('\n');
    // a 40-char probe from the JPEG the browser actually uploaded (re-encoded, so not the same as PALM)
    const sentProbe = sent.match(/base64,([A-Za-z0-9+/]{3000})/)?.[1]?.slice(2000, 2040) || '';
    ok(sentProbe.length === 40, 'captured a probe from the uploaded JPEG');
    ok(!disk.includes(sentProbe) && !S.logs().includes(sentProbe) && !/base64|\/9j\//.test(S.logs()), `palm image is not in the data dir (${files.length} files) or the server logs`);
    ok(!/Gurugram|Riya/.test(disk + S.logs()), 'no name or birth place in data dir or logs');
    await ctx.close();
    await tvCtx.close();
  } finally {
    await S.stop();
  }
}

async function heroRun(layout) {
  const S = await startServer({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1200' });
  try {
    const portrait = layout === 'portrait';
    const tvCtx = await browser.newContext({ viewport: portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    watch(tv, `tv-${layout}`);
    await tv.goto(`${S.base}/tv/jyotish?c=8&capture=1${portrait ? '&layout=portrait' : ''}`);
    await wait(1200);
    const tag = portrait ? 'portrait' : 'landscape';
    await shot(tv, `capture-${tag}-0-idle`);
    const ctx = await phoneCtx();
    const phone = await ctx.newPage();
    watch(phone, `hero-${layout}`);
    let vibesCalls = 0;
    phone.on('request', (r) => { if (r.url().includes('/api/jyotish/vibes')) vibesCalls += 1; });
    await phone.goto(`${S.base}/jyotish?c=8&demo=hero`);
    await tv.waitForSelector('.jt-dock.on', { timeout: 20000 });
    await wait(1200);
    await shot(tv, `capture-${tag}-1-scan`);
    const hidden = await tv.evaluate(() => {
      const d = document.querySelector('.jt-dock')?.getBoundingClientRect();
      return [...document.querySelectorAll('.orx-node .orx-orb, .orx-node .orx-name')].filter((n) => {
        const r = n.getBoundingClientRect();
        return d && r.width && !(r.right <= d.left || r.left >= d.right || r.bottom <= d.top || r.top >= d.bottom);
      }).map((n) => n.textContent || 'orb');
    });
    ok(hidden.length === 0, `hero ${tag}: no agent hidden under the palm dock${hidden.length ? `: ${hidden.join(', ')}` : ''}`);
    const named = await tv.evaluate(() => [...document.querySelectorAll('.orx-node .orx-name')].filter((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.5 && r.right <= innerWidth + 1 && r.left >= -1; }).map((n) => n.textContent));
    ok(named.length === 6, `hero ${tag}: all 6 agents named on screen during the scan (${named.join(', ')})`);
    const ov1 = await tv.evaluate(LOG_OVERLAP);
    ok(ov1 === 0, `hero ${tag}: orchestra clear of the Mission Log during the scan (overlap ${ov1} px)`);
    if (!portrait) await shot(phone, 'phone-hero-run');
    await tv.waitForSelector('.jt-dock .jp-line', { timeout: 20000, state: 'attached' });
    await wait(2600);
    await shot(tv, `capture-${tag}-2-traced`);
    await tv.waitForSelector('.jt-spot', { timeout: 20000 });
    await wait(3500);
    await shot(tv, `capture-${tag}-3-typing`);
    await wait(14000);
    await shot(tv, `capture-${tag}-4-reading`);
    await phone.waitForSelector('#s-result:not([hidden])');
    const tvText = await tv.evaluate(() => document.body.innerText);
    ok(!/Aarav|Jaipur|2006/.test(tvText), `hero ${tag}: TV never shows the (fictional) name, DOB or place`);
    ok(vibesCalls === 0, `hero ${tag}: Dating/Health agents never fire (0 vibes calls)`);
    const tabs = await phone.evaluate(() => ({ tabs: !!document.getElementById('tabs').offsetParent, dating: !!document.getElementById('tab-dating').offsetParent, agents: !!document.getElementById('tab-agents').offsetParent }));
    ok(!tabs.tabs && !tabs.dating && !tabs.agents, `hero ${tag}: Dating and Health tabs and agents never appear`);
    ok(!/Dating|Health/.test(tvText), `hero ${tag}: TV shows no Dating/Health`);
    const psz = await tv.evaluate(() => [...document.querySelectorAll('.jt-spot .jp-chip-k, .jt-num small, .jt-demo')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    ok(Math.min(...psz) >= 22, `hero ${tag}: TV labels >= 22 px (min ${Math.min(...psz)})`);
    const overlap = await tv.evaluate(() => {
      const a = document.querySelector('.jt-foot')?.getBoundingClientRect();
      const b = document.querySelector('.tv-handle')?.getBoundingClientRect();
      return a && b && b.height ? !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left) : false;
    });
    ok(!overlap, `hero ${tag}: spotlight footer does not overlap the @handle`);
    const futureTyped = await tv.evaluate(() => document.querySelectorAll('.jt-col.future li.on').length);
    ok(futureTyped === 3, `hero ${tag}: TV types the 3 future lines for filming`);
    if (!portrait) { await shot(phone, 'phone-hero-result'); }
    // replay key R at half speed (filming)
    if (portrait) {
      console.log('  replay at 1/2x');
      await tv.keyboard.press('2');
      await tv.keyboard.press('r');
      await wait(5000);
      await shot(tv, 'capture-portrait-5-replay-half-speed');
    }
    await ctx.close();
    await tvCtx.close();
  } finally {
    await S.stop();
  }
}

async function offlineRun() {
  const S = await startServer({ DEMO_MODE: '1', OFFLINE: '1' });
  try {
    const ctx = await phoneCtx();
    const phone = await ctx.newPage();
    watch(phone, 'offline');
    await phone.goto(`${S.base}/jyotish?c=1`);
    await fillForm(phone, { name: 'Kabir', dob: '2009-11-11', place: 'Delhi', time: '' });
    await phone.click('#form button[type=submit]');
    await phone.setInputFiles('#palm-input', { name: 'palm.jpg', mimeType: 'image/jpeg', buffer: PALM });
    await phone.waitForSelector('#go:not([hidden])');
    const t0 = Date.now();
    await phone.click('#go');
    await phone.waitForSelector('#s-result:not([hidden])', { timeout: 60000 });
    const s = (Date.now() - t0) / 1000;
    const r = await phone.evaluate(() => ({ title: document.getElementById('r-title').textContent, who: document.getElementById('r-who').innerText, src: document.getElementById('r-src').textContent, badges: document.getElementById('r-badges').innerText }));
    ok(/Offline/.test(r.src) && r.title.length > 3 && /Life path 33/.test(r.who) && /33/.test(r.badges), `offline: reviewed reading for Scorpio + master number 33, ${s.toFixed(1)}s`);
    await phone.click('#tabs [data-tab=dating]');
    await wait(300);
    const d = await phone.evaluate(() => document.getElementById('tab-dating').innerText);
    ok(d.length > 40 && !/girlfriend|love|cute|hot/i.test(d), 'offline: Dating tab filled from the curated bank');
    const label = await phone.evaluate(() => document.querySelector('#tabs [data-tab=dating]').textContent);
    ok(label === 'Dosti', `under-18 visitor sees the tab as "Dosti" (got ${label})`);
    await shot(phone, 'phone-offline-result');

    // care path: a crisis line in the birth place field -> care card, nothing sent, nothing on the TV
    const careTv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await careTv.goto(`${S.base}/tv/jyotish?c=4`);
    const cp = await (await phoneCtx()).newPage();
    watch(cp, 'care');
    const careReq = [];
    cp.on('request', (q) => { if (q.url().includes('/api/jyotish/')) careReq.push(q.url()); });
    await cp.goto(`${S.base}/jyotish?c=4`);
    await fillForm(cp, { name: 'Kabir', dob: '2009-11-11', place: 'मुझे जीना नहीं है', time: '' });
    await cp.click('#form button[type=submit]');
    await cp.waitForSelector('[data-pz=care]', { timeout: 5000 });
    await wait(600);
    await shot(cp, 'phone-care-card');
    const careText = await cp.evaluate(() => document.querySelector('[data-pz=care]').innerText);
    const onPalm = await cp.evaluate(() => !document.getElementById('s-palm').hidden);
    const tvMode = await careTv.evaluate(() => window.__tv?.mode);
    ok(/14416/.test(careText) && !onPalm && careReq.length === 0 && tvMode === 'idle', `care path (Devanagari birth place): card with Tele-MANAS 14416, flow stopped, 0 requests, TV idle (${tvMode})`);
    // name field too (no exemption), solo and Dost
    const cn = await (await phoneCtx()).newPage();
    watch(cn, 'care-name');
    await cn.goto(`${S.base}/jyotish?c=4`);
    await fillForm(cn, { name: 'I want to die', dob: '2009-11-11', place: 'Delhi', time: '' });
    await cn.click('#form button[type=submit]');
    const c1 = await cn.waitForSelector('[data-pz=care]', { timeout: 5000 }).then(() => true).catch(() => false);
    await cn.goto(`${S.base}/jyotish/dost.html?c=4`);
    await cn.fill('input[name=name0]', 'Meher');
    await cn.fill('input[name=dob0]', '2007-03-02');
    await cn.fill('input[name=name1]', 'khudkushi');
    await cn.fill('input[name=dob1]', '2006-12-25');
    await cn.click('#squad button[type=submit]');
    const c2 = await cn.waitForSelector('[data-pz=care]', { timeout: 5000 }).then(() => true).catch(() => false);
    const dostRan = await cn.evaluate(() => !document.getElementById('s-run').hidden);
    ok(c1 && c2 && !dostRan, `care path on name fields: solo ${c1}, Dost ${c2}, Dost flow stopped ${!dostRan}`);
    await cn.context().close();
    await ctx.close();
  } finally {
    await S.stop();
  }
}

async function dostRun(mode) {
  const S = await startServer(mode === 'offline' ? { DEMO_MODE: '1', OFFLINE: '1' } : { CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1500' });
  const OUT15 = path.join(ROOT, 'docs', 'shots', 'TASK-15');
  if (SHOTS) fs.mkdirSync(OUT15, { recursive: true });
  const shot15 = async (page, name, opts = {}) => { if (SHOTS) { await page.screenshot({ path: path.join(OUT15, `${name}.png`), ...opts }); console.log('  shot', name); } };
  try {
    const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv = await tvCtx.newPage();
    watch(tv, `dost-tv-${mode}`);
    const tvEvents = [];
    await tv.exposeFunction('__jyEv', (x) => tvEvents.push(x));
    await tv.addInitScript(() => { const ES = window.EventSource; window.EventSource = class extends ES { constructor(...a) { super(...a); this.addEventListener('message', (m) => window.__jyEv?.(m.data)); } }; });
    await tv.goto(`${S.base}/tv/jyotish?c=2`);
    await wait(1000);
    const ctx = await phoneCtx();
    const phone = await ctx.newPage();
    watch(phone, `dost-${mode}`);
    const sent = [];
    phone.on('request', (q) => { if (q.url().includes('/api/')) sent.push(q.url() + ' ' + (q.postData() || '')); });
    await phone.goto(`${S.base}/jyotish/dost.html?c=2`);
    await wait(500);
    const squad = [['Meher', '2007-03-02'], ['Ishaan', '2006-12-25'], ['Zoya', '2008-07-30']];
    await phone.click('#add');
    for (const [i, [n, d]] of squad.entries()) { await phone.fill(`input[name=name${i}]`, n); await phone.fill(`input[name=dob${i}]`, d); }
    await phone.setInputFiles('input[data-i="0"]', { name: 'palm.jpg', mimeType: 'image/jpeg', buffer: PALM });
    await wait(500);
    let nick = null;
    if (mode === 'mock') {
      await phone.click('#nick');
      await phone.waitForSelector('[data-pz=nick]', { timeout: 5000 });
      nick = await phone.locator('[data-pz=nick]').first().textContent();
      await phone.locator('[data-pz=nick]').first().click();
      await wait(400);
    }
    if (mode === 'mock') await shot15(phone, 'phone-1-squad-form', { fullPage: true });
    const t0 = Date.now();
    await phone.click('#squad button[type=submit]');
    await wait(1800);
    if (mode === 'mock') { await shot15(phone, 'phone-2-orchestra'); await shot15(tv, 'tv-1-orchestra'); }
    await phone.waitForSelector('#s-result:not([hidden])', { timeout: 60000 });
    const secs = (Date.now() - t0) / 1000;
    ok(secs < 60, `dost ${mode}: 3-friend squad report in ${secs.toFixed(1)}s after submit (target < 2 min total)`);
    await wait(800);
    if (mode === 'mock') await shot15(phone, 'phone-3-report', { fullPage: true });
    const all = sent.join('\n');
    ok(!/Meher|Ishaan|Zoya|2007-03-02|2006-12-25|2008-07-30|base64/.test(all), `dost ${mode}: names, DOBs and palm photos never leave the phone`);
    if (mode === 'mock') {
      const boardTxt = await phone.evaluate(() => { const b = document.getElementById('r-board'); return b.hidden ? '' : b.textContent; });
      const st = await (await fetch(`${S.base}/api/core/stage/jyotish/2`)).json();
      const row = (st.board?.rows || []).find((x) => x.nickname === nick);
      ok(/#\d+/.test(boardTxt) && row && isPublic(row.extra?.line || ''), `dost mock: squad on the green-flag board under the stage nickname ${nick} (${boardTxt}), extra line is public text`);
      const reqs = sent.join('\n');
      ok(!/Meher|Ishaan|Zoya/.test(JSON.stringify(st)), 'dost mock: board holds nickname + score only, no names');
      void reqs;
    }
    const roles = await phone.evaluate(() => document.querySelectorAll('#r-roles li').length);
    ok(roles === 3, `dost ${mode}: 3 roles on the phone`);
    const pre = await phone.evaluate(() => ({ share: !!document.getElementById('share-box').offsetParent, src: document.getElementById('card-img').getAttribute('src') || '' }));
    ok(!pre.share && !pre.src, `dost ${mode}: squad card not reachable before the follow gate`);
    await tv.waitForSelector('.jt-dost', { timeout: 15000 });
    await wait(9000);
    if (mode === 'mock') await shot15(tv, 'tv-2-squad-report');
    const tvText = await tv.evaluate(() => document.body.innerText);
    ok(!/Meher|Ishaan|Zoya|2007|2006|2008/.test(tvText), `dost ${mode}: TV never shows names or DOBs (nicknames only)`);
    ok(!/Dating|Health|Rizz/i.test(tvText), `dost ${mode}: no Dating/Health on the TV`);
    const unreg = unregistered(tvEvents);
    ok(unreg.length === 0, `dost ${mode}: every TV string is registered public text (strict)${unreg.length ? `: ${unreg.slice(0, 3).join(' | ')}` : ''}`);
    const sz = await tv.evaluate(() => [...document.querySelectorAll('.jt-dost-role b, .jt-dost-role span, .jt-dost-score, .jt-dost .jt-kicker')].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    ok(Math.min(...sz) >= 22, `dost ${mode}: TV text >= 22 px (min ${Math.min(...sz)})`);
    await phone.click('#unlock');
    await wait(500);
    await phone.click('[data-pz=gate-unlock]');
    await phone.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0, null, { timeout: 15000 });
    const card = await phone.evaluate(async () => { const img = document.getElementById('card-img'); await img.decode(); const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0); return { w: img.naturalWidth, h: img.naturalHeight, png: cv.toDataURL('image/png').split(',')[1] }; });
    ok(card.w === 1080 && card.h === 1920, `dost ${mode}: share card ${card.w}x${card.h}`);
    if (SHOTS && mode === 'mock') fs.writeFileSync(path.join(OUT15, 'sharecard-1080x1920.png'), Buffer.from(card.png, 'base64'));
    if (mode === 'mock') { await phone.evaluate(() => document.getElementById('share-box').scrollIntoView({ block: 'center' })); await wait(300); await shot15(phone, 'phone-4-share'); }
    await ctx.close();
    await tvCtx.close();
    if (mode === 'mock') {
      // hero squad on a portrait capture TV (filming)
      const ptv = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
      watch(ptv, 'dost-portrait');
      await ptv.goto(`${S.base}/tv/jyotish?c=3&capture=1&layout=portrait`);
      const hp = await (await phoneCtx()).newPage();
      watch(hp, 'dost-hero');
      await hp.goto(`${S.base}/jyotish/dost.html?c=3&demo=hero`);
      await ptv.waitForSelector('.orx-node', { timeout: 20000, state: 'attached' });
      let ov = 0;
      for (let k = 0; k < 8; k++) { await wait(500); ov = Math.max(ov, await ptv.evaluate(LOG_OVERLAP)); if (k === 1) await shot15(ptv, 'tv-4-portrait-capture-orchestra'); }
      ok(ov === 0, `dost hero: portrait orchestra clear of the Mission Log (worst overlap ${ov} px)`);
      await ptv.waitForSelector('.jt-dost', { timeout: 30000 });
      await wait(9000);
      await shot15(ptv, 'tv-3-portrait-capture-hero');
      const t = await ptv.evaluate(() => document.body.innerText);
      ok(!/Aarav|Meher|Ishaan/.test(t), 'dost hero: portrait TV shows nicknames only');
      await shot15(hp, 'phone-5-hero-report', { fullPage: true });
      await ptv.context().close();
      await hp.context().close();
    }
  } finally {
    await S.stop();
  }
}

try {
  if (!ONLY || ONLY === 'dost') { await dostRun('mock'); await dostRun('offline'); }
  if (!ONLY || ONLY === 'mock') await mockRun();
  if (!ONLY || ONLY === 'hero') { await heroRun('landscape'); await heroRun('portrait'); }
  if (!ONLY || ONLY === 'offline') await offlineRun();
  ok(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
} catch (e) {
  fails.push(e.message);
  console.error(e.message.split('\n')[0], errors);
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
