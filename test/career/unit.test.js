// Unit tests: data display rules, jobs mapping, phone helpers, envelope, links, presign, AiSensy sender, PDF, copy rules.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fakeAiSensy } from './helpers.js';
import { phoneBundle, preview, loadData, tooltip } from '../../experiences/career/lib/data.js';
import { jobsBundle, JOBS, AGENTS_SCHEMA, cleanAgents, DOCTOR_SCHEMA, DOCTOR_BANK, doctorFromPicks } from '../../experiences/career/lib/jobs.js';
import { normalizePhone, maskPhone, phoneHash, firstName } from '../../experiences/career/lib/phone.js';
import { seal, open, publicKeyFromEnv, boxSeal, boxOpen, listKey } from '../../experiences/career/lib/envelope.js';
import { makeToken, readToken } from '../../experiences/career/lib/links.js';
import { presignGet } from '../../experiences/career/lib/store.js';
import { aisensySender, templateRequest, SendError } from '../../experiences/career/lib/aisensy.js';
import { buildPdf, pdfFileName } from '../../experiences/career/lib/pdf.js';
import { checkSchema } from '../../core/server/claude.js';

const CAREER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'experiences', 'career');
const cleanups = [];
after(async () => { for (const c of cleanups) await c(); });

test('preview: 5 areas, Growing/Changing only, every number has a source tooltip with the year, no pay', () => {
  const b = phoneBundle();
  assert.equal(b.areas.length, 5);
  for (const a of b.areas) {
    assert.ok(a.careers.length >= 1 && a.careers.length <= 3);
    for (const c of a.careers) {
      assert.ok(['Growing', 'Changing'].includes(c.badge));
      assert.equal(c.split.by_ai + c.split.with_ai + c.split.led_by_people, 100);
      assert.match(c.split.tip, /2026/);
      assert.match(c.lineTip, /2026/);
      assert.ok(c.line);
    }
  }
  const s = JSON.stringify(b);
  assert.ok(!/"pay"|"entry"|"senior"|LPA|Rs \d/.test(s), 'no pay or placement figures');
  assert.equal(b.zenith.tooltip, 'As published on zenithschool.ai');
  assert.equal(b.zenith.programmeLine, 'B.Tech in AI + mini-MBA, one KRMU degree');
  assert.deepEqual(b.zenith.usps, loadData().zenith.usps.map((u) => ({ title: u.title, lines: u.lines })), 'Zenith wording exact');
  assert.deepEqual(preview('buildings-infra').careers.map((c) => c.id), ['site-civil', 'structural', 'qs']);
});

test('jobs: 6 jobs, careers.json ids and tasks resolve, 3 skills that hold each (doctor illustrative)', () => {
  const b = jobsBundle();
  assert.deepEqual(b.map((j) => j.label), ['Marketing Manager', 'Financial Analyst', 'Product Manager', 'Software Engineer', 'Content Creator', 'Doctor']);
  const ids = Object.fromEntries(JOBS.map((j) => [j.id, j.careerId]));
  assert.deepEqual(ids, { marketing: 'marketing', finance: 'finance', product: 'product', software: 'software-engineer', creator: 'marketing', doctor: null });
  for (const j of b) {
    assert.equal(j.r1.length, 3);
    assert.equal(j.calls.length, 2);
    assert.equal(j.skills.length, 3);
    assert.deepEqual(Object.keys(j.agents), ['research', 'draft', 'analyst', 'review']);
    const tags = [...j.r1.map((t) => t.tag), ...Object.values(j.agents).map((a) => a.tag), ...j.calls.map((c) => c.tag)];
    for (const t of tags) {
      assert.ok(['Done by AI', 'Done with AI', 'Led by people'].includes(t.label));
      if (j.career) { assert.ok(Number.isInteger(t.share)); assert.match(t.tip, /2026/); }
      else { assert.equal(t.share, null); assert.equal(t.illustrative, true); }
    }
    if (j.career) for (const s of j.skills) { assert.ok(loadData().byId.get(j.career.id).skills_that_hold.includes(s.skill)); assert.ok(s.courses.length >= 1); }
  }
  const doc = b.find((j) => j.id === 'doctor');
  assert.match(doc.note, /AI assist karta hai, doctors decide karte hain/);
  assert.ok(doc.calls.every((c) => c.tag.mode === 'led_by_people'), 'the doctor decides');
});

test('fixtures: every job has fixtures matching the agents schema, no digits, no dashes', () => {
  for (const j of JOBS) {
    const arr = JSON.parse(fs.readFileSync(path.join(CAREER, 'fixtures', `agents_${j.id}.json`), 'utf8'));
    assert.ok(arr.length >= 2);
    for (const a of arr) {
      if (j.id === 'doctor') {
        // bank-only: the fixtures are id picks; they map to reviewed lines only
        assert.deepEqual(checkSchema(a, DOCTOR_SCHEMA), []);
        const d = doctorFromPicks(a);
        const bank = new Set(Object.values(DOCTOR_BANK).flatMap((b) => Object.values(b)));
        assert.ok(Object.values(d).flat().every((x) => bank.has(x)));
        continue;
      }
      assert.deepEqual(checkSchema(a, AGENTS_SCHEMA), []);
      const c = cleanAgents(a);
      assert.equal(c.research.length, 3); assert.equal(c.drafts.length, 3); assert.equal(c.call_options.length, 3);
      assert.ok(!/\d/.test(JSON.stringify(a)), `no numbers in fixture text (${j.id})`);
      assert.ok(Object.values(c).flat().every((x) => x.length <= 120));
    }
  }
});

test('phone helpers', () => {
  assert.equal(normalizePhone('+91 90000-00001'), '9000000001');
  assert.equal(normalizePhone('09000000001'), '9000000001');
  assert.equal(normalizePhone('919000000001'), '9000000001');
  assert.equal(normalizePhone('5000000001'), null);
  assert.equal(normalizePhone('900000001'), null);
  assert.equal(maskPhone('9876543210'), '+91 98xxxxx210');
  assert.equal(phoneHash('9000000001', 'x'.repeat(32)), phoneHash('9000000001', 'x'.repeat(32)));
  assert.notEqual(phoneHash('9000000001', 'x'.repeat(32)), phoneHash('9000000001', 'y'.repeat(32)));
  assert.equal(firstName('  Aarav Kumar '), 'Aarav');
  assert.equal(firstName('<b>x</b>'), 'bxb');
});

test('envelope: public key encrypts, only the private key decrypts; one-line env form parses', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const pk = publicKeyFromEnv(publicKey.trim().replace(/\n/g, '\\n'));
  const buf = seal({ whatsapp: '9000000001', first_name: 'Aarav' }, pk);
  assert.ok(!buf.toString().includes('9000000001'));
  assert.deepEqual(open(buf, crypto.createPrivateKey(privateKey)), { whatsapp: '9000000001', first_name: 'Aarav' });
  assert.throws(() => open(buf, crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey));
  const k = listKey('p'.repeat(40), 'stop-list');
  assert.deepEqual(boxOpen(boxSeal({ a: 1 }, k), k), { a: 1 });
  assert.throws(() => boxOpen(boxSeal({ a: 1 }, k), listKey('z'.repeat(40), 'stop-list')));
});

test('links: stateless 30-day token, tamper and expiry refused', () => {
  const key = 'pdfs/2026-10-27/AbCdEfGhIjKlMnOpQrStUv.pdf';
  const now = Date.parse('2026-10-27T10:00:00Z');
  const t = makeToken(key, 's'.repeat(40), { now });
  assert.deepEqual(readToken(t, 's'.repeat(40), { now }), { key });
  assert.deepEqual(readToken(t, 's'.repeat(40), { now: now + 29 * 86400e3 }), { key });
  assert.equal(readToken(t, 's'.repeat(40), { now: now + 31 * 86400e3 }), null);
  assert.equal(readToken(t, 'x'.repeat(40), { now }), null);
  assert.equal(readToken(t.replace('AbCd', 'AbCe'), 's'.repeat(40), { now }), null);
  assert.equal(readToken('../../etc', 's'.repeat(40), { now }), null);
});

test('presigned URL matches the AWS SigV4 documentation example', () => {
  const u = presignGet({ bucket: 'examplebucket', region: 'us-east-1', key: 'test.txt', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', expires: 86400, now: new Date('2013-05-24T00:00:00Z'), host: 'examplebucket.s3.amazonaws.com' });
  assert.ok(u.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
});

test('AiSensy sender: success "true" and true; http and rejected not retried; network retried once with the same body', async () => {
  const body = templateRequest({ apiKey: 'k'.repeat(24), campaign: 'Pdf student', userName: 'Career Studio', source: 'x', phone: '9000000001', params: ['Aarav', 'https://l'], media: { url: 'https://m', filename: 'Career_Forecast_Aarav.pdf' } });
  assert.deepEqual(body, { apiKey: 'k'.repeat(24), campaignName: 'Pdf student', destination: '+919000000001', userName: 'Career Studio', source: 'x', templateParams: ['Aarav', 'https://l'], media: { url: 'https://m', filename: 'Career_Forecast_Aarav.pdf' } });
  const ok = await fakeAiSensy(); cleanups.push(ok.close);
  assert.equal((await aisensySender({ url: ok.url })(body)).msgId, 'fake-1');
  const e500 = await fakeAiSensy({ mode: () => 'http500' }); cleanups.push(e500.close);
  await assert.rejects(aisensySender({ url: e500.url })(body), (e) => e instanceof SendError && e.kind === 'http' && !e.message.includes('9000000001'));
  assert.equal(e500.bodies.length, 1);
  const drop = await fakeAiSensy({ drops: 1 }); cleanups.push(drop.close);
  await aisensySender({ url: drop.url })(body);
  assert.equal(drop.bodies.length, 1);
  assert.deepEqual(drop.bodies[0].body, body);
  const hang = await fakeAiSensy({ mode: () => 'hang' }); cleanups.push(hang.close);
  await assert.rejects(aisensySender({ url: hang.url, timeoutMs: 400 })(body), (e) => e.kind === 'timeout');
  assert.equal(hang.bodies.length, 1);
});

test('PDF: 3 pages, Zenith wording, STOP line, source year, no pay, file name rule', async () => {
  const { PDFDocument } = await import('../../experiences/career/node_modules/pdf-lib/dist/pdf-lib.esm.js');
  for (const a of ['computers-coding', 'machines-making', 'electronics-chips', 'buildings-infra', 'business-managing']) {
    const buf = await buildPdf({ areaId: a, stopText: 'play.zenithschool.ai/stop' });
    const doc = await PDFDocument.load(buf);
    assert.equal(doc.getPageCount(), 3);
    assert.equal(doc.getTitle(), 'Career Forecast: Ideas 4.0');
    assert.ok(buf.length < 200000);
  }
  assert.equal(pdfFileName('Aarav'), 'Career_Forecast_Aarav.pdf');
  assert.equal(pdfFileName('आरव'), 'Career_Forecast_आरव.pdf');
  assert.equal(pdfFileName('<>'), 'Career_Forecast.pdf');
  assert.equal(tooltip('atlas_v7_1'), 'Tasks, outlook and sectors: Zenith School of AI research, 2026.');
});

test('copy rules: no em or en dashes, no guarantee or fear words, no parent fields, no competitor names in Career Studio code and copy', () => {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'data'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs|json|html|css|md)$/.test(e.name)) files.push(p); } };
  walk(CAREER);
  walk(path.dirname(fileURLToPath(import.meta.url)));
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(!/[\u2013\u2014]/.test(s), `dash in ${f}`);
    if (f.includes(`${path.sep}test${path.sep}`)) continue;
    assert.ok(!/job pakki|guaranteed job|100% placement|placement guarantee/i.test(s), `guarantee words in ${f}`);
    assert.ok(!/mummy|papa|parent_?phone|parentName/i.test(s.replace(/no parent/gi, '')), `parent field in ${f}`);
  }
});
