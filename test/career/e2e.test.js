// Browser end to end (Playwright Chromium): phone 375x812 + counter TV, mock mode with a FAKE AiSensy (live send
// shows "Bhej diya"), and offline mode (fixtures only) for all 6 jobs. No console errors, gate holds round 2,
// share sheet gets card + ?ref=share&exp=career link, card 1080x1920, nothing personal on the TV.
//   node --test test/career/e2e.test.js            (about 2 minutes)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmp, testKeys, fakeAiSensy } from './helpers.js';
import { playFlow } from './flow.mjs';
import { localSafety, registerPublic } from '../../experiences/career/lib/public.js';

/** Bus strict mode, checked here too: the same strings core's bus checks (tvStrings in core/server/bus.js). */
function untemplated(events) {
  const safety = localSafety();
  registerPublic(safety);
  const out = [];
  const deep = (v, k) => {
    if (k === 'qr' || k === 'url' || k === 'image') return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => deep(x));
    else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) deep(x, kk);
  };
  for (const ev of events) {
    if (ev.t === 'init') { deep(ev.title); for (const a of [ev.orchestrator, ...(ev.agents || [])]) { deep(a?.name); deep(a?.role); deep(a?.label); } }
    for (const k of ['task', 'text', 'label', 'summary']) deep(ev[k]);
    if (ev.t === 'result') deep(ev.payload);
    if (ev.t === 'custom') { deep(ev.name); deep(ev.data); }
  }
  return out.filter((x) => x !== undefined && !/^-?\d+(\.\d+)?%?$/.test(x) && x !== '' && !safety.accepts(x));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const procs = [];
const cleanups = [];
after(async () => { for (const p of procs) p.kill(); for (const c of cleanups) await c().catch(() => {}); });

// PORT=0: the OS picks a free port; the real port is read from the server's start line.
async function serve(env) {
  const p = spawn(process.execPath, ['core/server/index.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, PZ_NO_DOTENV: '1', PZ_QUIET: '0', PORT: '0', PUBLIC_TEXT_STRICT: '1', DATA_DIR: tmp('pze2e'), CLAUDE_MOCK_LATENCY_MS: '300', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procs.push(p);
  const logs = [];
  p.stdout.on('data', (d) => logs.push(String(d)));
  p.stderr.on('data', (d) => logs.push(String(d)));
  const port = await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 15000); p.stdout.on('data', (d) => { const m = /play-zenith on http:\/\/localhost:(\d+)/.exec(String(d)); if (m) { clearTimeout(t); res(Number(m[1])); } }); });
  const base = `http://127.0.0.1:${port}`;
  return { base, logs, local: (u) => u.startsWith(base) || /^(blob:|data:)/.test(u) };
}

const PHONE = '9000000007';
const keys = testKeys();

test('mock mode: full Job Time Machine + forecast + WhatsApp live send against a fake AiSensy, TV mirror', async () => {
  const fake = await fakeAiSensy();
  cleanups.push(fake.close);
  const s = await serve({
    CLAUDE_MOCK: '1', WHATSAPP_PDF_ON: 'on', WHATSAPP_ALLOWLIST: PHONE, AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url,
    LEADS_PUBLIC_KEY: keys.pubEnv, PHONE_PEPPER: 'p'.repeat(40), LINK_HMAC_SECRET: 's'.repeat(40),
  });
  const r = await playFlow({ base: s.base, job: 'marketing', phoneNumber: PHONE });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.gatedBeforeUnlock, { r2: false, result: false, card: false, friends: false, story: false }, 'nothing of round 2 before "Maine follow kar liya"');
  assert.deepEqual(r.card, { w: 1080, h: 1920 });
  assert.ok(r.cards.length >= 1 && r.cards.every((c) => c.dropped === 0 && c.pt.length >= 3), `share cards built from public text only: ${JSON.stringify(r.cards)}`);
  assert.equal(r.share.url, 'https://play.zenithschool.ai/career?ref=share&exp=career');
  assert.equal(r.share.files[0].type, 'image/png');
  assert.equal(r.submitDisabledUnticked, true, 'unticked consent blocks submit');
  assert.equal(r.mask, '+91 90xxxxx007, sahi hai?');
  assert.equal(r.doneCopy, 'Ho gaya! Tumhara forecast PDF 1 minute mein WhatsApp pe aa raha hai');
  assert.ok(r.bus.length > 20, 'the phone mirrored to the TV');
  assert.deepEqual(untemplated(r.bus), [], 'every TV text is a bank line or template');
  assert.deepEqual(r.rejected, [], 'core bus in strict mode rejected nothing');
  assert.ok(r.tvHtml.includes('2030 ka marketer') || r.tvHtml.includes('Career Forecast preview'), 'the TV received the result');
  assert.ok(!s.logs.join('').includes('"kind":"public_text"'), 'no untemplated-text warning from core');
  assert.ok(!r.tvHtml.includes('Udaan bharo') && !r.tvHtml.includes('College crowd ko comfort'), 'model drafts never reach the TV');
  assert.ok(r.tvForFunPx >= 22, `TV For fun only label ${r.tvForFunPx}px`);
  assert.equal(r.tvCardBg, 'rgb(20, 16, 58)', 'opaque result card');
  assert.ok(!/2L per year/.test(r.tvHtml), 'Zenith earnings line stays off the TV');
  assert.equal(r.midTips, 3, 'every percentage on the mid screen has its source tooltip');
  assert.equal(r.sendState, 'Bhej diya');
  assert.equal(fake.bodies.length, 1);
  assert.equal(fake.bodies[0].body.destination, `+91${PHONE}`);
  assert.ok(!r.tvHtml.includes(PHONE) && !r.tvHtml.includes('Aarav'), 'TV never shows the number or the name');
  assert.ok(!r.tvHtml.includes('Fest ready, har step pe swag'), 'TV never shows typed text');
  assert.ok(!r.pageHtml.includes(PHONE), 'the number is not left in the page');
  const logs = s.logs.join('');
  assert.ok(!logs.includes(PHONE) && !logs.includes('Aarav'), 'no number or name in server logs');
  assert.ok(!/api\/career\/p\?t=/.test(logs), 'no link token in server logs');
  assert.ok(r.requests.every(s.local), 'no outside requests from the page');
  assert.ok(r.timings.total < 90000);
});

test('offline mode: all 6 jobs playable with fixture drafts, no console errors, no outside requests', async () => {
  const s = await serve({ DEMO_MODE: '1', OFFLINE: '1', LEADS_PUBLIC_KEY: keys.pubEnv, PHONE_PEPPER: 'p'.repeat(40) });
  for (const job of ['marketing', 'finance', 'product', 'software', 'creator', 'doctor']) {
    const r = await playFlow({ base: s.base, job, tv: false, forecast: job === 'doctor', phoneNumber: '9000000008' });
    assert.deepEqual(r.errors, [], job);
    assert.deepEqual(untemplated(r.bus), [], `${job}: every TV text is templated`);
    assert.deepEqual(r.rejected, [], `${job}: strict bus rejected nothing`);
    assert.deepEqual(r.card, { w: 1080, h: 1920 }, job);
    assert.ok(r.cards.every((c) => c.dropped === 0), `${job}: share card text is all public text`);
    assert.ok(r.requests.every(s.local), `${job}: no outside requests`);
    if (job === 'doctor') assert.equal(r.doneCopy, 'Ho gaya! Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega', 'offline: batch copy');
  }
});
