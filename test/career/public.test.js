// BRAIN rules (CHECK_build items 12 and 13; core CONTRACT section 13): TV, share card and PDF text only from
// registered banks and templates; model drafts phone-only after the judge; visitor text never on TV or card;
// typed input through core's care path.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSafety } from '../../core/server/safety.js';
import { publicDefs, pdfDefs, pdfChecker, registerPublic, localSafety } from '../../experiences/career/lib/public.js';
import { buildPdf } from '../../experiences/career/lib/pdf.js';
import { careerServer, post, postLead, lead, testKeys, tmp } from './helpers.js';
import { screenAgents } from '../../experiences/career/lib/screen.js';
import { careerRuleHit } from '../../experiences/career/lib/public.js';
import { DOCTOR_BANK, doctorFromPicks, JOBS } from '../../experiences/career/lib/jobs.js';

const cleanups = [];
after(async () => { for (const c of cleanups) await c().catch(() => {}); });

test('every bank line and template passes core copy rules (core createSafety accepts them all)', () => {
  const core = createSafety({ config: { publicTextStrict: true }, claude: null, analytics: { inc() {}, count() {} } });
  const bound = { bank: (id, e) => core.bank('career', id, e), template: (id, t, sl) => core.template('career', id, t, sl) };
  registerPublic(bound, { stopText: 'play.zenithschool.ai/stop' });
  const { banks, templates } = publicDefs();
  const p = pdfDefs();
  assert.ok(Object.keys(banks).length >= 8 && Object.keys(templates).length >= 10);
  for (const [b, lines] of Object.entries({ ...banks, ...p.banks })) for (const k of Object.keys(lines)) assert.equal(core.publicText('career', b, k).text, lines[k]);
  assert.equal(core.isPublic('career', 'Marketing Manager · 2030'), true);
  assert.equal(core.isPublic('career', '[Done by AI] 3 caption drafts likho: ho gaya'), true);
  assert.equal(core.isPublic('career', 'Call 2: Led by people wali call tumne li'), true);
  assert.equal(core.isPublic('career', '2026 ka marketer vs 2030 ka marketer'), true);
  assert.equal(core.isPublic('career', 'Fest ready feet, zero compromise. Udaan bharo.'), false, 'a model draft is not public text');
  assert.equal(core.isPublic('career', 'Aarav'), false, 'a name is not public text');
  assert.throws(() => core.publicText('career', 'card_r1', { n: 'Aarav' }), 'slots are typed');
});

test('PDF: every string it draws is registered; anything else is refused', async () => {
  const c = pdfChecker({ stopText: 'play.zenithschool.ai/stop' });
  assert.equal(c.accepts('Career Forecast: Ideas 4.0'), true);
  assert.equal(c.accepts('Top careers: Computers and coding'), true);
  assert.equal(c.accepts('Page 2 of 3'), true);
  assert.equal(c.accepts('Hi Aarav, yeh tumhara forecast hai'), false);
  assert.equal(c.accepts('Page 9 of 3'), false);
  for (const a of ['computers-coding', 'machines-making', 'electronics-chips', 'buildings-infra', 'business-managing']) await buildPdf({ areaId: a, stopText: 'play.zenithschool.ai/stop' });
});

test('local fallback matches the core API (bank line, template, typed slots, judge fails closed on risky text)', async () => {
  const s = localSafety();
  registerPublic(s);
  assert.equal(s.publicText('card_r1', { n: 12 }).text, '2026: 12s, sab haath se');
  assert.throws(() => s.publicText('card_r1', { n: -1 }));
  assert.throws(() => s.publicText('nope', 'x'));
  const j = await s.judge([{ id: 'a', text: 'Reel ka hook: fest ka pehla din' }, { id: 'b', text: 'Diagnosis karo' }, { id: 'c', text: 'Call 9876543210 now' }]);
  assert.deepEqual(j.flagged, ['b', 'c']);
});

test('server: /card and /preview return public text only, from the job and numbers (no name or typed text can reach the card)', async () => {
  const keys = testKeys();
  const s = await careerServer({ LEADS_PUBLIC_KEY: keys.pubEnv });
  cleanups.push(() => s.close());
  const c = await (await post(s.base, '/api/career/card', { job: 'marketing', r1: 41, r2: 6, firstName: 'Aarav', typed: 'Fest ready, har step pe swag', title: 'Hacked' })).json();
  assert.equal(c.title.text, '2026 ka marketer vs 2030 ka marketer');
  assert.deepEqual(c.lines.map((l) => l.text), ['2026: 41s, sab haath se', '2030: AI 6s, maine 2 calls li']);
  assert.ok(c.lines.every((l) => typeof l.pt === 'string'));
  const all = JSON.stringify(c);
  assert.ok(!all.includes('Aarav') && !all.includes('swag') && !all.includes('Hacked'));
  assert.equal((await post(s.base, '/api/career/card', { job: 'marketing', r1: 'Aarav', r2: 6 })).status, 400);
  const pv = await (await post(s.base, '/api/career/preview', { area: 'computers-coding' })).json();
  assert.deepEqual(pv.card.lines.map((l) => l.text), ['AI / LLM Engineer: Growing', 'Cybersecurity Analyst: Growing', 'Data Scientist / ML Engineer: Changing']);
});

test('server: model drafts pass the judge; a flagged line becomes a plain reviewed line (doctor drafts mention medicine)', async () => {
  const s = await careerServer({});
  cleanups.push(() => s.close());
  const r = await (await post(s.base, '/api/career/agents', { job: 'doctor' })).json();
  assert.equal(r.source, 'mock');
  const bank = new Set(Object.values(DOCTOR_BANK).flatMap((b) => Object.values(b)));
  assert.ok(Object.values(r.agents).flat().every((x) => bank.has(x)), 'Doctor lines come only from the reviewed bank');
  const m = await (await post(s.base, '/api/career/agents', { job: 'marketing' })).json();
  assert.ok(m.agents.drafts.every((d) => !d.startsWith('Option ')), 'clean drafts are kept for the phone');
});

test('server: a crisis phrase in the name field gets the care answer and nothing is stored', async () => {
  const keys = testKeys();
  const dataDir = tmp();
  const s = await careerServer({ LEADS_PUBLIC_KEY: keys.pubEnv }, { DATA_DIR: dataDir });
  cleanups.push(() => s.close());
  const r = await postLead(s.base, lead('9000000601', { firstName: 'mujhe jeena nahi hai' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { care: true });
  assert.equal(fs.existsSync(path.join(dataDir, 'leads')), false);
});

const BAD = [
  // the checker's 5 (CHECK-03c, permissive judge)
  'Tum bekaar ho, kuch nahi kar paoge', 'Tumhara career khatam ho jayega', 'AI tumhari naukri kha jayega, tum berozgaar rahoge',
  'Take paracetamol 500 mg twice a day', 'Insulin ka dose double kar do',
  // put-downs about the visitor
  'Tum toh nikamme ho yaar', 'Aap nalayak ho, isliye mushkil hai', 'You are useless at this', 'Tu bewakoof hai, rehne de', 'Tum kuch bhi nahi kar sakte',
  'Tum fail ho jaoge is field mein', 'Tum loser ho, kuch nahi hoga tumse', "You're a failure, try something else", 'Tum kamzor ho, chhod do',
  // job-loss fear copy
  'AI naukri chheen lega sabki', 'Is field mein koi naukri nahi bachegi', 'Marketing ka career barbaad ho jayega', 'AI will replace you by 2030',
  'Jobs will vanish, sab berozgar honge', 'Tumhe replace kar dega ek bot', 'Lakhs will lose their jobs, you too', 'Tumhari job khatam samjho',
  // medicine, dose or treatment instructions
  'Dolo 650 le lo, theek ho jaoge', 'Din mein do baar ye goli lo', 'Antibiotics start kar do aaj se', 'Give 10 ml syrup after food',
  'Iska ilaaj ghar pe ho jayega, dawai lo', 'Steroid cream laga lo', 'Prescription mein metformin add karo', 'Injection lagwa lo jaldi',
];

test('drafts with a permissive judge: none of 30 bad lines reaches the phone; reviewed fixture lines pass unchanged', async () => {
  assert.equal(BAD.length, 30);
  const permissive = async () => ({ ok: [], flagged: [] });
  for (let i = 0; i < BAD.length; i += 3) {
    const a = { plan: BAD[i], research: [BAD[i + 1] || 'x', 'Research ok', 'Research ok 2'], drafts: [BAD[i + 2] || 'y', 'Draft ok', 'Draft ok 2'], analysis: 'Report ok', review: 'Review ok', call_options: ['A', 'B', 'C'] };
    const { agents } = await screenAgents(a, permissive);
    const all = JSON.stringify(agents);
    for (const b of BAD) assert.ok(!all.includes(b), `reached the phone: ${b}`);
  }
  for (const b of BAD) assert.equal(careerRuleHit(b), true, b);
  // no false alarms on the reviewed drafts of the other 5 jobs
  for (const j of JOBS.filter((x) => x.id !== 'doctor')) {
    const fx = JSON.parse(fs.readFileSync(new URL(`../../experiences/career/fixtures/agents_${j.id}.json`, import.meta.url), 'utf8'));
    for (const e of fx) {
      const { flagged } = await screenAgents({ ...e }, permissive);
      assert.deepEqual(flagged, [], `${j.id}: ${JSON.stringify(e).slice(0, 60)}`);
    }
  }
  // a broken judge flags everything
  const { flagged } = await screenAgents({ plan: 'a', research: ['b', 'c', 'd'], drafts: ['e', 'f', 'g'], analysis: 'h', review: 'i', call_options: ['j', 'k', 'l'] }, async () => { throw new Error('down'); });
  assert.equal(flagged.length, 12);
});

test('Doctor is bank-only: unknown, repeated or free-text picks still give reviewed lines only', () => {
  const bank = new Set(Object.values(DOCTOR_BANK).flatMap((b) => Object.values(b)));
  for (const picks of [{}, { plan: 'Take paracetamol 500 mg', research: ['re1', 're1', 'Insulin ka dose double kar do'], drafts: 'dr1', review: 'xx' }, { research: ['re6', 're5', 're4', 're3'] }]) {
    const d = doctorFromPicks(picks);
    assert.equal(d.research.length, 3);
    assert.equal(new Set(d.research).size, 3);
    assert.ok(Object.values(d).flat().every((x) => bank.has(x)), JSON.stringify(picks));
  }
  for (const line of bank) assert.equal(careerRuleHit(line), false, `bank line trips a rule: ${line}`);
});

test('live crisis gate: the JTM typed answer and the /lead name go through ctx.safety.inputLive; the text is never stored or logged', async () => {
  const keys = testKeys();
  const dataDir = tmp();
  const s = await careerServer({ LEADS_PUBLIC_KEY: keys.pubEnv }, { DATA_DIR: dataDir });
  cleanups.push(() => s.close());
  const ok = await (await post(s.base, '/api/career/check', { text: 'Fest ready, har step pe swag' })).json();
  assert.deepEqual(ok, { ok: true });
  const care = await (await post(s.base, '/api/career/check', { text: 'main ab marna chahta hoon' })).json();
  assert.deepEqual(care, { care: true });
  assert.equal((await post(s.base, '/api/career/check', { text: ['x'] })).status, 400);
  const lead = await (await postLead(s.base, { firstName: 'mujhe jeena nahi hai', phone: '9000000701', band: 'college', area: 'computers-coding', consent: true, consentVersion: 'ideas4-wa-v1' })).json();
  assert.deepEqual(lead, { care: true });
  assert.equal(fs.existsSync(path.join(dataDir, 'leads')), false);
  const logs = s.logs.lines.join('');
  assert.ok(!logs.includes('swag') && !logs.includes('marna') && !logs.includes('jeena'), 'typed text never in a log');
  const src = fs.readFileSync(new URL('../../experiences/career/server.js', import.meta.url), 'utf8');
  assert.ok((src.match(/await safety\.inputLive\(/g) || []).length >= 2, 'both visitor-text routes use the live gate');
  assert.ok(!/safety\.input\(/.test(src), 'no route uses the sync rules-only check');
});
