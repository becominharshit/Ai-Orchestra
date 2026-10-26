// End-to-end smoke: the sample experience on a 375x812 phone, mirrored to the counter TV, in mock and offline mode.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'shots', 'TASK-01');

// ports come from playwright.config.js (free ports picked at start, or PZ_E2E_*_PORT)
const MOCK = `http://127.0.0.1:${process.env.PZ_E2E_MOCK_PORT}`;
const OFFLINE = `http://127.0.0.1:${process.env.PZ_E2E_OFFLINE_PORT}`;
const LAB = `http://127.0.0.1:${process.env.PZ_E2E_LAB_PORT}`; // public-text rule off: synthetic TV text only
const PHONE = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** Collect console errors and every request that leaves 127.0.0.1. */
// Wait for state, not time: two animation frames, then every finite CSS/Web animation (entrances, panel fades) done.
async function settle(page) {
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const finite = () => document.getAnimations().filter((a) => { const t = a.effect?.getComputedTiming?.(); return t && Number.isFinite(t.endTime) && a.playState !== 'finished'; });
    for (let i = 0; i < 5 && finite().length; i++) await Promise.all(finite().map((a) => a.finished.catch(() => {})));
    await document.fonts.ready;
  });
}
function watch(page, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.errors.push(m.text()); });
  page.on('pageerror', (e) => sink.errors.push(e.message));
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !u.protocol.startsWith('blob') && !u.protocol.startsWith('data')) sink.external.push(r.url()); });
}

async function playSample(phone, base, counter) {
  await phone.goto(`${base}/_sample?c=${counter}`);
  await expect(phone.locator('h1')).toContainText('Vibe');
  await phone.fill('input[name=word]', 'curious');
  await phone.selectOption('select[name=subject]', 'science');
  await phone.click('button[type=submit]');
  await expect(phone.locator('.orx')).toBeVisible();
  await expect(phone.locator('.orx-node')).toHaveCount(4);
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  await expect(phone.locator('#r-lines li')).toHaveCount(3);
  await expect(phone.locator('#r-lines li.locked')).toHaveCount(1);
}

async function stats(request, base) {
  return (await request.get(`${base}/admin/stats.json?key=e2e-admin`)).json();
}

test('hub lists the 5 experiences', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(page, sink);
  await page.goto(`${MOCK}/`);
  await expect(page.locator('.hub-card')).toHaveCount(5);
  await expect(page.locator('.hub-card[data-exp=shark]')).toContainText('AI Sharks');
  expect(sink.errors).toEqual([]);
  await ctx.close();
});

test('mock mode: full flow on 375x812, live TV mirror, gate without Instagram calls, 1080x1920 share card', async ({ browser, request }) => {
  const sink = { errors: [], external: [] };
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { staffToken } = await import('../../core/server/limits.js');
  await tvCtx.addCookies([{ name: 'pz_staff', value: staffToken('e2e-admin'), url: MOCK }]); // the counter TV was paired once at /staff (P needs it)
  const tv = await tvCtx.newPage();
  watch(tv, sink);
  await tv.goto(`${MOCK}/tv/_sample?c=9`);
  await expect(tv.locator('.tv-qr svg')).toBeVisible();
  await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('idle');

  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  watch(phone, sink);
  await playSample(phone, MOCK, 9);
  await expect(phone.locator('#r-src')).toContainText('Mock mode');

  // TV mirrored the orchestra and showed the result spotlight, without the typed word
  await expect.poll(() => tv.evaluate(() => window.__tv.events)).toBeGreaterThan(8);
  await expect(tv.locator('.tv-live .orx-node')).toHaveCount(4);
  await expect(tv.locator('.tv-spot.show')).toBeVisible();
  expect(await tv.locator('body').innerText()).not.toContain('curious');

  // before the gate: the share card and share buttons must not be reachable
  await expect(phone.locator('#share-box')).toBeHidden();
  await expect(phone.locator('#share')).toBeHidden();
  await expect(phone.locator('#card-img')).toBeHidden();
  expect(await phone.evaluate(() => getComputedStyle(document.getElementById('share-box')).display)).toBe('none');
  const before = (await stats(request, MOCK)).totals._sample?.share || 0;
  await phone.locator('#share').click({ force: true, timeout: 1500 }).catch(() => {});
  expect((await stats(request, MOCK)).totals._sample?.share || 0).toBe(before);

  // follow gate: QR + IG link + honour button, no Instagram requests
  await phone.click('#unlock');
  const sheet = phone.locator('.pz-gate');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pz-qr svg path')).toHaveCount(1);
  await expect(sheet.locator('[data-pz=gate-ig]')).toHaveAttribute('href', 'https://instagram.com/zenith_school_of_ai');
  await expect(sheet).toContainText('Maine follow kar liya');
  await phone.click('[data-pz=gate-unlock]');
  await expect(phone.locator('#r-lines li.locked')).toHaveCount(0);

  // share card is exactly 1080x1920
  const img = phone.locator('#card-img');
  await expect(img).toBeVisible();
  const dims = await img.evaluate(async (el) => { await el.decode(); return [el.naturalWidth, el.naturalHeight]; });
  expect(dims).toEqual([1080, 1920]);

  // TV replay (R) and pin (P) for filming
  await tv.keyboard.press('2');
  await tv.keyboard.press('r');
  await expect.poll(() => tv.evaluate(() => window.__tv.replaying)).toBe(true);
  await tv.keyboard.press('Escape');
  await tv.keyboard.press('p');
  await expect.poll(() => tv.evaluate(() => window.__tv.pinned)).toBe(true);
  await tv.keyboard.press('p');
  await expect.poll(() => tv.evaluate(() => window.__tv.pinned)).toBe(false);

  const st = await stats(request, MOCK);
  for (const k of ['start', 'complete', 'gate_view', 'gate_unlock']) expect(st.totals._sample[k], k).toBeGreaterThanOrEqual(1);

  expect(sink.errors).toEqual([]);
  expect(sink.external).toEqual([]);
  await ctx.close();
  await tvCtx.close();
});

test('offline mode: full flow from fixtures, no request leaves the machine', async ({ browser, request }) => {
  const sink = { errors: [], external: [] };
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  watch(phone, sink);
  await playSample(phone, OFFLINE, 4);
  await expect(phone.locator('#r-src')).toContainText('Offline mode');
  await phone.click('#unlock');
  await phone.click('[data-pz=gate-unlock]');
  await expect(phone.locator('#card-img')).toBeVisible();
  const st = await stats(request, OFFLINE);
  expect(st.totals._sample.fallback).toBeGreaterThanOrEqual(1);
  expect(sink.errors).toEqual([]);
  expect(sink.external).toEqual([]);
  await ctx.close();
});

test('hero demo (?demo=hero): fictional profile runs by itself, answers from fixtures, not counted', async ({ browser, request }) => {
  const before = (await stats(request, MOCK)).totals._sample?.start || 0;
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(phone, sink);
  await phone.goto(`${MOCK}/_sample/?demo=hero&c=7`);
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  await expect(phone.locator('#r-title')).toHaveText('Curious Builder');
  const after = (await stats(request, MOCK)).totals._sample?.start || 0;
  expect(after).toBe(before);
  expect(sink.errors).toEqual([]);
  await ctx.close();
});

test('network failure shows the friendly retry screen and recovers', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  phone.on('pageerror', (e) => sink.errors.push(e.message));
  await phone.route('**/api/_sample/vibe', (route) => route.abort('internetdisconnected'));
  await phone.goto(`${MOCK}/_sample/?c=5`);
  await phone.fill('input[name=word]', 'bold');
  await phone.click('button[type=submit]');
  const retry = phone.locator('[data-pz=retry]');
  await expect(retry).toBeVisible({ timeout: 10000 });
  await expect(retry).toContainText('Dobara try karo');
  await phone.unroute('**/api/_sample/vibe');
  await retry.locator('button').click();
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  expect(sink.errors).toEqual([]);
  await ctx.close();
});

test('friend share link counts one ref_visit and strips the params', async ({ browser, request }) => {
  const before = (await stats(request, MOCK)).totals._sample?.ref_visit || 0;
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(`${MOCK}/_sample/?ref=share&exp=_sample`);
  await expect.poll(() => page.evaluate(() => location.search)).toBe('');
  await page.reload();
  await expect.poll(async () => (await stats(request, MOCK)).totals._sample?.ref_visit || 0).toBe(before + 1);
  await ctx.close();
});

test('TV capture + portrait layout hides the QR and keeps a 9:16 stage', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const tv = await ctx.newPage();
  await tv.goto(`${MOCK}/tv/_sample?c=9&capture=1&layout=portrait`);
  await expect(tv.locator('.tv-frame.is-capture')).toBeVisible();
  await expect(tv.locator('.tv-qr')).toBeHidden();
  const box = await tv.locator('.tv-stage').boundingBox();
  expect(Math.round(box.width)).toBe(1080);
  expect(Math.round(box.height)).toBe(1920);
  await ctx.close();
});

// ---------- TV graph legibility (CHECK-01 F2) ----------
const NAMES = ['Rashi Agent', 'Ank Agent', 'Hast Rekha Agent', 'Kaal Agent', 'Career Agent', 'Dating Agent', 'Health Agent'];
const ROLES = ['Sun sign, in code', 'Life path number', 'Palm lines (vision)', 'Past + future', 'AI-era career', 'Vibe match', 'Vibe check'];
const STATES = ['done', 'working', 'thinking', 'retry', 'thinking', 'working', 'idle'];

async function publishSession(request, base, c, n, sid) {
  const agents = NAMES.slice(0, n).map((name, i) => ({ id: `a${i}`, name, role: ROLES[i], icon: ['star', 'dice', 'palm', 'clock', 'compass', 'heart', 'bolt'][i] }));
  const events = [{ t: 'init', ts: 0, title: 'AI Jyotish', orchestrator: { id: 'guru', name: 'Jyotish Guru', role: 'Orchestrator', icon: 'spark' }, agents }];
  agents.forEach((a, i) => events.push({ t: 'assign', ts: 10 + i, id: a.id, task: `Kaam number ${i + 1} chal raha hai` }));
  agents.forEach((a, i) => { if (STATES[i] !== 'idle') events.push({ t: 'status', ts: 30 + i, id: a.id, state: STATES[i] }); });
  agents.forEach((a, i) => events.push({ t: 'log', ts: 50 + i, id: a.id, text: `step ${i + 1} computed from real data` }));
  const r = await (await request.post(`${base}/api/core/bus/_sample/${c}`, { data: { sid, events } })).json();
  expect(r.rejected).toEqual([]);
}

async function measure(tv) {
  return tv.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const vis = (e) => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.offsetWidth > 0;
    const items = [];
    document.querySelectorAll('.tv-live .orx-node').forEach((node, i) => {
      const o = R(node.querySelector('.orx-orb'));
      const ring = (node.classList.contains('orx-node--lead') ? 0.75 : 0.55) * 16;
      items.push({ what: `orb+ring#${i}`, r: { l: o.l - ring, t: o.t - ring, r: o.r + ring, b: o.b + ring } });
      for (const sel of ['.orx-name', '.orx-role', '.orx-chip', '.orx-task']) { const e = node.querySelector(sel); if (vis(e)) items.push({ what: `${sel}#${i}`, r: R(e) }); }
    });
    document.querySelectorAll('.tv-live .orx-beam-label').forEach((e, i) => { if (vis(e)) items.push({ what: `handoff-label#${i}`, r: R(e) }); });
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].r, b = items[j].r;
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlaps.push(`${items[i].what} x ${items[j].what}`);
    }
    const graph = R(document.querySelector('.tv-live .orx-graph'));
    const outside = items.filter((x) => x.r.l < graph.l - 1 || x.r.r > graph.r + 1 || x.r.t < graph.t - 1 || x.r.b > graph.b + 1).map((x) => x.what);
    const px = (sel) => [...document.querySelectorAll(`.tv-live ${sel}`)].filter(vis).map((e) => parseFloat(getComputedStyle(e).fontSize));
    const panel = R(document.querySelector('.tv-live .orx-log'));
    const rows = [...document.querySelectorAll('.tv-live .orx-roster-row')].filter(vis).map(R);
    const clipped = rows.filter((r) => r.b > panel.b + 0.5 || r.t < panel.t - 0.5).length;
    const labels = document.querySelectorAll('.tv-live .orx-beam-label').length;
    return { overlaps, outside, names: px('.orx-name'), roles: px('.orx-role'), chips: px('.orx-chip'), log: px('.orx-lines li'), rows: rows.length, clipped, labels };
  });
}

const LAYOUTS = [
  { name: 'TV 1920x1080', w: 1920, h: 1080, q: '', base: 40, roster: true },
  { name: 'TV portrait capture 1080x1920', w: 1080, h: 1920, q: '&capture=1&layout=portrait', base: 80, roster: false },
  { name: 'TV portrait 1080x1920', w: 1080, h: 1920, q: '&layout=portrait', base: 90, roster: false },
];
for (const L of LAYOUTS) for (const n of [3, 5, 7]) {
  test(`${L.name} with ${n} agents: no overlaps, no clipped roster rows, camera text sizes`, async ({ browser, request }) => {
    const c = L.base + n;
    const sid = `layout-${n}-${Date.now()}`;
    await publishSession(request, LAB, c, n, sid);
    const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h } });
    const tv = await ctx.newPage();
    await tv.goto(`${LAB}/tv/_sample?c=${c}${L.q}`);
    await expect(tv.locator('.tv-live .orx-node')).toHaveCount(n + 1);
    await tv.evaluate(() => document.fonts.ready);
    await settle(tv); // entrance animation
    // under heavy machine load the solver can place the graph a frame late: wait for a settled layout, then check it
    await expect.poll(async () => (await measure(tv)).overlaps, { timeout: 8000 }).toEqual([]);
    let m = await measure(tv);
    expect(m.overlaps, 'overlaps').toEqual([]);
    expect(m.outside, 'outside the graph').toEqual([]);
    if (L.roster) expect(m.rows).toBe(n);
    expect(m.clipped, 'clipped roster rows').toBe(0);
    expect(Math.min(...m.names)).toBeGreaterThanOrEqual(36);
    if (m.roles.length) expect(Math.min(...m.roles)).toBeGreaterThanOrEqual(24);
    expect(Math.min(...m.chips)).toBeGreaterThanOrEqual(24);
    expect(Math.min(...m.log)).toBeGreaterThanOrEqual(22);
    // live handoffs: labels never land on a node (they are skipped when there is no free spot)
    const evBefore = await tv.evaluate(() => window.__tv.events);
    await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [
      { t: 'handoff', ts: 100, from: 'a0', to: `a${n - 1}`, label: 'sign = Leo' },
      { t: 'handoff', ts: 101, from: 'a1', to: 'guru', label: 'number = 7' },
    ] } });
    await expect.poll(() => tv.evaluate(() => window.__tv.events)).toBeGreaterThanOrEqual(evBefore + 2);
    await settle(tv);
    m = await measure(tv);
    expect(m.overlaps, 'overlaps with handoff labels').toEqual([]);
    await tv.screenshot({ path: path.join(SHOTS, `tv-layout-${L.q.includes('portrait') ? (L.q.includes('capture') ? 'portrait-capture-' : 'portrait-') : ''}${n}-agents.png`) });
    await ctx.close();
  });
}


// ---------- CHECK-01 F3: 429 respects Retry-After; "Doston ko bhejo" ----------
test('429: the cool-down screen waits the full Retry-After before the next request, then the flow completes', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(phone, sink);
  const hits = [];
  await phone.route('**/api/_sample/vibe', async (route) => {
    hits.push(Date.now());
    if (hits.length === 1) return route.fulfill({ status: 429, headers: { 'retry-after': '3', 'content-type': 'application/json' }, body: JSON.stringify({ error: 'slow_down', retryMs: 3000, message: 'Itni speed! Thoda saans lo, 3 second mein phir khelna.' }) });
    return route.continue();
  });
  await phone.goto(`${MOCK}/_sample/?c=2`);
  await phone.fill('input[name=word]', 'calm');
  await phone.click('button[type=submit]');
  const slow = phone.locator('[data-pz=slow]');
  await expect(slow).toBeVisible();
  await expect(slow).toContainText('3 second mein');
  await expect(slow.locator('[data-pz=slow-left]')).toHaveText(/^[1-3]$/);
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  expect(hits.length).toBe(2);
  expect(hits[1] - hits[0]).toBeGreaterThanOrEqual(2900);
  // Chrome itself logs every 4xx response as "Failed to load resource"; that one is expected here
  expect(sink.errors.filter((e) => !/status of 429/.test(e))).toEqual([]);
  await ctx.close();
});

test('"Doston ko bhejo" shares the PNG, Hinglish text and the ref=share link, and counts a share', async ({ browser, request }) => {
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })), text: d.text, url: d.url }; };
  });
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(phone, sink);
  const before = (await stats(request, MOCK)).totals._sample?.share || 0;
  await playSample(phone, MOCK, 6);
  await expect(phone.locator('#friends')).toBeHidden();
  await phone.click('#unlock');
  await phone.click('[data-pz=gate-unlock]');
  await phone.click('#friends');
  await expect.poll(() => phone.evaluate(() => window.__shared)).toBeTruthy();
  const shared = await phone.evaluate(() => window.__shared);
  expect(shared.url).toBe('https://play.zenithschool.ai/_sample?ref=share&exp=_sample');
  expect(shared.files[0].type).toBe('image/png');
  expect(shared.files[0].size).toBeGreaterThan(10000);
  expect(shared.text).toBe('Maine Zenith School of AI ka AI experience try kiya. Tum bhi khelo!');
  await expect.poll(async () => (await stats(request, MOCK)).totals._sample?.share || 0).toBe(before + 1);
  expect(sink.errors).toEqual([]);
  expect(sink.external).toEqual([]);
  await ctx.close();
});


// ---------- counter map v4 + agent labels ----------
test('TV without ?c uses the experience counter (map v4) and warns on a mismatch', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.goto(`${MOCK}/tv/shark`);
  await expect.poll(() => tv.evaluate(() => window.__tv.counter)).toBe(3);
  await expect(tv.locator('.tv-counter b')).toHaveText('3');
  await tv.goto(`${MOCK}/tv/shark?c=6`);
  await expect.poll(() => tv.evaluate(() => window.__tv.mismatch)).toBe(true);
  await tv.goto(`${MOCK}/tv/jyotish`);
  await expect.poll(() => tv.evaluate(() => window.__tv.counter)).toBe(1);
  await ctx.close();
});

test('CHECK-20 F4/F5: with the flags off, the counter 2 and 4 TVs and phones revert on their own; phones show v4 counter numbers from the map', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.goto(`${MOCK}/tv/startup?c=2`);
  expect(new URL(tv.url()).pathname).toBe('/tv/jyotish');
  await expect.poll(() => tv.evaluate(() => window.__tv.counter)).toBe(2);
  await expect(tv.locator('.tv-top-mid')).toContainText(/Jyotish/i);
  await tv.goto(`${MOCK}/tv/agent?c=4`);
  expect(new URL(tv.url()).pathname).toBe('/tv/career');
  await expect.poll(() => tv.evaluate(() => window.__tv.mismatch)).toBe(false);
  await ctx.close();
  const pctx = await browser.newContext(PHONE);
  const phone = await pctx.newPage();
  await phone.goto(`${MOCK}/startup?c=2`);
  expect(new URL(phone.url()).pathname).toBe('/jyotish/');
  for (const [u, sel, want] of [['/shark/?c=3', '[data-pz-counter-of=shark]', '3'], ['/asli/?c=7', '[data-pz-counter-of=asli]', '7'], ['/reel/?c=6', '[data-pz-counter-of=reel]', '6']]) {
    await phone.goto(`${MOCK}${u}`);
    await expect(phone.locator(sel).first(), u).toHaveText(want);
  }
  await pctx.close();
});

test('agent label: three sharks get distinct log tags and roster names', async ({ browser, request }) => {
  const c = 60;
  const agents = [{ id: 'vc', name: 'Shark', role: 'Venture capital', label: 'VC' }, { id: 'mk', name: 'Shark', role: 'Marketing head', label: 'MKTG' }, { id: 'fi', name: 'Shark', role: 'Finance head', label: 'CFO' }];
  const events = [{ t: 'init', ts: 0, title: 'AI Sharks', orchestrator: { id: 'host', name: 'Shark Host' }, agents }, ...agents.map((a, i) => ({ t: 'log', ts: 5 + i, id: a.id, text: `question ${i + 1} ready` }))];
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid: `labels-${Date.now()}`, events } });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.goto(`${LAB}/tv/_sample?c=${c}`);
  await expect(tv.locator('.tv-live .orx-lines li b').filter({ hasText: /^(VC|MKTG|CFO)$/ })).toHaveCount(3);
  await expect(tv.locator('.tv-live .orx-roster-row b')).toHaveText(['VC · Shark', 'MKTG · Shark', 'CFO · Shark']);
  await ctx.close();
});

// ---------- Jyotish requests: privacy, camera minimums, capture chips, share card fit, tvToggle hint ----------
test('TV forgets image bytes once the session ends; experience CSS cannot shrink camera text', async ({ browser, request }) => {
  const c = 70;
  const sid = `img-${Date.now()}`;
  const img = 'data:image/jpeg;base64,' + 'B'.repeat(4000);
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [
    { t: 'init', ts: 0, title: 'Palm', orchestrator: { id: 'g', name: 'Jyotish Guru' }, agents: [{ id: 'h', name: 'Hast Rekha Agent', role: 'Palm lines' }] },
  ] } });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctx.newPage();
  await tv.goto(`${LAB}/tv/_sample?c=${c}`);
  await expect(tv.locator('.tv-live .orx-node')).toHaveCount(2);
  // an experience stylesheet trying to shrink the TV text has no effect
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [{ t: 'log', ts: 2, id: 'h', text: 'palm lines found' }] } });
  await expect(tv.locator('.tv-live .orx-lines li')).not.toHaveCount(0);
  await tv.addStyleTag({ content: '.orx-name,.orx-role,.orx-chip,.orx-lines,.orx-lines li,.orx-lines li b,.orx-lines li time,.orx-msg,.orx-roster-row,.orx-roster-row b,.orx-roster-row .orx-chip{font-size:10px}' });
  const sizes = await tv.evaluate(() => Object.fromEntries(['.orx-name', '.orx-role', '.orx-node .orx-chip', '.orx-lines', '.orx-lines li', '.orx-lines li b', '.orx-msg', '.orx-roster-row b', '.orx-roster-row .orx-chip']
    .map((s) => [s, parseFloat(getComputedStyle(document.querySelector(`.tv-live ${s}`)).fontSize)])));
  expect(sizes['.orx-name']).toBeGreaterThanOrEqual(36);
  expect(sizes['.orx-role']).toBeGreaterThanOrEqual(24);
  expect(sizes['.orx-node .orx-chip']).toBeGreaterThanOrEqual(24);
  for (const k of ['.orx-lines', '.orx-lines li', '.orx-lines li b', '.orx-msg', '.orx-roster-row b']) expect(sizes[k], k).toBeGreaterThanOrEqual(22);
  expect(sizes['.orx-roster-row .orx-chip']).toBeGreaterThanOrEqual(24);
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [{ t: 'result', ts: 5, payload: { title: 'Palm read', image: img, lines: ['ok'] } }] } });
  await expect.poll(() => tv.evaluate(() => window.__tv.holdsImages)).toBe(true);
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [{ t: 'end', ts: 9 }] } });
  await expect.poll(() => tv.evaluate(() => window.__tv.holdsImages)).toBe(false);
  // a TV that connects later gets the session without the image
  const late = await ctx.newPage();
  await late.goto(`${LAB}/tv/_sample?c=${c}`);
  await expect.poll(() => late.evaluate(() => window.__tv.last)).toBeGreaterThan(0);
  expect(await late.evaluate(() => window.__tv.holdsImages)).toBe(false);
  await ctx.close();
});

test('portrait capture: REPLAY and PINNED chips sit in the bottom strip, not the top area', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const tv = await ctx.newPage();
  await tv.goto(`${MOCK}/tv/_sample?c=9&capture=1&layout=portrait`);
  await expect(tv.locator('.tv-conn.ok')).toBeAttached(); // SSE hello received (it sets the pin state)
  await settle(tv);
  await tv.evaluate(() => document.querySelector('.tv-frame').classList.add('is-pinned', 'is-replay'));
  const r = await tv.evaluate(() => [...document.querySelectorAll('.tv-pin, .tv-replay')].map((e) => e.getBoundingClientRect().top));
  expect(r.length).toBe(2);
  for (const top of r) expect(top).toBeGreaterThan(1920 * 0.9);
  await ctx.close();
});

test('share card: long text shrinks, then gets an ellipsis; no line is ever dropped', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(`${MOCK}/_sample/`);
  const out = await page.evaluate(async () => {
    const { makeShareCard } = await import('/core/sharecard.js');
    const long = 'Tumhari energy aisi hai ki pura group ek saath hans padta hai aur phir sab milke kuch naya banate hain';
    const P = (text, i = 0) => ({ pt: `_sample.test:${i}`, text }); // public text objects, as a server returns them
    const big = await makeShareCard({ kicker: 'Test', title: P('Ek bahut lamba title jo teen line mein bhi mushkil se aata hai yaar'), lines: [1, 2, 3, 4, 5, 6].map((i) => P(long, i)), footer: 'For fun only' });
    const small = await makeShareCard({ kicker: 'Test', title: P('Leo'), lines: [P('one', 1), P('two', 2)] });
    const plain = await makeShareCard({ kicker: 'Test', title: 'A free string', lines: ['free one', 'free two'] });
    if (plain.layout.rendered !== 0) throw new Error('strict mode must drop plain strings');
    const last = globalThis.__pzShareCards[globalThis.__pzShareCards.length - 1];
    if (last.dropped < 4) throw new Error(`kicker, title and lines must all be dropped as plain strings (dropped ${last.dropped})`);
    return { big: { ...big.layout, w: big.width, h: big.height }, small: small.layout };
  });
  expect(out.big.w).toBe(1080);
  expect(out.big.h).toBe(1920);
  expect(out.big.rendered).toBe(6);
  expect(out.big.lineSize).toBeLessThan(42);
  expect(out.big.titleSize).toBeLessThan(112);
  expect(out.small).toMatchObject({ rendered: 2, lineSize: 42, titleSize: 112, shortened: 0 });
  await ctx.close();
});

test('tvToggle takes a per-experience hint', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.goto(`${MOCK}/_sample/?c=3`);
  const text = await page.evaluate(async () => {
    const { tvToggle } = await import('/core/kit.js');
    const el = tvToggle(() => {}, { hint: 'Sirf haath ki photo aur reading, naam kabhi nahi.' });
    document.body.appendChild(el);
    return el.innerText;
  });
  expect(text).toContain('Sirf haath ki photo aur reading, naam kabhi nahi.');
  expect(text).toContain('Counter 3');
  await ctx.close();
});


test('staff key B blanks the TV at once and clears the channel for late joiners', async ({ browser, request }) => {
  const c = 75;
  await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid: `b-${Date.now()}`, events: [
    { t: 'init', ts: 0, title: 'X', orchestrator: { id: 'g', name: 'Guru' }, agents: [{ id: 'a', name: 'Rashi Agent' }] },
    { t: 'result', ts: 4, payload: { title: 'Something to wipe', lines: ['x'] } },
  ] } });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const { staffToken } = await import('../../core/server/limits.js');
  await ctx.addCookies([{ name: 'pz_staff', value: staffToken('e2e-admin'), url: LAB }]); // key B needs a staff TV (CHECK-12 F1)
  const tv = await ctx.newPage();
  await tv.goto(`${LAB}/tv/_sample?c=${c}`);
  await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('live');
  await tv.keyboard.press('b');
  await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('idle');
  expect(await tv.evaluate(() => [window.__tv.events, window.__tv.last])).toEqual([0, 0]);
  await expect(tv.locator('.tv-spot')).not.toContainText('Something to wipe');
  const late = await ctx.newPage();
  await late.goto(`${LAB}/tv/_sample?c=${c}`);
  await expect(late.locator('.tv-qr svg')).toBeVisible();
  await expect(late.locator('.tv-conn.ok')).toBeAttached(); // hello (and any replay) received
  await settle(late);
  expect(await late.evaluate(() => [window.__tv.mode, window.__tv.events, window.__tv.last])).toEqual(['idle', 0, 0]);
  await ctx.close();
});

// ---------- TASK-16: care path, operator alert, core TV label floors ----------
const SHOTS16 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'shots', 'TASK-16');

test('safety net: a calm Tele-MANAS line right under long free-text inputs on the phone only; never under single-word fields, never on the TV or the share card', async ({ browser }) => {
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  await phone.goto(`${MOCK}/_sample/?c=8`);
  await expect(phone.locator('input[name=word]')).toBeVisible();
  await settle(phone);
  await expect(phone.locator('[data-pz=care-net]')).toHaveCount(0); // a single-word field gets no line
  // a long answer box (as in the AI Sharks pitch or a typed answer): the line appears right under it
  await phone.evaluate(() => {
    const ta = Object.assign(document.createElement('textarea'), { name: 'idea', rows: 3, placeholder: 'Apna idea 2 line mein likho' });
    ta.className = 'pz-input';
    document.querySelector('input[name=word]').after(ta);
  });
  const net = phone.locator('[data-pz=care-net]');
  await expect(net).toHaveCount(1);
  await expect(net).toHaveText('Kabhi bhi baat karni ho: Tele-MANAS 14416 (free, 24x7)');
  await expect(net.locator('a[href="tel:14416"]')).toBeVisible();
  expect(await phone.evaluate(() => document.querySelector('textarea[name=idea]').nextElementSibling?.dataset.pz)).toBe('care-net');
  // this server has no live AI crisis check (mock): degraded safety mode, so the line is more prominent (16 px, soft card)
  await expect.poll(() => phone.evaluate(() => document.documentElement.dataset.pzSafety)).toBe('degraded');
  expect(await net.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(16);
  expect(await net.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('solid');
  fs.mkdirSync(SHOTS16, { recursive: true });
  await phone.screenshot({ path: path.join(SHOTS16, 'care-net-degraded-375x812.png') });
  // opt-in / opt-out attributes
  await phone.evaluate(() => {
    document.querySelector('textarea[name=idea]').setAttribute('data-care-net', 'off');
    document.querySelector('input[name=word]').setAttribute('data-care-net', '');
  });
  await expect(phone.locator('input[name=word] + [data-pz=care-net]')).toHaveCount(1);
  await expect(phone.locator('textarea[name=idea] + [data-pz=care-net]')).toHaveCount(0);
  await phone.evaluate(() => { document.querySelector('input[name=word]').removeAttribute('data-care-net'); document.querySelector('textarea[name=idea]').remove(); });
  await expect(phone.locator('[data-pz=care-net]')).toHaveCount(0);
  // live safety mode (the kit reads safetyMode from /api/core/config): calm 14 px line, no card
  const livePhone = await ctx.newPage();
  await livePhone.route('**/api/core/config', async (route) => { const r = await route.fetch(); route.fulfill({ response: r, json: { ...(await r.json()), safetyMode: 'live' } }); });
  await livePhone.goto(`${MOCK}/_sample/?c=8`);
  await livePhone.evaluate(() => document.querySelector('input[name=word]').after(Object.assign(document.createElement('textarea'), { name: 'idea', rows: 3, className: 'pz-input' })));
  await expect.poll(() => livePhone.evaluate(() => document.documentElement.dataset.pzSafety)).toBe('live');
  const liveNet = livePhone.locator('[data-pz=care-net]');
  await expect(liveNet).toHaveText('Kabhi bhi baat karni ho: Tele-MANAS 14416 (free, 24x7)');
  expect(await liveNet.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBe(14);
  await livePhone.screenshot({ path: path.join(SHOTS16, 'care-net-375x812.png') });
  await livePhone.close();
  // the TV never shows it, even when a long text box appears there
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${MOCK}/tv/_sample?c=8`);
  await expect(tv.locator('.tv-conn.ok')).toBeAttached();
  await tv.evaluate(() => document.body.append(document.createElement('textarea')));
  await settle(tv);
  await expect(tv.locator('[data-pz=care-net]')).toHaveCount(0);
  expect(await tv.evaluate(() => document.body.innerText)).not.toContain('14416');
  // share card: never drawn into the card
  await phone.fill('input[name=word]', 'chai aur code');
  await phone.click('button[type=submit]');
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  await phone.click('#unlock');
  await phone.click('[data-pz=gate-unlock]');
  await expect(phone.locator('#card-img')).toBeVisible();
  const cards = await phone.evaluate(() => globalThis.__pzShareCards);
  expect(JSON.stringify(cards)).not.toContain('14416');
  await ctx.close();
  await tvCtx.close();
});

test('care path: crisis text shows the support card, nothing is sent, the TV stays idle, the operator sees a quiet alert', async ({ browser, request }) => {
  const { staffToken } = await import('../../core/server/limits.js');
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await tvCtx.addCookies([{ name: 'pz_staff', value: staffToken('e2e-admin'), url: MOCK }]);
  const op = await tvCtx.newPage();
  await op.goto(`${MOCK}/tv/_sample?c=8&op=1`);
  await expect.poll(() => op.evaluate(() => window.__tv.mode)).toBe('idle');

  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(phone, sink);
  let vibeCalls = 0;
  await phone.route('**/api/_sample/vibe', (r) => { vibeCalls++; return r.continue(); });
  await phone.goto(`${MOCK}/_sample/?c=8`);
  await phone.fill('input[name=word]', 'mar jana hai');
  await phone.click('button[type=submit]');
  const card = phone.locator('[data-pz=care]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Tum akele nahi ho.');
  await expect(card).toContainText('Tele-MANAS (free, 24x7): 14416');
  await expect(card.locator('a[href="tel:14416"]')).toBeVisible();
  await expect(phone.locator('.orx')).toHaveCount(0);
  expect(vibeCalls).toBe(0);
  fs.mkdirSync(SHOTS16, { recursive: true });
  await phone.screenshot({ path: path.join(SHOTS16, 'care-card-375x812.png') });
  // operator alert, time only
  const alert = op.locator('[data-pz=care-alert]');
  await expect(alert).toBeVisible({ timeout: 8000 });
  await expect(alert).toContainText('Ek visitor ko support card dikha');
  expect(await op.evaluate(() => window.__tv.mode)).toBe('idle');
  await op.screenshot({ path: path.join(SHOTS16, 'operator-alert-1920.png') });
  await alert.locator('button').click();
  await expect(alert).toHaveCount(0, { timeout: 8000 });
  // "Wapas" restarts the experience
  await card.locator('.pz-care-back').click();
  await expect(phone.locator('#s-form')).toBeVisible();
  expect(sink.errors).toEqual([]);
  const st = await stats(request, MOCK);
  expect(st.totals._sample.care_shown).toBeGreaterThanOrEqual(1);
  await ctx.close();
  await tvCtx.close();
});

async function smallText(page) {
  return page.evaluate(() => {
    const out = [];
    const stage = document.querySelector('.tv-stage');
    const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest('.tv-help, .tv-pinbtn, .tv-flash, .tv-qr, .tv-core, svg')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      let hidden = cs.visibility === 'hidden' || r.width === 0 || r.height === 0;
      for (let a = el; a && !hidden; a = a.parentElement) { const s = getComputedStyle(a); if (s.display === 'none' || Number(s.opacity) === 0) hidden = true; }
      if (hidden) continue;
      const px = parseFloat(cs.fontSize);
      const min = el.closest('.pz-forfun') ? 24 : 22;
      if (px < min) out.push(`${el.className || el.tagName} "${n.textContent.trim().slice(0, 30)}" ${px}px`);
    }
    return out;
  });
}

for (const L of [{ w: 1920, h: 1080, q: '' }, { w: 1080, h: 1920, q: '&layout=portrait' }, { w: 1080, h: 1920, q: '&layout=portrait&capture=1' }]) {
  test(`core TV labels are at least 22px ("For fun only" 24px): idle, live and result, ${L.w}x${L.h}${L.q}`, async ({ browser, request }) => {
    const c = 50 + (L.q.length % 9);
    const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h } });
    const tv = await ctx.newPage();
    await tv.goto(`${LAB}/tv/_sample?c=${c}${L.q}`);
    await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('idle');
    await tv.evaluate(() => document.fonts.ready);
    expect(await smallText(tv), 'idle').toEqual([]);
    const sid = `lbl-${Date.now()}`;
    await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [
      { t: 'init', ts: 0, title: 'Vibe Scanner', orchestrator: { id: 'c', name: 'Vibe Conductor', role: 'Orchestrator' }, agents: [{ id: 'n', name: 'Number Agent', role: 'Word score, in code', label: 'NUMBER' }, { id: 'v', name: 'Vibe Agent', role: 'Claude call', label: 'VIBE' }] },
      { t: 'assign', ts: 5, id: 'n', task: 'Word ka number nikalo' }, { t: 'status', ts: 6, id: 'n', state: 'working' },
      { t: 'log', ts: 7, id: 'n', text: '7 letters, 4 vowels, sum 106 -> number 7' },
    ] } });
    await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('live');
    await settle(tv);
    expect(await smallText(tv), 'live').toEqual([]);
    await request.post(`${LAB}/api/core/bus/_sample/${c}`, { data: { sid, events: [{ t: 'done', ts: 9, summary: 'Vibe report ready in 1.2s' }, { t: 'result', ts: 10, payload: { kicker: 'Vibe report', title: 'Curious Builder', lines: ['Har cheez ka kaise jaanna'], forFun: true } }] } });
    await expect(tv.locator('.tv-spot.show')).toBeVisible();
    await settle(tv);
    expect(await smallText(tv), 'result').toEqual([]);
    await ctx.close();
  });
}

// ---------- CHECK_build 13: no visitor-typed text reaches a TV, a leaderboard or a share card ----------
test('typed names, slurs and phone numbers never reach the TV stream or the share card (strict by default)', async ({ browser, request }) => {
  test.setTimeout(180000); // four full phone flows in a row
  const typed = ['Priya Sharma', 'chutiya', 'Rohan from DPS', 'madarchod'];
  const c = 3;
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  await tv.goto(`${MOCK}/tv/_sample?c=${c}`);
  await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('idle');
  for (const word of typed) {
    const ctx = await browser.newContext(PHONE);
    const phone = await ctx.newPage();
    await phone.goto(`${MOCK}/_sample/?c=${c}`);
    await phone.fill('input[name=word]', word);
    await phone.click('button[type=submit]');
    await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
    await phone.click('#unlock');
    await phone.click('[data-pz=gate-unlock]');
    await expect(phone.locator('#card-img')).toBeVisible();
    const cards = await phone.evaluate(() => globalThis.__pzShareCards);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.strict).toBe(true);
      expect(card.dropped).toBe(0);
      expect(card.pt.length).toBeGreaterThanOrEqual(3); // title + lines, all publicText ids
      for (const id of card.pt) expect(id).toMatch(/^_sample\.(?:vibe:[tsl]\d|orx:cardKicker)/);
    }
    const dump = await tv.evaluate(() => window.__tv.dump());
    for (const w of [word, ...word.split(' ').filter((x) => x.length >= 3 && x.toLowerCase() !== 'from')]) expect(dump.toLowerCase()).not.toContain(w.toLowerCase());
    await ctx.close();
  }
  // a modified client sending a phone number or a name straight to the bus is dropped
  const r = await (await request.post(`${MOCK}/api/core/bus/_sample/${c}`, { data: { sid: 'evil', events: [{ t: 'result', payload: { title: 'Priya Sharma', lines: ['Hi Priya'] } }, { t: 'log', id: 'vibe', text: 'Call me at nine eight seven' }] } })).json();
  expect(r.accepted).toBe(0);
  expect(r.rejected.length).toBe(2);
  // and the server-side route never echoes the typed word anywhere public
  const api = await (await request.post(`${MOCK}/api/_sample/vibe`, { data: { word: 'Priya', subject: 'art' } })).json();
  expect(JSON.stringify(api.public)).not.toContain('Priya');
  await tvCtx.close();
});

// ---------- TASK-12: stage mode ----------
const SHOTS12 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'shots', 'TASK-12');

test('big screen: nickname pick (no text box), queue, TV shows the nickname, reward token, operator "Reward given"; anchor only after a played turn', async ({ browser, request }) => {
  const { staffToken } = await import('../../core/server/limits.js');
  const c = 4;
  fs.mkdirSync(SHOTS12, { recursive: true });
  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await tvCtx.addCookies([{ name: 'pz_staff', value: staffToken('e2e-admin'), url: MOCK }]);
  const op = await tvCtx.newPage();
  await op.goto(`${MOCK}/tv/_sample?c=${c}&op=1`);
  await expect(op.locator('[data-pz=op-queue]')).toBeVisible();
  // guest star needs the consent tick
  await op.selectOption('[data-pz=anchor-name]', 'Gaurav Taneja');
  await Promise.all([op.waitForResponse((r) => r.url().includes('/stage/anchor')), op.click('[data-pz=op-anchor]')]);
  await op.waitForResponse((r) => /\/api\/core\/ops\/_sample\/\d+$/.test(r.url())); // the next operator poll
  await expect(op.locator('[data-pz=op-pending]')).toHaveCount(0);
  await op.check('[data-pz=anchor-consent]');
  await op.click('[data-pz=op-anchor]');
  await expect(op.locator('[data-pz=op-pending]')).toContainText('Gaurav Taneja');
  // nothing about the anchor exists before a turn is played
  await op.evaluate(() => window.__stage.refresh());
  expect(await op.evaluate(() => window.__stage.panels)).not.toContain('anchor');

  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  const sink = { errors: [], external: [] };
  watch(phone, sink);
  await phone.goto(`${MOCK}/_sample/?c=${c}`);
  await phone.fill('input[name=word]', 'swift');
  await phone.click('[data-pz=bigscreen]');
  const picks = phone.locator('[data-pz=nick]');
  await expect(picks).toHaveCount(3);
  await expect(phone.locator('.pz-stage-sheet input, .pz-stage-sheet textarea')).toHaveCount(0); // no text box
  const nick = (await picks.nth(1).innerText()).trim();
  expect(nick.length).toBeLessThanOrEqual(12);
  await picks.nth(1).click();
  // a pending guest star waits for the operator (CHECK-12 WARN-B): nobody starts it by just joining
  await expect(op.locator('[data-pz=op-waiting] li')).toContainText([nick], { timeout: 10000 });
  await expect(op.locator('[data-pz=op-running]')).toContainText('On TV: nobody');
  await op.click('[data-pz=op-next]');
  // the TV shows the nickname, the game runs
  await expect(op.locator('[data-pz=tv-nick]')).toContainText(nick, { timeout: 10000 });
  await op.screenshot({ path: path.join(SHOTS12, 'tv-bigscreen-turn-1920.png') });
  await expect(phone.locator('#s-result')).toBeVisible({ timeout: 20000 });
  const token = phone.locator('[data-pz=token]');
  await expect(token).toBeVisible({ timeout: 10000 });
  await expect(phone.locator('.pz-stage-sheet')).toContainText('Counter pe dikhao');
  const code = (await token.innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  await phone.screenshot({ path: path.join(SHOTS12, 'phone-reward-token.png') });
  // the anchor card now exists: "Beat Gaurav Taneja ka score"
  await op.evaluate(() => window.__stage.refresh());
  await expect.poll(() => op.evaluate(() => window.__stage.panels)).toContain('anchor');
  // operator: types the code the visitor shows (CHECK-12 WARN-C), then "Reward given"
  const before = (await stats(request, MOCK)).totals._sample?.reward_given || 0;
  await expect(op.locator('[data-pz=op-reward]')).toBeVisible({ timeout: 8000 }); // quick button for the last token
  await op.fill('[data-pz=op-token]', 'zzzz');
  await op.click('[data-pz=op-token-give]');
  await expect(op.locator('[data-pz=op-token-note]')).toContainText('Token nahi mila');
  await op.fill('[data-pz=op-token]', code.toLowerCase());
  await op.click('[data-pz=op-token-give]');
  await expect(op.locator('[data-pz=op-token-note]')).toContainText(`Reward given: ${code}`);
  await expect(op.locator('[data-pz=op-reward]')).toHaveCount(0, { timeout: 8000 });
  expect((await stats(request, MOCK)).totals._sample.reward_given).toBe(before + 1);
  expect(await op.evaluate(() => document.querySelector('[data-pz=op-queue]').textContent)).not.toContain('null'); // CHECK-12 F3
  await op.screenshot({ path: path.join(SHOTS12, 'op-view-token-1920.png') });
  // a TV browser without the staff cookie cannot hide it (CHECK-12 F1): the channel token alone is not enough
  const plainCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const plain = await plainCtx.newPage();
  await plain.goto(`${MOCK}/tv/_sample?c=${c}`);
  await expect(plain.locator('.tv-conn.ok')).toBeAttached();
  const [denied] = await Promise.all([plain.waitForResponse((r) => r.url().includes('/tv/hide')), plain.keyboard.press('a')]);
  expect(denied.status()).toBe(403);
  await expect.poll(() => plain.evaluate(async () => { await window.__stage.refresh(); return window.__stage.panels; })).toContain('anchor');
  await plainCtx.close();
  // staff key A (on a TV paired once at /staff) hides the anchor card at once
  const tv = await tvCtx.newPage();
  await tv.goto(`${MOCK}/tv/_sample?c=${c}`);
  await expect.poll(() => tv.evaluate(async () => { await window.__stage.refresh(); return window.__stage.panels; })).toContain('anchor');
  await tv.keyboard.press('a');
  await expect.poll(() => tv.evaluate(async () => { await window.__stage.refresh(); return window.__stage.panels; })).not.toContain('anchor');
  await tv.keyboard.press('a');
  await expect.poll(() => tv.evaluate(async () => { await window.__stage.refresh(); return window.__stage.panels; })).toContain('anchor');
  expect(sink.errors).toEqual([]);
  await ctx.close();
  await tvCtx.close();
});

test('staff phone: pair with a 6-digit code at /staff (no admin key in the URL), then the all-counters safety panel shows, dismisses and chimes', async ({ browser, request }) => {
  const code = (await (await request.post(`${MOCK}/admin/pair?key=e2e-admin`)).text()).match(/data-pz="pair-code"[^>]*>(\d{6})</)[1];
  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  await phone.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; }; });
  await phone.goto(`${MOCK}/staff`);
  await phone.fill('[data-pz=staff-code]', code);
  await phone.click('[data-pz=staff-pair]');
  await expect(phone.locator('h1')).toHaveText('Staff device ready');
  expect(phone.url()).not.toContain('e2e-admin');
  fs.mkdirSync(SHOTS16, { recursive: true });
  await phone.goto(`${MOCK}/admin/alerts`);
  await expect(phone.locator('h1')).toHaveText('Alerts, every counter');
  await phone.click('[data-pz=alerts-sound]');
  await expect(phone.locator('[data-pz=alerts-sound]')).toHaveText('Sound + vibration: on');
  const before = await phone.locator('[data-pz=alert]').count();
  await request.post(`${MOCK}/api/core/care`, { data: { exp: 'jyotish', c: 2 }, headers: { cookie: `pz_sid=alerts-e2e-${Date.now()}` } });
  await request.post(`${MOCK}/api/core/care`, { data: { exp: 'shark', c: 4 }, headers: { cookie: `pz_sid=alerts-e2e2-${Date.now()}` } });
  await expect(phone.locator('[data-pz=alert]')).toHaveCount(before + 2, { timeout: 10000 });
  await expect(phone.locator('[data-pz=alert]').first()).toContainText(/Counter \d+ · /);
  await expect.poll(() => phone.evaluate(() => window.__vib.length)).toBeGreaterThan(0);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await phone.screenshot({ path: path.join(SHOTS16, 'safety-alerts-375x812.png') });
  await phone.locator('[data-pz=alert-dismiss]').first().click();
  await expect(phone.locator('[data-pz=alert]')).toHaveCount(before + 1);
  // a browser that was never paired gets the "Staff only" page
  const other = await (await browser.newContext(PHONE)).newPage();
  const r = await other.goto(`${MOCK}/admin/alerts`);
  expect(r.status()).toBe(403);
  await ctx.close();
});

test('operator view on a phone (375x812 and landscape): panels only, readable, nothing overlaps, no stage graphics', async ({ browser, request }) => {
  const { staffToken } = await import('../../core/server/limits.js');
  const c = 6;
  // a care alert and a waiting visitor so every panel has content
  await request.post(`${MOCK}/api/core/care`, { data: { exp: '_sample', c }, headers: { cookie: 'pz_sid=op-phone-care' } });
  for (const L of [{ w: 375, h: 812, tag: '375x812' }, { w: 812, h: 375, tag: 'landscape' }]) {
    const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addCookies([{ name: 'pz_staff', value: staffToken('e2e-admin'), url: MOCK }]);
    const op = await ctx.newPage();
    await op.goto(`${MOCK}/tv/_sample?c=${c}&op=1`);
    await expect(op.locator('[data-pz=op-queue]')).toBeVisible();
    await expect(op.locator('[data-pz=care-alert]')).toBeVisible({ timeout: 8000 });
    for (const sel of ['[data-pz=op-next]', '[data-pz=op-skip]', '[data-pz=op-clear]', '[data-pz=op-pin]', '[data-pz=anchor-name]', '[data-pz=anchor-consent]', '[data-pz=op-anchor]', '[data-pz=op-record]', '[data-pz=op-token]', '[data-pz=op-token-give]']) {
      await expect(op.locator(sel), `${L.tag} ${sel}`).toBeVisible();
    }
    await expect(op.locator('.tv-qr')).toBeHidden(); // no stage graphics
    await expect(op.locator('.tv-live')).toBeHidden();
    const m = await op.evaluate(() => {
      const els = [...document.querySelectorAll('.tv-op, .tv-op-queue')].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0);
      const rs = els.map((e) => e.getBoundingClientRect());
      const overlaps = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i].top < rs[j].bottom && rs[j].top < rs[i].bottom && rs[i].left < rs[j].right && rs[j].left < rs[i].right) overlaps.push([i, j]);
      const small = [...document.querySelectorAll('.tv-op *, .tv-op-queue *')].filter((e) => e.offsetParent && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((px) => px < 13);
      return { overlaps, small, scroll: document.documentElement.scrollWidth, buttons: [...document.querySelectorAll('.tv-op-btn')].map((b) => b.getBoundingClientRect().height) };
    });
    expect(m.overlaps, L.tag).toEqual([]);
    expect(m.small, L.tag).toEqual([]);
    expect(m.scroll, L.tag).toBeLessThanOrEqual(L.w);
    expect(Math.min(...m.buttons)).toBeGreaterThanOrEqual(44);
    // it still works: type a token
    await op.fill('[data-pz=op-token]', 'zzzz');
    await op.click('[data-pz=op-token-give]');
    await expect(op.locator('[data-pz=op-token-note]')).toContainText('Token nahi mila');
    await op.screenshot({ path: path.join(SHOTS12, `op-phone-${L.tag}.png`), fullPage: true });
    await ctx.close();
  }
});

for (const L of [{ w: 1920, h: 1080, q: '', tag: '1920' }, { w: 1080, h: 1920, q: '&layout=portrait', tag: 'portrait' }]) {
  test(`stage loop panels (${L.tag}): QR, counters, leaderboard, anchor, about; camera text sizes hold`, async ({ browser }) => {
    const c = 4; // the previous test played a big-screen turn and an anchor turn here
    const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h } });
    const tv = await ctx.newPage();
    await tv.goto(`${MOCK}/tv/_sample?c=${c}${L.q}`);
    await expect.poll(() => tv.evaluate(() => window.__tv.mode)).toBe('idle');
    await tv.evaluate(() => window.__stage.refresh());
    const panels = await tv.evaluate(() => window.__stage.panels);
    for (const p of ['qr', 'counters', 'board', 'about']) expect(panels).toContain(p);
    for (let i = 0; i < panels.length; i++) {
      const was = await tv.evaluate(() => document.querySelector('.tv-frame').dataset.panel);
      await tv.evaluate(() => window.__stage.rotate());
      if (panels.length > 1) await expect.poll(() => tv.evaluate(() => document.querySelector('.tv-frame').dataset.panel)).not.toBe(was);
      await settle(tv);
      const id = await tv.evaluate(() => document.querySelector('.tv-frame').dataset.panel);
      expect(await smallText(tv), `panel ${id}`).toEqual([]);
      await tv.screenshot({ path: path.join(SHOTS12, `stage-${id}-${L.tag}.png`) });
    }
    const text = await tv.locator('.tv-stage').innerText();
    expect(text).not.toMatch(/followers/i);
    await ctx.close();
  });
}
