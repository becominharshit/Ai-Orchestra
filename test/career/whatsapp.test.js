// WhatsApp capture + PDF send, end to end against a FAKE AiSensy server. Dummy numbers only. No real API is called.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DUMMY, testKeys, fakeAiSensy, careerServer, post, postLead, playToken, lead, jobState, tmp, waitFor } from './helpers.js';
import { open } from '../../experiences/career/lib/envelope.js';

const keys = testKeys();
const cleanups = [];
after(async () => { for (const c of cleanups.reverse()) await c().catch(() => {}); });

async function setup(env = {}, { mode, drops, dataDir } = {}) {
  const fake = await fakeAiSensy({ mode, drops });
  const s = await careerServer({
    WHATSAPP_PDF_ON: 'on', AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url,
    LEADS_PUBLIC_KEY: keys.pubEnv, ...env,
  }, dataDir ? { DATA_DIR: dataDir } : {});
  cleanups.push(() => fake.close(), () => s.close());
  return { s, fake };
}
const leadFiles = (dir) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; if (fs.existsSync(path.join(dir, 'leads'))) walk(path.join(dir, 'leads')); return out; };
const priv = () => crypto.createPrivateKey(fs.readFileSync(keys.privPath, 'utf8'));
function assertNoSecretsInLogs(s, numbers, extra = []) {
  const all = s.logs.lines.join('');
  for (const n of numbers) assert.ok(!all.includes(n), 'a phone number appeared in the logs');
  for (const x of extra) assert.ok(!all.includes(x), 'a token or name appeared in the logs');
}

test('live send: exact AiSensy request (campaign, 2 values in order, document url + file name), "Bhej diya" state, link works', async () => {
  const { s, fake } = await setup({ WHATSAPP_ALLOWLIST: `${DUMMY[0]},${DUMMY[1]}` });
  const r = await postLead(s.base, lead(DUMMY[0]));
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.path, 'live');
  assert.equal(j.copy, 'Ho gaya! Tumhara forecast PDF 1 minute mein WhatsApp pe aa raha hai');
  assert.ok(!JSON.stringify(j).includes(DUMMY[0]), 'the response never echoes the number');
  const st = await jobState(s.base, j.job);
  assert.equal(st.state, 'sent');
  assert.equal(fake.bodies.length, 1);
  const { body, method, url } = fake.bodies[0];
  assert.equal(method, 'POST');
  assert.equal(url, '/campaign/t1/api/v2');
  assert.deepEqual(Object.keys(body).sort(), ['apiKey', 'campaignName', 'destination', 'media', 'source', 'templateParams', 'userName'].sort());
  assert.equal(body.apiKey, 'test-aisensy-key-000000000000');
  assert.equal(body.campaignName, 'Pdf student');
  assert.equal(body.destination, `+91${DUMMY[0]}`);
  assert.equal(body.userName, 'Career Studio', 'the name goes only into template value 1');
  assert.equal(body.templateParams.length, 2);
  assert.equal(body.templateParams[0], 'Aarav');
  assert.match(body.templateParams[1], /^https:\/\/play\.zenithschool\.ai\/p\/\d{8}\.[A-Za-z0-9_-]{16,32}\.[0-9a-z]+\.[A-Za-z0-9_-]{27}$/);
  assert.equal(body.media.filename, 'Career_Forecast_Aarav.pdf');
  assert.ok(body.media.url.startsWith('http'));
  // the link opens the PDF (local store: served directly)
  const token = body.templateParams[1].split('/p/')[1];
  const pdf = await fetch(`${s.base}/p/${token}`);
  assert.equal(pdf.headers.get('cache-control').includes('no-store'), true);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  const bad = await fetch(`${s.base}/p/${token.slice(0, -2)}xx`);
  assert.equal((await fetch(`${s.base}/api/career/p?t=${token}`)).status, 200, 'the older API form still works');
  assert.equal(bad.status, 404);
  // nothing personal in logs: number, link token, first name
  await new Promise((r) => setTimeout(r, 100));
  assertNoSecretsInLogs(s, [DUMMY[0]], [token, 'Aarav']);
  assert.ok(s.logs.lines.some((l) => l.includes('"kind":"http"')), 'the access log ran (path and status only)');
});

test('allow-list mode: a number not on the list goes to the batch, no request', async () => {
  const { s, fake } = await setup({ WHATSAPP_ALLOWLIST: DUMMY[0] });
  const j = await (await postLead(s.base, lead(DUMMY[2]))).json();
  assert.equal(j.path, 'batch');
  assert.equal(j.copy, 'Ho gaya! Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(fake.bodies.length, 0);
});

test('switch off: batch copy, no send; the admin switch turns it on at runtime and it survives a restart', async () => {
  const dataDir = tmp();
  const { s, fake } = await setup({ WHATSAPP_PDF_ON: 'off' }, { dataDir });
  const b = await (await fetch(`${s.base}/api/career/bundle`)).json();
  assert.equal(b.wa.live, false);
  const j = await (await postLead(s.base, lead(DUMMY[0]))).json();
  assert.equal(j.path, 'batch');
  assert.match(j.copy, /48 ghante/);
  assert.equal((await fetch(`${s.base}/api/career/admin/whatsapp`)).status, 403);
  const sw = await (await post(s.base, '/api/career/admin/whatsapp', { on: true }, { headers: { 'x-admin-key': 'test-admin-key' } })).json();
  assert.equal(sw.switchOn, true);
  const j2 = await (await postLead(s.base, lead(DUMMY[1]))).json();
  assert.equal(j2.path, 'live');
  await jobState(s.base, j2.job);
  assert.equal(fake.bodies.length, 1);
  await s.close();
  const again = await setup({ WHATSAPP_PDF_ON: 'off' }, { dataDir });
  const st = await (await fetch(`${again.s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(st.switchOn, true, 'runtime switch persisted in the store');
  assert.equal(st.total, 1);
});

test('max 1 send per number per 24 h, per-session cap 2, daily cap', async () => {
  const { s, fake } = await setup({ WHATSAPP_DAILY_CAP: '3' });
  const a = await (await postLead(s.base, lead(DUMMY[0]), { sid: 'sessionAAAA01' })).json();
  await jobState(s.base, a.job);
  const again = await (await postLead(s.base, lead(DUMMY[0]), { sid: 'sessionBBBB01' })).json();
  assert.equal(again.path, 'live', 'a recent number looks like any live send (no probing)');
  assert.deepEqual(Object.keys(again).sort(), Object.keys(a).sort());
  assert.equal((await jobState(s.base, again.job)).state, 'sent');
  const b = await (await postLead(s.base, lead(DUMMY[1]), { sid: 'sessionAAAA01' })).json();
  assert.equal(b.path, 'live');
  await jobState(s.base, b.job);
  const c = await (await postLead(s.base, lead(DUMMY[2]), { sid: 'sessionAAAA01' })).json();
  assert.equal(c.path, 'batch', 'third send in one session goes to the batch');
  const d = await (await postLead(s.base, lead(DUMMY[3]), { sid: 'sessionCCCC01' })).json();
  assert.equal(d.path, 'live');
  await jobState(s.base, d.job);
  const e = await (await postLead(s.base, lead(DUMMY[4]), { sid: 'sessionDDDD01' })).json();
  assert.equal(e.path, 'batch', 'over the daily cap');
  assert.equal(e.copy, 'Ho gaya! Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega');
  assert.equal(fake.bodies.length, 3);
  const st = await (await fetch(`${s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(st.today, 3);
  assert.equal(st.dailyCap, 3);
});

test('defaults: daily cap 700, total cap 2000, switch off, 2 per session, concurrency 4', async () => {
  const { readSettings } = await import('../../experiences/career/lib/settings.js');
  const st = readSettings({});
  assert.equal(st.dailyCap, 700);
  assert.equal(st.totalCap, 2000);
  assert.equal(st.pdfOn, false);
  assert.equal(st.sessionCap, 2);
  assert.equal(st.concurrency, 4);
  assert.equal(st.campaign, 'Pdf student');
  assert.equal(st.template, 'cf_pdf_student_v4');
  assert.deepEqual(st.paramOrder, ['name', 'link']);
  assert.deepEqual(readSettings({ AISENSY_PDF_STUDENT_PARAMS: 'link,name' }).paramOrder, ['link', 'name']);
  assert.throws(() => readSettings({ AISENSY_PDF_STUDENT_PARAMS: 'name,phone' }));
});

test('total cap is persisted: holds across a restart', async () => {
  const dataDir = tmp();
  const env = { WHATSAPP_TOTAL_CAP: '2' };
  const one = await setup(env, { dataDir });
  const a = await (await postLead(one.s.base, lead(DUMMY[0]), { sid: 'sess-total-1' })).json();
  await jobState(one.s.base, a.job);
  await one.s.close();
  const two = await setup(env, { dataDir });
  const b = await (await postLead(two.s.base, lead(DUMMY[1]), { sid: 'sess-total-2' })).json();
  assert.equal(b.path, 'live');
  await jobState(two.s.base, b.job);
  const c = await (await postLead(two.s.base, lead(DUMMY[2]), { sid: 'sess-total-3' })).json();
  assert.equal(c.path, 'batch');
  const counter = JSON.parse(fs.readFileSync(path.join(dataDir, 'whatsapp', 'counter.json'), 'utf8'));
  assert.equal(counter.total, 2);
  assert.deepEqual(Object.keys(counter).sort(), ['days', 'total', 'updated'], 'counts only');
});

test('failure goes to the batch path with the 48 ghante copy, and gives the reservation back', async () => {
  const { s, fake } = await setup({}, { mode: () => 'http500' });
  const j = await (await postLead(s.base, lead(DUMMY[0]))).json();
  assert.equal(j.path, 'live');
  const st = await jobState(s.base, j.job);
  assert.equal(st.state, 'batch');
  assert.equal(st.copy, 'Tumhara forecast PDF 48 ghante mein WhatsApp pe aayega');
  assert.equal(fake.bodies.length, 1, 'an http error is not retried');
  const a = await (await fetch(`${s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(a.total, 0);
  assert.equal(a.sentListSize, 0, 'not marked sent, so the batch picks it up');
});

test('rejected (success "false") and timeout: one try each; network drop is retried once', async () => {
  const r1 = await setup({}, { mode: () => 'rejected' });
  const a = await (await postLead(r1.s.base, lead(DUMMY[0]))).json();
  assert.equal((await jobState(r1.s.base, a.job)).state, 'batch');
  assert.equal(r1.fake.bodies.length, 1);
  const r2 = await setup({ AISENSY_TIMEOUT_MS: '600' }, { mode: () => 'hang' });
  const b = await (await postLead(r2.s.base, lead(DUMMY[1]))).json();
  assert.equal((await jobState(r2.s.base, b.job)).state, 'batch');
  assert.equal(r2.fake.bodies.length, 1, 'a timeout is never retried');
  const t = await (await fetch(`${r2.s.base}/api/career/admin/whatsapp?key=test-admin-key`)).json();
  assert.equal(t.total, 1, 'a timeout keeps its reservation (AiSensy may still deliver)');
  const r3 = await setup({}, { drops: 1 });
  const c = await (await postLead(r3.s.base, lead(DUMMY[2]))).json();
  assert.equal((await jobState(r3.s.base, c.job)).state, 'sent', 'no answer -> second try succeeds');
});

test('stop list: /stop blocks the live send', async () => {
  const { s, fake } = await setup();
  const r = await post(s.base, '/api/career/stop', { phone: `+91 ${DUMMY[5]}` });
  assert.equal(r.status, 200);
  const j = await (await postLead(s.base, lead(DUMMY[5]))).json();
  assert.equal(j.path, 'live', 'a stopped number gets the same answer shape as any other');
  assert.equal(j.copy, 'Ho gaya! Tumhara forecast PDF 1 minute mein WhatsApp pe aa raha hai');
  await jobState(s.base, j.job);
  assert.equal(fake.bodies.length, 0);
  const raw = fs.readFileSync(path.join(s.dataDir, 'whatsapp', 'stop.bin'));
  assert.ok(!raw.toString('latin1').includes(DUMMY[5]), 'stop list is encrypted');
  assertNoSecretsInLogs(s, [DUMMY[5]]);
});

test('capture: unticked consent and bad fields are refused; the record is encrypted, has the tags, no parent fields, and is unreadable without the private key', async () => {
  const { s } = await setup({ WHATSAPP_PDF_ON: 'off' });
  const no = await postLead(s.base, lead(DUMMY[0], { consent: false }));
  assert.equal(no.status, 400);
  assert.equal((await no.json()).field, 'consent');
  for (const [k, v] of [['phone', '12345'], ['phone', '5000000000'], ['band', 'parent'], ['area', 'x'], ['firstName', '']]) {
    const r = await postLead(s.base, lead(DUMMY[0], { [k]: v }));
    assert.equal(r.status, 400, k);
  }
  assert.equal(leadFiles(s.dataDir).length, 0, 'nothing stored for refused forms');
  const ok = await postLead(s.base, lead(DUMMY[0], { band: 'class_9_10', parentPhone: DUMMY[1], school: 'X' }));
  assert.equal(ok.status, 200);
  const files = leadFiles(s.dataDir);
  assert.equal(files.length, 1);
  assert.match(path.relative(s.dataDir, files[0]), /^leads\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]{22}\.bin$/);
  const raw = fs.readFileSync(files[0]);
  assert.ok(!raw.toString('latin1').includes(DUMMY[0]) && !raw.toString('latin1').includes('Aarav'), 'ciphertext only');
  const rec = open(raw, priv());
  assert.equal(rec.whatsapp, DUMMY[0]);
  assert.equal(rec.u18, true);
  assert.equal(rec.age_band, 'class_9_10');
  assert.equal(rec.source, 'ideas4');
  assert.equal(rec.consent_text_version, 'ideas4-wa-v1');
  assert.ok(rec.consent_ts);
  assert.ok(!Object.keys(rec).some((k) => /parent|mummy|papa|school/i.test(k)), 'no parent or school fields');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.throws(() => open(raw, other), 'a different private key cannot open it');
  // analytics: counts only
  const snap = s.analytics.snapshot();
  const c = snap.todayCounts.career;
  assert.equal(c.lead_submit, 1);
  assert.equal(c.lead_u18, 1);
  s.analytics.save();
  const af = fs.readFileSync(path.join(s.dataDir, 'analytics.json'), 'utf8');
  assert.ok(!af.includes(DUMMY[0]) && !af.includes('Aarav'));
  // the page HTML and the bundle never contain a number or a parent field
  const html = await (await fetch(`${s.base}/career/`)).text();
  assert.ok(!/parent|mummy|papa|school/i.test(html), 'no parent or school field on the page');
  assert.ok(!html.includes(DUMMY[0]));
  const bundle = await (await fetch(`${s.base}/api/career/bundle`)).text();
  assert.ok(!bundle.includes(DUMMY[0]));
  assertNoSecretsInLogs(s, [DUMMY[0], DUMMY[1]], ['Aarav']);
});

test('hero demo never saves or sends', async () => {
  const { s, fake } = await setup();
  const j = await (await postLead(s.base, lead(DUMMY[0]), { headers: { 'x-pz-demo': 'hero' } })).json();
  assert.equal(j.path, 'demo');
  assert.equal(leadFiles(s.dataDir).length, 0);
  assert.equal(fake.bodies.length, 0);
});

test('without LEADS_PUBLIC_KEY the form refuses politely and stores nothing', async () => {
  const { s } = await setup({ LEADS_PUBLIC_KEY: '' });
  const r = await postLead(s.base, lead(DUMMY[0]));
  assert.equal(r.status, 503);
  assert.equal(leadFiles(s.dataDir).length, 0);
});

test('PDF sweeper deletes PDFs older than 30 days', async () => {
  const { createWhatsApp } = await import('../../experiences/career/lib/whatsapp.js');
  const { createStore } = await import('../../experiences/career/lib/store.js');
  const { readSettings } = await import('../../experiences/career/lib/settings.js');
  const dir = tmp();
  const store = createStore({ dataDir: dir });
  await store.put('pdfs/2026-09-01/AAAAAAAAAAAAAAAAAAAAAA.pdf', Buffer.from('%PDF-old'));
  await store.put('pdfs/2026-10-27/BBBBBBBBBBBBBBBBBBBBBB.pdf', Buffer.from('%PDF-new'));
  const wa = createWhatsApp({ settings: readSettings({ PHONE_PEPPER: 'p'.repeat(40) }), store, send: async () => ({}), now: () => new Date('2026-10-28T10:00:00Z') });
  assert.equal(await wa.sweep(), 1);
  assert.deepEqual(await store.list('pdfs/'), ['pdfs/2026-10-27/BBBBBBBBBBBBBBBBBBBBBB.pdf']);
  await waitFor(() => true);
});
