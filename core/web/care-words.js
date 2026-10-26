// Self-harm and crisis detection, shared by the browser (before send) and the server (the authority).
// English, Hinglish (Roman) and Devanagari, with disguised spellings (leetspeak, repeats, letters spelled apart).
// It errs towards triggering: a false alarm only shows a kind card with a helpline.
import { searchable, devaNorm } from './normalize.js';
import { detectCategories, fixTypos } from './care-categories.js';

// Patterns run on searchable(text): lowercase, normalised, single spaces, padded with a space at each end.
const W = (s) => new RegExp(s, 'u');
const EN = [
  'suicid', 'su[i1]c[i1]de', 'unalive', ' kms ', ' kys ',
  'kil+ (my ?self|me now|myself tonight)', 'kil+ing myself', 'want(ed)? to kil+ myself', 'kil+myself',
  '(end|ending|take|taking|took) (my|my own) life', 'end it all', 'ending it all', 'end everything',
  '(want|wanna|wana|going|gonna|plan|planning|ready|trying|try) (to )?die', 'i (just )?want to die', 'rather (be )?dead',
  'i (wish|hope) i (was|were|am) dead', 'wish i (was|were) never born', 'should (just )?be dead', 'better off dead', 'better off without me',
  "(dont|do not|dnt) want to (live|be alive|exist|wake up|be here)", 'no (reason|point) (to|in) (live|living|going on|being alive)',
  'not worth living', 'life (is|isnt|feels) (not worth|pointless|meaningless|worthless)', 'nobody (would|will) (miss|care if)',
  'no one (would|will) (miss|care if)', 'self ?harm', '(cut|cutting|hurt|hurting|harm|harming) (my ?self|myself|my wrist)',
  'overdose', 'hang (my ?self|myself)', 'jump (off|from) (a |the |this )?(building|bridge|roof|terrace|floor)',
  'cant (go on|take (it|this) anymore|do this anymore|live like this)', 'give up on (life|living)', 'disappear forever',
  'sleep (and|n) never wake up', 'take all (the|my) pills',
];
const HI = [
  // die / want to die
  ' (mar|marr|mr) (jana|jaana|jau|jaun|jaoon|jaaun|jaunga|jaungi|jaaunga|jaaungi|jaoonga|jaoongi|jauga|jaugi) ', ' marna (hai|he|chahta|chahti|chahiye|chahte) ',
  ' mujhe marna ', ' mar hi (jau|jaun|jaunga|jaungi|jaana|jana) ', ' mar (jaane|jane) (ka|ko) (mann|man|dil) ', ' mar (jata|jaata|jati|jaati) to (acha|accha|achha) ',
  'khudkushi', 'khudkhushi', 'khudkhusi', 'khud ?kushi', 'aatm?a?hatya', 'atmhatya', 'suicide (kar|karna|karunga|karungi|kar lunga|kar lungi)',
  // do not want to live
  ' jeen?e (ka|ki) (mann|man|mood|ichha|icha|iccha|wajah|vajah|koi wajah|koi vajah|koi fayda|fayda|faida|matlab|koi matlab) nahi', ' jeena nahi (chahta|chahti|hai|he) ',
  ' (zindagi|jindagi|zindgi|jindgi) (khatam|khatm|bekar|bekaar|se tang|se pareshan|jhel nahi|nahi chahiye|nahi jeeni) ', ' zinda nahi (rehna|rahna) ',
  ' (main|mai|me) (nahi|nhi) (rehna|rahna|jeena) (chahta|chahti) ', ' sab khatam (kar|karna|kardu|kardena|kar du|kar dunga|kar dungi|karna hai|kar lunga|kar lungi) ',
  ' sab (khatm|khtm) karna ', ' (khud|apne aap) ko (khatam|khatm|maar|mar|hurt|nuksan|nuksaan|chot|takleef) ', ' khatam kar (dunga|dungi|lunga|lungi) (khud|apne aap) ',
  // methods
  ' (nas|nass) (kaat|kat|kaatni|katni|kaatna) ', ' (phaansi|phansi|fansi|faansi|phasi) ', ' jaan (de|dena|dedu|de du|de dunga|de dungi|dedunga|dedungi) ', ' apni jaan ',
  ' duniya (chhod|chod) (dunga|dungi|du|doon|jaunga|jaungi) ', ' (zeher|zehar|jeher|jahar) (kha|pee|pi) ', ' neend ki goli', ' train ke (aage|niche|neeche) (kood|kud|aa ja|so ja|lait|let ja)',
  ' chhat se (kood|kud) ', ' kood (jaunga|jaungi|jau|jaun) ', ' koi fayda nahi (jeene|zinda) ',
];
const DEVA = [
  'आत्महत्या', 'आतमहत्या', 'खुदकुशी', 'खुदखुशी', 'सुसाइड', 'मर जाना', 'मर जाउं', 'मर जाऊं', 'मर जाऊंगा', 'मर जाऊंगी', 'मर जाउंगा', 'मर जाउंगी', 'मरना है', 'मरना चाहता', 'मरना चाहती',
  'मर ही जाऊं', 'जीने का मन नहीं', 'जीने की इच्छा नहीं', 'जीने की वजह नहीं', 'जीना नहीं चाहता', 'जीना नहीं चाहती', 'जिंदगी खत्म', 'ज़िंदगी खत्म', 'ज़िन्दगी खत्म', 'जिन्दगी खत्म',
  'सब खत्म कर', 'सब ख़त्म कर', 'खुद को खत्म', 'खुद को मार', 'खुद को नुकसान', 'अपने आप को खत्म', 'फांसी', 'फाँसी', 'नस काट', 'जान दे दूंगा', 'जान दे दूंगी', 'जान दे दूं', 'अपनी जान',
  'दुनिया छोड़ दूंगा', 'दुनिया छोड़ दूंगी', 'ज़हर खा', 'जहर खा', 'नींद की गोली',
].map((p) => devaNorm(p));

// Patterns are written readably; collapse doubled letters the same way the text is normalised (h excepted).
const collapse = (p) => p.replace(/([a-gi-z])\1+/g, '$1');
const RE = [...EN, ...HI].map((s) => W(collapse(s)));
// compact forms (all spaces removed) catch "k i l l m y s e l f", "kill-my-self", "khud.kushi"
const COMPACT = ['suicid', 'kilmyself', 'kilingmyself', 'endmylife', 'khudkushi', 'khudkhushi', 'atmahatya', 'aatmahatya', 'unalive', 'wanttodie', 'marjanahai', 'jeenekamannahi', 'selfharm'];

// ---------- concept patterns (CHECK-16): a death / ending term near a self, desire, plan or negation marker ----------
// Written on the normalised spaced text; G = up to 4 words in between, so "jump off my hostel roof" and
// "marne ka plan bana liya" match. Spacing-insensitive verbs ("marjaunga") are written with optional spaces.
const G = '(?: \\S+){0,4}';
const G2 = '(?: \\S+){0,2}';
const SELF = '(?:i|im|me|my|myself|main|mai|mein|mujhe|mujh|mera|meri|apni|apna|apne|khud)';
const WANT = '(?:want|wanna|wana|going|gonna|wil|plan|planing|ready|chahta|chahti|chahte|chahiye|dunga|dungi|lunga|lungi|jaunga|jaungi|jaun|jau|karunga|karungi|kar dunga|kar lunga|bana liya|soch raha|soch rahi|tonight|aaj raat)';
const NEG = '(?:nahi|nahin|nhi|na|not|no|dont|cant|never|kabhi nahi|aur nahi)';
const CONCEPT = [
  // English
  `${SELF}${G} (?:want|wanna|wana|going|gonna|plan|planing|ready|need) (?:to )?(?:die|end it|end my|end everything|disappear|be gone|not exist|stop existing)`,
  `(?:dont|do not|dnt|never) (?:want|wanna|wana) (?:to )?(?:live|be alive|exist|wake up|be here|go on)`, `(?:dont|do not|dnt) wanna live`,
  `(?:happier|better|beter) (?:off )?if i (?:was|were|am) (?:gone|dead|not here|not around)`, `(?:nobody|no one|noone) (?:cares|wil care|would care|wil mis|would mis) if i (?:die|died|was gone|disappear)`,
  `jump\\S*${G} (?:roof|terace|terrace|floor|building|bridge|balcony|hostel|chat|top)`, `(?:handful|bunch|bottle|all) of (?:pils|pills|tablets|sleeping pils)`, `took${G2} (?:pils|pills|tablets)${G} (?:strange|weird|dizy|dizzy|sleepy)`,
  `hate my life${G} (?:out|end|gone|forever|die)`, `(?:wish|hope) i (?:could|would|can)${G2} (?:not|never) wake up`, `not wake up (?:tomorow|tomorrow|again|ever)`,
  `(?:want|wanna) (?:to )?end (?:it|it al|this life|my life)`, `${SELF}${G} (?:want|wanna) (?:to )?disappear`, `(?:end|ending) it (?:al|tonight|today|now)`,
  // Hinglish (Roman): mar, jee, khatam, kood, chala jaunga, umeed, bojh, plan
  ` mar ?(?:jau|jaun|jaunga|jaungi|jaoon|jaoonga|jaoongi|jauga|jaugi|jana|jaana|jaye|jayu|jaun ga) `, ` mar(?:na|ne) (?:ka |ki )?(?:plan|soch|man|mann|dil|socha|faisla|irada)`,
  ` marna (?:hai|he|chahta|chahti|chahte|chahiye)`, ` (?:main|mai|mujhe|me)${G} marna `, ` mar (?:hi )?(?:jaana|jana) (?:hai|chahta|chahti)`,
  ` (?:jee|ji|jeeh) (?:nahi|nhi) (?:sakta|sakti|sakte|paunga|paungi|paa raha|pa raha|pa rahi)`,
  ` (?:nahi|nhi) (?:jee|ji) (?:sakta|sakti|sakte|paunga|paungi|pa raha|pa rahi)`, ` (?:aur|ab aur|ab) nahi (?:jee|ji) (?:sakta|sakti|sakte|paunga|paungi)`,
  ` jeen?(?:a|e) (?:ka|ki|ko)${G2} (?:mann|man|dil|mood|ichha|icha|umeed|wajah|vajah|fayda|faida|matlab|maksad)${G2} (?:nahi|nhi|nahin|na|khatam|nahi bachi|nahi raha|nahi rahi)`,
  ` jeena (?:bekar|bekaar|mushkil|bojh|nahi|nhi|faltu) `, ` (?:zindagi|jindagi|zindgi|jindgi) (?:bojh|bekar|bekaar|faltu|khatam|se tang|se thak|nahi chahiye)`,
  ` (?:sab|sab kuch|sabkuch|sab kuchh) (?:khatam|khatm|khtm) (?:kar|karna|kardu|kar du|kar dunga|kar dungi|kar lunga|kar lungi|ho jaye|karne)`,
  ` (?:khud|apne aap|apni zindagi|zindagi) (?:ko )?(?:khatam|khatm|maar|mar|hurt|nuksan|nuksaan|chot|takleef)`, ` khatam (?:ho )?(?:jana|jaana) (?:chahta|chahti|hai)`,
  ` (?:main|mai|me) khatam`, ` (?:chhat|chat|roof|building|terrace|bridge|upar|balcony)${G2} (?:se )?(?:kood|kud|koodna|kudna|chalang)`, ` (?:kood|kud) (?:jaunga|jaungi|jau|jaun|jaoonga|jaoongi|lunga|lungi) `,
  ` hamesha ke liye (?:chala|chali) (?:jaunga|jaungi|jau|jaun) `, ` (?:chala|chali) (?:jaunga|jaungi) hamesha`, ` sab (?:ko|kuch) (?:chhod|chod) ke${G} hamesha`,
  ` (?:koi )?(?:umeed|ummeed|ummid|umid) nahi (?:bachi|rahi|hai)${G2}`, ` (?:jeene|jine) ki (?:koi )?(?:umeed|ummeed|ummid|umid) `,
  ` (?:zeher|zehar|jeher|jahar|poison) (?:kha|pee|pi|le|lunga|lungi) `, ` (?:goli|goliyan|pills|tablets) (?:kha|kha li|kha lunga|kha lungi|le li) `,
  // Career re-check: "no reason to keep living", "life khatam karni hai meri", "zinda ab nahi rehna"
  `(?:no|dont see (?:a|any)|do not see (?:a|any)|dont have (?:a|any)|cant (?:find|see) (?:a|any)|not (?:a|any)|without (?:a|any)|lost (?:my|al|every)) (?:reason|point|purpose|wil)${G2} (?:to|in|for) (?:keep |go on |continue |carry on |stay )?(?:living|live|going on|being alive|existing|exist|staying alive)`,
  `(?:whats|what is) the (?:point|use) (?:of|in) (?:living|going on|being alive|staying alive)`,
  ` (?:meri |apni )?life (?:khatam|khatm|khtm) (?:karni|karna|kar|kar du|kardu|kar dunga|kar dungi|kar lunga|kar lungi|karne)`, ` (?:meri|apni) life (?:khatam|khatm|khtm)`,
  ` (?:zinda|jinda)${G2} (?:nahi|nhi|nahin)${G2} (?:rehna|rahna|rahunga|rahungi|reh sakta|reh sakti|reh paunga|reh paungi)`, ` (?:zinda|jinda) (?:rehna|rahna) (?:nahi|nhi|nahin)`,
];
const CONCEPT_RE = CONCEPT.map((p) => new RegExp(p.replace(/([a-gi-z])\1+/g, '$1'), 'u'));
// Devanagari concepts (normalised with devaNorm: nukta, chandrabindu, long/short vowels merged)
const DEVA_CONCEPT = [
  'सब कुछ खत्म', 'सबकुछ खत्म', 'छत से कूद', 'कूद जाउं', 'कूद जाउंगा', 'कूद जाउंगी', 'कूद जाऊं', 'कूद जाऊंगा', 'कूद जाऊंगी', 'मर जाउं', 'मरने का', 'जी नहीं सकता', 'जी नहीं सकती',
  'और नहीं जी', 'जीने का दिल नहीं', 'जीने की उम्मीद नहीं', 'जीने की कोई उम्मीद', 'जिंदगी बोझ', 'ज़िंदगी बोझ', 'हमेशा के लिए चला जाउंगा', // "खत्म कर दूंगा" alone is not self-harm (प्लास्टिक खत्म कर दूंगा): only with सब कुछ / खुद को
  'गोलियां खा', 'नींद की गोलियां', 'नहीं जीना', 'जीना नहीं', 'नहीं जी सकता', 'नहीं जी सकती',
  'जिंदा नहीं रहना', 'जिन्दा नहीं रहना', 'लाइफ खत्म कर', 'जिंदगी खत्म कर', 'जीने का कोई फायदा नहीं', 'जीने की कोई वजह नहीं',
].map((p) => devaNorm(p).replace(/\s+/g, ' '));
// Devanagari concepts with up to 2 words in between ("ज़िंदा अब नहीं रहना", "अब और जिंदा नहीं रह सकता")
const DG = '(?: \\S+){0,2}';
const DEVA_CONCEPT_RE = [
  `(?:जिंदा|जिन्दा)${DG} नहीं${DG} (?:रहना|रहूं|रहूंगा|रहूंगी|रह सकता|रह सकती|रह पाऊंगा|रह पाऊंगी)`, `(?:जिंदा|जिन्दा) रहना नहीं`,
  `जीने${DG} (?:फायदा|मतलब|वजह|मकसद|उम्मीद)${DG} नहीं`, `(?:लाइफ|जिंदगी|ज़िंदगी|जिन्दगी)${DG} खत्म (?:करनी|करना|कर दूं|कर दूंगा|कर दूंगी|कर लूंगा|कर लूंगी)`,
].map((p) => new RegExp(devaNorm(p), 'u'));

/** true when the text suggests self-harm or a crisis. Errs towards true. */
export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const s = searchable(text);
  if (phraseRules(s)) return true;
  const fixed = fixTypos(s); // one-edit typos of suicide, khudkushi, aatmahatya, marna, maut
  if (fixed && phraseRules(fixed)) return true;
  return detectCategories(text, s);
}

function phraseRules(s) {
  if (RE.some((re) => re.test(s))) return true;
  const compact = s.replace(/\s+/g, '');
  if (COMPACT.some((c) => compact.includes(collapse(c)))) return true;
  if (DEVA.some((p) => s.includes(p) || compact.includes(p.replace(/\s+/g, '')))) return true;
  if (CONCEPT_RE.some((re) => re.test(s))) return true;
  if (DEVA_CONCEPT.some((p) => s.includes(p) || compact.includes(p.replace(/\s+/g, '')))) return true;
  if (DEVA_CONCEPT_RE.some((re) => re.test(s))) return true;
  return false;
}

/** Scan every string in a value (request bodies). */
// Only a real binary image payload in a known image field skips the text check (N20a): a "data:" prefix alone does not.
export const IMAGE_KEYS = new Set(['image', 'photo', 'palm', 'frame', 'dataUrl', 'dataurl', 'img', 'picture', 'selfie', 'cover', 'thumb', 'snapshot']);
export const isImagePayload = (v) => typeof v === 'string' && v.length < 12_000_000 && /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/\r\n]+={0,2}$/.test(v);
export function detectDeep(v, depth = 0, key = null) {
  if (depth > 6) return false;
  if (typeof v === 'string') return !(key && IMAGE_KEYS.has(key) && isImagePayload(v)) && detect(v.length > 20000 ? v.slice(0, 20000) : v);
  if (Array.isArray(v)) return v.some((x) => detectDeep(x, depth + 1, key));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => detectDeep(x, depth + 1, k));
  return false;
}
