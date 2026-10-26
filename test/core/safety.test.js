// Shared safety (CONTRACT 13): care detection, judge, public text, the server as the care authority.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKER, CHECKER_SAFE, MINE, SAFE2, CHECKER_C, CHECKER_C_SAFE, TARGETED, TARGETED_SAFE } from './care-sets.js';
import { fixTypos } from '../../core/web/care-categories.js';
import { detect } from '../../core/web/care-words.js';
import { createSafety } from '../../core/server/safety.js';
import { createClaude } from '../../core/server/claude.js';
import { createBus } from '../../core/server/bus.js';
import { makeConfig } from '../../core/server/config.js';
import { staffToken } from '../../core/server/limits.js';
import { startServer, json, tmpDir } from './helpers.js';

const servers = [];
after(async () => { for (const s of servers) await s.close().catch(() => {}); });

const crisis = [
 'I want to die','i want to kill myself','I am going to kill myself','thinking about suicide','suicidal feel kar raha hoon','I want to end my life','I will end it all tonight','I don\'t want to live anymore','dont want to wake up tomorrow','no reason to live','life is pointless','everyone would be better off without me','nobody would miss me','I cut myself','I hurt myself again','self harm karta hoon','i took an overdose','I will hang myself','jump off the building','I cant go on','i cant take it anymore','I wish I was dead','kms','unalive myself','s.u.i.c.i.d.e','k i l l m y s e l f','su1c1de','i wanna die lol','give up on life','sleep and never wake up',
 'mar jana hai','mujhe marna hai','main mar jaunga','mar jaungi main','marna chahta hoon','mar hi jau toh accha','khudkushi kar lunga','aatmahatya','suicide kar lunga','jeene ka mann nahi','jeene ka man nahi karta','jeena nahi chahta','zindagi khatam karni hai','zindagi se tang aa gaya','sab khatam karna hai','sab khatam kar dunga','khud ko khatam kar dunga','khud ko hurt karta hoon','nas kaat lunga','phaansi laga lunga','jaan de dunga','apni jaan le lunga','duniya chhod dunga','zeher kha lunga','jeene ki koi wajah nahi','main nahi rehna chahta','zinda nahi rehna','chhat se kood jaunga','Jeene ka koi fayda nahi','MAR JANA HAI',
 'मैं आत्महत्या कर लूंगा','मुझे मरना है','मर जाना चाहता हूं','जीने का मन नहीं','जीना नहीं चाहती','ज़िंदगी खत्म कर दूंगा','सब खत्म कर दूंगी','खुद को खत्म कर लूंगा','फांसी लगा लूंगा','ख़ुदकुशी','नस काट लूंगी','अपनी जान दे दूंगा','जीने की इच्छा नहीं',
];
const safe = ['exam ka tension hai','mood off hai','I am sad today','bahut thak gaya hoon','I failed my maths test','has has ke mar gaya','this exam will kill me','I am dying to try this','mar gaya yaar, kitna funny','life is good','zindagi mast hai','I love my life','dead tired','I killed it on stage','Killer pitch!','main thoda pareshan hoon','ghar ki yaad aa rahi hai','sab theek hai','jeene ka maza aa gaya','mujhe chai chahiye','मुझे परीक्षा का डर है','आज मन उदास है','Deal!','Main out hoon'];

test('care.detect: 60+ crisis phrasings trigger (English, Hinglish, Devanagari, disguised)', () => {
  assert.ok(crisis.length >= 60);
  assert.deepEqual(crisis.filter((t) => !detect(t)), []);
});

test('care.detect: sad-but-safe lines do not trigger', () => {
  assert.deepEqual(safe.filter((t) => detect(t)), []);
});

const cfg = (o = {}) => makeConfig({ DATA_DIR: tmpDir('safety'), ANTHROPIC_API_KEY: '', CLAUDE_MOCK: '0', DEMO_MODE: '0', OFFLINE: '0', ...o });

test('judge: the model returns APPROVED ids; omitted ids and any failure count as flagged (fails closed)', async () => {
  const fake = (approved, fail) => ({ beta: { messages: { create: async () => { if (fail) throw Object.assign(new Error('overloaded'), { status: 529 }); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ approved }) }], usage: { input_tokens: 10, output_tokens: 5 } }; } } } });
  const lines = [{ id: 'a', text: 'Tumhara agla idea kamaal ka hoga.' }, { id: 'b', text: 'Tum ek din bade founder banoge.' }, { id: 'c', text: 'Aaj ka din tumhara hai.' }];
  const live = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const mk = (client) => createSafety({ config: live, claude: createClaude({ config: live, client }) });
  let r = await mk(fake(['a', 'c'])).judge('x', lines);
  assert.deepEqual(r.flagged, ['b'], 'b was omitted, so it is flagged');
  r = await mk(fake(['a', 'b', 'c', 'zzz'])).judge('x', lines);
  assert.deepEqual(r.flagged, []);
  r = await mk(fake([], true)).judge('x', lines);
  assert.deepEqual(r.flagged, ['a', 'b', 'c'], 'API failure flags everything');
  r = await mk(fake(['m'])).judge('x', [{ id: 'm', text: 'Doctor ne kaha dawai lo' }]);
  assert.deepEqual(r.flagged, ['m'], 'the model cannot approve what the rules reject');
});

test('judge in mock/offline: deterministic rule pass flags negative, violent, sexual, school, medical, romantic, crisis lines', async () => {
  const m = cfg({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1' });
  const s = createSafety({ config: m, claude: createClaude({ config: m }) });
  const bad = ['Tum thode bewakoof ho', 'Usko maar do', 'Tum bahut sexy ho', 'DPS ke topper ho', 'Diabetes ka dhyan rakho', 'Tumhara crush tumhe pasand karta hai', 'Tum fail hoge', 'mar jana hai', 'tu chutiya hai'];
  const good = ['Tumhara agla idea kamaal ka hoga.', 'Aaj ka din tumhara hai.', 'Tum team ki energy ho.'];
  const r = await s.judge('x', [...bad.map((t, i) => ({ id: `b${i}`, text: t })), ...good.map((t, i) => ({ id: `g${i}`, text: t }))]);
  assert.deepEqual(r.flagged.sort(), bad.map((_, i) => `b${i}`).sort());
  const o = cfg({ DEMO_MODE: '1' });
  const off = createSafety({ config: o, claude: createClaude({ config: o }) });
  assert.deepEqual((await off.judge('x', [{ id: 'g', text: 'Aaj ka din tumhara hai.' }])).flagged, []);
});

test('judge: job, placement and salary guarantees are flagged in every mode; the model cannot approve them', async () => {
  const bad = ['100% job milegi', 'Placement guaranteed hai', 'Pakki naukri tumhari', 'Job ki guarantee hai', 'Salary guaranteed', 'Tumhe 100 percent placement milega', 'Guaranteed high salary package', 'Naukri pakki hai', 'Sure shot job', 'नौकरी की गारंटी', 'पक्की नौकरी'];
  const good = ['Job ke liye skills seekho.', 'AI se naye kaam banenge.', 'Internship ke liye apply karo.', '100% fun guaranteed!', 'Pakka dost mil gaya.', 'B.Tech in AI + mini-MBA. Ek degree, KRMU ki.'];
  const lines = [...bad.map((t, i) => ({ id: `b${i}`, text: t })), ...good.map((t, i) => ({ id: `g${i}`, text: t }))];
  const m = cfg({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1' });
  const r = await createSafety({ config: m, claude: createClaude({ config: m }) }).judge('career', lines);
  assert.deepEqual(r.flagged.sort(), bad.map((_, i) => `b${i}`).sort());
  const live = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const approveAll = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ approved: lines.map((l) => l.id) }) }], usage: { input_tokens: 10, output_tokens: 5 } }) } } };
  const r2 = await createSafety({ config: live, claude: createClaude({ config: live, client: approveAll }) }).judge('shark', lines);
  assert.deepEqual(r2.flagged.sort(), bad.map((_, i) => `b${i}`).sort(), 'the rules veto the model');
});

test('judge guarantee rule is sentence level: a guarantee or promise word plus a job word anywhere in the line; the live prompt asks for it too', async () => {
  const bad = ['Zenith graduates always get hired, it is a sure shot thing', 'We will ensure you get a job', 'You are certain to get a placement here', 'Bharosa rakho, job mil hi jayegi', 'Koi chinta nahi, naukri hamari zimmedari hai', 'नौकरी मिलना तय है', 'Naukri pakki, bas join karo',
    'We guarantee you a high paying job', 'We guarantee every student a very well paying job', 'Aapko guarantee hai ki top company mein job milegi', 'We promise you a job',
    'Surely you will get placed', 'Lifetime job security milegi tumhe', 'Your career is guaranteed to be bright', 'Ek achhi job milna pakka hai', '100 percent placement', 'प्लेसमेंट पक्का', 'कंपनी में नौकरी की पूरी गारंटी'];
  const good = ['Job ke liye skills seekho.', '100% fun guaranteed!', 'Pakka dost mil gaya.', 'Tumhara idea pakka hit hoga', 'Company banane ka sapna dekho', 'Internship ke liye apply karo.', 'Interview ke liye resume taiyar karo', 'Hiring managers ko portfolio pasand aata hai', 'तुम्हारा करियर तुम्हारे हाथ में है'];
  const lines = [...bad.map((t, i) => ({ id: `b${i}`, text: t })), ...good.map((t, i) => ({ id: `g${i}`, text: t }))];
  const m = cfg({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1' });
  const r = await createSafety({ config: m, claude: createClaude({ config: m }) }).judge('career', lines);
  assert.deepEqual(r.flagged.sort(), bad.map((_, i) => `b${i}`).sort());
  // the live judge prompt names the rule
  let system = '';
  const live = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const spy = { beta: { messages: { create: async (body) => { system = body.system; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ approved: [] }) }], usage: { input_tokens: 1, output_tokens: 1 } }; } } } };
  await createSafety({ config: live, claude: createClaude({ config: live, client: spy }) }).judge('career', [{ id: 'x', text: 'Aaj ka din tumhara hai.' }]);
  assert.match(system, /guarantees a job, placement, salary/);
});

test('judge: exam-result promises are flagged at sentence level (Hinglish, English, Devanagari); study advice stays fine', async () => {
  const bad = ['100% marks pakke', 'Rank guaranteed hai', 'Topper ban jaoge pakka', 'We promise you a top rank in JEE', 'Boards mein 95 percent pakka', 'Selection confirm hai, chinta mat karo',
    'You will surely clear ho jayega the cutoff', 'Pakka pass ho jaoge', 'Full marks ki guarantee', 'Admission pakka', 'Result 100% aayega', 'Neet mein seat pakki', 'परीक्षा में 100% अंक पक्के', 'टॉपर बनना पक्का है', 'रैंक की गारंटी'];
  const good = ['Roz 2 ghante Physics revise karo', 'Exam se pehle ek mock test do', 'Definitely revise formulas before the exam', 'Certain chapters zyada important hain exam ke liye',
    'Pakka plan banao aur aaj se shuru karo', 'Boards ki taiyari plan ke saath karo', 'Har subject ko barabar time do', 'Revision ke liye notes banao', 'परीक्षा की तैयारी रोज़ करो', 'Tumhara idea pakka hit hoga'];
  const lines = [...bad.map((t, i) => ({ id: `b${i}`, text: t })), ...good.map((t, i) => ({ id: `g${i}`, text: t }))];
  const m = cfg({ CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '1' });
  const r = await createSafety({ config: m, claude: createClaude({ config: m }) }).judge('agent', lines);
  assert.deepEqual(r.flagged.sort(), bad.map((_, i) => `b${i}`).sort());
});

// ---------- live crisis gate and degraded safety mode (combined re-check, BRAIN 24 Oct) ----------
const liveClient = (fn, calls = []) => ({ beta: { messages: { create: async (body) => { calls.push(body); const out = await fn(body); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 5 } }; } } } });
const liveSafety = (fn, calls, o = {}) => { const c = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key', CARE_LIVE_TIMEOUT_MS: '300', ...o }); return createSafety({ config: c, claude: createClaude({ config: c, client: liveClient(fn, calls) }) }); };

test('live mode: the AI crisis check runs on ALL free text (short text too), schema { crisis, confidence }, before answering', async () => {
  const calls = [];
  const s = liveSafety((body) => { const t = body.messages[0].content; return /sort ho jayega|nobody will notice/.test(t) ? { crisis: true, confidence: 0.9 } : /hmm/.test(t) ? { crisis: false, confidence: 0.6 } : { crisis: false, confidence: 0.05 }; }, calls);
  assert.equal(s.safetyMode(), 'live');
  const req = (sid) => ({ sid, headers: { 'x-pz-counter': '3' } });
  assert.equal(await s.inputLive('shark', req('a'), 'chai aur code'), false);
  assert.equal(calls.length, 1, 'even short, harmless text is checked');
  assert.deepEqual(calls[0].output_config.format.schema.required.sort(), ['confidence', 'crisis']);
  assert.equal(await s.inputLive('shark', req('b'), { pitch: 'kal tak sab sort ho jayega' }), true, 'a crisis the rules miss');
  assert.equal(await s.inputLive('shark', req('c'), 'hmm'), true, 'confidence at or above 0.4 counts');
  assert.equal(s.isCareLocked('b'), true);
  assert.equal(s.alertsFor('shark', 3).filter((a) => a.kind === 'care').length, 2);
  const before = calls.length;
  assert.equal(await s.inputLive('shark', req('d'), 'mujhe marna hai'), true, 'a rule hit answers at once');
  assert.equal(calls.length, before, 'no model call needed when the rules already found a crisis');
  // the sync input() starts the same check in the background: the next request gets the care card
  assert.equal(s.input('shark', req('e'), 'nobody will notice when im gone'), true, 'rules catch this one');
  assert.equal(s.input('shark', req('f'), 'kal tak sab sort ho jayega'), false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(s.input('shark', req('f'), 'anything'), true, 'care card on the next request');
});

test('CHECK-21 L1/L2: a timed-out live check FAILS CLOSED (the line is not used); an error gets one fast retry; degraded only after 3 failures in 60 s or an auth/quota error', async () => {
  // L1: slow -> 'unchecked' within the deadline (here 300 ms), never 'clear'; the rules still catch crises at once
  const slowCalls = [];
  const slow = liveSafety(() => new Promise((r) => setTimeout(() => r({ crisis: false, confidence: 0 }), 2000)), slowCalls);
  const t0 = Date.now();
  const req = { sid: 's1' };
  assert.equal(await slow.inputLive('jyotish', req, 'kuch bhi likha'), 'unchecked', 'a timeout fails closed');
  assert.equal(req.pzUnchecked, true);
  assert.ok(Date.now() - t0 < 1500, 'answered at the deadline');
  assert.equal(slowCalls.length, 1, 'no retry after a slow call');
  const res = { req, status() { return this; }, json(b) { this.body = b; return this; } };
  slow.careResponse(res);
  assert.deepEqual([res.body.unchecked, res.body.care, res.body.chips], [true, false, true], 'the phone is told: not used, offer chips');
  assert.equal(await slow.inputLive('jyotish', { sid: 's2' }, 'mujhe marna hai'), true, 'the rules still catch crises');
  assert.equal(slow.safetyMode(), 'live', 'one slow call does not darken the site (L2)');
  await slow.inputLive('jyotish', { sid: 's3' }, 'aur ek line');
  await slow.inputLive('jyotish', { sid: 's4' }, 'teesri line');
  assert.equal(slow.safetyMode(), 'degraded', '3 failures in 60 s: degraded');
  // an error gets one fast retry inside the deadline
  let n = 0;
  const flaky = liveSafety(() => { n++; if (n === 1) throw Object.assign(new Error('overloaded'), { status: 529 }); return { crisis: false, confidence: 0 }; }, []);
  assert.equal(await flaky.inputLive('jyotish', { sid: 'f1' }, 'aaj ka din'), false, 'the retry answered');
  assert.equal(n, 2);
  assert.equal(flaky.liveStats().retries, 1);
  assert.equal(flaky.safetyMode(), 'live');
  // an auth or quota error: degraded at once
  const auth = liveSafety(() => { throw Object.assign(new Error('unauthorized'), { status: 401 }); }, []);
  assert.notEqual(await auth.inputLive('jyotish', { sid: 'a1' }, 'aaj ka din'), true);
  assert.equal(auth.safetyMode(), 'degraded');
});

test('degraded mode (mock, demo, offline, no key, spend cap): every rule-based care or language hit raises the quiet operator alert', async () => {
  for (const o of [{ CLAUDE_MOCK: '1' }, { DEMO_MODE: '1' }, { OFFLINE: '1', DEMO_MODE: '1' }, {}]) {
    const c = cfg(o);
    const s = createSafety({ config: c, claude: createClaude({ config: c }) });
    assert.equal(s.safetyMode(), 'degraded', JSON.stringify(o));
    const req = { sid: `deg-${Object.keys(o).join('')}`, headers: { 'x-pz-counter': '5' } };
    assert.equal(s.input('shark', req, 'tu chutiya hai'), false, 'language is not a crisis');
    assert.equal(s.input('shark', req, 'mujhe marna hai'), true);
    const kinds = s.alertsFor('shark', 5).map((a) => a.kind).sort();
    assert.deepEqual(kinds, ['care', 'language']);
    for (const a of s.alertsFor('shark', 5)) assert.deepEqual(Object.keys(a).sort(), ['at', 'exp', 'id', 'kind'], 'time and experience only');
    assert.equal(s.isCareLocked(`lang:${req.sid}`), false);
  }
  // live mode: language hits do not alert (the live check is the gate)
  const live = liveSafety(() => ({ crisis: false, confidence: 0 }), []);
  live.input('shark', { sid: 'l1', headers: { 'x-pz-counter': '5' } }, 'tu chutiya hai');
  assert.deepEqual(live.alertsFor('shark', 5), []);
});

test('CHECK-16d: _sample answers a live-only crisis on the SAME request (inputLive); live check sends up to 16 strings of 1,200 characters; sync input() logs a count-only deprecation warning', async () => {
  const sent = [];
  const client = liveClient((body) => { const t = body.messages[0].content; sent.push(t); return /sort ho jayega/.test(t) ? { crisis: true, confidence: 0.9 } : { crisis: false, confidence: 0 }; });
  const logs = [];
  const l = await startServer({ CLAUDE_MOCK: '0', ANTHROPIC_API_KEY: 'test-not-a-real-key' }, { claudeClient: client, log: (o) => logs.push(o) });
  servers.push(l);
  const r = await (await json(l.base, '/api/_sample/vibe', { word: 'kal tak sab sort ho jayega', subject: 'coding' }, { cookie: 'pz_sid=live-same-1', 'x-pz-counter': '2' })).json();
  assert.equal(r.care, true, 'the care card comes with this very request');
  // limits: 16 strings, 1,200 characters each
  const s = liveSafety((body) => { sent.push(body.messages[0].content); return { crisis: false, confidence: 0 }; }, []);
  const many = Array.from({ length: 20 }, (_, i) => `part ${i} ${'x'.repeat(i === 3 ? 1500 : 5)}`);
  sent.length = 0;
  await s.inputLive('shark', { sid: 'lim' }, many);
  const texts = JSON.parse(sent[0]);
  assert.equal(texts.length, 16);
  assert.equal(texts[3].length, 1200);
  // a crisis after character 700 of a pitch still reaches the check
  sent.length = 0;
  await s.inputLive('shark', { sid: 'lim2' }, `${'mera idea ek app hai '.repeat(45)}ZZEND`); // the marker sits after character 900
  assert.ok(JSON.parse(sent[0])[0].endsWith('ZZEND'));
  // deprecation: count-only log, never the text
  const dlogs = [];
  const c2 = cfg({ CLAUDE_MOCK: '1' });
  const d = createSafety({ config: c2, claude: createClaude({ config: c2 }), log: (o) => dlogs.push(o) });
  for (let i = 0; i < 100; i++) d.input('career', { sid: `dep${i}` }, 'secret visitor text');
  const w = dlogs.filter((o) => o.warn === 'sync_input_deprecated');
  assert.deepEqual(w.map((o) => o.calls), [1, 100]);
  assert.ok(!JSON.stringify(dlogs).includes('secret visitor text'));
  assert.equal(d.stats().syncInput.career, 100);
});

test('ctx.safety.safetyMode() on the server: same rule as /status.json (3 failures in a minute or an auth error = degraded)', async () => {
  const dir = tmpDir('pz-exp-mode-');
  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(path.join(dir, 'zz_mode'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zz_mode', 'server.js'), `export default function register({ app, safety }) {
    app.get('/mode', (req, res) => res.json({ mode: safety.safetyMode() }));
    app.post('/text', async (req, res) => res.json({ care: await safety.inputLive(req, req.body?.t) }));
  }`);
  let fail = false;
  const client = liveClient(() => { if (fail) throw Object.assign(new Error('overloaded'), { status: 529 }); return { crisis: false, confidence: 0 }; });
  const l = await startServer({ CLAUDE_MOCK: '0', ANTHROPIC_API_KEY: 'test-not-a-real-key' }, { claudeClient: client, expDir: dir });
  servers.push(l);
  const mode = async () => (await (await fetch(`${l.base}/api/zz_mode/mode`)).json()).mode;
  const status = async () => (await (await fetch(`${l.base}/status.json`)).json()).safetyMode;
  assert.equal(await mode(), 'live');
  assert.equal(await status(), 'live');
  fail = true;
  await json(l.base, '/api/zz_mode/text', { t: 'aaj ka din' }, { cookie: 'pz_sid=mode-1' });
  assert.equal(await mode(), 'live', 'one failed check (with its retry) is not "unavailable" (CHECK-21 L2)');
  await json(l.base, '/api/zz_mode/text', { t: 'aaj ka din 2' }, { cookie: 'pz_sid=mode-2' });
  await json(l.base, '/api/zz_mode/text', { t: 'aaj ka din 3' }, { cookie: 'pz_sid=mode-3' });
  assert.equal(await mode(), 'degraded', '3 failures in a minute: degraded');
  assert.equal(await status(), 'degraded');
  const m = await startServer({ CLAUDE_MOCK: '1' }, { expDir: dir });
  servers.push(m);
  assert.equal((await (await fetch(`${m.base}/api/zz_mode/mode`)).json()).mode, 'degraded');
});

test('safetyMode is exposed in /status.json and /api/core/config ("live" with a working key, else "degraded")', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1' });
  servers.push(s);
  assert.equal((await (await fetch(`${s.base}/status.json`)).json()).safetyMode, 'degraded');
  assert.equal((await (await fetch(`${s.base}/api/core/config`)).json()).safetyMode, 'degraded');
  const l = await startServer({ CLAUDE_MOCK: '0', ANTHROPIC_API_KEY: 'test-not-a-real-key' }, { claudeClient: liveClient(() => ({ crisis: false, confidence: 0 })) });
  servers.push(l);
  assert.equal((await (await fetch(`${l.base}/status.json`)).json()).safetyMode, 'live');
  assert.equal((await (await fetch(`${l.base}/api/core/config`)).json()).safetyMode, 'live');
});

test('publicText: bank lines, templates with int / enum / list / nickname slots; free strings are not public', () => {
  const s = createSafety({ config: cfg(), claude: null });
  s.setNicknameCheck((n) => n === 'TurboJugnu'); // stands in for "core generated this nickname"
  s.bank('jy', 'past', { p1: 'Class 8 mein tumne sabko surprise kiya tha.' });
  s.list('jy', 'personas', ['Seth Dhanraj', 'Riya Rao']);
  s.template('jy', 'sign', 'Sun sign: {sign}', { sign: 'list:signs' });
  s.template('jy', 'score', '{nick} ne {score}/10 score kiya', { nick: 'nickname', score: 'int:0..10' });
  s.template('jy', 'verdict', '{p} ne kaha: {v}', { p: 'list:personas', v: ['Deal', 'Main out hoon'] });
  s.template('jy', 'plain', 'Score: {n}', { n: 'int:0..10' });
  assert.deepEqual(s.publicText('jy', 'past', 'p1'), { pt: 'jy.past:p1', text: 'Class 8 mein tumne sabko surprise kiya tha.' });
  assert.equal(s.publicText('jy', 'sign', { sign: 'Leo' }).text, 'Sun sign: Leo');
  assert.equal(s.publicText('jy', 'score', { nick: 'TurboJugnu', score: 8 }).text, 'TurboJugnu ne 8/10 score kiya');
  assert.throws(() => s.publicText('jy', 'score', { nick: '@priya', score: 8 }));
  assert.throws(() => s.publicText('jy', 'score', { nick: 'TurboJugnu', score: 11 }));
  assert.throws(() => s.publicText('jy', 'verdict', { p: 'Some Real Ceo', v: 'Deal' }));
  assert.throws(() => s.publicText('jy', 'past', 'nope'));
  for (const ok of ['Class 8 mein tumne sabko surprise kiya tha.', 'Sun sign: Leo', 'Score: 7', 'TurboJugnu ne 8/10 score kiya', 'Riya Rao ne kaha: Deal', '7']) assert.ok(s.isPublic('jy', ok), ok);
  for (const no of ['Sun sign: Leo and you are amazing', 'Priya ne 8/10 score kiya', 'Riya Rao ne kaha: Main in hoon', 'any free AI sentence', 'Score: 11']) assert.ok(!s.isPublic('jy', no), no);
  assert.throws(() => s.bank('jy', 'x', { a: 'Bad line \u2014 with a dash' }));
  assert.throws(() => s.bank('jy', 'y', { a: 'mar jana hai' }));
  assert.throws(() => s.template('jy', 'z', 'Value {v}', { v: 'list:not_a_list_anywhere' }));
});

test('bus with PUBLIC_TEXT_STRICT: untemplated TV text is rejected; bank and template text passes; warn mode counts', () => {
  const strict = createSafety({ config: cfg({ PUBLIC_TEXT_STRICT: '1' }), claude: null });
  strict.bank('jyotish', 'orx', { guru: 'Jyotish Guru', t1: 'Sun sign nikalo' });
  strict.template('jyotish', 'sign', 'Sun sign: {sign}', { sign: 'list:signs' });
  const bus = createBus({ config: makeConfig({}), safety: strict });
  const r = bus.publish('jyotish', 1, 'p', [
    { t: 'init', orchestrator: { id: 'g', name: 'Jyotish Guru' }, agents: [] },
    { t: 'assign', id: 'g', task: 'Sun sign nikalo' },
    { t: 'log', id: 'g', text: 'Sun sign: Leo' },
    { t: 'log', id: 'g', text: 'Tum bahut special ho, AI ne kaha' },
    { t: 'result', payload: { title: 'Free AI title', number: 7 } },
  ]);
  assert.equal(r.accepted, 3);
  assert.deepEqual(r.rejected.map((x) => x.i), [3, 4]);
  const warn = createSafety({ config: cfg({ PUBLIC_TEXT_STRICT: '0' }), claude: null });
  const bus2 = createBus({ config: makeConfig({}), safety: warn });
  assert.equal(bus2.publish('jyotish', 2, 'p', [{ t: 'init', orchestrator: { id: 'g', name: 'Guru' }, agents: [] }, { t: 'log', id: 'g', text: 'free text' }]).accepted, 2);
  assert.equal(warn.stats().untemplated.jyotish, 2);
});

test('server is the care authority: a modified client gets the care response, no game, nothing on the TV, a quiet staff alert', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'k' });
  servers.push(s);
  const phone = { cookie: 'pz_sid=crisis-phone-1', 'x-pz-counter': '9' };
  await json(s.base, '/api/core/bus/_sample/9', { sid: 'run1', events: [{ t: 'init', orchestrator: { id: 'conductor', name: 'Vibe Conductor' }, agents: [] }] }, phone);
  assert.equal(s.bus.status().find((x) => x.channel === '_sample:9').events, 1);
  const r = await (await json(s.base, '/api/_sample/vibe', { word: 'mar jana hai', subject: 'art' }, phone)).json();
  assert.deepEqual(r, { care: true }, 'no game, no score');
  assert.equal(s.bus.status().find((x) => x.channel === '_sample:9').events, 0, 'the TV was wiped');
  const pub = await (await json(s.base, '/api/core/bus/_sample/9', { sid: 'run2', events: [{ t: 'log', id: 'conductor', text: 'x' }] }, phone)).json();
  assert.equal(pub.accepted, 0);
  assert.equal(pub.care, true, 'nothing from this phone reaches a TV');
  await json(s.base, '/api/core/care', { exp: '_sample', c: 9 }, phone);
  const st = await (await fetch(`${s.base}/admin/stats.json?key=k`)).json();
  assert.equal(st.totals._sample.care_shown, 1, 'counted once');
  assert.equal((await fetch(`${s.base}/api/core/ops/_sample/9`)).status, 403);
  const staff = { cookie: `pz_staff=${staffToken('k')}` };
  const ops = await (await fetch(`${s.base}/api/core/ops/_sample/9`, { headers: staff })).json();
  assert.equal(ops.alerts.length, 1);
  assert.deepEqual(Object.keys(ops.alerts[0]).sort(), ['at', 'exp', 'id', 'kind'], 'time, experience and kind only, no visitor data');
  await fetch(`${s.base}/api/core/ops/_sample/9/alerts/${ops.alerts[0].id}/dismiss`, { method: 'POST', headers: staff });
  assert.equal((await (await fetch(`${s.base}/api/core/ops/_sample/9`, { headers: staff })).json()).alerts.length, 0);
  assert.equal((await (await json(s.base, '/api/_sample/vibe', { word: 'curious', subject: 'art' }, { cookie: 'pz_sid=happy-phone-2' })).json()).source, 'mock', 'other phones are unaffected');
});

test('every bank line registered by every experience passes the copy rules', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1' });
  servers.push(s);
  const reg = s.safety.registry();
  assert.ok(reg.banks.length >= 2, 'the sample registers its banks');
  for (const b of reg.banks) for (const line of b.lines) {
    assert.ok(!/[\u2013\u2014]/.test(line), `${b.id}: dash`);
    assert.ok(!detect(line), `${b.id}: care words`);
  }
});

test('strict mode: the sample\'s real TV events all pass (registered banks and templates); free text does not', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', PUBLIC_TEXT_STRICT: '1' });
  servers.push(s);
  const fx = JSON.parse((await import('node:fs')).readFileSync(new URL('../../experiences/_sample/fixtures/vibe.json', import.meta.url), 'utf8'))[0];
  const events = [
    { t: 'init', ts: 0, title: 'Vibe Scanner', orchestrator: { id: 'conductor', name: 'Vibe Conductor', role: 'Orchestrator', icon: 'spark' },
      agents: [{ id: 'number', name: 'Number Agent', role: 'Word score, in code', label: 'NUMBER' }, { id: 'vibe', name: 'Vibe Agent', role: 'Claude call', label: 'VIBE' }, { id: 'card', name: 'Card Agent', role: 'Share card, canvas', label: 'CARD' }] },
    { t: 'assign', ts: 1, id: 'vibe', task: 'Vibe report likho (Claude)' }, { t: 'assign', ts: 2, id: 'number', task: 'Word ka number nikalo' },
    { t: 'log', ts: 3, id: 'number', text: '7 letters, 4 vowels, sum 106 -> number 7' }, { t: 'handoff', ts: 4, from: 'number', to: 'vibe', label: 'lucky number = 7' },
    { t: 'log', ts: 5, id: 'vibe', text: 'mock reply in 1.2s, 3 lines' }, { t: 'handoff', ts: 6, from: 'vibe', to: 'card', label: 'title + 3 lines' },
    { t: 'assign', ts: 7, id: 'card', task: 'Story card banao' }, { t: 'log', ts: 8, id: 'card', text: '1080x1920 PNG ready, 1950 KB' },
    { t: 'done', ts: 9, summary: 'Vibe report ready in 3.3s' },
    { t: 'result', ts: 10, payload: { kicker: 'Vibe report', title: fx.title, lines: [fx.superpower, ...fx.lines], number: 7, forFun: true } },
    { t: 'end', ts: 11 },
  ];
  const r = await (await json(s.base, '/api/core/bus/_sample/5', { sid: 'strict-1', events }, { cookie: 'pz_sid=strict-phone-1' })).json();
  assert.deepEqual(r.rejected, []);
  assert.equal(r.accepted, events.length);
  const bad = await (await json(s.base, '/api/core/bus/_sample/5', { sid: 'strict-1', events: [{ t: 'log', id: 'vibe', text: 'mock reply in 1.2s, 3 lines, title "Some AI words"' }, { t: 'result', payload: { title: 'An AI wrote this' } }] }, { cookie: 'pz_sid=strict-phone-1' })).json();
  assert.equal(bad.accepted, 0);
  assert.equal(bad.rejected.length, 2);
});

test('templates: only int, enum, count, nickname and numbered-label slots; ideaLabel is stable per session', () => {
  const s = createSafety({ config: cfg(), claude: null });
  for (const bad of ['string', 'text', 'dec:0..10', 'any', 'free']) assert.throws(() => s.template('x', `t_${bad.replace(/\W/g, '')}`, 'Hello {v}', { v: bad }), /not allowed/);
  s.template('x', 'idea', '{idea} ko {n}/40 mila', { idea: 'label:Idea', n: 'int:0..40' });
  const a = s.ideaLabel({ sid: 'phone-a' }, 'Idea');
  assert.equal(s.ideaLabel({ sid: 'phone-a' }, 'Idea'), a, 'stable per session');
  assert.notEqual(s.ideaLabel({ sid: 'phone-b' }, 'Idea'), a);
  assert.match(a, /^Idea #\d+$/);
  assert.equal(s.publicText('x', 'idea', { idea: a, n: 31 }).text, `${a} ko 31/40 mila`);
  assert.throws(() => s.publicText('x', 'idea', { idea: 'Meri chai startup', n: 31 }));
  assert.ok(!s.isPublic('x', 'Meri chai startup ko 31/40 mila'));
  assert.ok(s.isPublic('x', `${a} ko 31/40 mila`));
});

test('care detection undoes Unicode disguises too (phone-only guard)', () => {
  for (const t of ['mar ja​na hai', 'suіcіde', 'kіll myself', 'mār jāna hai', 'ｓｕｉｃｉｄｅ', 'jeene ka mann na‍hi']) assert.ok(detect(t), t);
});


// ---------- CHECK-16: concept-pattern care detection, model backstop, side channels ----------
const Z = '\u200b';
const checker16 = ['everyone would be happier if i was gone','i took a handful of pills and i feel strange','im going to jump off my hostel roof','i hate my life and want out forever','i wish i could just not wake up tomorrow','ab aur nahi jee sakta','sab ko chhod ke hamesha ke liye chala jaunga','jeene ki koi umeed nahi bachi','aaj raat sab kuch khatam kar dunga','marne ka plan bana liya hai','zindagi bojh lag rahi hai, jeene ka dil nahi karta','सब कुछ खत्म कर दूंगा आज रात','छत से कूद जाऊँगा',`mar${Z}jaunga`,
'marjaunga','main marjaunga','jeene ka dil nahi karta','jeene ka dil nahi hai','i dont wanna live','i will jump from the 5th floor','jump off my roof','nobody cares if i die','i want to end it','i want to disappear','sab kuch khatam kar dunga','कूद जाऊंगा','सब कुछ खत्म','jeena bekaar hai','main khatam ho jana chahta hu',
'mujhe suicide karna hai','nas kaat lunga aaj','main apni jaan le lunga','मैं मरना चाहता हूँ','अब जीने का मन नहीं करता','आत्महत्या','खुदकुशी','ज़हर खा','s u i c i d e','su1c1de','k.i.l.l m.y.s.e.l.f','unalive','m@rna h@i'];
const mine16 = ['i am going to end my life tonight','i just want to die','i dont want to be here anymore','i cant do this anymore','im planning to kill myself','i will overdose','nobody would miss me if i was gone','i want to stop existing','i wanna disappear forever','everyone is better off without me','i feel like ending it all','im ready to die','i keep thinking of jumping from the bridge','took too many pills, feeling dizzy','i dont want to wake up','i wish i was dead','life feels pointless','kill myself','i will hang myself tonight','self harm karti hoon',
'mujhe mar jana hai','main mar jaungi','mar jaun toh accha','marna chahti hoon','mujhe marna hai yaar','marne ka man kar raha hai','marne ki soch rahi hoon','mai nahi jee sakti ab','jeene ka mann nahi hai','jeene ki ichha khatam','zindagi se thak gaya hoon, khatam karna hai','zindagi bekaar hai','sab khatam kar dungi','khud ko khatam kar lungi','khud ko hurt karti hoon','chhat se kood jaungi','building se koodna hai','zeher kha lungi','neend ki goli kha li','hamesha ke liye chali jaungi','jaan de dungi','duniya chhod dungi','phansi laga lungi','nas kaat li maine','apni zindagi khatam kar dunga','umeed nahi bachi jeene ki','koi umeed nahi rahi',
'मैं मर जाऊंगी','मुझे नहीं जीना','जीने का दिल नहीं','मैं खुद को खत्म कर दूंगी','छत से कूद जाऊंगी','फाँसी लगा लूंगी','ज़िंदगी बोझ बन गई है','अब और नहीं जी सकती','नींद की गोलियां खा लूंगा','सबकुछ खत्म कर दूंगी',
`mar${Z}jaungi`,'ｍａｒ ｊａｕｎｇａ','m4rn4 h4i','k i l l m y s e l f','j33ne ka mann nahi','sab kuch khatm kar dunga'];
const safe16 = ['plastic khatam karna hai', 'poverty khatam karni hai', 'traffic khatam', 'traffic khatam karna hai', 'khatarnak idea', 'killer app', 'ye app killer hai', 'pollution khatam kar dunga', 'corruption khatam karna hai', 'प्लास्टिक खत्म कर दूंगा', 'गरीबी खत्म कर देंगे', 'exam ka tension hai','exam stress bahut hai','mood off hai','bahut thak gaya hoon','thak gayi hoon aaj','this class is so boring','boring lecture yaar','I failed my maths test','has has ke mar gaya','this exam will kill me','I am dying to watch the match','mar gaya yaar, kitna funny','life is good','zindagi mast hai','jeene ka maza aa gaya','dead tired after practice','I killed it on stage','sab kaam khatam kar dunga aaj','exam khatam ho gaya, ab chill','Gandhi jee nahi aaye aaj','I want to end this boring class','jump in the pool','pool mein kood gaya','Kumar jaana chahta hai party mein','परीक्षा का तनाव है','आज मन उदास है','homework khatam kar dunga','main thoda pareshan hoon','ghar ki yaad aa rahi hai','nobody came to the party'];

test('care.detect (CHECK-16): the checker\'s fresh set, 60+ new phrasings, and sad-but-safe stays quiet', () => {
  assert.deepEqual(checker16.filter((t) => !detect(t)), [], 'checker set');
  assert.ok(mine16.length >= 60);
  assert.deepEqual(mine16.filter((t) => !detect(t)), [], 'new set');
  assert.ok(safe16.length >= 20);
  assert.deepEqual(safe16.filter((t) => detect(t)), [], 'sad-but-safe');
});

// Career Studio re-check: 4 misses on 6e41cf8, plus variants (nukta / NFD ज़, "ab" in between, Roman)
const careerRecheck = ['I dont see a reason to keep living anymore', 'मुझे अब जीना नहीं है', 'life khatam karni hai meri, koi fayda nahi', 'मुझे ज़िंदा नहीं रहना'];
const careerVariants = ['मुझे ज़िंदा नहीं रहना'.normalize('NFD'), 'मुझे जिंदा नहीं रहना', 'मुझे अब ज़िंदा नहीं रहना', 'मुझे ज़िंदा अब नहीं रहना', 'मुझे अब जिंदा नहीं रहना है', 'ज़िंदा रहना नहीं चाहता', 'मुझे अब और जिंदा नहीं रह सकता', 'अब मुझे जीना नहीं है', 'मुझे अब जीना नहीं'.normalize('NFD'),
  "I don't see any reason to keep living anymore", 'there is no point in living anymore', 'whats the point of living', 'I lost all will to live', 'meri life khatam kar dunga', 'life khatam karni hai', 'zinda ab nahi rehna', 'mujhe ab zinda nahi rehna', 'लाइफ खत्म करनी है', 'जीने का कोई फायदा नहीं', 'मेरी ज़िंदगी खत्म करनी है', `life khatam ${Z}karni hai`];
const careerSafe = ['battery life khatam ho gayi', 'phone ki battery life khatam', 'is project ka koi fayda nahi', 'mujhe yahan nahi rehna', 'मुझे यहाँ नहीं रहना', 'I dont see a reason to keep this feature', 'what is the point of this class', 'zinda dil insaan', 'is idea ka koi fayda nahi', 'no reason to leave early', 'ghar pe nahi rehna aaj, party hai'];

test('care.detect (Career re-check): the 4 missed phrasings and their variants trigger; near-misses stay quiet', () => {
  assert.deepEqual(careerRecheck.filter((t) => !detect(t)), [], 'career re-check set');
  assert.deepEqual(careerVariants.filter((t) => !detect(t)), [], 'variants');
  assert.deepEqual(careerSafe.filter((t) => detect(t)), [], 'near-misses');
  assert.deepEqual([...safe16, ...careerSafe].filter((t) => detect(t)), []);
});

test('care.detect (CHECK-16b): category rules catch the checker\'s 51 and 50+ new lines; eco, business and exam jokes stay quiet', () => {
  assert.equal(CHECKER.length, 51);
  assert.ok(MINE.length >= 50);
  const missed = [...CHECKER, ...MINE].filter((t) => !detect(t));
  assert.ok(missed.length <= 1, `at most 1 miss, got: ${missed.join(' | ')}`);
  assert.deepEqual([...CHECKER_SAFE, ...SAFE2].filter((t) => detect(t)), [], 'safe sets');
  // the categories, one line each, in Roman Hinglish, English and Devanagari
  const cats = {
    farewell: ['aaj mera aakhri din hai, alvida', 'goodbye everyone, this is my last message', 'सबको हमेशा के लिए अलविदा'],
    method: ['pankhe se latak jaunga aaj', 'gonna swallow all the sleeping pills', 'मैं पंखे से लटक जाऊंगा'],
    wishDeath: ['maut aa jaye toh accha ho', 'i wish i would just die in my sleep', 'काश मुझे मौत आ जाए'],
    notExist: ['mujhe is duniya mein nahi rehna', 'i am just a burden to everyone', 'मैं सबके लिए बोझ हूं'],
    meaningless: ['zindagi ka koi matlab nahi raha mere liye', 'there is nothing left for me to live for', 'मेरे जीने का कोई मतलब नहीं'],
  };
  for (const [k, list] of Object.entries(cats)) for (const t of list) assert.ok(detect(t), `${k}: ${t}`);
  // a farewell to a thing is not a farewell
  for (const t of ['plastic ko alvida kaho hamesha ke liye', 'say goodbye to plastic forever', 'प्लास्टिक को हमेशा के लिए अलविदा', 'goodbye party for seniors on the last day']) assert.equal(detect(t), false, t);
});

test('care.detect (CHECK-16c): the checker\'s 62 fresh crisis lines trigger; its 51 safe lines (cricket, movies, eco, exam jokes) stay quiet', () => {
  assert.equal(CHECKER_C.length, 62);
  assert.deepEqual(CHECKER_C.filter((t) => !detect(t)), []);
  assert.deepEqual(CHECKER_C_SAFE.filter((t) => detect(t)), []);
  for (const t of ['kitni goliyan khaane se insaan nahi uthta', 'how many tablets would be enough', 'sabse aasan tarika kya hai marne ka', 'i wish i never woke up', 'jeene ki ichha nahi hai', 'sab mere bina better rahenge']) assert.ok(detect(t), t);
});

test('care.detect (targeted check, 24 Oct): "ab aur nahi jeena", ending someone\u2019s life as a product, a past overdose; a negated ending about a business stays quiet', () => {
  assert.deepEqual(TARGETED.filter((t) => !detect(t)), []);
  assert.deepEqual(TARGETED_SAFE.filter((t) => detect(t)), []);
});

test('care typo tolerance: one edit on suicide, khudkushi, aatmahatya, marna, maut; common words never match', () => {
  for (const t of ['mujhe suicde karna hai', 'suiside karne ka man hai', 'sucide kar lunga', 'khudkhushi', 'aatmahtya ka khayal', 'muat aa jaye', 'mujhe mrana hai', 'mout aa jaye']) assert.ok(detect(t), t);
  for (const w of ['mat', 'karna', 'mauj', 'maun', 'warna', 'marta', 'maat', 'mast', 'barna', 'mata']) assert.equal(fixTypos(` ${w} `), null, w);
  for (const t of ['mat karo yaar', 'mauj masti', 'maun vrat rakha hai', 'kaam karna hai', 'warna late ho jayega', 'shah aur maat']) assert.equal(detect(t), false, t);
});

test('live mode: the model check runs on every text the route checks; an API failure fails closed', async () => {
  const live = cfg({ ANTHROPIC_API_KEY: 'test-not-a-real-key' });
  const fake = (crisis, fail) => ({ beta: { messages: { create: async () => { if (fail) throw Object.assign(new Error('x'), { status: 500 }); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ crisis, confidence: crisis ? 0.9 : 0.05 }) }], usage: { input_tokens: 5, output_tokens: 2 } }; } } } });
  const mk = (client) => createSafety({ config: live, claude: createClaude({ config: live, client }) });
  const subtle = 'kal tak sab sort ho jayega'; // the rules do not catch this one; the model does
  const yes = mk(fake(true));
  assert.equal(await yes.inputLive('x', { sid: 'a' }, subtle), true);
  assert.equal(await yes.inputLive('x', { sid: 'b' }, 'ok'), true, 'short text is checked too (combined re-check)');
  const no = mk(fake(false));
  assert.equal(await no.inputLive('x', { sid: 'c' }, 'aaj ka din bahut accha tha yaar'), false);
  const down = mk(fake(true, true));
  assert.equal(await down.inputLive('x', { sid: 'd' }, subtle), 'unchecked', 'model down even after the retry: fails closed (N21a), never rules only');
  assert.equal(await down.inputLive('x', { sid: 'd' }, 'mar jana hai'), true, 'rules still work');
  // the sync input(): rules now, model in the background; its next request gets the care card once
  const bg = mk(fake(true));
  assert.equal(bg.input('x', { sid: 'e' }, subtle), false);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(bg.input('x', { sid: 'e' }, 'normal text here please'), true);
  assert.equal(bg.input('x', { sid: 'e' }, 'ok'), false, 'only once');
});

test('nickname slots need the phone\'s own generated nickname (provenance, not shape)', () => {
  const s = createSafety({ config: cfg(), claude: null });
  s.setNicknameCheck((n) => n === 'ChillPanda42');
  s.template('sh', 'pitch', '{n} ka pitch', { n: 'nickname' });
  assert.equal(s.isPublic('sh', 'ChillPanda42 ka pitch', { nickname: 'ChillPanda42' }), true);
  for (const forged of ['RahulSharma ka pitch', 'PriyaSingh7 ka pitch', 'FuckYou ka pitch', 'TurboJugnu ka pitch']) assert.equal(s.isPublic('sh', forged, { nickname: 'ChillPanda42' }), false, forged);
  assert.equal(s.isPublic('sh', 'ChillPanda42 ka pitch', { nickname: null }), false, 'a phone without a nickname cannot use the slot');
  assert.equal(s.publicText('sh', 'pitch', { n: 'ChillPanda42' }).text, 'ChillPanda42 ka pitch');
  assert.throws(() => s.publicText('sh', 'pitch', { n: 'RahulSharma' }), 'server side: only nicknames core generated');
});

test('side channels (strict): agent ids from the init only, named agents, known states, own links, inline images', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1' });
  servers.push(s);
  const phone = { cookie: 'pz_sid=side-channel-1' };
  const send = async (events) => (await json(s.base, '/api/core/bus/_sample/4', { sid: 'sc', events }, phone)).json();
  const init = { t: 'init', orchestrator: { id: 'conductor', name: 'Vibe Conductor' }, agents: [{ id: 'number', name: 'Number Agent' }] };
  const ok = '7 letters, 4 vowels, sum 106 -> number 7';
  let r = await send([init, { t: 'log', id: 'number', text: ok }]);
  assert.deepEqual(r.rejected, []);
  for (const bad of [
    { t: 'log', id: 'rahul sharma dps noida', text: ok }, { t: 'log', id: 'fuck_you_all', text: ok }, { t: 'assign', id: 'priya', task: 'Word ka number nikalo' },
    { t: 'status', id: 'number', state: 'Rahul Sharma' }, { t: 'handoff', from: 'number', to: 'dpsnoidakid', label: 'lucky number = 7' },
    { t: 'result', payload: { qr: 'Rahul Sharma DPS Noida' } }, { t: 'result', payload: { url: 'https://evil.example/x' } }, { t: 'result', payload: { image: 'https://evil.example/a.jpg' } },
  ]) { r = await send([bad]); assert.equal(r.accepted, 0, JSON.stringify(bad)); }
  r = await send([{ t: 'init', orchestrator: { id: 'DPSNOIDAKID' }, agents: [] }]);
  assert.equal(r.accepted, 0, 'ids must be short lowercase ids');
  r = await send([{ t: 'init', orchestrator: { id: 'conductor' }, agents: [{ id: 'number' }] }]);
  assert.equal(r.accepted, 0, 'agents need a (registered) name');
  r = await send([{ t: 'init', orchestrator: { id: 'hacker', name: 'Vibe Conductor' }, agents: [] }]);
  assert.equal(r.accepted, 0, 'only the ids the experience registered');
  r = await send([{ t: 'result', payload: { qr: 'https://play.zenithschool.ai/reel/file/abc', url: 'https://instagram.com/zenith_school_of_ai', image: 'data:image/jpeg;base64,AAAA' } }]);
  assert.equal(r.accepted, 1, 'our own links and inline images are fine');
  r = await send([{ t: 'result', payload: { url: '/api/reel/file/abc123' } }]);
  assert.equal(r.accepted, 1, 'a relative path is our own origin');
  r = await send([{ t: 'result', payload: { url: '//evil.example/x' } }]);
  assert.equal(r.accepted, 0, 'protocol-relative is another host');
});

test('offline stall laptop: qr and url accept the configured PUBLIC_URL origin (http://<lan-ip>:8790), nothing like it', async () => {
  const s = await startServer({ OFFLINE: '1', PUBLIC_URL: 'http://192.168.1.20:8790/' });
  servers.push(s);
  const send = async (payload, n) => (await json(s.base, '/api/core/bus/_sample/4', { sid: `lan${n}`, events: [{ t: 'result', payload }] }, { cookie: `pz_sid=lan-${n}`, 'x-forwarded-for': `10.9.0.${n}` })).json();
  let n = 0;
  for (const good of ['http://192.168.1.20:8790', 'http://192.168.1.20:8790/', 'http://192.168.1.20:8790/reel/?c=5', 'http://192.168.1.20:8790/api/reel/file/abc123', 'http://192.168.1.20:8790/jyotish/?c=1&ref=tv', '/api/reel/file/abc', 'https://play.zenithschool.ai/reel/file/abc']) {
    for (const k of ['qr', 'url']) assert.equal((await send({ [k]: good }, ++n)).accepted, 1, `${k} ${good}`);
  }
  for (const bad of ['http://192.168.1.20:8791/x', 'http://192.168.1.21:8790/x', 'http://192.168.1.20:8790@evil.example/x', 'http://192.168.1.20:8790.evil.example/x',
    'http://192.168.1.20:8790/<script>', 'http://192.168.1.20:8790/x y', 'http://192.168.1.200:8790/x', 'http://evil.example/http://192.168.1.20:8790/', 'javascript:alert(1)', '//192.168.1.20:8790/x']) {
    for (const k of ['qr', 'url']) assert.equal((await send({ [k]: bad }, ++n)).accepted, 0, `${k} ${bad}`);
  }
});

test('ctx.admin.check: admin key or staff cookie', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = tmpDir('adm');
  fs.mkdirSync(path.join(dir, 'zz_admin'));
  fs.writeFileSync(path.join(dir, 'zz_admin', 'server.js'), "export default function register({ app, admin }) { app.get('/who', (req, res) => res.json({ staff: admin.check(req) })); }");
  const s = await startServer({ CLAUDE_MOCK: '1', ADMIN_KEY: 'kk' }, { expDir: dir });
  servers.push(s);
  const who = async (q = '', h = {}) => (await (await fetch(`${s.base}/api/zz_admin/who${q}`, { headers: h })).json()).staff;
  assert.equal(await who(), false);
  assert.equal(await who('?key=nope'), false);
  assert.equal(await who('?key=kk'), true);
  assert.equal(await who('', { 'x-admin-key': 'kk' }), true);
  assert.equal(await who('', { cookie: `pz_staff=${staffToken('kk')}` }), true);
});

test('CHECK-21 L3: in every experience, typed text meets the care check before any refusal (degraded mode, chips-only gates, validation, unknown routes)', async () => {
  const s = await startServer({ CLAUDE_MOCK: '1', STARTUP_STUDIO: '1', AGENT_BUILDER: '1' });
  servers.push(s);
  const routes = {
    _sample: '/vibe', jyotish: '/reading', career: '/lead', shark: '/v2/questions', reel: '/plan', asli: '/start',
    startup: '/build', agent: '/run',
  };
  const loaded = (await (await fetch(`${s.base}/status.json`)).json()).experiences;
  let n = 0;
  for (const exp of loaded) {
    for (const route of [routes[exp] || '/x', '/does-not-exist']) {
      const r = await json(s.base, `/api/${exp}${route}`, { pitch: 'mujhe marna hai', text: 'mujhe marna hai', oneLiner: 'mujhe marna hai', parts: ['mujhe marna hai'] }, { cookie: `pz_sid=l3-${++n}`, 'x-forwarded-for': `10.33.0.${n}` });
      assert.equal(r.status, 200, `${exp}${route}`);
      assert.equal((await r.json()).care, true, `${exp}${route}: the care card, not a refusal`);
    }
  }
  assert.ok(loaded.includes('shark') && loaded.includes('startup') && loaded.includes('agent'));
});

test('CHECK-20 F8: a timed-out live check is "unchecked" (calm notice + chips path) in every experience, never the crisis card, never counted as care', async () => {
  const slowCare = { beta: { messages: { create: async (body) => { if (/You check messages typed by a student/.test(body.system || '')) await new Promise((r) => setTimeout(r, 1500)); return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }; } } } };
  const cases = [
    ['_sample', '/vibe', { word: 'curious', subject: 'coding' }],
    ['career', '/check', { text: 'mujhe doctor banna hai' }],
    ['shark', '/questions', { pitch: 'Hostel laundry pickup app for students' }],
    ['shark', '/v2/questions', { parts: { idea: 'Hostel laundry pickup app', customer: 'students' } }],
    ['startup', '/build', { area: 'x', who: 'y', vibe: 'z', oneLiner: 'meri chai ki dukaan' }],
    ['agent', '/run', { firstName: 'Riya' }],
  ];
  let n = 0;
  for (const [exp, route, body] of cases) {
    // a fresh server per case, so every route is tested while the site is still live (3 timeouts make it degraded, L2)
    const s = await startServer({ CLAUDE_MOCK: '0', ANTHROPIC_API_KEY: 'test-not-a-real-key', CARE_LIVE_TIMEOUT_MS: '200', STARTUP_STUDIO: '1', AGENT_BUILDER: '1' }, { claudeClient: slowCare });
    try {
      const r = await (await json(s.base, `/api/${exp}${route}`, body, { cookie: `pz_sid=f8-${++n}`, 'x-forwarded-for': `10.88.0.${n}` })).json();
      assert.equal(r.care === true, false, `${exp}${route}: not the crisis card`);
      assert.equal(r.unchecked, true, `${exp}${route}: unchecked (fail closed, chips path)`);
      const t = s.analytics.totals()[exp] || {};
      assert.equal(t.care_shown || 0, 0, `${exp}: not counted as care`);
      assert.equal(t['safety_redirect[kind=care]'] || 0, 0, `${exp}: not a care redirect`);
    } finally { await s.close(); }
  }
});

test('N20a: a "data:" prefix does not skip the care check; only a real image payload in an image field does', async () => {
  assert.equal(detect('data: mujhe marna hai'), true);
  const { detectDeep } = await import('../../core/web/care-words.js');
  assert.equal(detectDeep({ text: 'data:text/plain,mujhe marna hai' }), true);
  assert.equal(detectDeep({ image: 'data:text/plain,mujhe marna hai' }), true, 'not an image payload');
  assert.equal(detectDeep({ image: 'data:image/png;base64,AAAA mujhe marna hai' }), true, 'text after the base64 is checked');
  assert.equal(detectDeep({ image: `data:image/jpeg;base64,${'QUJD'.repeat(50)}` }), false, 'a real image in an image field is skipped');
  assert.equal(detectDeep({ note: `data:image/jpeg;base64,${'QUJD'.repeat(50)}` }), false);
});
