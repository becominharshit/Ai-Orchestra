// Profanity mask regression (CHECK-01 re-check 2): the checker's misses and harmless words, plus our own.
// Defence in depth, not perfection. Target: under 5% misses on the bad list, 0 false positives on the harmless list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText as c } from '../../core/server/textfilter.js';

const bad = [
 // checker misses (round 1+2)
 'teri maa ki chut','maa ki chut','chut','twat','piss off','bollocks','blowjob','handjob','prick','douchebag','cum','jerk off','arse','asshat','a**hole','dumbfuck','fuckwit','mothafucka','sh!tty','sh1+','mderchod','chutiyapa','Chutiyas','chutiyon','bhosdika','madarchods','behenchods','bahenchod','lawde','lode','randiyan','gaandmasti','jhant','kutiya','maa chod di','chodna hai',
 // checker handled
 'fuck','FuCk','fuuuuuck!!!','f.u.c.k','F U C K','b-h-e-n-c-h-o-d','m a d a r c h o d','f_u_c_k','F*CK','c*nt','b*tch','sh*t','$hit','b!tch','b1tch','ch00tiya','mad@rchod','g@ndu','fck','fcuk','phuck','biatch','bsdk','mkc','(fuck)','"bitch"','fuck!','MADARCHOD!!!','lauda!','harami!','MC BC',
 // mine
 'fuck you','motherfucker','fucking hell','bullshit','dipshit','bitches','bastards','cunts','twats','pricks','douches','blowjobs','pissed','dickhead','cocksucker','wanker','retards','faggot','nigger','niggas','sluts','whores','bhenchod','bhosdike','bhosadike','gaandu','gandu','lund','lauda','lavde','randi','harami','haramkhor','bakchodi','bhadwe','chudai','chutiye','chutiya','bkl','tmkc','fkn','stfu','wtf',
 // devanagari
 'चूतिया','मादरचोद','बहनचोद','भोसड़ीके','गांडू','रंडी','लौड़ा','हरामी','भेनचोद','लंड','बकचोद','तू चूतिया है','साला मादरचोद','भोसडीके','गाँडू','चुतिया','मादर चोद','कुतिया','चुदाई','भड़वा',
];
const good = ['Shital','Shitij','Assam','Scunthorpe','class','pass','Kumar','chodo mat','MC Stan','sex ratio','Essex','Sussex','Penistone','cockpit','Dickens','Hancock','Cockburn','Gandhi','Gandhinagar','Bhosle','Sandhya','Randhir','Randeep','Chopra','Chauhan','Lodha','Lodhi','Mumbai','assessment','bitcoin',
 'Dick','Moby Dick','Dick Van Dyke','Lund University','Gand Sahab','BC Roy','Harami Pass','pussy willow','Loda Mavi','B.Com','B.Tech','M.Sc','Ph.D','M.Com','B.Sc','LL.B','M.B.A','BBA','MBA',
 'Chhodo yaar','sab chod diya','kuch chod do','chhod do','gandhi ji','Lucky number 7: aaj ka din tumhara hai.','1080x1920','A+ grade','2026 vs 2030','Niger','Nigeria','Arsenal','Hitchcock','Peacock','Dickinson','cumulative','magna cum laude','mother lode','Wow!!','Deal!','chakka maara','ganda mat karo','Kamini','parachute','laundry','circumstance','Matsushita','grandiose','analysis','therapist','classic','Titanic','Sextant','Hello B.Com student','I study B.Tech at KRMU','Rohit ne chakka maara','5* rating','A* grade','B.A. in English','नमस्ते दोस्तों','भारत माता की जय','चौदह','छोड़ो यार','लंदन','गांधी जी','कमाल है','हर दिन','सब छोड़ दिया','बहन जी','माँ की ममता','HTML','PDF','CBSE','NCR','BTech','MBBS','rhythm','maa ki chutti','Maa ki chutti hai aaj','chhod do','chhodo','Chhodo yaar, chill','chod do','chod de','chakka','chakke','Kya chakka maara!','CHAKKA!!','chhodna mat','sab chhod diya'];

test('bad list: under 5% misses (target 0)', () => {
  const miss = bad.filter((b) => !c(b).includes('***'));
  assert.ok(miss.length / bad.length < 0.05, `missed ${miss.length}/${bad.length}: ${miss.join(' | ')}`);
  assert.deepEqual(miss, []);
});

test('harmless list: 0 false positives', () => {
  const fp = good.filter((g) => c(g) !== g).map((g) => `${g} -> ${c(g)}`);
  assert.deepEqual(fp, []);
});

test('degree abbreviations survive the link stripper; real links do not', () => {
  assert.equal(c('Main B.Com aur M.Sc kar raha hoon, Ph.D baad mein'), 'Main B.Com aur M.Sc kar raha hoon, Ph.D baad mein');
  assert.equal(c('join evil.com now'), 'join now');
  assert.equal(c('play.zenithschool.ai/jyotish'), 'play.zenithschool.ai/jyotish');
});

test('Devanagari: NFC, nukta and vowel-sign tolerant', () => {
  const nfd = 'भोसड़ीके'.normalize('NFD');
  assert.equal(c(nfd), '***');
  assert.equal(c('भोसडीके'), '***');
  assert.equal(c('चुतिया'), '***');
  assert.equal(c('तू चूतिया है'), 'तू *** है');
});

test('Unicode disguises (re-check 3): zero-width, format characters, Cyrillic/Greek look-alikes and accents are undone', () => {
  const Z = '​', N = '‌', J = '‍', WJ = '⁠', BOM = '﻿', SH = '­';
  const disguised = [
    // the checker's 13
    `fu${Z}ck`, `mad${Z}archod`, `bi${N}tch`, `chu${J}tiya`, `sh${WJ}it`, `be${BOM}henchod`,
    'fuсk', 'ѕhit', 'bіtch', 'madаrchod', 'fück', 'chūtiya', 'mādarchod',
    // more of our own
    `fu${SH}ck`, 'ｆｕｃｋ', 'bιtch', 'mаdаrchоd', 'f́úćk', 'ᴄʜᴜᴛɪʏᴀ',
    'bhоsdike', 'gаndu', 'rаndi', 'lаuda', `ch${Z}u${Z}t${Z}i${Z}y${Z}a`, 'teri maa ki chūt', `B${Z}C`,
  ];
  const missed = disguised.filter((t) => !c(t).includes('***'));
  assert.deepEqual(missed, []);
  // zero-width characters never reach a TV even in harmless text
  assert.equal(c(`Curious${Z} Builder`), 'Curious Builder');
  for (const ok of ['café', 'naïve', 'Zoë', 'Müller', 'résumé', 'São Paulo', 'Ελλάδα', 'Москва', 'fiancée']) assert.equal(c(ok), ok);
});

test('CHECK-16 confusables: small capitals, Greek sigmas, lunate sigma, f-hook, circled and parenthesised letters', () => {
  const bad = ['ꜰᴜᴄᴋ', 'ςhit', 'ϲunt', 'ƒuck', 'ⓕⓤⓒⓚ', 'ꜰᴜᴄᴋ ʏᴏᴜ', '⒡⒰⒞⒦', 'ⓒⓗⓤⓣⓘⓨⓐ', 'ⓕ ⓤ ⓒ ⓚ', 'ʙɪᴛᴄʜ', 'ꜱʜɪᴛ', 'ᴍᴀᴅᴀʀᴄʜᴏᴅ'];
  assert.deepEqual(bad.filter((t) => !c(t).includes('***')), []);
  const good = ['Café', 'Müller', 'São Paulo', 'Москва', 'Zoë', 'Ελλάδα', 'Åsa', 'Łukasz', 'Çelik', 'Nuñez', 'Kraków', 'Íñigo', 'Dvořák', 'Beyoncé', 'Ünal', 'José García', 'Zürich', 'Røed', 'İstanbul', 'Crème brûlée', 'Ångström', 'Sandhya Bhosle', 'Tōkyō', 'Naïve façade', '© 2026 Zenith', 'Score ★★★'];
  assert.deepEqual(good.filter((t) => c(t) !== t), []);
});

test('CHECK-16b: circled and other letter-like symbols are fully masked, not kept around the mask', () => {
  const cases = { 'tu ⓕⓤⓒⓚ hai': 'tu *** hai', 'ⓢⓗⓘⓣ': '***', 'ⓑⓘⓣⓒⓗ': '***', 'Ⓕⓤⓒⓚ off': '*** off', '⒡⒰⒞⒦': '***', 'ⓜⓐⓓⓐⓡⓒⓗⓞⓓ': '***', 'ⓒⓗⓤⓣⓘⓨⓐ': '***', '(ⓑⓘⓣⓒⓗ)': '(***)', '𝐟𝐮𝐜𝐤 you': '*** you' };
  for (const [input, want] of Object.entries(cases)) {
    const out = c(input);
    assert.equal(out, want, input);
    assert.ok(!/[①-⓿\u{1d400}-\u{1d7ff}]/u.test(out), `no letter-like symbol left: ${input}`);
  }
  for (const ok of ['ⓩⓔⓝⓘⓣⓗ rocks', '★ star ★', '① first', 'Zoë', 'Αθήνα']) assert.equal(c(ok), ok, ok);
});

test('combined re-check: negative circled / squared letters, regional indicators and hooked Latin capitals fold before matching', () => {
  for (const t of ['🅵🆄🅲🅺', '🅱🅸🆃🅲🅷', '🆂🅷🅸🆃', 'Ƒuck', '🅕🅤🅒🅚', '🇫🇺🇨🇰', 'Ɓitch', '🄵🅄🄲🄺', '⒡⒰⒞⒦']) {
    assert.equal(c(`tu ${t} hai`), 'tu *** hai', t);
  }
  for (const ok of ['Łódź', 'Ørsted', 'Zoë', '🇮🇳 India', 'Ħello', 'Dvořák', 'İstanbul', 'Nguyễn']) assert.equal(c(`hello ${ok} yaar`), `hello ${ok} yaar`, ok);
});
