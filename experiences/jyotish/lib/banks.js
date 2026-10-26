// Curated, reviewed line banks for the phone-only Dating and Health tabs, and replacement lines for the reading.
// The model NEVER writes Dating or Health text: it only picks ids from these banks (plus one adjective from ADJ).
// Review rules: PG, positive, about friendship and confidence (Dating) or everyday energy (Health).
// Health never names a food to skip: SKIP is habits only. SUPERFOODS are everyday foods to enjoy, no diets.
// Every line must pass lib/guard.js (test/jyotish/guard.test.js checks it). APPEND ONLY: ids are positions.

const bank = (prefix, lines) => lines.map((text, i) => ({ id: `${prefix}${String(i + 1).padStart(2, '0')}`, text }));

export const ADJ = ['chill', 'bold', 'sunny', 'sparkly', 'steady', 'curious', 'cosmic', 'golden', 'breezy', 'witty', 'kind', 'zen', 'electric', 'cheerful', 'focused', 'playful', 'bright', 'calm', 'creative', 'radiant'];

export const DATING = {
  title: bank('dt', ['Green Flag Energy', 'Main Character Energy', 'Loyal Legend', 'Golden Heart Energy', 'Big Heart Energy', 'Squad Captain Vibe', 'Mentor Glow', 'Intuition Icon', 'Social Butterfly', 'Calm Confidence', 'Hype Friend Energy', 'Sunshine Squad Lead', 'Vibe Curator', 'Master Builder Vibe', 'Mystery Mode', 'Boss Mode Friend', 'Adventure Buddy', 'Chill Pill Energy', 'Good Vibes Only', 'Team Glue Energy', 'Kind Soul Vibe', 'Bestie Material', 'Fearless Friend', 'Star of the Squad']),
  forecast: bank('dr', [
    'Tumhari listening skills hi tumhara secret superpower hain.',
    'Is mahine tum group chat ke trendsetter banoge.',
    'Tumhare jokes se naye dost bante rahenge.',
    'Tumhara bharosa hi tumhari sabse badi taakat hai.',
    'Tumhari spontaneous vibe se har din nayi story banegi.',
    'Tumhari care log hamesha yaad rakhte hain.',
    'Tumhari calm vibe sabko curious bana deti hai.',
    'Tumhari confidence se squad naturally inspire hota hai.',
    'Tumhari kindness har nayi dosti ki shuruaat hai.',
    'Tum pehli baat mein hi vibe pakad lete ho.',
    'Tumhare plans sunke log turant team join karna chahte hain.',
    'Tumhari advice log screenshot karke rakhte hain.',
    'Naye class ya club mein tum sabse pehle dost banaoge.',
    "Tumhara ek 'hi' squad ke liye free power-up hai.",
    'Fest mein tumhari energy poore stall ko jaga degi.',
    'Tum jahan jaate ho, wahan conversation shuru ho jaati hai.',
    'Tumhari honesty sabko comfortable feel karwati hai.',
    "Tumhara ek 'chalo karte hain' poore group ko utha deta hai.",
    'Tumhara sense of humour is hafte full form mein rahega.',
    'Tumhare memes group chat ke highlight banenge.',
    'Naye logon se milna tumhare liye level up jaisa hai.',
    'Tumhari energy dekh ke chup rehne wale dost bhi bolne lagte hain.',
    'Tum team mein woh ho jiske aane se meeting fun ho jaati hai.',
    'Is mahine ek naya dost tumhari playlist ka fan banega.',
    'Tumhari baaton mein ek alag sa sukoon hai.',
    'Tum doston ki jeet ko apni jeet ki tarah celebrate karte ho.',
    'Tumhari presence se room ki battery full ho jaati hai.',
    'Tum har kisi ko feel karwate ho ki woh important hai.',
    'Tumhare dost tumhe apna hype manager maante hain.',
    'Tumhara ek message kisi ka din bana deta hai.',
    'Tum stage pe bhi aur canteen mein bhi utne hi confident ho.',
    'Tumhari curiosity naye logon ko tumse baat karne ka bahana deti hai.',
    'Tum group ke peacemaker ho, sab tumhari baat sunte hain.',
    'Tumhari positivity is hafte sabse zyada contagious rahegi.',
    'Tum chupchaap sabka dhyan rakhte ho, aur sab jaante hain.',
    'Tumhari ek tareef kisi ka poora hafta bana degi.',
    'Tum naye idea ke saath sabse pehle haath uthate ho.',
    'Tumhari vibe match karne wale log khud tumhe dhoondh lenge.',
    'Tumhari dosti mein full commitment hai, aur log ise mehsoos karte hain.',
    'Is fest season tum squad ke official vibe setter ho.',
    "Tumhari soch sunke log 'yaar, yeh toh sahi hai' bolte hain.",
    'Tum har group photo ko yaadgaar bana dete ho.',
  ]),
  flags: bank('df', ['Seedhi baat, no drama', 'Promise nibhate ho', 'Sabko saath le ke chalte ho', 'Sunte ho, judge nahi karte', 'Birthday hamesha yaad rakhte ho', 'Chhoti baaton ka khayal', 'Sabko hasate ho', 'Energy kabhi low nahi', 'Naye logon ko welcome karte ho', 'Waqt pe aate ho', 'Har plan ka backup ready', 'Dosti mein full commitment', 'Har plan ke liye ready', 'Naya try karne mein aage', 'Boring moment ko fun banate ho', 'Sabka khayal rakhte ho', 'Ghar jaisi vibe dete ho', 'Deep baatein karte ho', 'Secrets safe rehte hain', 'Har baat soch samajh ke', 'Bade sapne, solid plan', 'Team ko motivate karte ho', 'Jo kehte ho woh karte ho', 'Sabki madad karte ho', 'Open minded', 'Gut feeling on point', 'Inspiring baatein', 'Vision bhi, execution bhi', 'Sabko role dete ho', 'Patience unlimited', 'Har kisi mein accha dekhte ho', 'Credit share karte ho', 'Thank you bolna yaad rehta hai', 'Notes share karte ho', 'Late night doubt helpline', 'Playlist share karte ho', 'Doston ke liye stand lete ho', 'Honest feedback, softly', 'Group chat mein sabse fast reply', 'Har jeet celebrate karte ho', 'Naye idea ko support karte ho', 'Juniors ki help karte ho', 'Kabhi show off nahi', 'Sabka naam yaad rakhte ho', 'Chai pe sabse acchi baatein']),
  signs: bank('ds', ['Dost jo late night deep talks enjoy kare', 'Squad jo board games ka shaukeen ho', 'Log jo tumhari kindness ko value karein', 'Squad jo karaoke night pe full josh mein ho', 'Dost jo tumhare memes pe sabse pehle react kare', 'Log jo creative plans mein saath dein', 'Dost jo weekend projects mein saath baithe', 'Squad jo trekking plan kare', 'Log jo seedhi aur sacchi baat pasand karein', 'Dost jo last minute trip pe nikal pade', 'Squad jo naya street food dhoondhe', 'Log jo tumhari energy match karein', 'Dost jo ghar ke khane ki tareef kare', 'Squad jo festival saath manaye', 'Log jo chhoti khushiyon ko celebrate karein', 'Dost jo bookstore ya cafe trip enjoy kare', 'Squad jo puzzles aur quiz ka fan ho', 'Log jo shaanti mein bhi comfortable hon', 'Dost jo startup ideas pe brainstorm kare', 'Squad jo goals share kare', 'Log jo tumhari ambition ko cheer karein', 'Dost jo volunteering mein saath aaye', 'Squad jo naye cultures explore kare', 'Log jo tumhari soch ko inspire karein', 'Dost jo stargazing ka shaukeen ho', 'Squad jo art aur music jam kare', 'Log jo tumhare ideas ko space dein', 'Dost jo hackathon mein saath code kare', 'Squad jo bade projects plan kare', 'Log jo long term goals mein believe karein', 'Dost jo naye logon ko group mein laaye', 'Squad jo juniors ko sikhane mein maza le', 'Log jo tumhari warmth ko return karein', 'Dost jo cricket match pe live commentary kare', 'Squad jo fest stall pe saath volunteer kare', 'Dost jo tumhari playlist mein naye gaane add kare', 'Squad jo early morning cricket ke liye uthe', 'Log jo tumhe hype karein, aur tum unhe', "Dost jo har plan mein 'haan' bole", 'Squad jo canteen mein naye ideas banaye', 'Dost jo photography walk pe saath chale', 'Log jo sawaal poochna enjoy karein']),
};

export const HEALTH = {
  type: bank('ht', [
    ['Morning Sprinter', 'Tumhari battery subah full charge hoti hai, din ki shuruaat tumhari.'],
    ['Sunset Chiller', 'Shaam ko tumhari energy sabse smooth flow mein hoti hai.'],
    ['Party Starter Spark', 'Tumhari energy dopahar ke baad aur bhi tez ho jaati hai.'],
    ['Steady Engine', 'Tumhari energy poore din ek jaisi chalti hai, bilkul steady.'],
    ['Weekend Explorer', 'Tumhari energy naye experiences se recharge hoti hai.'],
    ['Cozy Recharger', 'Tum apno ke saath waqt bitake sabse zyada recharge hote ho.'],
    ['Night Owl Thinker', 'Raat ko tumhara dimaag sabse creative mode mein hota hai.'],
    ['Power Hour Pro', 'Tumhari energy focused bursts mein aati hai, ekdum powerful.'],
    ['Golden Hour Glow', 'Tumhari energy logon ke saath share karke badhti hai.'],
    ['Moonlight Creator', 'Tumhari creative energy shaam aur raat mein chamakti hai.'],
    ['Marathon Mind', 'Tumhari energy lambi race ke liye bani hai, steady aur strong.'],
    ['Sunrise Guide', 'Tumhari energy subah ke shaant waqt mein sabse saaf hoti hai.'],
    ['Lunch Break Legend', 'Dopahar ka break tumhare liye mini festival hai.'],
    ['Dopahar Dynamo', 'Jab sab sust padte hain, tumhari spark tab jaagti hai.'],
    ['Chai Time Thinker', 'Tumhare best ideas chai ke pehle ghoont ke saath aate hain.'],
    ['Rainy Day Dreamer', 'Baarish ki aawaz tumhari creativity ka on button hai.'],
    ['Breeze Walker', 'Ek chhoti si walk tumhara poora mood reset kar deti hai.'],
    ['Desk Hero', 'Ek baar focus lag gaya toh tum kamaal kar dete ho.'],
    ['Music Mover', 'Sahi gaana bajte hi tumhari energy double ho jaati hai.'],
    ['Garden Wanderer', 'Hariyali ke beech tumhara dimaag sabse fresh rehta hai.'],
    ['Weekend Warrior', 'Weekend aate hi tumhari energy naye plans bana leti hai.'],
    ['Spark Plug', 'Tum chhoti chhoti bursts mein poore group ko charge kar dete ho.'],
    ['Steady Glow Star', 'Tumhari energy dheere jaagti hai, phir der tak chalti hai.'],
    ['Early Bird Builder', 'Subah ka shaant time tumhara secret build mode hai.'],
  ].map(([type, line]) => `${type}|${line}`)),
  superfoods: bank('hf', ['Chana chaat', 'Nimbu paani', 'Kele ka shake', 'Dahi', 'Nariyal paani', 'Moong dal chilla', 'Bhuna makhana', 'Aam panna', 'Paneer tikka', 'Rajma chawal', 'Chhaachh', 'Peanut chikki', 'Sprouts bhel', 'Jaljeera', 'Fruit chaat', 'Khichdi', 'Haldi doodh', 'Poha', 'Badaam', 'Ginger chai', 'Sattu sharbat', 'Paneer bhurji', 'Lassi', 'Mixed dry fruits', 'Amla murabba', 'Masala chaas', 'Ragi ladoo', 'Tulsi chai', 'Gud chana', 'Dal chawal', 'Moongphali', 'Upma', 'Seasonal fruits', 'Idli sambhar', 'Dhokla', 'Besan chilla', 'Coconut chutney', 'Bajra khichdi', 'Methi thepla', 'Kokum sharbat', 'Bhel puri', 'Corn chaat']),
  skip: bank('hs', ['3 am reels', 'Snooze button marathon', 'Doomscrolling', 'Group chat mein 2 baje tak', 'Bina break ke binge-watch', 'Weekend pe sirf sofa', 'Lagataar 4 ghante screen', 'Same routine ka loop', 'Phone ke saath raat jagna', 'Break lena bhoolna', 'Har notification pe turant jump', 'Bina stretch ke poora din', 'Bina break ke kaam', 'Raat 2 baje tak scroll', 'Late night scrolling', 'Charger dhoondhne ki daud', 'Raat bhar laptop marathon', 'Notifications ka tsunami', 'Har 5 minute phone check', 'Ek hi jagah 3 ghante baithna', 'Raat ko bright screen', 'Subah uthte hi reels', 'Band kamre mein poora din', 'Assignment last raat tak', 'Weekend pe zero plan, sirf screen', 'Ghanton tak ek hi position', 'Autoplay pe agla episode', 'Bina plan ke all-nighter', 'Phone ko alarm aur takiya dono banana', 'Ek hi playlist pe atak jaana', 'Sunday ko sirf scroll', 'Classes ke beech zero stretch', 'Ek saath 10 tabs aur zero break', 'Gaming marathon bina break', 'Raat ka last reel jo kabhi last nahi hota', 'Subah ka alarm 7 baar', 'Alarm ke baad bhi 20 minute scroll', 'Headphones full volume pe', 'Bina uthe seedha online class', 'Weekend pe zero dhoop']),
};

const all = { ...Object.fromEntries(Object.entries(DATING).map(([k, v]) => [`dating.${k}`, v])), ...Object.fromEntries(Object.entries(HEALTH).map(([k, v]) => [`health.${k}`, v])) };
export const BANK_IDS = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.map((x) => x.id)]));
const byId = new Map(Object.values(all).flat().map((x) => [x.id, x.text]));
export const bankText = (id) => byId.get(id) || null;

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}
/** Deterministic pick of n distinct ids from a bank (offline, mock, and filling gaps in a model pick). */
export function seeded(list, n, seed, exclude = []) {
  const r = rng(seed);
  const ids = list.map((x) => x.id).filter((id) => !exclude.includes(id));
  const out = [];
  while (out.length < n && ids.length) out.push(ids.splice(Math.floor(r() * ids.length), 1)[0]);
  return out;
}

/** A schema-shaped id pick for this seed (what the offline fixture and the mock answer). */
export function pickVibes(seed) {
  return {
    dating: { title: seeded(DATING.title, 1, `${seed}:t`)[0], forecast: seeded(DATING.forecast, 1, `${seed}:r`)[0], flags: seeded(DATING.flags, 3, `${seed}:f`), signs: seeded(DATING.signs, 3, `${seed}:s`), adj: ADJ[Math.floor(rng(`${seed}:a`)() * ADJ.length)] },
    health: { type: seeded(HEALTH.type, 1, `${seed}:h`)[0], superfoods: seeded(HEALTH.superfoods, 3, `${seed}:sf`), skip: seeded(HEALTH.skip, 3, `${seed}:sk`), adj: ADJ[Math.floor(rng(`${seed}:b`)() * ADJ.length)] },
  };
}

/**
 * Turn a model (or fixture) id pick into the text the phone shows. Unknown, duplicate or wrong-bank ids are
 * replaced by seeded picks, so the result always has 1 title, 1 forecast, 3 flags, 3 signs, 1 type, 3 + 3.
 * Returns { vibes, fixed } where fixed = how many ids had to be replaced.
 */
export function resolveVibes(pick, seed) {
  let fixed = 0;
  const one = (list, id, s) => { if (list.some((x) => x.id === id)) return id; fixed += 1; return seeded(list, 1, s)[0]; };
  const many = (list, ids, n, s) => {
    const ok = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => list.some((x) => x.id === id)))].slice(0, n);
    if (ok.length < n) { fixed += n - ok.length; ok.push(...seeded(list, n - ok.length, s, ok)); }
    return ok;
  };
  const adj = (a) => (ADJ.includes(a) ? a : (fixed += 1, ADJ[0]));
  const d = pick?.dating || {};
  const h = pick?.health || {};
  const [type, line] = bankText(one(HEALTH.type, h.type, `${seed}:h`)).split('|');
  const vibes = {
      dating: {
        title: bankText(one(DATING.title, d.title, `${seed}:t`)),
        rizz: bankText(one(DATING.forecast, d.forecast, `${seed}:r`)),
        flags: many(DATING.flags, d.flags, 3, `${seed}:f`).map(bankText),
        signs: many(DATING.signs, d.signs, 3, `${seed}:s`).map(bankText),
        adj: adj(d.adj),
      },
      health: {
        type, line,
        superfoods: many(HEALTH.superfoods, h.superfoods, 3, `${seed}:sf`).map(bankText),
        skip: many(HEALTH.skip, h.skip, 3, `${seed}:sk`).map(bankText),
        adj: adj(h.adj),
      },
  };
  return { vibes, fixed }; // after building: the helpers above count the fixes
}

/** The bank as prompt text: "id: line" per row, so the model can choose by meaning. */
export function bankPrompt() {
  const rows = (title, list) => `${title}\n${list.map((x) => `${x.id}: ${x.text.replace('|', ' : ')}`).join('\n')}`;
  return [
    rows('DATING TITLES (pick 1)', DATING.title), rows('DATING FORECASTS (pick 1)', DATING.forecast),
    rows('GREEN FLAGS (pick 3)', DATING.flags), rows('VIBE MATCH SIGNS (pick 3)', DATING.signs),
    rows('HEALTH ENERGY TYPES (pick 1)', HEALTH.type), rows('EVERYDAY SUPERFOODS (pick 3)', HEALTH.superfoods),
    rows('HABITS TO SKIP (pick 3)', HEALTH.skip), `ADJECTIVES (pick 1 for dating.adj and 1 for health.adj)\n${ADJ.join(', ')}`,
  ].join('\n\n');
}
