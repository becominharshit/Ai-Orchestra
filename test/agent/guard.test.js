// CHECK-19 F3: the local wording guard stops unsafe model lines even when the judge approves everything.
// The checker's 49 lines are copied here (test/_check19 is a scratch folder, not imported), plus our own fresh
// variants written separately so the rules do not just fit the checker's wording, plus safe lines that must pass.
// Also the optional first name (CHANGE-02a update 2): shape, profanity, confusables, mixed scripts, blocklist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordingOk, blockedBy } from '../../experiences/agent/lib/guard.js';
import { cleanLine } from '../../experiences/agent/server.js';
import { nameShape, nameRulesOk } from '../../experiences/agent/lib/name.js';
import { INTRO, WHY } from '../../experiences/agent/lib/banks.js';
import { CHECKER_49, FRESH, SAFE } from './unsafe-lines.js';

test('the checker\'s 49 unsafe lines: 0 pass the guard (so 0 reach the phone even with an approve-all judge)', () => {
  const all = Object.values(CHECKER_49).flat();
  assert.equal(all.length, 49);
  const passed = all.filter((l) => cleanLine(l) !== '');
  assert.deepEqual(passed, []);
});

test('fresh unsafe variants (our own wording, leetspeak, spacing, Devanagari, fullwidth, emoji): 0 pass', () => {
  const all = Object.values(FRESH).flat();
  assert.ok(all.length >= 70, `${all.length} lines`);
  const passed = all.filter((l) => wordingOk(l));
  assert.deepEqual(passed, []);
});

test('safe lines and our own reviewed intro and step lines still pass (the guard is not a blanket block)', () => {
  for (const l of SAFE) assert.equal(blockedBy(l), '', l);
  for (const l of Object.values(WHY).flat()) assert.equal(blockedBy(l), '', l);
  for (const l of Object.values(INTRO).flat()) { const line = l.replace('{name}', 'Nova Jugnu'); assert.equal(blockedBy(line), '', line); }
});

test('first name: shape, profanity in any form, confusables, mixed scripts and blocklist fall back to null', () => {
  for (const ok of ['Riya', 'aarav', 'ISHAAN', 'रिया', 'आरव', 'Virat', 'Rahul', 'Aakash']) assert.ok(nameShape(ok) && nameRulesOk(nameShape(ok)), ok);
  assert.equal(nameShape('riya'), 'Riya');
  for (const bad of ['R', 'Riya Sharma', 'Riya1', 'R1ya', '@riya', 'riya@x.com', 'www.riya.in', 'Rіya' /* Cyrillic i */, 'Riyaरिया', 'Ri\u200bya', 'Abcdefghijklmn', '', '  ', '98765', 'Riya!', 'Riya_']) assert.equal(nameShape(bad), null, JSON.stringify(bad));
  for (const bad of ['Chutiya', 'chutiya', 'Ch00tiya', 'Madarchod', 'Bhosdi', 'Randi', 'Kamina', 'Harami', 'Fuck', 'Fck', 'Bitch', 'Loser', 'Idiot', 'Kohli', 'Dhoni', 'Modi', 'Hitler', 'Gandhi', 'Elonmusk', 'Admin', 'Sexy', 'कुत्ता', 'हरामी', 'मोदी', 'चूतिया']) {
    const s = nameShape(bad);
    assert.ok(!s || !nameRulesOk(s), bad);
  }
});

// ---- CHECK-19 round 4: allow-list coverage and the checker's bypass set ----
import { SAMPLE_ALL } from './name-sample.js';
import { HOLDOUT } from './name-holdout.js';
import { FRESH_A, FRESH_150 } from './name-fresh.js';
import { allowListSize, onAllowList } from '../../experiences/agent/lib/name.js';


const listed = (n) => { const s = nameShape(n); return !!(s && nameRulesOk(s) && onAllowList(s)); };
// the checker's round 2 bad-name sets (copied from test/_check19/r2-hostile.mjs, a scratch folder we do not import)
const CHECKER_BAD = ['Ch00tiya', 'B1tch', 'Chutiya', 'Chootiya', 'Bsdk', 'Bhosdike', 'Madarchod', 'Lodu', 'Lauda', 'Gaandu', 'Gandu', 'Randi', 'Kutiya', 'Harami', 'Tharki', 'Kaminey', 'Saala', 'Kutta', 'Suar', 'Fuck', 'Fck', 'Shit', 'Bitch', 'Slut', 'Whore', 'Pussy', 'Boobs', 'Porn', 'Horny', 'Nude', 'Sexy', 'Sexxy', 'Sexyy', 'Chodu', 'Jhaatu', 'Behenchod', 'Penchod', 'Lund', 'Chut', 'Gaand', 'Tatti', 'Hijra', 'Chakka', 'Chhakka', 'Meetha',
  'Chamar', 'Bhangi', 'Chura', 'Katua', 'Katwa', 'Mulla', 'Jihadi', 'Paki', 'Chinki', 'Nigga', 'Negro', 'Kalua', 'Madrasi', 'Kafir', 'Sanghi', 'Bhakt', 'Andhbhakt', 'Pappu', 'Feku', 'Libtard', 'Chamcha',
  'Viratkohli', 'Kingkohli', 'Thala', 'Hitman', 'Carryminati', 'Mrbeast', 'Zuckerberg', 'Amitshah', 'Owaisi', 'Kejri', 'Adityanath', 'Godse', 'Nathuram', 'Dawood', 'Kasab', 'Laden', 'Bishnoi', 'Hitler', 'Modi', 'Namo', 'Raga', 'Rahulgandhi', 'Dhoni', 'Tendulkar',
  'Мodi', 'Ηitler', 'Сhutiya', 'Riyaरिया', 'R1ya', 'Riya Sharma', '@riya', 'Riya_', 'R', '9876543210', 'Ri​ya', 'https', 'wwwcom', 'Git',
  'चूतिया', 'भोसड़ी', 'मादरचोद', 'लौड़ा', 'लोडू', 'गांडू', 'कमीने', 'कमीना', 'रंडी', 'हरामी', 'कुत्ता', 'सुअर', 'चमार', 'भंगी', 'कटुआ', 'मुल्ला', 'मोदी', 'राहुलगांधी', 'हिटलर', 'पप्पू', 'फेकू', 'छक्का', 'हिजड़ा', 'सेक्सी', 'लंड', 'चूत'];

test('round 6: only listed names are ever used; none of the checker\'s bad names or the F7 entries is on the list', () => {
  assert.deepEqual(CHECKER_BAD.filter(listed), [], 'nothing bad can reach the phone or the Agent card');
  const F7 = ['Gypsy', 'Rodent', 'Rogue', 'Vice', 'Willie', 'Budhu', 'Budhoo', 'Plastic', 'Spy', 'The', 'Those', 'Trying', 'Think', 'Old', 'Part', 'List', 'Space', 'Real', 'Sanity', 'Tolerant', 'Shatter', 'Stagger', 'Panacea', 'Sunni', 'Hva', 'Wic', 'Leest', 'Neeck', 'Volfgang', 'Saifoollah', 'Prafooll', 'Anboobalan', 'Wineet', 'Lalu', 'लालू', 'Brandi', 'Choden', 'Git'];
  assert.deepEqual(F7.filter(onAllowList), []);
  for (const ok of ['Riya', 'Ria', 'Aarav', 'Arav', 'Priya', 'Pria', 'Virat', 'Rahul', 'Aakash', 'Mohammed', 'Muhammad', 'Gurpreet', 'Fatima', 'Joseph', 'Kavya', 'Harsh', 'Salman', 'Shahrukh', 'Deepika', 'Ranbir', 'Kamini', 'Asha', 'Amar', 'Kiran', 'आरव', 'रिया', 'विराट', 'सलमान', 'शाहरुख', 'कामिनी']) assert.ok(listed(ok), ok);
});

test('round 6: the list is clean (Western names not English words, generated spellings scanned) and holds 5,000+ Indian names', async () => {
  const { generatedProblem, generatedProblemDeva } = await import('../../experiences/agent/ops/build-names.mjs');
  const fs = await import('node:fs');
  const j = JSON.parse(fs.readFileSync(new URL('../../experiences/agent/data/names.json', import.meta.url), 'utf8'));
  const dict = new Set(fs.existsSync('/usr/share/dict/words') ? fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((w) => w && w === w.toLowerCase()) : []);
  assert.equal(j.latinCurated.length + j.latinWestern.length + j.latinGenerated.length + j.devaCurated.length + j.devaGenerated.length, allowListSize());
  if (dict.size) assert.deepEqual(j.latinWestern.filter((n) => dict.has(n.toLowerCase())), [], 'Western names that are English words are out');
  assert.deepEqual(j.latinGenerated.filter((n) => generatedProblem(n.toLowerCase())).concat(j.devaGenerated.filter((n) => generatedProblemDeva(n))), []);
  for (const n of ['git', 'sexy', 'dhonnie', 'saifoollah', 'anboobalan', 'wineet', 'idiot']) assert.ok(generatedProblem(n), n);
  const indian = j.latinCurated.length + j.latinGenerated.length + j.devaCurated.length + j.devaGenerated.length;
  assert.ok(indian >= 5000, `${indian} Indian names`);
  console.log(`# allow-list: Indian ${indian} (Latin curated ${j.latinCurated.length}, Latin generated ${j.latinGenerated.length}, Devanagari curated ${j.devaCurated.length}, Devanagari generated ${j.devaGenerated.length}) + Western ${j.latinWestern.length}`);
});

test('round 6 coverage (reported, below 95% is accepted): fresh 150 per community', () => {
  const by = {};
  const groups = ['hindu_north', 'hindu_south', 'hindu_east', 'hindu_west', 'muslim', 'sikh', 'christian', 'jain', 'buddhist', 'north_east', 'tribal'];
  const sizes = [20, 20, 15, 15, 20, 15, 15, 8, 10, 7, 5];
  let k = 0;
  groups.forEach((g, i) => { by[g] = FRESH_150.slice(k, k + sizes[i]); k += sizes[i]; });
  assert.equal(k, 150);
  const pct = (l) => Math.round((l.filter(listed).length / l.length) * 100);
  console.log(`# first-name coverage (fresh 150, never added to the list): ${pct(FRESH_150)}% overall; ${groups.map((g) => `${g} ${pct(by[g])}%`).join(', ')}`);
  const reg = [...SAMPLE_ALL, ...HOLDOUT, ...FRESH_A];
  assert.ok(reg.filter(listed).length / reg.length >= 0.85, 'regression samples stay mostly covered');
});
