// Startup name generator: an area prefix + a shared suffix ("Thali" + "Dost" = "ThaliDost").
// Never visitor-typed. Every possible name is built once at boot and checked against BLOCKLIST (well-known
// Indian and global brands and famous people). Names that hit it are never offered, to the model or the composer.
// In live mode the chosen name also goes through core's judge (server.js); a flagged name falls back to a reviewed one.
import { AREAS, SUFFIXES } from './content.js';
import { BRANDS } from './brands.js';

// Normalised (lowercase, letters and digits only). Brands 5+ characters long are blocked as a substring of a name,
// shorter ones only as the whole name or as one of its two parts.
export const BLOCKLIST = [
  // Indian consumer apps and startups
  'swiggy', 'zomato', 'zepto', 'blinkit', 'grofers', 'bigbasket', 'jiomart', 'dunzo', 'instamart', 'milkbasket', 'licious', 'freshtohome', 'country delight',
  'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'snapdeal', 'shopclues', 'tatacliq', 'firstcry', 'lenskart', 'purplle', 'mamaearth', 'boat', 'noise', 'bewakoof',
  'paytm', 'phonepe', 'gpay', 'googlepay', 'bharatpe', 'mobikwik', 'cred', 'groww', 'zerodha', 'upstox', 'razorpay', 'pine labs', 'policybazaar', 'paisabazaar', 'slice', 'jupiter', 'fampay', 'junio',
  'ola', 'uber', 'rapido', 'yulu', 'bounce', 'blusmart', 'redbus', 'chalo', 'makemytrip', 'goibibo', 'cleartrip', 'ixigo', 'yatra', 'oyo', 'treebo', 'fabhotels', 'zostel',
  'byjus', 'unacademy', 'vedantu', 'physicswallah', 'toppr', 'doubtnut', 'embibe', 'extramarks', 'upgrad', 'simplilearn', 'whitehat', 'cuemath', 'meritnation', 'adda247', 'testbook', 'gradeup', 'collegedunia', 'shiksha', 'careers360',
  'dream11', 'mpl', 'my11circle', 'winzo', 'rummycircle', 'nazara', 'loco', 'rooter', 'cricbuzz', 'cricinfo', 'fancode', 'hotstar', 'jiocinema', 'sonyliv', 'zee5', 'mxplayer', 'voot', 'altbalaji',
  'cultfit', 'curefit', 'healthifyme', 'fittr', 'practo', 'pharmeasy', 'netmeds', 'tata1mg', 'apollo', 'medlife',
  'urbancompany', 'urbanclap', 'housejoy', 'nobroker', 'magicbricks', '99acres', 'housing', 'nestaway', 'stanza', 'zolo',
  'sharechat', 'moj', 'josh', 'chingari', 'roposo', 'koo', 'dailyhunt', 'inshorts', 'pratilipi', 'pocketfm', 'kukufm', 'gaana', 'jiosaavn', 'wynk', 'hungama',
  'apna', 'naukri', 'indeed', 'internshala', 'foundit', 'monster', 'dukaan', 'khatabook', 'okcredit', 'vyapar', 'udaan', 'indiamart', 'justdial', 'sulekha',
  'rebelfoods', 'faasos', 'box8', 'freshmenu', 'eatfit', 'behrouz', 'chaayos', 'chaipoint', 'mtr', 'haldiram', 'haldirams', 'bikaji', 'amul', 'mother dairy', 'britannia', 'parle', 'dabur', 'patanjali', 'itc',
  'dabbawala', 'dabbawalas', 'kabadiwala', 'kabadiwalla', 'scrapuncle', 'supertails', 'headsupfortails', 'ugaoo', 'nurserylive', 'bandlab', 'focusmate',
  // Indian groups and global brands
  'tata', 'reliance', 'jio', 'airtel', 'vodafone', 'adani', 'ambani', 'birla', 'mahindra', 'infosys', 'wipro', 'tcs', 'hcl', 'bajaj', 'hero', 'maruti', 'godrej', 'larsen',
  'google', 'alphabet', 'youtube', 'gmail', 'android', 'pixel', 'apple', 'iphone', 'microsoft', 'windows', 'xbox', 'amazon', 'alexa', 'meta', 'facebook', 'instagram', 'whatsapp', 'messenger', 'threads',
  'twitter', 'tiktok', 'snapchat', 'telegram', 'signal', 'discord', 'reddit', 'linkedin', 'pinterest', 'spotify', 'netflix', 'disney', 'samsung', 'xiaomi', 'redmi', 'oneplus', 'vivo', 'oppo', 'realme',
  'nike', 'adidas', 'puma', 'reebok', 'decathlon', 'zara', 'ikea', 'tesla', 'starbucks', 'mcdonalds', 'dominos', 'pizzahut', 'kfc', 'subway', 'cocacola', 'pepsi', 'nestle', 'maggi', 'cadbury', 'redbull',
  'openai', 'chatgpt', 'anthropic', 'claude', 'gemini', 'copilot', 'nvidia', 'intel', 'ibm', 'oracle', 'adobe', 'canva', 'figma', 'notion', 'slack', 'zoom', 'duolingo', 'coursera', 'udemy', 'khanacademy',
  'airbnb', 'booking', 'paypal', 'visa', 'mastercard', 'steam', 'playstation', 'nintendo', 'epicgames', 'fortnite', 'minecraft', 'roblox', 'pubg', 'freefire', 'bgmi', 'respawn', 'valorant',
  'campus', 'sparx', 'bata', 'liberty', 'woodland', 'peter england', 'raymond', 'biba', 'fabindia', 'westside', 'pantaloons', 'trends',
  // famous people (full names are matched as phrases; distinctive surnames alone)
  'virat kohli', 'kohli', 'dhoni', 'sachin', 'tendulkar', 'rohit sharma', 'bumrah', 'gambhir', 'dravid', 'ganguly', 'sehwag', 'yuvraj', 'hardik pandya',
  'shah rukh', 'shahrukh', 'srk', 'salman khan', 'aamir khan', 'amitabh', 'bachchan', 'akshay kumar', 'ranveer', 'ranbir', 'deepika', 'priyanka chopra', 'alia bhatt', 'katrina', 'kareena',
  'modi', 'gandhi', 'nehru', 'ratan tata', 'mukesh ambani', 'gautam adani', 'narayana murthy', 'elon musk', 'musk', 'bezos', 'bill gates', 'zuckerberg', 'sundar pichai', 'satya nadella', 'sam altman',
  'taylor swift', 'messi', 'ronaldo', 'neeraj chopra', 'sindhu', 'mary kom', 'kalam', 'tagore', 'bhagat singh', 'shivaji', 'carryminati', 'bhuvan bam', 'ashneer', 'aman gupta', 'anupam mittal', 'peyush bansal', 'namita thapar', 'vineeta singh',
];

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const BLOCK = [...new Set([...BLOCKLIST, ...BRANDS].map(norm))].filter(Boolean);

/** true when a generated name collides with a well-known brand or person. */
export function blocked(name, parts = []) {
  const n = norm(name);
  const ps = parts.map(norm);
  return BLOCK.some((b) => (b.length >= 5 ? n.includes(b) : n === b || ps.includes(b)));
}

// Words core's judge rules dislike in a public line (school names, body, romance, violence ...), plus double meanings
// a teen would read into a name (CHECK-18 N6: "anal", "haram", "gaali"). A name with one is never offered.
const AVOID = /school|college|hot|sex|kill|love|date|body|fat|ugly|gun|bomb|crush|doctor|dawa|anal|haram|gaal|gali|kachra|chut|lund|gand|bc$/i;

// Logo monograms (the 2 capitals of a name) that read as slang, an insult, a caste category, a party, a brand or a
// team. A name whose monogram is here is never offered (CHECK-18 N6).
export const MONO_STOP = new Set(['BS', 'SS', 'PP', 'HP', 'LG', 'FB', 'MG', 'KK', 'BC', 'MC', 'BJ', 'VD', 'ED', 'SC', 'ST', 'OBC', 'PM', 'CM', 'MS', 'LV', 'CK', 'HM',
  'KC', 'SB', 'GB', 'MI', 'GT', 'DC', 'RR', 'SG', 'GM', 'BB', 'BP', 'PK', 'SP', 'CP', 'TC', 'JD', 'BSP', 'AAP', 'KFC', 'XX', 'FU', 'WTF', 'OMG', 'IG', 'YT', 'TV', 'PC', 'BH']);

/** Every safe name for one area: [{ pre, suf, name }] (indexes into area.pre and SUFFIXES). */
export function namesFor(area) {
  const out = [];
  area.pre.forEach((p, i) => SUFFIXES.forEach((s, j) => {
    const name = `${p}${s}`;
    if (name.length > 16 || blocked(name, [p, s]) || AVOID.test(name) || MONO_STOP.has(initials(name))) return;
    out.push({ pre: i, suf: j, name });
  }));
  return out;
}

export const NAMES = Object.fromEntries(AREAS.map((a) => [a.id, namesFor(a)]));
export const ALL_NAMES = [...new Set(Object.values(NAMES).flat().map((n) => n.name))];

/** The reviewed fallback names of an area (used when the judge flags the model's pick). */
export function safeNames(area) {
  const list = NAMES[area.id];
  const want = ['Dost', 'Hub', 'Sathi', 'Yaar'];
  return want.map((s) => list.find((n) => SUFFIXES[n.suf] === s)).filter(Boolean);
}

export function initials(name) { return (name.match(/[A-Z]/g) || [name[0].toUpperCase()]).slice(0, 2).join(''); }
