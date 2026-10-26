// Safety Agent: a local, instant filter that runs in EVERY mode (live, mock, offline, hero) before any
// Claude call and again before scoring (pitch + every answer). Claude also returns `safe` + a category in
// BOTH schemas and the server enforces them, but this list is the first and the offline-only layer.
// The visitor is never blamed: every redirect is kind and offers fresh idea prompts. Self-harm ("care")
// gets a caring line with "Kisi bade se baat karo", no game and no score.
//
// Audience: school students (many under 18) and parents. PG always.
// Inputs checked as: raw lower case, a leetspeak-normalised copy (s3x, m4darch0d), a copy with letters
// spelled apart joined (s e x), and Devanagari words (सट्टा, जुआ, नंगा ...). Core's textfilter is a final
// profanity/slur check (same list the TV uses).
// TODO(student): add Hinglish spellings you hear at the stall, then run `node --test test/shark/*.test.js`.
import { cleanText } from '../../../core/server/textfilter.js';
import { coreProbe } from './text.js';
// Core's care detector (CONTRACT 13.3) is the only care judge; this file has no care rules of its own.
import { detect as coreCare } from '../../../core/web/care-words.js';

const RULES = {
  adult: [
    /\b(intimate|private|personal|nangi|nude|bold|hot)\s+(photos?|pics|images?|videos?|clips?)\b.*\b(bech\w*|sell\w*|unlock\w*|subscribers?|paise|paid|money)\b|\b(bech\w*|sell\w*|unlock\w*)\b.*\bintimate\b/,
    /\b(sex|sexy|sexual|sexting|porn|porno|pornography|nude|nudes|nudity|naked|nangi|nanga|nange|xxx|nsfw|erotic|erotica|onlyfans|only fans|escort|escorts|hookups?|strip ?club|stripper|condoms?|boobs?|horny|chudai|chodna|chudne|lingerie|bikini|bikinis|spicy (videos?|photos?|pics?|chats?|rooms?|content|stories)|dirty (chat|videos?|photos?|pics|stories|talk)|hot (pics|photos|videos|girls|chat)|private (photos?|pics|videos?|rooms?) (for|of)|kiss(ing)? videos?|adult (content|videos?|site|app|movies?|chat|stories))\b/,
    /\b18\s?\+|\b(16|17|15|14|13)\s?\+\s*(only|content|videos?|rooms?)/,
    /\b(late[- ]night|midnight|raat ko)\b.*\b(video rooms?|video calls? with strangers|private chats?|spicy|dirty)\b/,
    /\b(dating|date|girlfriend|boyfriend)\b.*\b(kids|bachche|bachon|minors?|school students|1[3-7] (saal|year))/,
    /\b(girls?|ladki|ladkiyon|women|aunty|aunties)\b.*\b(photos?|pics|videos?)\b.*\b(edit|morph|spicy|sell|bech|paid|paying|subscribers?)\b/,
    /\bpaying subscribers?\b.*\b(photos?|pics|videos?)\b|\b(photos?|pics|videos?)\b.*\bpaying subscribers?\b/,
    /\b(raat wali|night wali|private|body ke|personal) (photos?|pics|videos?)\b.*\b(bech|sell|paise|paisa|subscribers?|kama)/,
    /\b(kapde utaar|kapde utar|kapde utarkar|without clothes|undress|strip(ping)? (show|video|call))/,
    /\bhappy ending\b|\bromantic massage\b|\bbody massage\b.*\b(girls?|ladki|private)\b/,
    /\b(video call|videocall)\b.*\b(paise lekar|paid|for money|paise le)\b.*\b(girls?|ladki|private|kapde)\b|\b(girls?|ladki)\b.*\bvideo call\b.*\b(paise|paid|money)\b/,
  ],
  violence: [
    /\b(zeher|zehar|zahar|poison|poisoning)\b.*\b(dena|dene|de do|do|mila|milao|mix|kutte|kutta|kutton|dogs?|cats?|billi|animals?|janwar|neighbou?r'?s?|padosi|kisi ko|logon ko|someone|people)\b|\b(kutte|kutta|kutton|dogs?|cats?|billi|janwar|animals?|birds?|chidiya)\b.*\b(zeher|zehar|poison|maar|maarna|maarne|pitai|torture|jala|kill\w*)\b/,
    /\b(dhamka\w*|dhamki|darra\w*|darane|daraane|harass\w*|threaten\w*|blackmail\w*|tang karne|pareshan karne)\b/,
    /(?<!\b(glue|water|nerf|massage|spray|toy|paint|staple|hot glue|nail) )\bguns?\b/,
    /\b(pistols?|rifles?|revolvers?|bombs?|explosives?|grenades?|weapons?|hathiyar|ammo|ammunition|katta|kattas|hitman|hitmen|terror|terrorist|terrorism|murder|murders|stab|stabbing|supari killer|contract killing|knife|knives|chaku|chaaku|chakku|chhuri|churi|talwar|talwaar|daggers?|machetes?|swords?|stun guns?|tasers?|tear gas|brass knuckles|acid attack)\b/,
    /\bbombs?\s+(banane|banana|banao|bana|making|make|kit|blast|recipe|banayenge|banayega|bananey|se uda|phodna|phod)\b|\b(make|making|build|building) (a )?bombs?\b|\bbomb (blast|attack)\b|\bgunpowder\b/,
    /\b(bandook|bandukh|banduk|bandooq|tamancha|desi katta|goli chalana|goli maar)\b|\b(gun|bandook|pistol)\b.*\b(banane|banana|tutorial|ghar pe|at home|making)\b/,
    /\bacid\b.*\b(phenk|phek|throw|attack|daal)\b|\b(phenk|throw)\b.*\bacid\b/,
    /\bpepper spray\b.*\b(secret|secretly|chupke|attack|fight|school)\b|\b(secret|secretly|chupke)\b.*\bpepper spray\b/,
    /\bkill(ing)?\s+(people|someone|somebody|log|logon|insaan|humans?|him|her|them|teachers?|students?|animals?|dogs?)\b/,
    /\b(maar ?peet|maarpeet|beat (people|someone|them|him|her|bullies)( up)?|beat up|fight club|gang ?war|goonde|goons?|hired gang|gang hire|pitai|peetna|thokna|fights? (in|at) school|school fights?)\b/,
  ],
  drugs: [
    /\b(drugs?|weed|ganja|charas|cocaine|heroin|mdma|ecstasy|lsd|meth|opium|afeem|smack|vapes?|vaping|e-?cigs?|cigarettes?|cigs|tobacco|gutkha|hookah|shisha|alcohol|alcoholic|sharab|sharaab|daaru|daru|beer|beers|whisky|whiskey|vodka|rum|liquor|theka|bhang|nasha|stoner|high hone)\b/,
  ],
  betting: [
    /\bentry fee\b.*\b(prize|prizes|inaam|jeeto|jeet|win|cash)\b|\b(cash prize|cash prizes|cash inaam|prize money|prize pool)\b.*\b(ludo|cards|taash|teen patti|game|games|tournament|match|carrom|dice|quiz|contest|entry)\b|\b(ludo|cards|taash|carrom|dice|game|tournament)\b.*\b(cash prize|cash prizes|cash inaam|prize money)\b/,
    /\b(betting|bettings|bets?\s+(on|lagao|lagana|paisa|money)|satta|sattebaazi|matka|gambling|gamble|gambler|casino|casinos|lottery|lotteries|jua|juaa|juwa|poker|rummy|teen patti|jackpot|cash stakes?|real[- ]money|money games?|paisa lagao|paise lagao|paise laga|paisa laga|paisa double|paise double|double money|money double)\b/,
    /\b(lagao|laga ke|lagake|lagana|daalo|daalte|daalna|deposit|stake|bet)\b.*\b(win|jeeto|jeet|jeetenge|double|milenge)\b|\b(win|jeeto|jeet)\b.*\b(lagao|laga ke|lagake|daalo|deposit|stake)\b/,
    /\b(cash|paise|paisa|money) (daalte|daalo|daal ke|laga ke|lagate)\b|\bwinner takes\b|\bwhole pool\b|\bprize pool\b.*\b(entry|cash|paise)\b/,
    /\b(ipl|cricket|match|kabaddi|football)\b.*\bprediction\b.*\b(rs|rupees?|rupaye|paise|paisa|money|cash|\d+)\b/,
    /\b(ludo|carrom|cards|taash|game|games|match|tournament)\b.*\b(for|with|pe|par)\s+(cash|money|paise|paisa)\b/,
    /\b(cash|money|paise|paisa)\s+(stakes?|lagake|laga ke|pe khelo)\b/,
  ],
  cheating: [
    /\blikhwa\w*\b.*\b(apne naam|own name|jama|submit)\b|\bghost ?-?writ\w*\b|\b(ai|chatgpt|bot)\s+se\s+likhwa\w*|\b(project|assignment|homework|thesis|essay)\b.*\b(likh ke|likhke|bana ke|banake)\s+(dena|denge|dunga|dungi)\b.*\b(paise|rupaye|rupees|\d+)\b/,
    /\b(paper|papers|question paper|exam|board) ?leaks?\b/,
    /\bleak(ed|ing)?\s+(the\s+)?(exam|paper|papers|question)/,
    /\bcheat(ing)?\s+(in|during|on|for)\s+(the\s+)?(exams?|tests?|papers?|boards?|quiz)/,
    /\b(exam|test|paper|quiz) (me|mein|main)\s+(cheat|nakal|chori)/,
    /\b(nakal|cheating app|cheating device|cheating watch|proxy attendance|fake attendance|proxy exam|dummy candidate|plagiarism)\b/,
    /\b(solve|solves|solving|likh|likhe|likhega|answers?|bata)\b.*\b(online )?(exam|test|quiz)\b.*\b(teacher|invigilator|sir|madam|ma'am)\b.*\b(not|nahi|na)\b/,
    /\b(bot|ai|app|tool)\b.*\b(solve|solves|solving|answers?)\b.*\b(online )?(exams?|tests?|quiz)\b|\b(exam|test) (bot|solver)\b/,
    /\b(online )?(exam|test|quiz|paper)\b.*\b(solve|likh|answers?)\b.*\b(teacher|invigilator|sir|madam)\b.*\b(not|nahi|na)\b/,
    /\b(exam|test|paper) (solve|likh) kar(e|ega|egi|de|ke|ta|ti)?\b|\bbot\b.*\b(exam|test|quiz)\b.*\bsolve/,
    /\b(koi aur|someone else|dusra)\b.*\b(exam|paper|test)\b.*\b(de|dega|write|likhe|give)\b/,
    /\b(assignments?|homework|projects?|essays?)\b.*\b(likh|likhke|likh ke|write|written|writing|bana|banake)\b.*\b(bech|sell|selling|submit|apne naam|own name|as (their|his|her|your|my) own)\b/,
    /\b(assignment|homework|essay) (selling|bechna|writing service|for money)\b/,
    /\b(thesis|assignment|project|essay|homework|report)\b.*\b(submit|jama)\b.*\b(as mine|as my own|as their own|apne naam|own name|mera naam)\b/,
    /\bleak\w*\b.*\b(question|paper|exam)\b|\b(question|exam) paper\b.*\b(telegram|whatsapp group|leak)\b/,
    /\b(bluetooth|earpiece|earphone|hidden camera|smart watch|smartwatch)\b.*\b(exams?|tests?|papers?)\b|\banswers? (during|in) (the )?(exams?|tests?)\b/,
    /\bpassword (nikaal|nikal|crack|chura|tod)\w*|\bhacking tools?\b|\b(account|insta|instagram) hack\w*/,
    /\bfake\s+(certificates?|marksheets?|degrees?|ids?|id cards?|documents?|aadhaar|aadhar|pan cards?|reviews?|followers|likes|notes?|currency|medical)\b/,
    /\bhack(ing|er|ers)?\s+(into\s+)?(instagram|insta|facebook|whatsapp|accounts?|wifi|wi-fi|passwords?|someone|school|phones?|bank|portal)/,
    /\b(password|account) (hack|chura|churana|steal)/,
  ],
  privacy: [
    /\b(secretly|chupke se|chupke|bina bataye|without telling)\b.*\b(read|padh\w*|dekh\w*|check\w*)\b.*\b(messages?|chats?|whatsapp|dms?|texts?|inbox)\b|\b(read|padh\w*)\b.*\b(my|meri|her|his|uski|uske)\s+(girlfriend|boyfriend|gf|bf|ex|wife|husband|crush|sister|brother|behen|bhai)\b.*\b(messages?|chats?|whatsapp|dms?)\b|\b(girlfriend|boyfriend|gf|bf|ex)\s+(ke|ki|ka)\s+(messages?|chats?|whatsapp)\b/,
    /\b(phone numbers?|mobile numbers?|numbers ki list|contacts?|contact list|personal data|data|details|addresses|emails?|email ids?)\b.*\b(bech\w*|sell\w*|marketers?|companies ko de)\b/,
    /\b(spy|spying|stalk|stalking|stalker|stalkers)\b/,
    /\btrack(ing)?\s+(my\s+|a\s+|any\s+)?(girlfriend|boyfriend|gf|bf|ex|wife|husband|someone|somebody|anyone|classmates?|crush|girls?|boys?|ladki|ladka|person|people|teacher)\b/,
    /\b(home address|ghar ka pata|ghar ka address|uska address|where (s?he|they|my crush) lives?|kahan rehti|kahan rehta)\b/,
    /\b(live )?location\b.*\b(bina bataye|without (telling|asking|consent)|secretly|chupke|of (a|any|my) (girl|boy|crush|ex|classmate))\b/,
    /\b(secretly|chupke se|chupke)\s+(record|track|photo|photos|video|videos|follow)/,
    /\b(phone numbers?|numbers?|contacts?) (of|wale) (girls|ladkiyon|classmates|students)\b/,
    /\bfollow (her|him|them|girls|ladki) (home|ghar)\b/,
    /\b(without (her|his|their|them) (knowing|knowledge|consent)|bina (unhe|use|usko|uske)? ?bataye|bina pata chale)\b/,
    /\bsee where (my|a|any)? ?(girlfriend|boyfriend|gf|bf|wife|husband|crush|sister|brother|girl|boy)\b|\bwhere (she|he) is all the time\b/,
    /\b(read|padhna|dekhna|check)\b.*\b(her|his|someone'?s|kisi ki|kisi ke|behen ki|bhai ki)\b.*\b(whatsapp|chats?|messages|dms?)\b/,
  ],
  hate: [
    /\b(dalit|dalits|sc|st|obc|quota|reservation|caste|jaati|muslims?|hindus?|sikhs?|christians?|tribal|adivasi)\b.*\b(memes?|mazaak|mazak|jokes?|roast\w*|making fun|make fun|mock\w*|troll\w*)\b|\b(memes?|jokes?|roast\w*|making fun|make fun|mock\w*|troll\w*)\b.*\b(dalit|dalits|quota|reservation|caste|jaati|muslims?|hindus?|sikhs?|christians?|tribal|adivasi)\b/,
    /\bbody ?-?sham\w*|\b(fat|mota|moti|motu|kaali|kaala|kaalu|patla|patli|ugly|chubby)\b.*\b(roast\w*|sham\w*|mazaak|mazak|jokes?|troll\w*|make fun)\b|\b(roast\w*|sham\w*|troll\w*)\b.*\b(fat|mota|moti|motu|ugly|chubby)\s+(girls?|boys?|ladki\w*|ladk\w*|people|log|students?)\b/,
    /\b(bully|bullying|bullies|hate speech|hate page|hate group|casteist|casteism|racist|racism|retard|retarded|retards|chinki|chinky|kaalu|kalu|bhangi|chamar|katua|mulla|gay jokes?|homophobic)\b/,
    /\b(rate|rating|rank|ranking)\s+(girls|boys|classmates|students|teachers|people)('s)?\s*(looks|faces|body|bodies)?\b.*\b(looks|hot|ugly|cute|faces?|body)\b/,
    /\bhot or not\b/,
    /\b(make fun of|roast|insult|mock|mocking|tease|chidhana)\s+(people|classmates|teachers|fat|poor|girls|boys|kids|disabled|gay|gays)\b/,
    /\b(only|sirf) (for )?(hindu|muslim|sikh|christian|jain|dalit|brahmin|upper caste)s?\b|\bno (muslims?|hindus?|sikhs?|christians?|dalits?)( allowed)?\b/,
    /\b(how )?(fat|ugly|kaali|kaala|mota|moti)\b.*\b(girls?|boys?|ladki|ladke|students|classmates|people)\b.*\b(rat(e|es|ing)|rank\w*|scor(e|es|ing)|vot(e|es|ing))\b|\b(rat(e|es|ing)|rank\w*|scor(e|es|ing)|vot(e|es|ing))\b.*\b(girls?|boys?|ladki|classmates|students)\b.*\b(fat|ugly|mota|moti|kaala|kaali|looks)\b/,
    /\bquota (wale|wala|waale|students)\b.*\b(mazaak|mazak|joke|roast|tease)\b|\b(mazaak|mazak|roast)\b.*\bquota\b/,
    /\bjokes? (on|about) (gay|gays|disabled|handicapped|fat|poor|caste|muslims?|hindus?|sikhs?|christians?)\b/,
  ],
  language: [
    /\b(fuck|fucking|fucker|shit|bitch|bastard|asshole|madarchod|maderchod|behenchod|bhenchod|chutiya|chutiye|gandu|bsdk|bhosdi|bhosdike|lavda|lauda|lodu|randi|harami|mc|bc|bkl)\b/,
  ],
};

// Devanagari (Hindi script) words. \b does not work for Devanagari in JS, so these are substring matches.
const HINDI = {
  adult: ['सेक्स', 'नंगा', 'नंगी', 'चुदाई', 'अश्लील', 'पोर्न'],
  violence: ['बंदूक', 'चाकू', 'तलवार', 'बम बनाने', 'बम बनाना', 'हथियार', 'तेजाब', 'कत्ल', 'मार पीट', 'मारपीट'],
  drugs: ['शराब', 'दारू', 'गांजा', 'चरस', 'ड्रग्स', 'नशा', 'सिगरेट', 'गुटखा', 'हुक्का'],
  betting: ['सट्टा', 'जुआ', 'जुए', 'लॉटरी', 'कैसीनो', 'पैसा लगाओ', 'पैसे लगाओ'],
  cheating: ['नकल', 'पेपर लीक', 'फर्जी', 'हैक'],
  privacy: ['पीछा', 'घर का पता', 'जासूसी'],
  hate: ['चिंकी', 'भंगी'],
  language: ['चूतिया', 'मादरचोद', 'बहनचोद', 'भोसड़ी', 'रंडी', 'गांडू'],
};

// Order matters: the first matching kind decides the message (care first, always).
export const KINDS = ['care', 'adult', 'violence', 'drugs', 'betting', 'cheating', 'privacy', 'hate', 'language'];

export const CARE_LINE = 'Kisi bade se baat karo';
const MESSAGES = {
  care: `Yeh sunke humein tumhari fikar hui. Tum akele nahi ho. ${CARE_LINE}: ghar pe, teacher ya counsellor se, abhi. Stall pe kisi bhi Zenith didi ya bhaiya ko bolo, woh saath chalenge.`,
  adult: 'Yeh topic hamare family-friendly tank ke liye nahi hai. Chalo ek fresh idea try karte hain!',
  violence: 'Sharks safety-first hain, isliye yeh idea skip. Koi aisa idea jo logon ki help kare?',
  drugs: 'Yeh idea rules aur health dono ke chakkar mein skip. Neeche se ek fresh idea pick karo!',
  betting: 'Sharks ko paisa lagane wale games pasand nahi. Skill wala ya kaam ka idea try karo?',
  cheating: 'Shortcut nahi, smart idea chahiye! Jo cheez sabki honestly help kare, woh pitch karo.',
  privacy: 'Kisi ki privacy, number ya address pe nazar? Nahi yaar. Sirf idea batao, naam aur number nahi!',
  hate: 'Sharks sirf kind ideas sunte hain. Koi aisa idea jo sabko saath laaye?',
  language: 'Arre, thoda clean language mein pitch karo, sharks sharma gaye! Ek baar phir try karte hain?',
  other: 'Yeh idea AI Sharks ke tank ke liye thoda off-limits hai. Neeche se ek idea pick karo ya naya socho!',
};

// Personal data in a pitch (phone, email, @handle, full date): redirected as privacy, never sent anywhere.
const PERSONAL = [
  /(?:\+?\d[\s-]?){10,}/,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /(^|\s)@[A-Za-z0-9_.]{3,}/,
  /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/,
];

const LEET = { 0: 'o', '@': 'a', 4: 'a', $: 's', 3: 'e', 1: 'i', '!': 'i', 5: 's', 7: 't' };
function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[0@4$31!57]/g, (c) => LEET[c])
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/[^a-z0-9+' -]+/g, ' ')
    .replace(/\s+/g, ' ');
}
// "s e x", "s.e.x", "n-u-d-e" -> "sex", "nude"
const joinSpelled = (s) => s.replace(/(?<![a-z])(?:[a-z][\s._-]){2,}[a-z](?![a-z])/g, (m) => m.replace(/[\s._-]/g, ''));

/**
 * check(text) -> { ok: true } or { ok: false, kind, message }.
 */
// Harmless phrases that look like unsafe words: removed before matching.
const HARMLESS = [/\b(alcohol|alchohol|sharab|sugar)[- ]?free\b/gi, /\bnon[- ]?alcoholic\b/gi, /\b(zero|no) alcohol\b/gi, /\b(is|are|was|the) (the )?bomb\b/gi, /\bbomb (golgappa|golgappe|pani ?puri|burger|pizza|taste|sale|deal|offer)\b/gi, /\bphotobomb\w*/gi, /\bstock khatam\b/gi, /\bwin (prizes?|trophies|trophy|medals?|certificates?|books?)\b/gi, /\bkiller app\b/gi, /\bknife (sharpening|sharpener|sharpeners|set|sets|skills|making class)\b/gi, /\b(kitchen|chef'?s?|butter) knives?\b/gi, /\bknives? (sharpening|sharpener)\b/gi, /\bmurder mystery\b/gi, /\bbomb ?-?proof\b/gi, /\bspy (theme|themed|party|parties|movie|movies|novel|novels|game|games|gadget toys?)\b/gi, /\b(theme|themed) spy\b/gi, /\bmystery (game|cafe|party)\b/gi];

export function check(text) {
  let src = String(text || '').normalize('NFKC');
  for (const re of HARMLESS) src = src.replace(re, ' ');
  const raw = src.toLowerCase().replace(/\s+/g, ' ');
  const variants = [raw, normalise(src), joinSpelled(normalise(src)), joinSpelled(raw)];
  // Care (self-harm, crisis): core's care.detect is the ONLY judge (CONTRACT 13.3), so AI Sharks and core always agree.
  if (coreCare(String(text || ''))) return block('care');
  for (const kind of KINDS) {
    for (const re of RULES[kind] || []) if (variants.some((v) => re.test(v))) return block(kind);
    for (const w of HINDI[kind] || []) if (src.includes(w)) return block(kind);
  }
  if (PERSONAL.some((re) => re.test(src))) return block('privacy');
  // Last layer: core's TV profanity/slur filter (masks a word as ***).
  const probe = coreProbe(src.slice(0, 600));
  if (cleanText(probe).includes('***') && !probe.includes('***')) return block('language');
  return { ok: true };
}

const block = (kind) => ({ ok: false, kind, message: MESSAGES[kind] });
export function redirectMessage(kind) { return MESSAGES[kind] || MESSAGES.other; }

/** Counted as the `safety_redirect` event dimension (short enum only). */
export const SAFETY_DIMS = [...KINDS, 'other'];
