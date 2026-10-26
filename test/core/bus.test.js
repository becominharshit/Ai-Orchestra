import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus, checkEvent } from '../../core/server/bus.js';
import { makeConfig } from '../../core/server/config.js';

test('TV safety: personal fields and personal-looking values are rejected', () => {
  const bad = [
    { t: 'result', payload: { title: 'ok', name: 'Priya' } },
    { t: 'result', payload: { title: 'ok', data: 1 } },
    { t: 'result', payload: { items: [{ dob: '2009-01-01' }] } },
    { t: 'result', payload: { birthPlace: 'Gurugram' } },
    { t: 'result', payload: { title: 'Call 98765 43210' } },
    { t: 'result', payload: { lines: ['follow @priya.codes'] } },
    { t: 'log', id: 'a', text: 'DOB 14/08/2009 -> Leo' },
    { t: 'log', id: 'a', text: 'mail me a@b.co' },
    { t: 'custom', name: 'x', data: { username: 'p' } },
    { t: 'assign', id: 'a', task: 'x', name: 'Priya' },
    { t: 'nope' },
  ];
  for (const ev of bad) assert.equal(checkEvent(ev).ok, false, JSON.stringify(ev));
  const good = [
    { t: 'result', payload: { kicker: 'Vibe', title: 'Curious Builder', lines: ['Tag @zenith_school_of_ai'], number: 7, forFun: true } },
    { t: 'log', id: 'a', text: '7 letters, 4 vowels -> number 7, year 2030' },
    { t: 'init', title: 'X', orchestrator: { id: 'g', name: 'Guru' }, agents: [{ id: 'a', name: 'Rashi Agent', role: 'Sun sign' }] },
  ];
  for (const ev of good) assert.equal(checkEvent(ev).ok, true, JSON.stringify(ev));
});

test('experiences can extend the allowlist, never with a denied key', () => {
  const bus = createBus({ config: makeConfig({}) });
  bus.allowKeys('shark', ['sharkScore', 'name']);
  const r = bus.publish('shark', 6, 'sid1', [{ t: 'result', payload: { sharkScore: 8 } }, { t: 'result', payload: { name: 'x' } }]);
  assert.equal(r.accepted, 1);
  assert.equal(r.rejected.length, 1);
});

test('pin holds the current session; other phones are held until unpinned', () => {
  const bus = createBus({ config: makeConfig({}) });
  const ev = [{ t: 'init', orchestrator: { id: 'g', name: 'G' }, agents: [] }];
  assert.equal(bus.publish('jyotish', 1, 'A', ev).accepted, 1);
  // the TV token comes with the SSE hello; read it through a fake subscription
  let hello = null;
  const res = { writeHead() {}, write(s) { const m = s.match(/^data: (.*)\n\n$/); if (m) { const j = JSON.parse(m[1]); if (j.type === 'hello') hello = j; } } };
  bus.subscribe('jyotish', 1, { on() {} }, res);
  assert.ok(hello.token && hello.active.length === 1);
  assert.equal(bus.pin('jyotish', 1, 'wrong', true).ok, false);
  assert.equal(bus.pin('jyotish', 1, hello.token, true).pinned, true);
  assert.equal(bus.publish('jyotish', 1, 'B', ev).held, true);
  assert.equal(bus.publish('jyotish', 1, 'A', [{ t: 'log', id: 'g', text: 'still me' }]).accepted, 1);
  bus.pin('jyotish', 1, hello.token, false);
  assert.equal(bus.publish('jyotish', 1, 'B', ev).accepted, 1);
  assert.equal(bus.publish('nope', 1, 'B', ev).accepted, 0);
});

test('value scan also catches dotted phone numbers and worded dates', () => {
  for (const text of ['call 98765.43210', '+91 (98765) 43210', 'born 4 March 2006', 'born 4th of Mar 2006', 'DOB March 4, 2006', "b'day 12 aug '07"]) {
    assert.equal(checkEvent({ t: 'log', id: 'a', text }).ok, false, text);
  }
  for (const text of ['2026 vs 2030', 'Round 3 of 10', '1080x1920 PNG ready, 1950 KB', 'May the force be with you', 'sum 106 -> number 7']) {
    assert.equal(checkEvent({ t: 'log', id: 'a', text }).ok, true, text);
  }
});

test('text filter: 140 chars max, links stripped (own links kept), Hindi and English profanity masked', async () => {
  const { cleanText } = await import('../../core/server/textfilter.js');
  const long = checkEvent({ t: 'log', id: 'a', text: 'x'.repeat(300) }).event.text;
  assert.equal([...long].length, 140);
  const r = checkEvent({ t: 'result', payload: { title: 'Visit https://evil.example.com now', lines: ['join bit.ly/abc', 'play.zenithschool.ai/jyotish', 'tu chutiya hai bc', 'What the F*ck'], qr: 'https://play.zenithschool.ai/reel/file/abc' } });
  assert.equal(r.ok, true);
  const p = r.event.payload;
  assert.equal(p.title, 'Visit now');
  assert.equal(p.lines[0], 'join');
  assert.equal(p.lines[1], 'play.zenithschool.ai/jyotish');
  assert.equal(p.lines[2], 'tu *** hai ***');
  assert.equal(p.qr, 'https://play.zenithschool.ai/reel/file/abc', 'QR urls are kept');
  assert.equal(cleanText('M4darch0d'), '***');
  assert.equal(cleanText('Chhodo yaar, gandhi ji ki jai'), 'Chhodo yaar, gandhi ji ki jai', 'no false positives on similar words');
  assert.equal(checkEvent({ t: 'handoff', from: 'a', to: 'b', label: 'see www.spam.in' }).event.label, 'see');
});

test('publish limit is keyed on the server session cookie + IP, not the client sid', () => {
  const bus = createBus({ config: makeConfig({}) });
  const ev = [{ t: 'log', id: 'g', text: 'x' }];
  let limited = 0;
  // the same phone (cookie + IP) rotating a fresh body sid on every POST is still limited
  for (let i = 0; i < 130; i++) if (bus.publish('jyotish', 2, `rotating-${i}`, ev, { session: 'cookie-A', ip: '49.36.1.2' }).limited) limited++;
  assert.equal(limited, 10);
  assert.equal(bus.publish('jyotish', 2, 'x', ev, { session: 'cookie-B', ip: '49.36.1.2' }).limited, undefined, 'another phone on the same CGNAT IP is fine');
  // a client that drops its cookie every time hits the per-IP cap
  let ipLimited = 0;
  for (let i = 0; i < 1300; i++) if (bus.publish('jyotish', 3, `s${i}`, ev, { session: `fresh-${i}`, ip: '10.9.9.9' }).limited) ipLimited++;
  assert.equal(ipLimited, 100);
  // server-side publishes (no rate) are never limited
  for (let i = 0; i < 200; i++) assert.equal(bus.publish('jyotish', 4, 'server', ev).limited, undefined);
});

test('privacy: image bytes are dropped from the replay buffer on end, on the next visitor, and after 3 minutes', () => {
  let t = 0;
  const bus = createBus({ config: makeConfig({}), now: () => t });
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(5000);
  const palm = (sid, c) => bus.publish('jyotish', c, sid, [
    { t: 'init', orchestrator: { id: 'g', name: 'Guru' }, agents: [{ id: 'h', name: 'Hast Rekha Agent' }] },
    { t: 'result', payload: { title: 'Palm', image: img, overlay: { paths: [{ x: 1, y: 2 }] } } },
  ]);
  const hello = (c) => { let h; bus.subscribe('jyotish', c, { on() {} }, { writeHead() {}, write(s) { const m = s.match(/^data: (.*)\n\n$/); if (m && JSON.parse(m[1]).type === 'hello') h = JSON.parse(m[1]); } }); return h; };
  // 1. end event
  palm('A', 11);
  assert.equal(bus.holdsImages(), true);
  bus.publish('jyotish', 11, 'A', [{ t: 'end' }]);
  assert.equal(bus.holdsImages(), false);
  const h1 = hello(11);
  assert.ok(!JSON.stringify(h1).includes('data:image'));
  assert.deepEqual(h1.active.find((e) => e.t === 'result').payload.overlay, { paths: [{ x: 1, y: 2 }] }, 'the overlay stays for replay');
  // 2. next visitor starts before an end
  palm('B', 12);
  bus.publish('jyotish', 12, 'C', [{ t: 'init', orchestrator: { id: 'g', name: 'Guru' }, agents: [] }]);
  assert.equal(bus.holdsImages(), false);
  assert.ok(!JSON.stringify(hello(12)).includes('data:image'));
  // 3. timeout: the visitor never ends, 3 minutes pass
  palm('D', 13);
  t += 2 * 60 * 1000;
  bus.sweepImages();
  assert.equal(bus.holdsImages(), true, 'still inside the 3 minutes');
  t += 60 * 1000;
  bus.sweepImages();
  assert.equal(bus.holdsImages(), false);
  assert.ok(!JSON.stringify(hello(13)).includes('data:image'));
});


test('init keeps the optional short agent label (cleaned, max 12 chars)', () => {
  const r = checkEvent({ t: 'init', orchestrator: { id: 'm', name: 'Shark Host' }, agents: [{ id: 'a', name: 'Shark', role: 'Venture capital', label: 'VC' }, { id: 'b', name: 'Shark', label: 'MARKETING-HEAD-X' }] });
  assert.equal(r.ok, true);
  assert.equal(r.event.agents[0].label, 'VC');
  assert.equal(r.event.agents[1].label, 'MARKETING-HE');
});

test('profanity mask: punctuation, spacing, symbols and vowel-dropped forms cannot dodge it; allow-list stays', async () => {
  const { cleanText } = await import('../../core/server/textfilter.js');
  const bad = ['fuck!', 'fuck!!', 'FUCK!!!', 'what the fuck!', 'bitch!', 'shit!', 'chutiya!', 'madarchod!!', 'rape!', 'lund!', 'mc!', 'bc!',
    'f u c k', 'f.u.c.k', 'F-U-C-K', 'f*ck', 'fck', 'fvck', 'fuk', 'fucc', 'phuck', 'biatch', 'bsdk', 'bakchod', 'bhadve', 'dumbass', 'wtf', 'stfu',
    'sh!t', 'a$$hole', 'b1tch', '!!madarchod!!', '(chutiya)', '"bitch"', '#fuck', 'fuck...', 'fuuuuck', 'chutiyaa', 'mother fucker', 'chtya', 'mdrchd',
    'c h u t i y a', 'b.c', 'm-c'];
  for (const b of bad) assert.ok(cleanText(b).includes('***'), `not masked: ${b}`);
  assert.equal(cleanText('tu chutiya! hai'), 'tu *** hai');
  const good = ['sex ratio', 'MC Stan', 'MC of the event', 'the MC', '3000 BC', '500 BCE', 'sab chod diya', 'kuch chod do', 'Chhodo yaar', 'gandhi ji',
    'Scunthorpe', 'Essex', 'assessment', 'cockpit', 'Dickens', 'classic', 'Gandhinagar', 'Bhosle', 'Randhir', 'Sandhya', 'Lundberg', 'Chodhary',
    'Lucky number 7: aaj ka din tumhara hai.', '1080x1920', 'A+ grade', '2026 vs 2030', 'sum 106 -> number 7', 'TTS model', 'pls', 'hrs', 'km',
    'Dick Whittington', 'e.g. this', 'Dr. Smith', 'Next.js', 'U.S.A', 'A B C', 'I am a student', 'x y z', 'chatty', 'Wow!!', 'Deal!'];
  for (const g of good) assert.equal(cleanText(g), g, `false positive: ${g}`);
});

test('CHECK-19 F1: numbers on the bus: 5+ digit numbers and number-only strings are refused unless the key has a registered range; server-only event types', async () => {
  const { startServer, json, tmpDir } = await import('./helpers.js');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = tmpDir('bus-num-');
  fs.mkdirSync(path.join(dir, 'zz_num'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zz_num', 'server.js'), `export default function register({ app, bus }) {
    bus.numbers({ score: [0, 250000] });
    bus.serverOnly(['result', 'custom:board']);
    app.post('/tv', (req, res) => res.json(bus.publish(3, 'srv-' + Date.now(), [{ t: 'result', ts: 1, payload: { title: 'x', score: 120000 } }])));
  }`);
  fs.mkdirSync(path.join(dir, '_sample'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_sample', 'server.js'), 'export default function register() {}');
  const s = await startServer({ CLAUDE_MOCK: '1', PUBLIC_TEXT_STRICT: '0' }, { expDir: dir });
  try {
    let n = 0;
    const send = async (exp, events) => (await (await json(s.base, `/api/core/bus/${exp}/4`, { sid: `num-${++n}`, events }, { cookie: `pz_sid=num-${n}`, 'x-forwarded-for': `10.7.0.${n}` })).json());
    // the forged agent result from CHECK-19: a phone number as a number, and as number-only strings
    for (const bad of [{ score: 9876543210 }, { value: 9876543210 }, { number: 98765 }, { values: [1, 2, 9876543210] }, { value: '9876543210' }, { number: '98765 43210' }, { score: '+91-98765-43210' }, { value: 1e12 }]) {
      const r = await send('_sample', [{ t: 'result', ts: 1, payload: { title: 'Agent result', ...bad } }]);
      assert.equal(r.accepted, 0, JSON.stringify(bad));
    }
    // ordinary numbers and core-ranged keys are fine
    const ok = await send('_sample', [{ t: 'result', ts: 1, payload: { title: 'x', score: 87, number: 7, percent: 64.5, max: 9999, duration: 41, x: 0.4321987, y: 1200 } }]);
    assert.equal(ok.accepted, 1);
    assert.equal((await send('_sample', [{ t: 'log', id: 'g', ts: 'soon', text: 'x' }])).accepted, 0, 'ts must be a number');
    // a registered range: the experience's own big numbers, within range only
    assert.equal((await send('zz_num', [{ t: 'custom', ts: 1, name: 'tick', data: { score: 120000 } }])).accepted, 1);
    assert.equal((await send('zz_num', [{ t: 'custom', ts: 1, name: 'tick', data: { score: 9876543210 } }])).accepted, 0);
    // server-only types: a phone cannot send them; the server can
    const forged = await send('zz_num', [{ t: 'result', ts: 1, payload: { title: 'x' } }, { t: 'custom', ts: 1, name: 'board', data: { score: 5 } }]);
    assert.equal(forged.accepted, 0);
    assert.match(forged.rejected[0].reason, /only the server sends this event/);
    assert.equal((await (await json(s.base, '/api/zz_num/tv', {})).json()).accepted, 1);
  } finally { await s.close(); }
});

test('CHECK-20 F6: numbers split by zero-width or any separator, other digit scripts, decimals and adjacent fields never reach a TV; only the normalised value is published', async () => {
  const { startServer, json, tmpDir } = await import('./helpers.js');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = tmpDir('bus-f6-');
  fs.mkdirSync(path.join(dir, '_sample'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_sample', 'server.js'), "export default function register({ safety }) { safety.bank('t', { a: 'Hello agents' }); }");
  const Z = '​';
  const forged = [
    `98765${Z}43210`, `9‌8‌7‌6‌5‌4‌3‌2‌1‌0`, `98765⁠43210`, `9${Z}8${Z}7${Z}6${Z}5${Z}4${Z}3${Z}2${Z}1${Z}0`,
    '９８７６５４３２１０', '९८७६५४३२१०', '9,876,543,210', '98765_43210', '98765/43210', '98765·43210', '98765 43210', '+91 (98765) 43210', 'Call 98765-43210 now',
  ];
  for (const strict of ['1', '0']) {
    const s = await startServer({ CLAUDE_MOCK: '1', PUBLIC_TEXT_STRICT: strict }, { expDir: dir });
    try {
      let n = 0;
      const send = async (payload) => (await (await json(s.base, '/api/core/bus/_sample/4', { sid: `f6-${strict}-${++n}`, events: [{ t: 'result', ts: 1, payload }] }, { cookie: `pz_sid=f6-${strict}-${n}`, 'x-forwarded-for': `10.6.${strict}.${n}` })).json());
      for (const v of forged) assert.equal((await send({ title: v })).accepted, 0, `strict=${strict} title ${JSON.stringify(v)}`);
      for (const p of [{ value: 9876.54321 }, { value: 0.987654321 }, { value: -9876.54321 }, { points: [98765, 43210] }, { duration: 3599999 }, { x: 98765 }]) assert.equal((await send({ title: 'Hello agents', ...p })).accepted, 0, `strict=${strict} ${JSON.stringify(p)}`);
      // fine: short numbers, ranged decimals, normal text
      assert.equal((await send({ title: 'Hello agents', score: 87, percent: 64.5, value: 0.05, x: 0.4321987, rank: 3 })).accepted, 1, `strict=${strict} ordinary numbers`);
    } finally { await s.close(); }
  }
  // the published value is the normalised one (zero-width characters removed)
  const { createBus } = await import('../../core/server/bus.js');
  const bus = createBus({ config: makeConfig({ PUBLIC_TEXT_STRICT: '0' }) });
  bus.allowExp('_sample');
  const r = bus.publish('_sample', 4, 'norm', [{ t: 'result', ts: 1, payload: { title: `Hel${Z}lo` } }]);
  assert.equal(r.accepted, 1);
  // a plain number is public text only up to 4 digits
  const { createSafety } = await import('../../core/server/safety.js');
  const safety = createSafety({ config: makeConfig({}), claude: null });
  assert.equal(safety.isPublic('_sample', '1234'), true);
  assert.equal(safety.isPublic('_sample', '98765'), false);
  assert.equal(safety.isPublic('_sample', '9876543210'), false);
  assert.equal(safety.isPublic('_sample', '9876.54321'), false);
});
