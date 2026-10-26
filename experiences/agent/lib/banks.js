// Reviewed wording banks (CHECK-19 F3): the agent never writes free text. The planner picks line ids from these
// banks (enums in its schema), the same way it picks tools; offline, mock and hero runs pick them in code.
//   INTRO  per voice, 6 lines (2 strict, 2 balanced, 2 chill). Slot {name} (the generated agent name, from our word lists).
//   WHY    per tool, 6 lines: why this step runs.
//   TIPS   per template: general tips plus chip-specific ones (shown only when that chip was picked).
// Every line passes the copy rules, core's judge rules and our guard (test/agent/banks.test.js), so the guard and the
// judge on the composed output are a backstop only.
// TODO(student): add lines here (keep them short, positive, Roman Hinglish), then run the tests.

export const INTRO = {
  commentator: [
    '{name} crease pe! Yeh innings hum discipline se khelenge.', 'Aur {name} ne guard le liya hai, plan ab seedha boundary ki taraf.',
    'Aur yeh raha {name}, full form mein! Aaj ka task ready.', '{name} ki entry ho chuki hai, crowd ready, plan ready.',
    '{name} ki chill batting: plan easy, par solid.', 'Smooth chalo: {name} singles le ke aage badhega.',
  ],
  filmy: [
    'Picture abhi baaki hai! {name} ka plan full discipline wala hai.', 'Ek agent, ek mission, zero excuse. Main hoon {name}.',
    'Ek agent, ek mission, ek plan. Main hoon {name}.', 'Lights, camera, plan! {name} ki kahani shuru hoti hai.',
    'Relax hero! {name} ne plan ekdum chill rakha hai.', 'Yeh kahani dheere dheere chalegi, par ending mast hai. {name} hazir.',
  ],
  guru: [
    'Shaant mann, saaf niyam. {name} tumhara plan bana raha hai.', 'Ek ek kadam, poore dhyan se. {name} ka seedha raasta.',
    'Ek ek kadam, {name} ke saath. Pehle plan, phir kaam.', 'Jaldi nahi, sahi. {name} ne raasta soch liya hai.',
    'Dheere chalo, par chalte raho. {name} ka aasaan plan.', 'Chhote kadam, lambi yatra. {name} saath hai.',
  ],
  senior: [
    'Sun, {name} bol raha hoon: plan tight hai, follow karna.', 'Seedhi baat: {name} ka plan simple hai, bas roz karna hai.',
    'Tension mat lo, {name} ne sab sort kar diya hai.', 'Chalo, {name} ke saath ek ek kaam set karte hain.',
    'Easy hai yaar, {name} ne halka plan banaya hai.', 'Chill karo, {name} ne kaam chhote tukdon mein baant diya.',
  ],
  robot: [
    'BEEP. {name} online. Mode: discipline. Plan compile ho raha hai.', 'BEEP BEEP. {name} ready. Har step ka order set.',
    'BEEP BOOP. {name} ready. Task load ho gaya.', 'BOOP. {name} ne tools check kar liye. Plan chalu.',
    'BEEP. {name} chill mode mein. Plan smooth hai.', 'BOOP BOOP. {name} low stress mode mein. Sab set.',
  ],
  coach: [
    'Chalo champion! {name} bol raha hai: no excuses, sirf plan.', 'Seeti baj gayi! {name} ka plan full energy wala.',
    'Warm up ho gaya? {name} ka plan ready hai, chalo shuru.', 'Team huddle! {name} ne aaj ka game plan banaya hai.',
    'Mast raho, {name} ke saath. Roz thoda, bas itna kaafi.', 'Halka warm up, halka plan. {name} tumhare saath.',
  ],
};

export const WHY = {
  lookup: ['Pehle facts, phir kaam. Bina info ke plan nahi.', 'Curated list se topics aur tips nikaal raha hoon.', 'Thoda padh lete hain, phir plan aur aasaan hoga.', 'Reviewed list sabse bharosemand jagah hai.', 'Sahi topic chunna hi aadha kaam hai.', 'Pehle dekhte hain kya kya cover karna hai.'],
  calculator: ['Har minute ka hisaab, taaki kuch na chhoote.', 'Time ko sahi hisson mein baant raha hoon.', 'Numbers simple rakhte hain, load kam.', 'Pehle hisaab, phir plan. Seedha.', 'Kis cheez ko kitna time, yeh numbers batayenge.', 'Ginti saaf toh plan saaf.'],
  calendar: ['Har din same slot, same time. Discipline hi superpower hai.', 'Har din ke apne slots, koi clash nahi.', 'Slots chhote, beech mein lamba gap. Dheere dheere progress.', 'Din aur time likh diya, ab sochna nahi padega.', 'Har slot ke beech gap, taaki dimaag fresh rahe.', 'Calendar pe likha kaam aadha ho gaya samjho.'],
  notes: ['Ek checklist, roz tick karo.', 'Sab ek jagah: chhoti si checklist.', 'Ek halki si checklist, bas follow karo.', 'Tick karne ka maza hi alag hai.', 'Checklist yaad rakhegi, tum bas karo.', 'Chhoti list, bade kaam ki.'],
};

// general tips per template, then chip-specific ones keyed 'param:value' or 'item:id'
export const TIPS = {
  jee: {
    general: ['Roz ka chhota revision bade din ko halka kar deta hai.', 'Notifications band karo, focus ka cheat code!', 'Galtiyon ki copy hi asli guide hai.', 'Har chapter ke baad 5 sawaal bina dekhe.', 'Formula card jeb mein, revision raaste mein.', 'Ek topic samajh aaye toh dost ko samjhao.', 'Mushkil sawaal pe atko mat, nishaan lagao aur aage badho.', 'Har din ka pehla slot sabse kaam ka.'],
    byChip: { 'item:physics': ['Physics mein diagram pehle, formula baad mein.'], 'item:chemistry': ['Chemistry ke reactions flowchart mein yaad karo.'], 'item:maths': ['Maths mein roz thode sawaal, ek din mein sab nahi.'], 'cls:c11': ['Gyarahvi ke basics hi aage ki neev hain.'], 'cls:c12': ['Barahvi ke saath gyarahvi ke basics bhi dekhte raho.'] },
  },
  boards: {
    general: ['Har round ke end pe ek sample paper, time laga ke.', 'Timetable deewar pe chipkao, roz dikhega!', 'Answer steps mein likho, padhne wale ko aasaan lage.', 'Diagrams saaf aur label ke saath.', 'Har hafte ek din halka rakho.', 'Mushkil topic subah ke slot mein rakho.', 'Revision ka round bhi utna hi kaam ka jitna padhna.', 'Ek page ka summary har chapter ka.'],
    byChip: { 'board:cbse': ['NCERT pehle, phir baaki books.'], 'board:isc': ['Har subject ka syllabus checklist banao.'], 'board:state': ['Textbook ke exercises poore karo.'], 'item:english': ['English mein har format ka ek sample apni copy mein.'], 'item:accounts': ['Accounts mein roz 2 entries bina dekhe.'] },
  },
  concept: {
    general: ['Kal yeh concept kisi dost ko 2 minute mein samjhao.', 'Concept samajh aa gaya? Ab iska meme bana do!', 'Apne words mein likhna sabse achha revision hai.', 'Ek real life example dhoondo, concept chipak jaayega.', 'Quick check ka sawaal kal phir karo.', 'Diagram banao, concept dikh jaayega.', 'Samajh na aaye toh teacher se ek sawaal poocho.', 'Spaced revision: din 1, 3, 7 aur 14.'],
    byChip: { 'item:newton': ['Ghar mein ek gend se teeno laws try karo.'], 'item:recursion': ['Kaagaz pe factorial ka trace karke dekho.'], 'item:probability': ['Sikka 20 baar uchhalo aur ginti karo.'], 'item:photosynthesis': ['Ek patti ko dhoop aur chhaon mein dekho.'] },
  },
  lecture: {
    general: ['Har episode ek idea, ek recap sawaal. Bas.', 'Pehla take kharab hoga, teesra mast. Record karte raho!', 'Script zor se padho, phir record karo.', 'Hook pehle 3 second mein.', 'Ghar ki cheezon se demo sabse yaad rehta hai.', 'Har episode ke end pe ek sawaal chhodo.', 'Captions daalo, bina awaaz bhi samajh aaye.', 'Chehra dikhane ki jagah haath aur board bhi kaafi.'],
    byChip: { 'cls:c11': ['Gyarahvi wale dost ke liye bana ke dekho.'], 'cls:c12': ['Barahvi wale dost se feedback lo.'] },
  },
  mock: {
    general: ['Mock ek practice hai, galtiyon ki list hi asli seekh.', 'Mock ke din bhi mood fresh rakho, apna fav gaana suno!', 'Har hisse ke baad ek minute time check.', 'Aasaan sawaal pehle, confidence ban jaata hai.', 'Mock ke baad 20 minute galtiyan dekho.', 'Mock ke din naya topic mat kholo.', 'Paper pehle poora dekho, phir shuru.', 'Har mock ke baad ek cheez sudharo, bas ek.'],
    byChip: { 'exam:boards': ['Sample paper mein steps aur diagrams pe dhyan do.'], 'exam:unit': ['Unit test ke liye syllabus list pehle banao.'], 'exam:jee': ['Galat answer ka minus yaad rakho, guess mat karo.'] },
  },
  skill: {
    general: ['Roz thoda code, hafte mein bada fark.', 'Error aaye toh khush ho jao, kuch naya seekhne wale ho!', 'Jo seekha, teen line mein likho.', 'Chhota project pura karna, bada adhoora chhodne se behtar.', 'Har hafte kuch dikhao jo tumne banaya.', 'Docs padhna bhi ek skill hai.', 'Ek dost ke saath seekho, dono tez chalo.', 'Pehle chalne wala version, phir sundar.'],
    byChip: { 'skill:python': ['Python mein print se debug karna seekho.'], 'skill:ai': ['AI ka jawab hamesha khud check karo.'], 'skill:web': ['Browser ka inspect tool tumhara dost hai.'], 'skill:data': ['Data mein pehle sawaal, phir chart.'] },
  },
  mvp: {
    general: ['Pehla version chhota rakho, users se seekho.', 'Paper sketch bhi ek prototype hai, jhijhko mat!', 'Ek screen, ek kaam.', 'Sabse kaam ka feature pehle, baaki baad mein.', 'Paanch users ko chala ke dekho, sirf dekho.', 'Har din kuch chalne wala banao.', 'Naam aur logo baad mein, kaam pehle.', 'Feedback likh ke rakho, yaad nahi rehta.'],
    byChip: { 'user:parents': ['Parents ke liye bade buttons aur simple words.'], 'user:shops': ['Dukaan walon ke liye flow ekdum simple rakho.'], 'app:habit': ['Habit app mein roz ek tap, bas.'], 'app:split': ['Hisaab wali app mein calculation hamesha check karo.'] },
  },
  hackathon: {
    general: ['Demo simple rakho aur practice 3 baar.', 'Snacks aur paani team ka secret power-up hain!', 'Har do ghante team check in.', 'Ek kaam, ek owner.', 'Pehle chalne wala demo, phir polish.', 'Problem ek line mein, sabko yaad.', 'Code har ghante save aur sync.', 'Raat ko ghar, subah fresh dimaag.'],
    byChip: { 'theme:climate': ['Climate idea ka asar ek simple ginti mein dikhao.'], 'theme:edtech': ['Students se hi unki dikkat poocho.'], 'theme:campus': ['Apne campus ki asli dikkat chuno.'], 'theme:social': ['Users ki privacy sabse pehle.'] },
  },
  cofounder: {
    general: ['Pehle 10 customers se seekho, phir bada socho.', 'Har founder ka pehla version thoda ajeeb hota hai, chalta hai!', 'Dikkat pehle samjho, solution baad mein.', 'Har hafte ek cheez test karo.', 'Mentor se 15 minute ki baat bhi kaam ki.', 'Customer ki baat likh ke rakho.', 'Chhota shuru karo, ek mohalla, ek group.', 'Har hafte ke end pe 3 line review.'],
    byChip: { 'area:hostel_food': ['Hostel ke 10 dost se menu poll karo.'], 'area:kirana': ['Ek dukaan ke saath shuru karo.'], 'area:notes': ['Notes ki quality check karke hi upload karo.'], 'area:thrift': ['Achhi photos hi asli dukaan hain.'], 'area:tutor': ['Pehla session free demo rakho.'], 'area:gear': ['Gear ki condition ki photo har baar lo.'] },
  },
  d2c: {
    general: ['Har post pe ek clear call to action rakho.', 'Product ko hero banao, filter ko nahi!', 'Hook pehle 2 second mein.', 'Banane ka process bhi content hai.', 'Comments ka jawab do, wahi asli community hai.', 'Ek hafte mein 5 posts, quality ke saath.', 'Customer ki photo unki permission se.', 'Har post ke baad dekho kya chala.'],
    byChip: { 'product:candles': ['Candles ke liye gifting angle sabse achha.'], 'product:plants': ['Plant posts ke saath care tips do.'], 'product:jewellery': ['Close up shots, natural light mein.'], 'audience:parents': ['Parents ke liye details aur trust pehle.'], 'audience:school': ['Fun aur budget friendly tone rakho.'] },
  },
  creator: {
    general: ['Consistency views se zyada important hai.', 'Hook pehle 2 second mein, baaki sab bonus!', 'Ek reel, ek idea.', 'Galtiyan bhi dikhao, log connect karte hain.', 'Comments se agle idea milte hain.', 'Captions daalo, bina awaaz bhi chale.', 'Apni privacy ka dhyan, ghar ki details nahi.', 'Post se pehle ek baar dost ko dikhao.'],
    byChip: { 'niche:tech': ['Tech ko simple words mein samjhao.'], 'niche:cricket': ['Gully cricket ke moments sabko pasand.'], 'niche:food': ['Kam steps wali recipe sabse zyada chalti hai.'], 'niche:study': ['Ek study hack, ek reel.'], 'niche:music': ['Audio saaf ho, video baad mein.'], 'niche:art': ['Time lapse sabse zyada pasand aata hai.'] },
  },
  fest: {
    general: ['Har kaam ka ek owner, aur last din ek buffer.', 'Stall pe smile sabse sasta decor hai!', 'Ek full run through karke dekho.', 'Saman ki list ek din pehle.', 'Visitor ki tarah stall dekho.', 'Team ko shift chart pehle bhejo.', 'Chhote prizes, badi smile.', 'Bijli ka kaam kisi bade ki madad se.'],
    byChip: { 'event:tech': ['Visitor ko kuch try karne do.'], 'event:art': ['Achhi lighting se art chamakta hai.'], 'event:quiz': ['Sawaal mixed rakho: aasaan aur mushkil.'], 'event:games': ['Game samjhane mein 10 second, bas.'] },
  },
  debate: {
    general: ['Opponent ki baat dhyaan se suno, rebuttal wahin se milta hai.', 'Mirror ke saamne practice, mirror kabhi interrupt nahi karta!', 'Har point: claim, reason, example.', 'Ruk ke bolna bhi power hai.', 'Respect se disagree karo.', 'Opening chhota aur yaad rehne wala.', 'Timer ke saath practice karo.', 'Dost ke saamne ek baar bolo.'],
    byChip: { 'side:for': ['For side mein ek strong example tayyar rakho.'], 'side:against': ['Against side mein pehle doosri side ki baat maano, phir jawab do.'] },
  },
  career: {
    general: ['Ek career ko ek mahina do, phir socho kaisa laga.', 'Seniors se baat karo, woh bahut kuch batate hain!', 'Mini task karke dekho, dil kya kehta hai.', 'Har career ki ek skill aaj se seekho.', 'Pasand aur mehnat, dono saath chalein.', 'Teacher se ek baar baat karke dekho.', 'Notes rakho, kya achha laga kya nahi.', 'Clubs aur events mein naye log milte hain.'],
    byChip: { 'area:coding': ['Ek chhota program likh ke dekho.'], 'area:business': ['Kisi dukaan wale se unka din poocho.'], 'area:machines': ['Ghar ki kisi machine ko samjho.'], 'area:electronics': ['Ek simple circuit simulator try karo.'], 'area:infra': ['Apne area ke kisi building ke kaam ko dekho.'] },
  },
  collegeq: {
    general: ['Har campus se same sawaal poocho, jawab likh ke milao.', 'Brochure se zyada seniors ki baat suno!', 'Jawab likhit mein maango.', 'Campus ek baar khud dekho.', 'Family ke saath milke sawaal list banao.', 'Ek sawaal ka jawab na mile, toh likh ke rakho.', 'Hostel aur canteen bhi dekhna.', 'Official website pe bhi check karo.'],
    byChip: { 'interest:ai': ['Projects aur coding clubs ke baare mein poocho.'], 'interest:business': ['Case studies aur live projects poocho.'], 'interest:design': ['Student work ki gallery dekho.'], 'interest:science': ['Lab ke hours poocho.'] },
  },
  cricket: {
    general: ['Har practice ke baad 2 minute socho: kya achha gaya.', 'Singles lo, board ghumao, aur thoda swag bhi!', 'Practice se pehle 5 minute warm up.', 'Fielding se runs bachte hain.', 'Calling clear aur zor se.', 'Har over ka ek plan.', 'Team ko har over ke baad ek line.', 'Khel ka mazaa pehle.'],
    byChip: { 'situation:chase': ['Chase mein wickets haath mein rakho.'], 'situation:defend': ['Defend mein dot balls sabse badi taakat.'], 'format:box6': ['6 over mein har ball count karti hai.'], 'format:t20': ['Partnerships match ka rukh badalti hain.'] },
  },
};

/** Stable ids for every line. */
export const introIds = (voice) => INTRO[voice].map((_, i) => `i_${voice}_${i}`);
export const whyIds = () => Object.entries(WHY).flatMap(([tool, l]) => l.map((_, i) => `w_${tool}_${i}`));
export const tipEntries = (tpl) => [
  ...TIPS[tpl].general.map((text, i) => ({ id: `t_${tpl}_g${i}`, text, chip: null })),
  ...Object.entries(TIPS[tpl].byChip).flatMap(([chip, lines]) => lines.map((text, i) => ({ id: `t_${tpl}_${chip.replace(':', '_')}_${i}`, text, chip }))),
];
/** Tips this design may show: general ones plus those whose chip the visitor picked. Chip-specific first. */
export function eligibleTips(design) {
  const has = (chip) => { const [k, v] = chip.split(':'); return k === 'item' ? design.items.includes(v) : String(design.params[k]) === v; };
  const all = tipEntries(design.job.id).filter((t) => !t.chip || has(t.chip));
  return [...all.filter((t) => t.chip), ...all.filter((t) => !t.chip)];
}
export const lineOf = (id) => {
  let m = /^i_(\w+?)_(\d+)$/.exec(id);
  if (m) return INTRO[m[1]]?.[Number(m[2])] ?? null;
  m = /^w_(\w+?)_(\d+)$/.exec(id);
  if (m) return WHY[m[1]]?.[Number(m[2])] ?? null;
  return null;
};
export const allBankLines = () => [...Object.values(INTRO).flat(), ...Object.values(WHY).flat(), ...Object.values(TIPS).flatMap((t) => [...t.general, ...Object.values(t.byChip).flat()])];
