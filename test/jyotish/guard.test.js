// Output guard: adversarial model outputs are rewritten or rejected; all fixtures pass clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardReading, breaks, tidy, norm, RULES } from '../../experiences/jyotish/lib/guard.js';
import { DATING, HEALTH, ADJ, resolveVibes, pickVibes } from '../../experiences/jyotish/lib/banks.js';
import { CHECKER_PROBES, OWN_PROBES, CHECK02B_NEG, CHECK02B_POS } from './probes.js';
import { banks as publicBanks, makeMatcher, TEMPLATES } from '../../experiences/jyotish/lib/public.js';
import { fill } from '../../experiences/jyotish/web/lib/publictext.js';
import { NUMBER_LINES } from '../../experiences/jyotish/server.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../experiences/jyotish');
const READ = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/reading.json'), 'utf8'));
const VIBES = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures/vibes.json'), 'utf8'));
const HERO = JSON.parse(fs.readFileSync(path.join(DIR, 'demo/hero.json'), 'utf8')).fixtures.reading;
const allStrings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === 'object' ? Object.values(v).flatMap(allStrings) : []);

test('every fixture line passes the guard unchanged (12 readings, 12 vibes, hero)', () => {
  assert.equal(READ.length, 12);
  assert.equal(VIBES.length, 12);
  for (const [i, r] of [...READ, HERO].entries()) {
    const g = guardReading(r, { fallback: r });
    assert.equal(g.rewrites, 0, `reading ${i}: ${g.hits}`);
    for (const k of ['who', 'past', 'future']) assert.equal(r[k].length, 3, `reading ${i}.${k}`);
  }
  for (const [i, v] of VIBES.entries()) assert.equal(resolveVibes(v, `lp${i}`).fixed, 0, `vibes fixture ${i} uses only valid bank ids`);
  for (const l of Object.values(NUMBER_LINES)) assert.equal(breaks(l), null, l);
  for (const s of allStrings([READ, HERO])) {
    assert.ok(!/[\u2013\u2014]/.test(s), `dash in: ${s}`);
    assert.ok(s.length <= 120, `too long for the TV: ${s}`);
  }
});

// Lines a model could plausibly produce that must never reach a visitor.
const ADVERSARIAL = {
  death: ['Agle saal ek accident ho sakta hai, dhyaan rakhna.', 'Tumhare ghar mein kisi ki death ka yog hai.', 'Tum 60 saal ki umar mein mar jaoge.'],
  medical: ['Tumhe sugar ki bimari ho sakti hai.', 'Thoda stress aur anxiety rahegi is mahine.', 'Hospital ke chakkar lag sakte hain.'],
  body: ['Tumhe thoda weight kam karna chahiye.', 'Tumhari skin glow karegi agar diet badlo.', 'Mota hone se bacho.'],
  romance: ['Is saal tumhara breakup hoga.', 'Tumhari girlfriend tumhe dhokha degi.', 'Shaadi jaldi hogi, tumhara crush haan bolega.'],
  exam_fail: ['Board exams mein thodi problem, fail hone ka darr.', 'Ek backlog aa sakta hai.', 'JEE mein rank pakki hai.'],
  money_loss: ['Business mein loss hoga.', 'Karz lene se bacho.', 'Tum crorepati banoge.'],
  guarantee: ['Tumhe 100% placement milega.', 'Salary 40 lakh ka package hoga.', 'Google mein job pakki hai, guarantee.'],
  negative: ['Shani ka bura samay chal raha hai.', 'Tumhari kundli mein manglik dosh hai.', 'Beware, koi dushman nazar laga raha hai.', 'Tum thode lazy aur akela feel karoge.'],
};

test('each rule catches its adversarial lines', () => {
  for (const [rule, lines] of Object.entries(ADVERSARIAL)) {
    for (const l of lines) assert.ok(breaks(l), `${rule} not caught: ${l}`);
  }
  assert.equal(RULES.length, 10);
});

test('positive Hinglish lines are not false positives', () => {
  const ok = [
    'Tum group project ko crush kar doge.', 'Tumhare notes itne clean hain ki log photocopy karwate hain.', 'Marks ki nahi, ideas ki baat karte hain.',
    'Tumhari skills next level pe jayengi.', 'Supply chain aur data dono samajhne wale banoge.',
    'Tumhare gun sab pehchante hain.', 'Life path 7: tum deep thinker ho.', 'Fearless vibe, seedhi baat.', 'Tum har cheez ko grand bana dete ho.',
    'Har jagah tumhari baat hoti hai.', 'Tumne kisi junior ko josh diya.', 'Kabhi nahi bhoola woh din.',
  ];
  for (const l of ok) assert.equal(breaks(l), null, `false positive: ${l}`);
});

test('tidy: dashes, handles, dates, place names, length', () => {
  assert.equal(tidy('Tum star ho \u2014 sach mein'), 'Tum star ho, sach mein');
  assert.equal(tidy('Range 3\u20135 tak'), 'Range 3, 5 tak');
  assert.equal(tidy('Follow @someone abhi'), 'Follow abhi');
  assert.equal(tidy('Tumhara din 12/08/2007 ko aaya'), 'Tumhara din ko aaya');
  assert.equal(tidy('Jaipur ki galiyon jaisi energy', { place: 'Jaipur, Rajasthan' }), 'tumhara shehar ki galiyon jaisi energy');
  const long = tidy('a'.repeat(30) + ' ' + 'bahut lambi line '.repeat(10));
  assert.ok(long.length <= 121 && long.endsWith('.'));
});

test('a mostly fine reading gets its bad lines rewritten from the fallback, not rejected', () => {
  const fb = READ[4];
  const raw = structuredClone(fb);
  raw.past[1] = 'Pichle saal tumhara breakup hua tha.';
  raw.future[2] = 'Agle mahine exam mein fail hone ka yog hai.';
  raw.who[0] = 'Tum Leo ho \u2014 aur Jaipur ke king.';
  raw.palm.lines[0].meaning = 'Heart line kehti hai heartbreak aayega.';
  const g = guardReading(raw, { fallback: fb, place: 'Jaipur' });
  assert.equal(g.rejected, false);
  assert.equal(g.rewrites, 3);
  assert.equal(g.data.past[1], fb.past[1]);
  assert.equal(g.data.future[2], fb.future[2]);
  assert.equal(g.data.who[0], 'Tum Leo ho, aur tumhara shehar ke king.');
  assert.equal(g.data.meanings.heart, '');
  assert.deepEqual(g.hits.sort(), ['exam', 'romance', 'romance']);
});

test('an answer full of bad lines is rejected; missing and extra items are fixed to 3', () => {
  const fb = READ[0];
  const raw = { title: 'Doomed Soul', who: ADVERSARIAL.death, past: ADVERSARIAL.money_loss, future: ADVERSARIAL.romance, career: { headline: 'Pakka placement 100%', read: ADVERSARIAL.guarantee, learn: ['x'], roles: ['a', 'b', 'c', 'd', 'e'] }, tvLine: 'Shani ka dosh', palm: { lines: [] } };
  const g = guardReading(raw, { fallback: fb });
  assert.equal(g.rejected, true);
  const ok = guardReading({ ...structuredClone(fb), who: [fb.who[0]], past: [...fb.past, 'extra line'] }, { fallback: fb });
  assert.equal(ok.data.who.length, 3);
  assert.equal(ok.data.past.length, 3);
  assert.equal(ok.data.career.learn.length, 3);
});

test('CHECK-02: all 138 checker probes are caught (controls pass) and all own probes are caught', () => {
  let n = 0;
  for (const [cat, lines] of Object.entries(CHECKER_PROBES)) {
    for (const l of lines) {
      n += 1;
      if (cat === 'controls') assert.equal(breaks(l), null, `false positive: ${l}`);
      else assert.ok(breaks(l), `${cat} slipped: ${l}`);
    }
  }
  assert.equal(n, 138);
  assert.ok(OWN_PROBES.length >= 40);
  for (const l of OWN_PROBES) assert.ok(breaks(l), `own probe slipped: ${l}`);
});

test('normalisation folds Hinglish spelling variants', () => {
  assert.equal(norm('Bimaaaar'), norm('bimar'));
  assert.equal(norm('beemari'), 'bimari');
  assert.equal(norm('Chhod dega!!'), 'chod dega');
  for (const l of ['Tum BIMAAR padoge', 'nuksaaan hoga', 'dil tooot jayega', 'paise doob jaayenge', 'tum haaaroge']) assert.ok(breaks(l), l);
});

test('curated banks: 40+ reviewed lines per content list, all pass the guard, Health skip is habits only', () => {
  for (const [k, list] of Object.entries({ forecast: DATING.forecast, flags: DATING.flags, signs: DATING.signs, superfoods: HEALTH.superfoods, skip: HEALTH.skip })) {
    assert.ok(list.length >= 40, `${k}: ${list.length}`);
  }
  assert.ok(DATING.title.length >= 20 && HEALTH.type.length >= 20);
  const ids = new Set();
  for (const list of [...Object.values(DATING), ...Object.values(HEALTH)]) {
    for (const x of list) {
      assert.ok(!ids.has(x.id), `duplicate id ${x.id}`);
      ids.add(x.id);
      for (const t of x.text.split('|')) { assert.equal(breaks(t), null, `bank line breaks a rule: ${t}`); assert.ok(!/[\u2013\u2014]/.test(t)); }
    }
  }
  for (const a of ADJ) assert.equal(breaks(a), null, a);
  const FOOD = /\b(samosa|maggi|chai|cold drink|junk|sugar|maida|fried|sweets|pizza|burger|chips|chocolate|biscuit|namkeen|soda)\b/i;
  for (const x of HEALTH.skip) assert.ok(!FOOD.test(x.text), `skip names a food: ${x.text}`);
  const v = resolveVibes(pickVibes('leo:6'), 'leo:6');
  assert.equal(v.fixed, 0);
  assert.equal(v.vibes.dating.flags.length, 3);
  assert.equal(v.vibes.health.skip.length, 3);
});

test('CHECK-02b: all 128 fresh negatives caught, all 30 positives pass', () => {
  for (const [cat, lines] of Object.entries(CHECK02B_NEG)) for (const l of lines) assert.ok(breaks(l), `${cat} slipped: ${l}`);
  assert.equal(Object.values(CHECK02B_NEG).flat().length, 128);
  for (const l of CHECK02B_POS) assert.equal(breaks(l), null, `false positive: ${l}`);
});

test('public banks (TV + share card): every line passes the guard and the copy rules; templates fill and match', () => {
  const B = publicBanks();
  for (const [name, b] of Object.entries(B)) {
    for (const [id, t] of Object.entries(b)) {
      assert.ok(t.length > 0 && t.length <= 120, `${name}.${id}`);
      assert.ok(!/[\u2013\u2014]/.test(t), `${name}.${id} dash`);
      if (!['sign', 'tok'].includes(name)) assert.equal(breaks(t), null, `${name}.${id}: ${t}`);
    }
  }
  assert.ok(Object.keys(B.who).length >= 40 && Object.keys(B.past).length >= 50 && Object.keys(B.future).length >= 50);
  const isPublic = makeMatcher();
  assert.ok(isPublic(fill('done', { s: 9 })));
  assert.ok(isPublic(fill('traced_log', { how: 'Claude vision', a: 'deep', b: 'clear', c: 'soft', d: 'deep' })));
  assert.ok(isPublic(fill('ank_log_master', { n: 33 })));
  assert.ok(!isPublic('Tum haar jaoge.'));
  assert.throws(() => fill('ank_log', { n: 42 }));
  assert.ok(Object.keys(TEMPLATES).length >= 10);
});
