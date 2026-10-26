// Ops scripts on dummy data: keygen, export (Meritto CSV), purge (by date, u18), batch (dry run, caps shared with the
// live counter, stop list, already-sent). Everything against a local store and a FAKE AiSensy.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DUMMY, tmp, fakeAiSensy } from './helpers.js';
import { createStore } from '../../experiences/career/lib/store.js';
import { createLedger } from '../../experiences/career/lib/ledger.js';
import { buildRecord, saveLead, AGE_BANDS } from '../../experiences/career/lib/leads.js';
import { phoneHash } from '../../experiences/career/lib/phone.js';
import { aisensySender } from '../../experiences/career/lib/aisensy.js';

const OPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'experiences', 'career', 'ops');
const PEPPER = 'q'.repeat(40);
const cleanups = [];
after(async () => { for (const c of cleanups) await c().catch(() => {}); });

function keys() {
  const dir = tmp('pzk');
  const out = execFileSync(process.execPath, [path.join(OPS, 'leads-keygen.mjs'), '--dir', dir], { encoding: 'utf8' });
  return { dir, out, priv: path.join(dir, 'play-leads-private.pem'), pub: fs.readFileSync(path.join(dir, 'play-leads-public.pem'), 'utf8') };
}
const band = (id) => AGE_BANDS.find((b) => b.id === id);
async function seed(dataDir, pub, rows) {
  const store = createStore({ dataDir });
  for (const r of rows) await saveLead(store, buildRecord({ first: r.first || 'Diya', phone: r.phone, band: band(r.band || 'college'), area: 'business-managing' }, { now: r.now || new Date(), waPath: 'batch' }), crypto.createPublicKey(pub), r.now || new Date());
  return store;
}

test('keygen: private key 0600, only the public key printed, refuses to overwrite', () => {
  const k = keys();
  assert.equal(fs.statSync(k.priv).mode & 0o777, 0o600);
  assert.match(k.out, /BEGIN PUBLIC KEY/);
  assert.ok(!/PRIVATE KEY-----/.test(k.out.replace(/play-leads-private\.pem/g, '')), 'private key never printed');
  assert.throws(() => execFileSync(process.execPath, [path.join(OPS, 'leads-keygen.mjs'), '--dir', k.dir], { stdio: 'pipe' }));
});

test('export: Meritto CSV with u18, consent and whatsapp_sent; stop list left out; duplicates merged; no number printed', async () => {
  const k = keys();
  const dataDir = tmp();
  const store = await seed(dataDir, k.pub, [
    { phone: DUMMY[0], band: 'class_9_10', now: new Date('2026-10-27T05:00:00Z') },
    { phone: DUMMY[0], band: 'class_9_10', first: 'Diya', now: new Date('2026-10-27T06:00:00Z') },
    { phone: DUMMY[1], band: 'college', now: new Date('2026-10-27T07:00:00Z') },
    { phone: DUMMY[2], band: 'class_11_12', now: new Date('2026-10-28T07:00:00Z') },
  ]);
  const ledger = createLedger({ store, pepper: PEPPER });
  await ledger.markSent(phoneHash(DUMMY[1], PEPPER));
  await ledger.addStop(phoneHash(DUMMY[2], PEPPER));
  process.env.PHONE_PEPPER = PEPPER;
  process.env.PZ_NO_DOTENV = '1';
  const { exportLeads } = await import('../../experiences/career/ops/leads-export.mjs');
  const said = [];
  const outFile = path.join(tmp(), 'leads.csv');
  const r = await exportLeads(['--local', dataDir, '--key', k.priv, '--out', outFile], (l) => said.push(l));
  assert.equal(r.rows, 2);
  assert.equal(r.stopped, 1);
  assert.equal(fs.statSync(outFile).mode & 0o777, 0o600);
  const csv = fs.readFileSync(outFile, 'utf8').trim().split('\n');
  assert.equal(csv[0], 'first_name,mobile,country_code,source,age_band,u18,interest_area,consent_ts,consent_text_version,whatsapp_sent,created_at');
  const rows = csv.slice(1).map((l) => l.split(','));
  const a = rows.find((x) => x[1] === DUMMY[0]);
  assert.equal(a[5], 'true');
  assert.equal(a[3], 'ideas4');
  assert.equal(a[9], 'no');
  assert.equal(a[7], '2026-10-27T06:00:00.000Z', 'latest record wins');
  assert.equal(rows.find((x) => x[1] === DUMMY[1])[9], 'yes');
  assert.ok(!rows.some((x) => x[1] === DUMMY[2]), 'stopped number not exported');
  assert.ok(!said.join(' ').includes(DUMMY[0]));
});

test('purge: dry run by default, by date, all u18 records', async () => {
  const k = keys();
  const dataDir = tmp();
  const store = await seed(dataDir, k.pub, [
    { phone: DUMMY[0], band: 'class_9_10', now: new Date('2026-10-27T05:00:00Z') },
    { phone: DUMMY[1], band: 'college', now: new Date('2026-10-27T06:00:00Z') },
    { phone: DUMMY[2], band: 'dropper', now: new Date('2026-10-28T06:00:00Z') },
    { phone: DUMMY[3], band: 'college', now: new Date('2026-10-28T07:00:00Z') },
  ]);
  const { purge } = await import('../../experiences/career/ops/leads-purge.mjs');
  const quiet = () => {};
  assert.deepEqual(await purge(['--local', dataDir, '--u18', '--key', k.priv], quiet), { would: 2, deleted: 0 });
  assert.equal((await store.list('leads/')).length, 4);
  assert.deepEqual(await purge(['--local', dataDir, '--u18', '--key', k.priv, '--run'], quiet), { would: 2, deleted: 2 });
  assert.equal((await store.list('leads/')).length, 2);
  assert.deepEqual(await purge(['--local', dataDir, '--date', '2026-10-28', '--run'], quiet), { would: 1, deleted: 1 });
  assert.deepEqual(await store.list('leads/2026-10-28/'), []);
  await assert.rejects(purge(['--local', dataDir], quiet));
});

test('batch: dry run sends nothing; real run skips sent and stopped numbers, uses the same campaign, 1 per number, and the total cap shared with live sends', async () => {
  const k = keys();
  const dataDir = tmp();
  const store = await seed(dataDir, k.pub, [
    { phone: DUMMY[0], first: 'Kabir' }, { phone: DUMMY[0], first: 'Kabir' }, { phone: DUMMY[1] }, { phone: DUMMY[2] }, { phone: DUMMY[3] }, { phone: DUMMY[4] },
  ]);
  const ledger = createLedger({ store, pepper: PEPPER });
  await ledger.markSent(phoneHash(DUMMY[1], PEPPER)); // went out live already
  await ledger.addStop(phoneHash(DUMMY[2], PEPPER));
  // the live server already used 1 of a total cap of 3
  assert.equal(await ledger.reserve({ dailyCap: 700, totalCap: 3 }), null);
  const fake = await fakeAiSensy();
  cleanups.push(() => fake.close());
  Object.assign(process.env, { PZ_NO_DOTENV: '1', PHONE_PEPPER: PEPPER, LINK_HMAC_SECRET: 'l'.repeat(40), AISENSY_API_KEY: 'test-aisensy-key-000000000000', AISENSY_API_URL: fake.url, WHATSAPP_TOTAL_CAP: '3', WHATSAPP_DAILY_CAP: '700' });
  delete process.env.WHATSAPP_ALLOWLIST;
  const { batch } = await import('../../experiences/career/ops/whatsapp-batch.mjs');
  const said = [];
  const dry = await batch(['--local', dataDir, '--key', k.priv], { out: (l) => said.push(l), gapMs: 0 });
  assert.equal(dry.dry, true);
  assert.equal(dry.toSend, 3);
  assert.equal(dry.alreadySent, 1);
  assert.equal(dry.stopped, 1);
  assert.equal(fake.bodies.length, 0, 'dry run sends nothing');
  const real = await batch(['--local', dataDir, '--key', k.priv, '--send'], { out: (l) => said.push(l), gapMs: 0, sender: aisensySender({ url: fake.url, timeoutMs: 2000 }) });
  assert.equal(real.sent, 2, 'stopped at the shared total cap of 3 (1 live + 2 batch)');
  assert.equal(fake.bodies.length, 2);
  assert.ok(fake.bodies.every((b) => b.body.campaignName === 'Pdf student' && b.body.templateParams.length === 2 && b.body.media.filename.startsWith('Career_Forecast_')));
  assert.equal(new Set(fake.bodies.map((b) => b.body.destination)).size, 2, 'one message per number');
  assert.ok(!fake.bodies.some((b) => [DUMMY[1], DUMMY[2]].some((n) => b.body.destination.endsWith(n))));
  assert.equal((await ledger.counter()).total, 3);
  assert.ok(!said.join('\n').includes(DUMMY[0]), 'only masked numbers in the summary');
  // a second run: everything left is over the cap, nothing sent
  const again = await batch(['--local', dataDir, '--key', k.priv, '--send'], { out: () => {}, gapMs: 0, sender: aisensySender({ url: fake.url, timeoutMs: 2000 }) });
  assert.equal(again.sent, 0);
  assert.equal(fake.bodies.length, 2);
});

test('data copy: every copied file matches the SHA-256 recorded in COPIED_FROM.md (no file outside the repo is read)', () => {
  // The byte-for-byte comparison with the Lead Magnet source is ops/check-data.mjs (run on the Mac); the test stays inside the repo.
  const dir = path.join(OPS, '..', 'data', 'cf_data_v60');
  const note = fs.readFileSync(path.join(dir, 'COPIED_FROM.md'), 'utf8');
  for (const f of ['careers.json', 'interest_map.json', 'sources.json', 'zenith.json']) {
    const want = new RegExp(`- ${f.replace('.', '\\.')} ([0-9a-f]{64})`).exec(note)?.[1];
    assert.ok(want, `hash for ${f} in COPIED_FROM.md`);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'), want, f);
  }
});
