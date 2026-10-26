// Wording guard for this experience: a deterministic layer in front of core's judge (CHECK-19 F3).
// Even if the model judge approved everything, a model line reaches the phone only if it passes ALL of this.
// It errs heavily towards the reviewed bank lines: blocking a harmless line costs nothing (a bank line shows instead),
// letting an unsafe one through is what we must never do. Model wording is meant to be short, Roman-script Hinglish,
// so anything else (Devanagari, emoji, other scripts, HTML, links, long numbers) is refused outright.

// 1. Shape: Roman letters, digits and plain punctuation only (no Devanagari, emoji, homoglyphs, zero-width).
const SHAPE = /^[A-Za-z0-9 .,!?'":;()&+/%-]+$/;

// 2. Words and phrases, matched on a normalised copy (lowercase, leetspeak folded, repeated letters squeezed).
const RULES = {
  // unhealthy study: less sleep, all-nighters, very early or late hours, skipping meals or breaks, marathon days, stimulants
  health: [
    /\b(neend|nind|neendh|sleep\w*|so\s?jaa\w*|so\s?jao|sona\b|sone\b|soyenge|soye|sote|aaram\w*|rest\w*)\b/,
    /\b(raat\s?bhar|poori\s?raat|puri\s?raat|saari\s?raat|sari\s?raat|all\s?nighters?|all\s?night|night\s?out|overnight|jaag\w*|jag\s?ke|jagte|late\s?night|midnight|aadhi\s?raat)\b/,
    /\b\d{1,2}\s?(baje|am|pm|o'?clock)\b/,
    /\b(khana|khaana|khane|khaane|meals?|breakfast|lunch|dinner|nashta|naashta|bhookh|bhook|food|breaks?|chutti|pause)\b/,
    /\b(non\s?stop|bina\s?ruke|lagatar|continuous\w*|marathon|grind\w*|hustle)\b/,
    /\b([1-9]\d|1[0-9]|2[0-4]|eighteen|sixteen|twelve|ten|fifteen|twenty|das|baarah|barah|pandrah|solah|athaarah)\s?(-|\s)?(ghant\w*|hours?|hrs?|h)\b/,
    /\b(energy\s?drinks?|red\s?bull|coffee|caffeine|chai\s?pi\w*|cold\s?drink)\b/,
  ],
  // exam, rank, marks or result promises (and any outcome talk at all)
  exam: [
    /\b(guarantee\w*|gaurantee\w*|garanti\w*|promise\w*|pakk[aeiy]\w*|pukka|pucca|sure\s?shot|definite\w*|confirm\w*|certain\w*|fixed|tay\s?(hai|he|h)|zaroor\w*|zarur\w*|jaroor\w*|100\s?%|hundred\s?percent|sau\s?pratishat)\b/,
    /\b(aayeg[aie]\s?hi|aayenge\s?hi|milenge?\s?hi|milegi\s?hi|hog[aie]\s?hi|ho\s?hi\s?nahi|nahi\s?sakte|ban\s?jaoge|ban\s?jaogi|\w+oge|\w+ogi)\b/,
    /\b(marks?|score\w*|rank\w*|air\s?\d+|percentile|percent|topper\w*|top\s?(karo\w*|rank|kar)|distinction|first\s?class|result\w*|selection|selected|seat\w*|admission\w*|crack\w*|clear\s?kar\w*|pass\s?ho\w*|fail\w*|cutoff|merit|iit|nit|aiims|neet|jee|boards?\s?top)\b/,
    /\b\d{2,3}\s?(%|percent|out\s?of\s?100|\/\s?100)\b|\b\d+\s?%/,
  ],
  // medical, diet, supplements, pushing through pain
  medical: [
    /\b(doctor|dr|dawai|dawa|dava|medicines?|medic\w*|tablets?|pills?|paracetamol|crocin|dolo|painkillers?|ibuprofen|vitamins?|multivitamins?|supplements?|protein|whey|creatine|steroids?|shakes?|injections?)\b/,
    /\b(diet\w*|calories?|calorie|carbs?|sugar|salad|fasting|upvas|vrat|kam\s?kha\w*|khaana\s?kam|khana\s?kam|weight|vajan|wazan|fat|motapa|mota|moti|skinny|patla|patli|abs|six\s?pack|body\w*|bmi|muscles?|bulk\w*)\b/,
    /\b(chakkar|dard|pain|injur\w*|chot|ghutn\w*|sprain|ignore\s?karo|push\s?karo|push\s?through|heart\s?rate|pulse|bp|blood|sweat\s?it|litres?|liters?)\b/,
  ],
  // money, investment, loans, income promises
  money: [
    /\b(invest\w*|stocks?|shares?|share\s?market|sensex|nifty|crypto\w*|bitcoin|trading|trader|forex|loan\w*|udhaa?r|karza|karz|emi|interest|byaaj|sip|mutual\s?funds?|returns?|double|tripl\w*|lakh\w*|crore\w*|crorepati|millionaire|ameer|rich|kamao\w*|kamaa\w*|kamai|income|salary|profit\w*|earn\w*|paisa\s?laga\w*|paise\s?laga\w*|apna\s?paisa|savings?|gullak|rs\.?\s?\d{3,}|rupa?y\w*|rupees?)\b/,
  ],
  // pressure, put-downs, family shame, harm to others, comparisons with real people
  pressure: [
    /\b(tumse|tumhare\s?se|unse)\s?(aage|behtar|better|zyada|tez)\b|\bkuch\s?nahi\s?ban\w*|\bsab\s?has\w*|\bnaraz\w*|\bgussa\w*/,
    /\b(loser\w*|nalayak|nikamm\w*|bekaar|bekar|barbaad\w*|barbad\w*|sar\s?jhuk\w*|naak\s?kat\w*|sharam\w*|sharm\w*|izzat|khatam|haar\w*|kamzor\w*|aalsi|lazy|bewakoof|bevakoof|stupid|idiot|dumb|useless|failure|disappoint\w*|ghar\s?walon?|parents?\s?ko|papa|mummy|mumma|darao|daraao|dara\s?do|ragg?ing|bully\w*|maar\w*|pitai|thappad|jaisa\s?ban\w*|jaisi\s?ban\w*|jaise\s?ban\w*|compare|tension\s?lo|pressure|stress\s?lo)\b/,
  ],
  // identity, contact, links, code, prompt injection
  leak: [
    /\d[\d\s-]{5,}\d/, /\d{5,}/,
    /https?|www|\.(com|in|org|net|io|ai|co|xyz|example|app|me|ly)\b|@/,
    /<|>|\{|\}|\\|`|\$/,
    /\b(ignore|previous\s?instructions?|system\s?prompt|instructions?|jailbreak|prompt|assistant|developer\s?mode|admin|password|api\s?key|forget|disregard|override|rules?)\b/,
    /\b(school|college|vidyalaya|dps|kv|class\s?\d+|section|whatsapp|insta\w*|call\s?karo|phone|number|address)\b/,
  ],
};

// distinctive words also caught when spaced or dotted out ("n e e n d", "c.r.y.p.t.o")
const SQUASHED = /neend|allnighter|raatbhar|pooriraat|multivitamin|paracetamol|painkiller|supplement|protein|crypto|bitcoin|udhaar|guarantee|pakka|pakki|topper|loser|barbaad|ragging|percentile|calorie|steroid|ignoreprevious/;

/** Lowercase, fold leetspeak, squeeze repeated letters ("neeeend" -> "neend", "sl33p" -> "sleep"). */
export function normalise(text) {
  const t = String(text).normalize('NFKC').toLowerCase()
    .replace(/(?<=[a-z])[013457@$](?=[a-z])|(?<=[a-z])[013457@$]\b|\b[013457@$](?=[a-z])/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' }[c]));
  return t.replace(/([a-z])\1{2,}/g, '$1$1');
}

/** Which rule group blocks this line ('' = none). Exported for tests and the README. */
export function blockedBy(text) {
  if (typeof text !== 'string' || !text.trim()) return 'empty';
  if (!SHAPE.test(text)) return 'shape';
  const n = normalise(text);
  for (const [group, list] of Object.entries(RULES)) if (list.some((re) => re.test(n))) return group;
  if (SQUASHED.test(n.replace(/[^a-z]/g, ''))) return 'squashed';
  return '';
}
export const wordingOk = (text) => blockedBy(text) === '';
