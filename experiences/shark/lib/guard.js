// Output guard: every free-text field the model (or the mock) writes passes through here before it can reach
// the phone or the counter TV: idea title/tvTitle, hostLine, questions + chips, why, line, compliment, fix,
// lesson explain, tvLine. A field that fails is replaced by a safe template line from the offline engine.
//
// A line FAILS when:
//   1. core's textfilter changes it (profanity/slur masked, link removed, over 140 chars), or it holds a phone,
//      email, @handle or date;
//   2. it is negative about the person (bekaar, stupid, loser, fail ho, ...; Hindi + English);
//   3. it echoes the visitor: any word that appears in the visitor's pitch or answers and is NOT on the
//      allow-list of common Hinglish/English and business words below. That stops names, schools, places,
//      brands and people from the pitch reaching the TV, whatever the model does;
//   4. it is not in Roman script (the stall copy is Hinglish in Roman script).
import { cleanText } from '../../../core/server/textfilter.js';
import { coreProbe, clean } from './text.js';
import { check as localCheck } from './safety.js';

// Words the visitor may share with our output: function words + business words. No names, places, brands.
// TODO(student): add a word here only if it can never be a person's name, a school or a place.
const COMMON = `
a an the and or but if so to of in on at by for from with without into over under up down out off as is are was were be been being am
i me my mine we our you your yours he she it they them their this that these those there here what which who whom whose why how when where
not no yes very more most less few many much some any all each every other another such only just also too again then than now
can could will would should may might must do does did done doing have has had make makes made get gets got give gives go goes going
first second third one two three four five ten hundred thousand lakh lakhs crore crores day days week weeks month months year years time
new old big small best better good great nice cool fun easy fast quick cheap smart simple real local online offline daily weekly monthly
idea ideas startup startups business company brand brands product products service services app apps website platform shop store stores
customer customers user users student students parents kids people log logon family families office school schools college colleges campus
hostel hostels market markets price prices pricing cost costs margin margins profit profits money paisa paise rupaye rupees rs order orders
plan plans subscription subscriptions delivery pickup home ghar city cities india area team partner partners growth scale sales sell selling
buy buying pay paying payment free premium trial offer offers discount deal model community insta instagram reel reels video videos photo
photos hook viral content creator creators ads marketing finance numbers number unit economics moat trust quality fresh healthy safe
food khana chai tea coffee snack snacks tiffin meal meals cake juice cafe kitchen laundry clothes kapde fashion thrift study notes padhai
exam exams tutor tuition class classes book books library game games gaming sports fitness gym yoga plant plants green eco recycle waste
water pet pets dog dogs cat cats travel trip tour ride rides cycle cycles bike repair cleaning cleaner help helper helpers seniors elderly
problem problems solution solve solves time waste save saves easy mushkil dikkat pareshan late
hai hain ho hoon hu tha thi the hoga hogi honge kar karo karna karenge karega karegi karte karti karta kiya kiye ki ka ke ko se mein me pe par
aur ya bhi hi toh to na nahi nahin mat kya kaun kaise kab kahan kyun kitna kitni kitne kis kisi kuch sab sabko sabse bahut zyada kam thoda
mera meri mere tera teri tere tumhara tumhari tumhare apna apni apne hum hamara hamari humein mujhe tumhe unhe usko isko yeh ye woh wo
jo jab tab ab abhi phir pehle baad saath liye wala wali wale waala waali waale jaisa jaise jaisi naya nayi naye purana purani purane
achha accha acha badhiya mast solid sahi pakka asli ghar bada badi bade chhota chhoti chhote log logon dost doston bachche bachon
din raat subah shaam roz har ek do teen char paanch das sau hazaar
bag bags box boxes packet packets cart stall counter dukaan naam logo hafte mahine saal ghante ghanta minute minutes jaldi sasta sasti mehenga mehngi kharcha bachega bachta hisaab week weekend cost price
`.split(/\s+/).filter(Boolean);

let VOCAB = new Set(COMMON);
/** Add more allowed words (engine keyword lists, fixture keywords, lesson titles). */
export function allowWords(words) {
  for (const w of words) for (const t of tokens(String(w))) VOCAB.add(t);
}

const NEGATIVE = /\b(bekaar|bekar|bakwas|bakwaas|faltu|ghatiya|bura idea|buri soch|stupid|idiot|idiots|dumb|dumbo|loser|losers|useless|worthless|pathetic|lame|nikamma|nikammi|nikamme|nalayak|bewakoof|bevakoof|bewkoof|pagal|paagal|gadha|gadhe|gadhi|ullu|chomu|fail ho|fail hoge|fail hogi|fail hi|failure|flop hai|flop hoga|hopeless|kabhi nahi chalega|nahi chalega|koi fayda nahi|give up|quit kar|chhod do|chod do|sharam|shame|shameless|ugly|bad idea|terrible|horrible|disaster|joke ho|mazaak ho|time waste|waste of time|tum bekaar|tumse nahi hoga|nahi hoga tumse|kuch nahi kar sakte|kisi kaam ka nahi|kisi kaam ke nahi|kisi kaam ki nahi|kachra|kachre|aukaat|aukat|trash|garbage|rubbish|pointless|mediocre|nonsense|ghatiya|dhakkan|nautanki|gawaar|ganwar|jaahil|jahil|bevkoof|tharki|kameena|kamina|kamini|haramkhor|dimaag kharab|dimag kharab|mazak hai|mazaak hai|ek mazak|a joke|is a joke|clueless|no clue|nalla|bekaar ho)\b/i;
// Claims we may never make (CHECK-13): job, placement, salary or admission guarantees.
const GUARANTEE = /\b(100 ?%|guarantee\w*|pakk[ia])\b.*\b(job|jobs|naukri|placement|placements|salary|package|admission|selection)\b|\b(job|jobs|naukri|placement|placements|salary|package|admission|selection)\b.*\b(guarantee\w*|pakk[ia]|100 ?%)\b|\b\d+ ?(lpa|lakh ka package)\b/i;
// Prompt-injection echoes and system-talk never reach the phone.
const INJECTION = /\b(ignore (all |the )?(previous|above|earlier) (instructions|rules)|system ?prompt|system:|admin key|api key|reveal your|developer mode|jailbreak)\b/i;
// Violent turns of phrase a model might use about rivals ("competitor ko khatam kar dete hain").
const VIOLENT = /\b(maar do|maar dalo|maar daalo|maar dete|maar denge|jaan se|khatam kar dete|khatam kar denge|khatam kar do|uda do|uda denge|finish them|destroy them|crush them|kill them)\b/i;
const PERSONAL = [/(?:\+?\d[\s-]?){7,}/, /[\w.+-]+@[\w-]+\.[\w.]+/, /@/, /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/, /\bhttps?:\/\//i, /\bwww\./i, /\broll ?(no|number)\b/i, /\bsector \d+/i, /\bclass \d+[a-z]?\b/i];
// Words that may be capitalised inside a model title (title-case names of an idea type).
const TITLE_WORDS = new Set('express hub box club co company studio labs lab point corner wala wale waala adda junction house bazaar mart cart kart buddy buddies pals match league plus pro go now kit smart desi fresh next gen startup idea app brand store shop service services helper care fun big new little mini super turbo green happy tasty smart quick easy daily campus hostel home ghar ka ki ke dabba tiffin chai cafe kitchen snacks laundry cycle pedal pet pets paw plant plants eco thrift drip style study notes tutor game gamers games tech senior seniors elders'.split(' '));

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
const HONORIFIC = /(jee|ji|bhaiya|bhaiyya|bhai|bhaisaab|saab|sahab|sahib|sir|madam|mam|didi|di|ben|behen|bro|sis)$/;

/** NFKC (fullwidth -> ASCII), lower case, accents dropped, leetspeak digits inside words read as letters. */
export function fold(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
    .replace(/(?<=\p{L})[0134578@$]+|[0134578@$]+(?=\p{L})/gu, (m) => [...m].map((c) => LEET[c] || c).join(''));
}

// Devanagari -> rough Roman (enough to catch "रोहन शर्मा" coming back as "Rohan Sharma").
const DV_CONS = { क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', क़: 'q', ख़: 'kh', ग़: 'g', ज़: 'z', ड़: 'r', ढ़: 'rh', फ़: 'f' };
const DV_VOW = { अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऋ: 'ri' };
const DV_SIGN = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri', 'ं': 'n', 'ँ': 'n', 'ः': 'h' };
export function translit(word) {
  const ch = [...String(word).normalize('NFC')];
  let out = '';
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    const nxt = ch[i + 1];
    if (DV_CONS[c]) {
      out += DV_CONS[c];
      if (nxt === '्') { i += 1; continue; }
      if (nxt && DV_SIGN[nxt] !== undefined && !'ंँः'.includes(nxt)) continue; // the sign adds the vowel
      if (i + 1 < ch.length && !(nxt === undefined)) out += 'a'; // inherent a, not at the end of the word
    } else if (DV_VOW[c]) out += DV_VOW[c];
    else if (DV_SIGN[c] !== undefined) out += DV_SIGN[c];
    else if (c === '्' || c === '़') continue;
    else out += c;
  }
  return out.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u');
}
const simplify = (t) => t.replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/(.)\1+/g, '$1');

export function tokens(s) {
  return (fold(s).match(/\p{L}[\p{L}\p{M}']*/gu) || []).map((t) => t.replace(/'s?$/, ''));
}
/** Token variants used for the echo check: the token, its simplified spelling, and without an honorific. */
function variants(t) {
  const v = new Set([t, simplify(t)]);
  const h = t.replace(HONORIFIC, '');
  if (h !== t && h.length >= 3) { v.add(h); v.add(simplify(h)); }
  return v;
}

/** The visitor's own words (pitch + answers), folded, with Devanagari words also in Roman. */
export function visitorWords(...texts) {
  const out = new Set();
  for (const t of texts) {
    for (const w of tokens(t)) {
      if (w.length < 2) continue;
      for (const v of variants(w)) out.add(v);
      if (/\p{Script=Devanagari}/u.test(w)) { const r = translit(w); out.add(r); out.add(simplify(r)); }
    }
  }
  return out;
}

/**
 * guardLine(text, visitor, { title }) -> { ok, text, reason }. Run on the FULL text, before any truncation.
 */
export function guardLine(text, visitor = new Set(), { title = false } = {}) {
  const raw = String(text ?? '');
  const s = raw.normalize('NFKC').trim();
  if (!s) return { ok: false, text: '', reason: 'empty' };
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(s)) return { ok: false, text: '', reason: 'script' };
  if (s !== raw.trim()) return { ok: false, text: '', reason: 'width' }; // fullwidth or odd forms: never shown
  if (PERSONAL.some((re) => re.test(s))) return { ok: false, text: '', reason: 'personal' };
  const probe = coreProbe(s);
  if (cleanText(probe) !== probe) return { ok: false, text: '', reason: 'filter' };
  const f = fold(s);
  if (NEGATIVE.test(f)) return { ok: false, text: '', reason: 'negative' };
  if (VIOLENT.test(f)) return { ok: false, text: '', reason: 'violent' };
  if (GUARANTEE.test(f)) return { ok: false, text: '', reason: 'guarantee' };
  if (INJECTION.test(f)) return { ok: false, text: '', reason: 'injection' };
  if (!localCheck(f).ok) return { ok: false, text: '', reason: 'unsafe' }; // violence, sex, self-harm words from the model
  for (const w of tokens(s)) {
    for (const v of variants(w)) if (visitor.has(v) && !VOCAB.has(v) && !VOCAB.has(w)) return { ok: false, text: '', reason: 'echo' };
    if (visitor.size) for (const vw of visitor) if (vw.length >= 4 && w.length > vw.length && w.startsWith(vw) && !VOCAB.has(vw) && !VOCAB.has(w)) return { ok: false, text: '', reason: 'echo' };
  }
  // Capitalised words inside a sentence that we do not know are probably names, schools, places or brands.
  const words = s.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!w || !/^\p{Lu}/u.test(w)) continue;
    const startOfSentence = i === 0 || /[.!?:]["')]*$/.test(words[i - 1]);
    const lw = fold(w);
    if (title ? !(VOCAB.has(lw) || TITLE_WORDS.has(lw)) : !startOfSentence && !VOCAB.has(lw) && !TITLE_WORDS.has(lw)) return { ok: false, text: '', reason: 'proper_noun' };
  }
  return { ok: true, text: s, reason: null };
}

/** First candidate whose FULL text passes the guard, then cleaned and cut to `max`. The last is a fixed safe default. */
export function pick(visitor, { max = 160, title = false } = {}, ...candidates) {
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    const r = guardLine(c, visitor, { title });
    if (r.ok) return clean(r.text, max);
  }
  return clean(String(candidates[candidates.length - 1] ?? ''), max);
}
/** Back-compat helper (already cleaned candidates). */
export function firstSafe(visitor, ...candidates) { return pick(visitor, { max: 400 }, ...candidates); }
