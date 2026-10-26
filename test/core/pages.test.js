// Public pages /<letter>/:code (CONTRACT 14, TASK-20): registration rules, typed slots, noindex, expiry, report, strict render check.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, json, tmpDir } from './helpers.js';
import { createPages, textNodes } from '../../core/server/pages.js';
import { createSafety } from '../../core/server/safety.js';
import { makeConfig } from '../../core/server/config.js';
import { staffToken } from '../../core/server/limits.js';

const servers = [];
after(async () => { for (const s of servers) await s.close().catch(() => {}); });

const TEMPLATE = `<main class="site" style="--brand: {{color}}">
  <p class="kicker">Ek nayi startup</p>
  <h1>{{name}}</h1>
  <p class="tag">{{tagline}}</p>
  <div class="logo">{{logo}}</div>
  <ul><li>{{f1}}</li><li>{{f2}}</li></ul>
  <p class="price">Price: Rs {{price}} per month</p>
  <p class="area">Problem: {{area}}</p>
</main>`;
const SERVER = `export default function register({ app, safety, publicPage }) {
  safety.bank('names', { a: 'ChaiChain', b: 'NotesNinja' });
  safety.bank('tags', { a: 'Hostel ka khana, ek tap mein', b: 'Exam ki taiyari, bina tension' });
  safety.bank('feat', { a: 'Live order tracking', b: 'Roz ka menu', c: 'Group order' });
  safety.list('areas', ['hostel food', 'exam stress']);
  const site = publicPage({ prefix: 's', template: 'web/site.html', css: 'site.css', ttlDays: 7, title: 'name', description: 'tagline',
    slots: { name: 'text', tagline: 'text', f1: 'text', f2: 'text', price: 'int:0..9999', area: 'list:areas', color: 'color', logo: 'svg' },
    svgs: { cup: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' } });
  app.post('/make', (req, res) => res.json(site.create(req, req.body || {}, req.body?.expiresAt ? { expiresAt: req.body.expiresAt } : {})));
  app.get('/peek/:code', (req, res) => res.json(site.get(req.params.code)));
}`;
function expDir(files = {}) {
  const dir = tmpDir('pz-pages-');
  fs.mkdirSync(path.join(dir, 'zz_site', 'web'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zz_site', 'server.js'), files.server || SERVER);
  fs.writeFileSync(path.join(dir, 'zz_site', 'web', 'site.html'), files.template || TEMPLATE);
  fs.writeFileSync(path.join(dir, 'zz_site', 'web', 'site.css'), '.site { color: var(--brand); }');
  return dir;
}
const GOOD = { name: 'ChaiChain', tagline: 'Hostel ka khana, ek tap mein', f1: 'Live order tracking', f2: 'Group order', price: 49, area: 'hostel food', color: '#FF8FC0', logo: 'cup' };

test('public page: create from server code with typed slots, serve /s/:code with noindex, self-only CSP, footer and Report; free text refused', async () => {
  const logs = [];
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k' }, { expDir: expDir(), log: (o) => logs.push(o) });
  servers.push(s);
  const bad = await (await json(s.base, '/api/zz_site/make', { ...GOOD, name: 'Rahul Sharma ki company' })).json();
  assert.deepEqual(bad, { ok: false, reason: 'bad_slot', slot: 'name' }, 'visitor text is never a page slot');
  for (const [slot, v] of [['price', 99999], ['area', 'pocket money'], ['color', 'red;background:url(x)'], ['logo', '<svg onload=x>'], ['f1', 'tu chutiya hai']]) {
    assert.equal((await (await json(s.base, '/api/zz_site/make', { ...GOOD, [slot]: v })).json()).slot, slot, slot);
  }
  const made = await (await json(s.base, '/api/zz_site/make', GOOD, { 'x-pz-counter': '2' })).json();
  assert.equal(made.ok, true);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(made.path, `/s/${made.code}`);
  const r = await fetch(`${s.base}/s/${made.code}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  const html = await r.text();
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<title>ChaiChain<\/title>/);
  assert.match(html, /<h1>ChaiChain<\/h1>/);
  assert.match(html, /--brand: #ff8fc0/);
  assert.match(html, /Price: Rs 49 per month/);
  assert.match(html, /<circle/);
  assert.match(html, /Made at Zenith School of AI · Ideas 4\.0/);
  assert.match(html, new RegExp(`action="/s/${made.code}/report"`));
  assert.match(html, /href="\/zz_site\/site\.css"/);
  assert.equal((await fetch(`${s.base}/s/${made.code.toLowerCase()}`)).status, 200, 'codes are case-insensitive');
  assert.deepEqual((await (await fetch(`${s.base}/api/zz_site/peek/${made.code}`)).json()).values.name, 'ChaiChain');
  // unknown code: 404, no-store, noindex
  const nf = await fetch(`${s.base}/s/ABCDEF`);
  assert.equal(nf.status, 404);
  assert.equal(nf.headers.get('cache-control'), 'no-store');
  assert.match(nf.headers.get('x-robots-tag'), /noindex/);
  assert.equal((await fetch(`${s.base}/s/../../etc`)).status, 404);
  assert.equal((await fetch(`${s.base}/q/${made.code}`)).status, 404, 'an unregistered letter is not a page family');
  // page paths never reach the log
  assert.ok(!JSON.stringify(logs).includes(made.code));
});

test('public page: expiry (410, no-store), Report raises a staff alert (page path only), staff can take it down, pages survive a restart', async () => {
  const dir = expDir();
  const dataDir = tmpDir('pz-pages-data-');
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', DATA_DIR: dataDir }, { expDir: dir });
  servers.push(s);
  const soon = await (await json(s.base, '/api/zz_site/make', { ...GOOD, expiresAt: new Date(Date.now() + 300).toISOString() })).json();
  assert.equal(soon.ok, true);
  await new Promise((r) => setTimeout(r, 400));
  const gone = await fetch(`${s.base}/s/${soon.code}`);
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get('cache-control'), 'no-store');
  const made = await (await json(s.base, '/api/zz_site/make', GOOD, { 'x-pz-counter': '2' })).json();
  assert.ok(new Date(made.expiresAt).getTime() <= Date.now() + 7 * 86400000 + 1000, 'at most ttlDays (7)');
  // Report: a form post from the page
  const rep = await fetch(`${s.base}/s/${made.code}/report`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
  assert.equal(rep.status, 200);
  assert.match(await rep.text(), /Shukriya/);
  const staff = { cookie: `pz_staff=${staffToken('k')}` };
  const { alerts } = await (await fetch(`${s.base}/api/core/ops/alerts`, { headers: staff })).json();
  const a = alerts.find((x) => x.kind === 'report');
  assert.deepEqual({ exp: a.exp, c: a.c, ref: a.ref }, { exp: 'zz_site', c: 0, ref: `/s/${made.code}` }); // zz_site has no counters in the map, so the creator's header is ignored
  assert.deepEqual(Object.keys(a).sort(), ['at', 'c', 'exp', 'id', 'kind', 'name', 'ref']);
  for (let i = 0; i < 8; i++) await fetch(`${s.base}/s/${made.code}/report`, { method: 'POST' });
  assert.equal((await (await fetch(`${s.base}/api/core/ops/alerts`, { headers: staff })).json()).alerts.filter((x) => x.kind === 'report').length, 1, 'one alert per page per minute, reports rate limited');
  // take down: staff only
  assert.equal((await fetch(`${s.base}/api/core/ops/pages/s/${made.code}/remove`, { method: 'POST' })).status, 403);
  const keep = await (await json(s.base, '/api/zz_site/make', GOOD)).json();
  assert.equal((await fetch(`${s.base}/api/core/ops/pages/s/${made.code}/remove`, { method: 'POST', headers: staff })).status, 200);
  assert.equal((await fetch(`${s.base}/s/${made.code}`)).status, 404);
  // restart: the store persists
  await s.close();
  const s2 = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', DATA_DIR: dataDir }, { expDir: dir });
  servers.push(s2);
  assert.equal((await fetch(`${s2.base}/s/${keep.code}`)).status, 200);
  assert.equal((await fetch(`${s2.base}/s/${made.code}`)).status, 404, 'a removed page stays removed');
});

test('public page registration refuses scripts, handlers, text slots inside tags, reserved or taken letters, and template text that fails the copy rules', async () => {
  const config = makeConfig({ DATA_DIR: tmpDir('pz-pages-reg-') });
  const safety = createSafety({ config, claude: null });
  const pages = createPages({ config, safety });
  const dir = tmpDir('pz-pages-tpl-');
  const tpl = (name, html) => { fs.writeFileSync(path.join(dir, name), html); return name; };
  const reg = (spec) => () => pages.register('zz', dir, spec);
  assert.throws(reg({ prefix: 'p', template: tpl('a.html', '<p>x</p>') }), /reserved/);
  assert.throws(reg({ prefix: 'ab', template: 'a.html' }), /one lowercase letter/);
  assert.throws(reg({ prefix: 's', template: tpl('b.html', '<p>hi</p><script>alert(1)</script>') }), /no scripts/);
  assert.throws(reg({ prefix: 's', template: tpl('c.html', '<p onclick="x()">hi</p>') }), /no scripts/);
  assert.throws(reg({ prefix: 's', template: tpl('d.html', '<a title="{{name}}">hi</a>'), slots: { name: 'text' } }), /cannot sit inside a tag/);
  assert.throws(reg({ prefix: 's', template: tpl('e.html', '<p>{{name}}</p>'), slots: {} }), /has no slot type/);
  assert.throws(reg({ prefix: 's', template: tpl('f.html', `<p>Best startup ${String.fromCharCode(0x2014)} ever</p>`) }), /copy rules/);
  assert.throws(reg({ prefix: 's', template: tpl('g.html', '<p>Directed and tested by students</p>') }), /copy rules/);
  assert.throws(reg({ prefix: 's', template: '../../etc/passwd' }), /not found/);
  assert.throws(reg({ prefix: 's', template: tpl('h.html', '<p>{{x}}</p>'), slots: { x: 'free' } }), /unknown type/);
  assert.throws(reg({ prefix: 's', template: tpl('i.html', '<p>{{l}}</p>'), slots: { l: 'svg' }, svgs: { a: '<svg><script>x</script></svg>' } }), /plain inline/);
  const ok = pages.register('zz', dir, { prefix: 's', template: tpl('ok.html', '<p>Hello {{n}}</p>'), slots: { n: 'int:0..9' } });
  assert.equal(ok.prefix, 's');
  assert.throws(() => pages.register('yy', dir, { prefix: 's', template: 'ok.html', slots: { n: 'int:0..9' } }), /already taken by zz/);
  pages.stop();
});

test('strict render check: a stored value that is not template text or a validated value is never served', () => {
  const config = makeConfig({ DATA_DIR: tmpDir('pz-pages-strict-') });
  const safety = createSafety({ config, claude: null });
  safety.bank('zz', 'n', { a: 'NotesNinja' });
  const pages = createPages({ config, safety });
  const dir = tmpDir('pz-pages-tpl2-');
  fs.writeFileSync(path.join(dir, 't.html'), '<h1>{{name}}</h1><p>Made for students</p>');
  const h = pages.register('zz', dir, { prefix: 's', template: 't.html', slots: { name: 'text' } });
  const made = h.create({}, { name: 'NotesNinja' });
  assert.equal(made.ok, true);
  const p = pages.find('s', made.code);
  assert.match(pages.render(p), /<h1>NotesNinja<\/h1>/);
  p.values.name = 'Rahul Sharma DPS Noida'; // a tampered store
  assert.equal(pages.render(p), null, 'values are validated again at render time');
  p.values.name = 'NotesNinja';
  // a template edited at runtime with new text is refused
  pages.families.get('s').spec.template = '<h1>{{name}}</h1><p>Call 9876543210 now</p>';
  assert.equal(pages.render(p), null);
  assert.equal(pages.stats().refusedRender, 2);
  assert.deepEqual(textNodes('<p>a <b>b</b></p><style>.x{}</style><!-- c -->'), ['a', 'b']);
  pages.stop();
});

// ---------- CHECK-20 round 2 ----------
test('CHECK-20 F1: every stored field is validated; a tampered pages.json entry is a clean 404 (or 410), never a 500 or a served page', async () => {
  const dir = expDir();
  const dataDir = tmpDir('pz-pages-tamper-');
  let s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', DATA_DIR: dataDir }, { expDir: dir });
  servers.push(s);
  const made = await (await json(s.base, '/api/zz_site/make', GOOD)).json();
  await s.close();
  const file = path.join(dataDir, 'pages.json');
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = db[`s:${made.code}`];
  const tamper = {
    TB2222: { ...base, code: 'AAAAAA/report"></form><h2>Call Rahul 9876543210</h2><form action="x' },
    TB3333: { ...base, code: 'TB3333', expiresAt: 8.64e15 },
    TB4444: { ...base, code: 'TB4444', expiresAt: 'soon' },
    TB5555: { ...base, code: 'TB5555', prefix: 'q' },
    TB6666: { ...base, code: 'TB6666', exp: 'jyotish' },
    TB7777: { ...base, code: 'TB7777', createdAt: Date.now() + 86400000, expiresAt: Date.now() + 2 * 86400000 },
    TB8888: { ...base, code: 'TB8888', c: 3.7 },
    TB9999: { ...base, code: 'TB9999', values: { ...base.values, name: 'Rahul Sharma 9876543210' } },
    TC2222: { ...base, code: 'TC2222', createdAt: Date.now() - 3 * 86400000, expiresAt: Date.now() - 1000 },
  };
  for (const [k, v] of Object.entries(tamper)) db[`s:${k}`] = v;
  fs.writeFileSync(file, JSON.stringify(db));
  s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k', DATA_DIR: dataDir }, { expDir: dir });
  servers.push(s);
  for (const k of Object.keys(tamper)) {
    const r = await fetch(`${s.base}/s/${k}`);
    const t = await r.text();
    assert.equal(r.status, k === 'TC2222' ? 410 : 404, k);
    assert.equal(r.headers.get('cache-control'), 'no-store', k);
    assert.ok(!/Rahul|<h2>/.test(t), `${k}: nothing injected`);
  }
  assert.equal((await fetch(`${s.base}/s/${made.code}`)).status, 200, 'the untouched page still works');
  // reports on bad, expired or removed pages raise nothing
  for (const k of ['TB2222', 'TC2222']) assert.equal((await fetch(`${s.base}/s/${k}/report`, { method: 'POST' })).status, 404);
});

test('CHECK-20 F3: text slots never take a phone number or any 5+ digit run; short numbers inside bank lines are fine; pure-digit template text is allowed', async () => {
  const server = SERVER.replace("safety.bank('tags', {", "safety.bank('tags', { n: 'Pehle 1000 customers ka plan', ph: 'Call 98765 43210 now', z: '12345', ")
    .replace("safety.bank('names', {", "safety.bank('names', { digits: '9876543210', ");
  const s = await startServer({ CLAUDE_MOCK: '1' }, { expDir: expDir({ server, template: TEMPLATE.replace('<p class="kicker">Ek nayi startup</p>', '<p class="kicker">Ek nayi startup</p><p class="yr">2026</p>') }) });
  servers.push(s);
  for (const v of ['9876543210', '919876543210', '98765 43210', '98-765-43210', 'Call 98765 43210 now', '12345']) {
    for (const slot of ['name', 'tagline']) assert.equal((await (await json(s.base, '/api/zz_site/make', { ...GOOD, [slot]: v })).json()).reason, 'bad_slot', `${slot}=${v}`);
  }
  const ok = await (await json(s.base, '/api/zz_site/make', { ...GOOD, tagline: 'Pehle 1000 customers ka plan' })).json();
  assert.equal(ok.ok, true, 'a 4-digit number inside a bank line is fine');
  const html = await (await fetch(`${s.base}/s/${ok.code}`)).text();
  assert.match(html, /<p class="yr">2026<\/p>/, 'pure-digit static template text renders');
});

test('CHECK-20 F2: report alerts have their own bucket (care alerts are never pushed out); the page counter is one of the experience\'s own counters', async () => {
  const config = makeConfig({ DATA_DIR: tmpDir('pz-pages-f2-') });
  const safety = createSafety({ config, claude: null });
  safety.raise('shark', 3, 'care-1');
  for (let i = 0; i < 60; i++) safety.raise('shark', 3, `report:${i}`, 'report', `/s/AAAA${String(i).padStart(2, '0')}`.slice(0, 9));
  const all = safety.alertsFor('shark', 3);
  assert.equal(all.filter((a) => a.kind === 'care').length, 1, 'the care alert survives 60 reports');
  assert.equal(all.filter((a) => a.kind === 'report').length, 60, 'reports keep their own list (last 200 pages)');
  safety.raise('shark', 3, 'report:again', 'report', '/s/AAAA00');
  assert.equal(safety.alertsFor('shark', 3).filter((a) => a.kind === 'report').length, 60, 'a repeat report of the same page refreshes its entry (N16)');
  assert.equal(safety.allAlerts().filter((a) => a.kind === 'care').length, 1);
  // counter validation: the creator's header only if it is one of the experience's counters (map v4: shark = 3)
  const pages = createPages({ config, safety });
  const dir = tmpDir('pz-pages-f2-tpl-');
  fs.writeFileSync(path.join(dir, 't.html'), '<h1>{{n}}</h1>');
  const h = pages.register('shark', dir, { prefix: 's', template: 't.html', slots: { n: 'int:0..9' } });
  const cOf = (hdr) => pages.find('s', h.create({ headers: { 'x-pz-counter': hdr } }, { n: 1 }).code).c;
  assert.equal(cOf('3'), 3);
  assert.equal(cOf('4'), 3, 'not a shark counter: the experience\'s own counter');
  assert.equal(cOf('3.7'), 3);
  assert.equal(cOf('99'), 3);
  pages.stop();
});

test('CHECK-20 notes: guessing codes is rate limited (30 not-found per IP per 10 min); template authors cannot add meta, iframes, forms, entity-encoded scripts or unquoted attribute slots; date slots take YYYY-MM-DD only', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1' }, { expDir: expDir() });
  servers.push(s);
  const statuses = [];
  for (let i = 0; i < 32; i++) statuses.push((await fetch(`${s.base}/s/ABCD${String(i).padStart(2, '0')}`.replace(/\d\d$/, (d) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Number(d)] + 'Q'), { headers: { 'x-forwarded-for': '10.20.30.40' } })).status);
  assert.equal(statuses.filter((x) => x === 404).length, 30);
  assert.equal(statuses.at(-1), 429);
  const config = makeConfig({ DATA_DIR: tmpDir('pz-pages-n4-') });
  const safety = createSafety({ config, claude: null });
  const pages = createPages({ config, safety });
  const dir = tmpDir('pz-pages-n4-tpl-');
  const reg = (html, slots = { name: 'text', plan: 'enum:basic|pro' }) => { fs.writeFileSync(path.join(dir, 'x.html'), html); return () => pages.register('zz', dir, { prefix: 's', template: 'x.html', slots }); };
  assert.throws(reg('<a title="a>b {{name}}">x</a>'), /cannot sit inside a tag/);
  assert.throws(reg('<style>.x{content:"{{name}}"}</style>'), /cannot sit inside <style>/);
  assert.throws(reg('<a href="java&#115;cript:alert(1)">x</a>', {}), /no scripts/);
  assert.throws(reg('<meta http-equiv="refresh" content="0;url=https://evil.example">', {}), /no meta/);
  assert.throws(reg('<iframe srcdoc="x"></iframe>', {}), /no meta/);
  assert.throws(reg('<div class={{plan}}>x</div>'), /quoted attribute value/);
  pages.stop();
  const p2 = createPages({ config, safety });
  fs.writeFileSync(path.join(dir, 'd.html'), '<p>{{day}}</p>');
  const h = p2.register('zz', dir, { prefix: 's', template: 'd.html', slots: { day: 'date' } });
  assert.equal(h.create({}, { day: 'Rahul 2026' }).reason, 'bad_slot');
  assert.equal(h.create({}, { day: '2026-02-30' }).reason, 'bad_slot');
  const ok = h.create({}, { day: '2026-10-30' });
  assert.equal(p2.find('s', ok.code).values.day, '2026-10-30');
  p2.stop();
});

test('N18: the rendered page never shows a run of 5+ digits, whatever slots produced it (three adjacent int slots)', () => {
  const config = makeConfig({ DATA_DIR: tmpDir('pz-pages-n18-') });
  const safety = createSafety({ config, claude: null });
  const pages = createPages({ config, safety });
  const dir = tmpDir('pz-pages-n18-tpl-');
  fs.writeFileSync(path.join(dir, 't.html'), '<p>Team {{a}}{{b}}{{c}}</p><p>Since 1947-2026, day {{d}}</p>');
  const h = pages.register('zz', dir, { prefix: 's', template: 't.html', slots: { a: 'int:0..9999', b: 'int:0..9999', c: 'int:0..99', d: 'date' } });
  const bad = h.create({}, { a: 9876, b: 5432, c: 10, d: '2026-10-30' });
  assert.equal(pages.render(pages.find('s', bad.code)), null, '9876543210 is never served');
  const ok = h.create({}, { a: 1, b: 2, c: 3, d: '2026-10-30' });
  assert.match(pages.render(pages.find('s', ok.code)), /Team 123/, 'short numbers, a year range and an ISO date are fine');
  pages.stop();
});
