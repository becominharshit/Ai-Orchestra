// Drives the whole Career Studio flow in a browser (phone 375x812 + counter TV 1920x1080), takes screenshots and
// collects console errors. Used by shots.mjs (docs/shots/TASK-03) and by e2e.test.js.
//   playFlow({ base, out, job, tv: true, shots: true }) -> { errors, timings, gatedBeforeUnlock }
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function playFlow({ base, out = null, job = 'marketing', tv = true, counter = 3, portrait = false, forecast = true, phoneNumber = '9000000001' }) {
  if (out) fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const requests = [];
  const bus = []; // every event the phone sent to the TV
  const rejected = []; // bus rejections the phone was told about (TV safety / public text strict mode)
  const watch = (page, tag) => {
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); if (/rejected/i.test(m.text())) rejected.push(`${tag}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('request', (r) => { requests.push(r.url()); if (r.url().includes('/api/core/bus/') && r.method() === 'POST') { try { bus.push(...JSON.parse(r.postData()).events); } catch { /* ignore */ } } });
  };
  const shot = async (page, name) => { if (out) await page.screenshot({ path: path.join(out, `${name}.png`) }); };
  const res = { errors, requests, bus, rejected, timings: {}, gatedBeforeUnlock: null };
  try {
    let tvp = null;
    if (tv) {
      const tvCtx = await browser.newContext({ viewport: portrait ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } });
      tvp = await tvCtx.newPage();
      watch(tvp, 'tv');
      await tvp.goto(`${base}/tv/career?c=${counter}${portrait ? '&layout=portrait&capture=1' : ''}`);
      await wait(1200);
      await shot(tvp, 'tv-0-idle');
    }
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    watch(p, 'phone');
    await p.goto(`${base}/career/?c=${counter}`);
    await p.waitForSelector('#jobs .cs-job', { state: 'attached' });
    await shot(p, 'phone-01-home');

    // ---- B. Job Time Machine ----
    const t0 = Date.now();
    await p.click('#go-jtm');
    await shot(p, 'phone-02-jobs');
    await p.click(`[data-job="${job}"]`);
    for (let i = 0; i < 3; i++) {
      await p.waitForSelector('#r1-task h3');
      await wait(300);
      if (i === 0) await shot(p, 'phone-03-r1-task1');
      const input = await p.$('#r1-task input:not([disabled])');
      if (input) { await input.fill('Fest ready, har step pe swag'); await p.click('#r1-task .pz-btn'); }
      else await p.click('#r1-task .cs-opt >> nth=0');
      await wait(250);
      if (i === 1) await shot(p, 'phone-04-r1-tagged');
      if (i === 1 && tvp) await shot(tvp, 'tv-1-round1');
      await wait(1300);
    }
    await p.waitForSelector('#s-mid:not([hidden])');
    res.timings.r1 = Date.now() - t0;
    await shot(p, 'phone-05-mid');
    res.midTips = await p.$$eval('#mid-tags li .cs-i', (x) => x.length);
    await p.click('#go-r2');
    await p.waitForSelector('[data-pz="gate-unlock"]');
    // gate check: nothing of round 2 / result / share card is visible before "Maine follow kar liya"
    res.gatedBeforeUnlock = await p.evaluate(() => {
      const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; };
      return { r2: vis('#s-r2'), result: vis('#s-result'), card: vis('#res-card'), friends: vis('#res-friends'), story: vis('#res-story') };
    });
    await shot(p, 'phone-06-gate');
    await p.click('[data-pz="gate-unlock"]');
    await p.waitForSelector('#s-r2:not([hidden])');
    await wait(1600);
    await shot(p, 'phone-07-orchestra');
    if (tvp) await shot(tvp, 'tv-2-orchestra');
    for (let i = 0; i < 2; i++) {
      await p.waitForSelector(`#calls .cs-call:nth-child(${i + 1}) .cs-opt:not([disabled])`, { timeout: 30000 });
      await wait(400);
      if (i === 0) { await shot(p, 'phone-08-call1'); if (tvp) await shot(tvp, 'tv-3-agents-done'); }
      await p.click(`#calls .cs-call:nth-child(${i + 1}) .cs-opt >> nth=${i === 0 ? 2 : 1}`);
      await wait(900);
      if (i === 1 && tvp) await shot(tvp, 'tv-4-call');
    }
    await p.waitForSelector('#s-result:not([hidden])');
    await p.waitForFunction(() => document.querySelector('#res-card').src.startsWith('blob:'));
    res.timings.total = Date.now() - t0;
    await wait(600);
    await shot(p, 'phone-09-result');
    await p.evaluate(() => document.querySelector('#res-skills').scrollIntoView());
    await shot(p, 'phone-10-result-skills');
    await p.evaluate(() => document.querySelector('.cs-share').scrollIntoView());
    await shot(p, 'phone-11-share');
    res.card = await p.evaluate(() => { const i = document.querySelector('#res-card'); return { w: i.naturalWidth, h: i.naturalHeight }; });
    res.cards = await p.evaluate(() => globalThis.__pzShareCards || []);
    if (tvp) {
      await wait(2500); await shot(tvp, 'tv-5-result');
      res.tvForFunPx = await tvp.evaluate(() => { const e = document.querySelector('.cst-foot .pz-forfun'); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; });
      res.tvCardBg = await tvp.evaluate(() => { const e = document.querySelector('.cst-res'); return e ? getComputedStyle(e).backgroundColor : ''; });
    }
    // native share sheet: stub navigator.share and check what it gets
    res.share = await p.evaluate(async () => {
      let got = null;
      navigator.canShare = () => true;
      navigator.share = async (d) => { got = { text: d.text, url: d.url, files: (d.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })) }; };
      document.querySelector('#res-friends').click();
      await new Promise((r) => setTimeout(r, 300));
      return got;
    });

    if (forecast) {
      // ---- A. Forecast preview + WhatsApp capture ----
      await p.click('#res-to-fc');
      await p.waitForSelector('#s-fc:not([hidden]), #s-areas:not([hidden])');
      if (await p.isVisible('#s-areas')) { await shot(p, 'phone-12a-areas'); await p.click('#areas .cs-area >> nth=0'); }
      await p.waitForSelector('#s-fc:not([hidden])');
      await wait(500);
      await shot(p, 'phone-12-forecast');
      await p.click('#fc-cards .cs-i >> nth=0');
      await wait(200);
      await shot(p, 'phone-13-tooltip');
      if (tvp) { await wait(1500); await shot(tvp, 'tv-6-forecast'); }
      await p.evaluate(() => document.querySelector('.cs-cta').scrollIntoView());
      await shot(p, 'phone-14-cta');
      await p.click('#fc-wa');
      await p.waitForSelector('#s-wa:not([hidden])');
      res.submitDisabledUnticked = await p.$eval('#wa-submit', (b) => b.disabled);
      await p.fill('input[name=firstName]', 'Aarav');
      await p.fill('input[name=phone]', phoneNumber);
      await p.selectOption('#wa-band', 'class_11_12');
      await shot(p, 'phone-15-wa-form');
      await p.check('#wa-consent');
      await p.click('#wa-submit');
      await p.waitForSelector('#s-wa-confirm:not([hidden])');
      res.mask = await p.textContent('#wa-mask');
      await shot(p, 'phone-16-wa-confirm');
      await p.click('#wa-yes');
      await p.waitForSelector('#s-wa-done:not([hidden])');
      await wait(400);
      await shot(p, 'phone-17-wa-done');
      // wait for the END state (sent, or the batch copy), polling up to 30 s: no fixed delay (slow under load)
      await p.waitForFunction(() => { const st = document.querySelector('#wa-state'); return st.hidden || document.querySelector('#wa-state-text').textContent === 'Bhej diya'; }, null, { timeout: 30000, polling: 200 });
      res.doneCopy = await p.textContent('#wa-copy');
      res.sendState = await p.evaluate(() => (document.querySelector('#wa-state').hidden ? null : document.querySelector('#wa-state-text').textContent));
      await shot(p, 'phone-18-wa-state');
      res.pageHtml = await p.content();
    }
    if (tvp) res.tvHtml = await tvp.content();
  } finally {
    await browser.close();
  }
  return res;
}
