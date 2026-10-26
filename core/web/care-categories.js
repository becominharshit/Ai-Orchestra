// CATEGORY rules for care detection (CHECK-16b), shared by the browser and the server.
// Instead of single phrases, each category has rules in Roman Hinglish, English and Devanagari:
//   farewell + finality, method words, wishing death, not wanting to exist, meaninglessness plus self.
// STRONG rules trigger alone. WEAK signals (a farewell, "hamesha ke liye", "mere jaane ke baad",
// "sab khatam", "maaf kar dena" ...) trigger only when two different weak categories meet, so an
// eco slogan ("plastic ko alvida") or an exam joke ("kal ke exam mein nahi bachunga") stays quiet.
// Typo tolerance: one edit (insert, delete, substitute, swap) on the key terms suicide, khudkushi,
// aatmahatya, marna and maut, with guards so common words (mat, karna, mauj, maun) never match.
import { searchable, devaNorm } from './normalize.js';

const collapse = (p) => p.replace(/([a-gi-z])\1+/g, '$1'); // the text is collapsed the same way (h kept)
const R = (s) => new RegExp(collapse(s), 'u');
const D = (s) => new RegExp(devaNorm(s), 'u');
const G = '(?: \\S+){0,4}';
const G2 = '(?: \\S+){0,2}';
const SELF = '(?:i|im|me|my|myself|main|mai|mein|mujhe|mujh|mera|meri|mere|apni|apna|apne|khud)';
const DSELF = '(?:मैं|मै|मुझे|मुझ|मेरा|मेरी|मेरे|अपनी|अपना|अपने|खुद)';

// ---------- STRONG rules ----------
const STRONG_ROMAN = [
  // farewell + finality (direct)
  ` (?:goodbye|good bye|suicide|alvida|alwida|farewell|last|akhri|aakhri|final) (?:note|letter|khat|chitthi|chithi) `,
  ` (?:kal se|ab se|aaj ke baad|iske baad) (?:main |mai )?(?:nahi|nhi) (?:rahunga|rahungi|rahuga|rahugi|rahoonga|rahoongi) `,
  ` hamesha ke liye (?:ja raha|ja rahi|jaa raha|jaa rahi|chala ja|chali ja|chala jaunga|chali jaungi|jaunga|jaungi|so jaunga|so jaungi|so jana|so jaana|gayab|chup) `,
  ` (?:chhod|chod)${G2} hamesha ke liye`, ` hamesha ke liye (?:sab )?(?:chhod|chod) `,
  // method words
  ` (?:rope|rasi|rassi|fanda|phanda|fandaa|noose)${G2} (?:le aaya|le aayi|le aya|le ayi|la ke rakh|la kar rakh|la ke rakha|rakh li|rakh liya|rakha hai|ready|tayar|tayyar|bandh|baandh|laga lunga|laga lungi|laga du|kharid|khareed|mangwa|gale)`,
  ` (?:i have|i got|ive got|i bought|got|bought|have) (?:a |the |my )?(?:noose|rope ready|rope for myself|rope to hang)`, ` noose `,
  ` (?:pankha|pankhe|pankhaa|fan|ceiling|chhat|chat|chhat ke|kamre ke)${G2} (?:se )?(?:latak|latakne|lataka|latkunga|latkungi|hang|fanda|phanda)`,
  ` latak (?:jaunga|jaungi|jau|jaun|jaoonga|jaoongi|lunga|lungi|jana|jaana) `,
  ` (?:sari|saari|sabhi|puri|poori|pura|poora|al|all|whole|entire|ek saath|ek sath|bahut sari|bahut saari|handful|bunch)${G2} (?:goliyan|goliya|goliyon|goli|tablets|tablet|pils|pills|strip|patta|bottle)${G} (?:kha|nigal|swallow|take|taking|took|le lunga|le lungi|le li|le liya)`,
  ` (?:kha|nigal|swallow|take|taking|took|le lunga|le lungi)${G2} (?:sari|saari|sabhi|puri|poori|pura|poora|al|all|whole|entire|ek saath|bahut sari|handful|bunch)${G2} (?:the |my )?(?:sleeping |nend ki |neend ki )?(?:goliyan|goliya|goliyon|goli|tablets|pils|pills|strip|patta|bottle)`,
  ` (?:zeher|zehar|jeher|jahar|poison)${G2} (?:kha lunga|kha lungi|kha liya|kha li|pee lunga|pee lungi|pi lunga|pi lungi|le aaya|le aayi|la ke rakha|la kar rakha|la ke rakh|rakha hai maine|rakh liya|drink|swallow|kharid|khareed|kha jaunga|kha jaungi)`,
  ` (?:poison|zeher|zehar) (?:kha|pee|pi|lunga|lungi) `,
  ` (?:train|metro|trein) (?:ke )?(?:aage|agey|samne|saamne|neeche|niche|nichey) (?:kood|kud|koodna|kudna|aa jaunga|aa jaungi|aa jaun|aa jau|aa jana|jump|lait|let jaunga|let jaungi|so jaunga|so jaungi)`,
  ` (?:jump|kood|kud)${G2} (?:in front of|samne|saamne|aage)${G2} (?:a |the )?(?:train|metro|truck)`,
  ` (?:blade|razor|chaku|chaaku|knife)${G2} (?:se )?(?:nas|wrist|kalai|haath|hath|khud|myself|my arm|apni|apna)`,
  // wrist and vein cutting
  ` (?:slit|sliting|slitting|slash|slashing|cut|cuting|cutting|kaat|kat)${G2} (?:my |apni |meri |apne |the )?(?:wrist|wrists|vein|veins|nas|nase|nasen|kalai|kalaai)`,
  ` (?:nas|nass|nase|nasen|kalai|kalaai|wrist|wrists|vein|veins)${G2} (?:kaat|kat|kaatni|katni|kaatna|katna|kaat lunga|kaat lungi|kaat li|kaat di|kaat dunga|kaat dungi|cut|slit|slash)`,
  ` (?:chhat|chat|terrace|roof|building|balcony)${G2} (?:se )?(?:koodne|kudne|koodna|kudna|jump karne|jump karunga|jump karungi)`,
  // wishing death
  ` (?:maut|mot)${G2} (?:aa jaye|aa jaaye|aajaye|aaye|aa jati|aa jaati|de de|dede|chahiye|chahie|mil jaye|mil jaaye|ka intezar|ka intezaar|ka intazar|ka intzar|bula|bulao|aa jae)`,
  ` (?:bhagwan|bhagvan|god|upar wala|upar vala|bhagwaan|rab|allah)${G2} (?:utha le|uthale|utha lo|bula le|bula lo|take me)`,
  ` (?:kash|kaash|i wish|wish)${G2} ${SELF}${G2} (?:mar jaun|mar jau|mar jaunga|mar jaungi|mar jata|mar jati|mar gaya hota|mar gayi hoti|was dead|were dead|could die|would die|would just die|die|died|wasnt born|was never born|wasnt alive|never existed)`,
  ` mar (?:jata|jaata|jati|jaati|jaun|jau) (?:to|toh) (?:acha|achha|accha) `,
  ` (?:i want|i pray|praying) (?:for )?(?:death|to die)`, ` death (?:would be|is) (?:better|a relief|the only way)`,
  // not wanting to exist
  ` (?:is |iss )?duniya (?:mein|me|mai|se)${G2} (?:nahi|nhi|nahin) (?:rehna|rahna|rahunga|rahungi|chahiye|chahta|chahti|jeena)`,
  ` (?:is |iss )?duniya se (?:chala|chali|chale) (?:jana|jaana|jaunga|jaungi|jaun|jau)`, ` (?:alvida|bye|goodbye) (?:duniya|world|zindagi|life) `,
  ` gayab ho (?:jana|jaana|jaun|jau|jaunga|jaungi)${G2} (?:hamesha|forever|duniya|sabki|sab ki|sabse)`, ` (?:hamesha ke liye|forever) gayab`,
  ` ${SELF}${G} (?:bojh|bojhh|burden) (?:hu|hoon|hun|hai|ban gaya|ban gayi|ban chuka|ban chuki|bana hua|bani hui)`,
  ` (?:i am|im|i feel like) (?:just |only |such )?(?:a )?burden`, ` burden (?:to|on|for) (?:everyone|my family|my parents|all|sab|everybody)`,
  ` (?:happier|better|beter|beter of|better off) without me`,
  ` (?:dont|do not|dnt) want to exist`,
  // asking for help or a way to die, asking to be killed, ending everything (lead's 6, 24 Oct)
  ` (?:marne|mrne|suicide|khudkushi|atmahatya)${G2} (?:mein|me|mai|ki|ka|ke|ke liye)? ?(?:help|madad|madat|tarika|tareeka|trika|way|idea|upay)`,
  ` (?:help me|madad karo|help karo)${G2} (?:die|to die|kil myself|end it|end my life|marne)`, ` (?:how to|best way to|painless way to|easy way to) (?:kil myself|die|end my life|end it)`,
  ` (?:koi |please |plz |pls )?(?:mujhe|muje|mjhe) (?:maar|mar|mardo|maardo|khatam) (?:do|de|dalo|daalo|dena|doge|kar do|kardo) `,
  // asking for methods is a crisis (sharks builder, 24 Oct): "painless ways to die", "marne ke tarike", "मरने के तरीके"
  ` (?:way|ways|method|methods|tarike|tarika|tareeke|tareeka|trick|tricks|tips) (?:to |of |for )?(?:die|dying|kil myself|kil yourself|kil oneself|end my life|end your life|end a life|end it al|commit suicide|suicide)`,
  ` (?:painles|painless|quick|quickest|easy|easiest|best|sure|fastest|fast|peaceful) (?:death|dying|suicide|way to die|ways to die|way out)`, ` (?:death|suicide|dying|suicidal) (?:method|methods|ways|tips|guide|options)`,
  ` (?:marne|mrne|mar jane|mar jaane) (?:ka|ke|ki) (?:asan |aasan |sabse asan |sabse aasan |koi )?(?:tarika|tarike|tareeka|tareeke|trika|trike|upay|tarah|idea)`,
  ` (?:kaise|kese|kaisey) (?:maru|marun|mar jaun|mar jau|mar sakta|mar sakti|mar skta|khudkushi|suicide)`,
  ` (?:bas |ab )?(?:sab|sab kuch|sabkuch|everything|life|zindagi|meri life|meri zindagi) (?:end|finish|stop) (?:karna|karni|kar du|kardu|kar dunga|kar dungi|kar lunga|kar lungi) `,
  ` mere bina sab (?:khush|kush|better|theek|thik|acha|accha|aram se) (?:rahenge|rahege|rahega|honge|hoga|ho jayenge|ho jayega)`,
  ` hate my life${G} (?:stop|end|over|gone|die|disappear)`, ` (?:want|wanna|need) (?:it al|it all|everything|my life|life) to (?:stop|end) `,
  // combined re-check (24 Oct): finality, farewell messages, testament
  ` (?:kal|kal subah|kal se|tomorrow|aaj ke baad|iske baad|subah tak) (?:main |mai |i )?(?:nahi|nhi|na) (?:hounga|houngi|hunga|hungi|rahunga|rahungi|bachunga|bachungi) `,
  ` (?:aaj ke baad|iske baad|ab se|ab) (?:meri|mera) (?:koi )?(?:khabar|khbar|message|msg|call|awaz)${G2} (?:nahi|nhi) (?:aayegi|ayegi|aayega|ayega|milegi|milega|aaega)`,
  ` (?:jab tak|by the time) (?:tum|aap|you|ye|yeh)${G2} (?:padhoge|padhogi|padhoge|padhenge|padho|read this|read it|read)${G} (?:ja chuka|jaa chuka|ja chuki|jaa chuki|chala gaya|chali gayi|chala gaya hounga|gone|dead|mar chuka|mar chuki|nahi rahunga|nahi rahungi)`,
  ` (?:main|mai) (?:ja|jaa|mar) (?:chuka|chuki) (?:hounga|houngi|hunga|hungi) `,
  ` (?:meri|my) (?:will|wasiyat|vasiyat|wasiyatnama)${G2} (?:likh|likhi|bana|banayi|ready|written|wrote|made|taiyar)`, ` (?:giving away|gave away|de diya|de di|de dena) (?:all )?(?:my|meri|mera|sab|sab kuch|sabkuch)${G2} (?:things|stuff|cheezein|saman|samaan|bhai ko|didi ko|dost ko|mummy ko|papa ko)`,
  ` sab kuch (?:bhai|didi|behen|mummy|papa|maa|dost)${G2} ko de dena`,
  // methods phrased as questions; plans with a time
  ` (?:how many|kitni|kitne|kitna|how much) (?:tablets|tablet|pils|pills|goliyan|goliya|goli|sleeping pils|dawai|dawa|dawaiyan|mg)${G} (?:enough|kafi|kaafi|die|dying|mar|marne|not wake|na uthu|nahi uthta|nahi uthti|nahi uthega|na uthe|overdose|lethal|jaan|kil)`,
  ` enough to (?:die|not wake|kil me|kil myself|end it|end my life)`,
  ` (?:asan|aasan|easy|easiest|best|sabse asan|sabse aasan|painles|painless|quick|quickest)${G2} (?:tarika|tarike|tareeka|tareeke|trika|way|ways|method|upay)${G2} (?:marne|mrne|die|dying|suicide|khudkushi|jaan dene|end it|to end)`,
  ` (?:kaunsi|konsi|which|kaun si) (?:dawai|dawa|goli|tablet|medicine|pill)${G} (?:mar jata|mar jate|mar jati|marta|die|dies|jaan chali|kil)`,
  ` (?:phansi|phaansi|fansi|faansi|fanda|phanda|noose)${G2} (?:ke liye|lagane|lagani|for)${G2} (?:kaunsi|konsi|which|kaisi)? ?(?:rasi|rope|rassi)`,
  ` (?:bought|got|have|kharid|khareed|kharidi|le aaya|le aayi|le aya|le ayi)${G} (?:pils|pills|tablets|blade|razor|rope|rasi|zeher|poison|noose)${G} (?:for tonight|tonight|aaj raat|aaj raat ke liye)`,
  ` (?:zeher|zehar|jeher|jahar|poison|sleeping pils|nend ki goli|neend ki goli)${G2} (?:kahan|kaha|where|kaise|how|kidhar) (?:milta|milega|milti|milegi|to buy|to get|buy|get|kharide|kharidu|khareedu)`,
  ` (?:naso|nason|nase|nasen|nas|nass|kalai|wrist|wrists)${G2} (?:ko )?(?:kaatna|katna|kaatne|katne|kaat|kat)${G} (?:kitna|kitni|kaise|how|deep|gehra|gehri)`,
  ` (?:chhat|chat|roof|terrace|building|balcony|bridge|pul)${G2} (?:se )?(?:chhalang|chhalaang|chalang|chalaang|chhalaang)`, ` (?:chhalang|chalang) (?:maar|mar|laga|lagaa) (?:dunga|dungi|du|lunga|lungi|dena) `,
  ` (?:high |tall |unchi |oonchi )?(?:building|imarat|chhat|terrace|bridge)${G2} (?:se )?(?:kudne|koodne|jump karne|girne)${G2} (?:ka|ki)? ?(?:plan|soch|irada|socha)`,
  // wishing death: never wake up, never born, hit by a bus
  ` (?:so jaun|so jau|so jaunga|so jaungi|so jaaun|sleep)${G} (?:kabhi na|kabhi nahi|kabhi bhi na|never|phir na|fir na|phir kabhi na) (?:uthun|uthu|uthoon|uthunga|uthungi|uthna|wake)`,
  ` (?:wish|hope|kash|kaash)${G2} (?:i )?(?:never|didnt|did not|dont|wont|would not|wouldnt|na|kabhi na) (?:woke|wake|waking|uthta|uthti|uthun)`,
  ` (?:i hope|i wish|hope|wish|kash|kaash)${G2} (?:i |main |mai |mujhe )?(?:get |gets |got )?(?:hit by|run over|knocked down|koi gadi|truck maar|accident ho)`,
  ` (?:kash|kaash|wish)${G2} (?:paida|peda|born)${G2} (?:hi )?(?:nahi|na|never) (?:hua|hui|hota|hoti|hua hota|hui hoti)?`, ` never (?:been )?born `,
  // not wanting to exist
  ` (?:exist|exists|existence)${G2} (?:hi )?(?:na|nahi|nhi) (?:karun|karu|karta|karti|kru|karoon)`,
  ` (?:main|mai) (?:na|nahi) (?:rahun|rahu|hota|hoti|hun|hu|rahoon) (?:to|toh) (?:behtar|acha|accha|better|sab)`,
  ` (?:duniya|world) se (?:door |dur |bahut door )(?:chala|chali|chale) (?:jana|jaana|jaunga|jaungi|jaun|jau)`,
  ` (?:want|wanna|need) (?:to get )?out (?:permanently|forever|of this life|of life|for good|of everything)`, ` cant do (?:this )?life anymore`,
  // burden
  ` mere (?:na hone|na rehne|na rahne|jaane|jane|marne) (?:se|par|pe)${G} (?:fark|farak|farq|frk) (?:nahi|nhi)`,
  ` (?:main|mai) (?:hat|hatt|mit|nikal) (?:jaun|jau|jaaun|jaoon) (?:to|toh) (?:acha|accha|achha|behtar|better|sab)`,
  ` mere bina${G} (?:behtar|better|beter|khush|kush|achi|acchi|achhi|aram|happy|happier)`, ` (?:sab|everyone|family|ghar wale) mere bina (?:behtar|better|beter|khush|happy)`,
  ` ${SELF}${G} (?:problem|musibat|mushkil|takleef|tension|bojh) (?:hu|hoon|hun|ban gaya|ban gayi|ban chuka|ban chuki) `,
  ` (?:khatam|khatm|khtm|maar|mar) (?:kar du|kardu|kar dunga|kar dungi|kar lu|kar lunga|kar lungi|du|dalu|daalu|dunga|dungi) (?:apne aap|khud|khudko|apne ko|apni life|apni zindagi)`,
  // meaninglessness
  ` (?:kya|koi) (?:fayda|faida|faayda|fyda|matlab|point) (?:hai )?(?:jeene|jine|zinda rehne|zinda rahne)`, ` jeene ka (?:kya|koi) (?:fayda|faida|faayda|matlab|point)`,
  ` (?:life|zindagi|jindagi)${G2} (?:mein|me|mai) (?:ab )?(?:kuch|kuchh) (?:bacha|bachi|raha) (?:hi )?(?:nahi|nhi)`,
  ` (?:thak|tang|haar) (?:gaya|gayi|chuka|chuki|gya|gyi)${G2} (?:jeete jeete|jite jite|jete jete|living|jeene se|zindagi se|life se)`,
  // targeted check (24 Oct): not wanting to live, others' life-ending as a product, a past overdose
  ` (?:${SELF.slice(3, -1)}|ab|aur|ab aur|bas)${G2} (?:nahi|nhi|na) (?:jeena|jina|jeeni|jini|jeena hai|jina hai) `,
  ` (?:end|ending|take|taking|khatam) (?:their|his|her|your|ones|apni|apna|unki|uski) (?:own )?(?:life|lives|zindagi|jaan) `,
  ` (?:took|taken|have taken|kha li|kha liya|kha li thi|kha liya tha|khayi|kha gaya|kha gayi)${G2} (?:too many|too much|so many|bahut sari|bahut saari|bahut zyada|zyada|extra|ek saath|al|all|a lot of|lots of)${G2} (?:of )?(?:my |the |sleeping |nend ki |neend ki )?(?:pils|pills|tablets|goliyan|goliya|goli|dawai|dawa|medicine|medicines)`,
  ` (?:pils|pills|tablets|goliyan|dawai|overdose|od)${G} (?:on purpose|jaan bujh ke|jaanbujh kar|deliberately|intentionaly|intentionally)`, ` (?:on purpose|jaan bujh ke|deliberately)${G} (?:pils|pills|tablets|goliyan|overdose|cut|hurt)`,
  // meaninglessness plus self
  ` (?:zindagi|jindagi|zindgi|life|jeene|jine|jeena|jina)${G2} (?:ka|ki|ko|ke|me|mein|mai)${G2} (?:koi )?(?:matlab|maksad|reason|wajah|vajah|point|purpose|meaning)${G2} (?:nahi|nhi|nahin|na)`,
  ` (?:zindagi|jindagi|zindgi|life|jeene|jine)${G2} (?:mein|me|mai|ke liye|ke lie) (?:ab )?(?:kuch|kuchh) (?:nahi|nhi) (?:bacha|bachi|raha|rahi)`,
  ` (?:kuch|kuchh) (?:nahi|nhi) (?:bacha|bachi|raha|rahi)${G2} (?:jeene|jine|zindagi|jindagi|life) `,
  ` khatam (?:hona|hone|ho jana|ho jaana) (?:chahta|chahti|chahte)`,
  ` (?:nothing|no one|nobody|noone) (?:left )?(?:to live for|left for me|left to live)`, ` (?:my )?life (?:has no|is without) (?:meaning|point|purpose)`,
];
const STRONG_DEVA = [
  'मौत आ जा', 'मौत चाहि', 'मौत का इंतजार', 'मौत मिल जा', 'उठा ले भगवान', `भगवान${'(?: \\S+){0,2}'} उठा ले`, `काश${'(?: \\S+){0,2}'} मर जा`,
  `पंखे${'(?: \\S+){0,2}'} लटक`, 'लटक जाऊं', 'लटक जाऊंगा', 'लटक जाऊंगी', 'फंदा', 'फंदे', 'फांसी का फंदा', `रस्सी${'(?: \\S+){0,2}'} (?:ले आया|ले आई|ला के रख|ला कर रख|रख ली|खरीद)`,
  `(?:सारी|सभी|पूरी|बहुत सारी)${'(?: \\S+){0,2}'} (?:गोलियां|गोलियाँ|गोली|टेबलेट)`, `(?:जहर|ज़हर)${'(?: \\S+){0,2}'} (?:ले आया|ले आई|ला के रख|खा लूंगा|खा लूंगी|पी लूंगा|पी लूंगी)`,
  `ट्रेन (?:के )?(?:आगे|नीचे|सामने)${'(?: \\S+){0,2}'} (?:कूद|आ जाऊंगा|आ जाऊंगी|लेट)`, `ब्लेड${'(?: \\S+){0,2}'} (?:नस|हाथ|कलाई)`,
  `(?:इस )?दुनिया (?:में|से)${'(?: \\S+){0,2}'} नहीं (?:रहना|रहूंगा|रहूंगी|जीना)`, 'दुनिया से चला जा', 'दुनिया से चली जा', 'अलविदा दुनिया', `गायब हो${'(?: \\S+){0,2}'} (?:हमेशा|जाना चाहता|जाना चाहती)`,
  `${DSELF}${'(?: \\S+){0,4}'} बोझ (?:हूं|हूँ|हु|बन गया|बन गई|बन गयी)`,
  `मरने (?:का|के|की) (?:आसान |कोई )?(?:तरीका|तरीके|उपाय)`, `(?:आत्महत्या|सुसाइड) (?:का|के) (?:तरीका|तरीके|उपाय)`, `कैसे (?:मरूं|मरुं|मरूँ|मरें|मर जाऊं|मर सकता|मर सकती)`,
  `मेरे बिना${'(?: \\S+){0,2}'} (?:खुश|बेहतर|अच्छे|आराम)`, `जीने (?:की|का)${'(?: \\S+){0,2}'} (?:इच्छा|मन|मकसद|वजह|मतलब)${'(?: \\S+){0,1}'} नहीं`, `पैदा${'(?: \\S+){0,2}'} नहीं (?:हुआ|हुई|होता|होती)`,
  `फांसी (?:लगाने|लगाने का|का) (?:तरीका|तरीके)`, `(?:कल|कल सुबह|आज के बाद) (?:मैं )?नहीं (?:होऊंगा|होऊंगी|रहूंगा|रहूंगी|बचूंगा|बचूंगी)`, `मेरे (?:ना|न) होने से`,
  `(?:नस|नसें|नसे|कलाई)${'(?: \\S+){0,2}'} (?:काट|काटी|काटना|काटूं|काटूंगा|काटूंगी)`,
  `(?:जिंदगी|ज़िंदगी|जिन्दगी|जीने)${'(?: \\S+){0,2}'} (?:में|के लिए) (?:अब )?कुछ नहीं (?:बचा|बची|रहा)`, `कुछ नहीं बचा${'(?: \\S+){0,2}'} (?:जीने|जिंदगी)`,
  `(?:जिंदगी|ज़िंदगी|जिन्दगी|जीने)${'(?: \\S+){0,2}'} (?:का|की|में) (?:कोई )?(?:मतलब|मकसद|वजह) नहीं`, 'खत्म होना चाहता', 'खत्म होना चाहती',
  `(?:कल से|आज के बाद) (?:मैं )?नहीं (?:रहूंगा|रहूंगी)`, `हमेशा के लिए (?:चला जाऊंगा|चली जाऊंगी|सो जाऊंगा|सो जाऊंगी|जा रहा|जा रही)`,
];
const STRONG = [...STRONG_ROMAN.map(R), ...STRONG_DEVA.map(D)];

// ---------- WEAK signals: two different categories must meet ----------
const WEAK = {
  final: [
    ` hamesha ke liye `, ` forever `, ` for ever `, ` (?:kabhi|phir|fir|ab) (?:nahi|nhi) (?:milenge|milunga|milungi|dikhunga|dikhungi) `, ` never see (?:me|you|u) `, ` wont see (?:me|you|u) `,
    ` (?:last|akhri|aakhri|final) (?:message|msg|time|baar|bar|goodbye|alvida) `, ` (?:mera|meri|my) (?:aakhri|akhri|last|final) (?:din|day|message|raat|night|baar) `,
    ` (?:aakhri|akhri|last) (?:din|day|raat|night) (?:hai )?(?:mera|meri|of my life) `, ` (?:maaf|maf) (?:kar dena|kardena|karna|kr dena|kar do) `, ` sorry (?:for everything|everyone|sabko|mummy|papa|mom|dad) `,
    ` bhool (?:jana|jaana|jao|jaao) `, ` take care of (?:mom|mummy|my family|papa|dad|everyone) `, ` wont be (?:here|around|alive) `, ` (?:main |mai )?(?:nahi|nhi) (?:rahunga|rahungi) $`,
    'हमेशा के लिए', 'आखिरी दिन', 'आखिरी बार', 'आखरी दिन', 'माफ कर देना', 'माफ करना', 'भूल जाना', 'कभी नहीं मिलेंगे', 'फिर नहीं मिलेंगे',
  ],
  leave: [
    ` mere (?:jaane|jane|na rehne|na rahne|marne) ke baad `, ` jab (?:main|mai) (?:chala|chali|na) (?:jaunga|jaungi|rahu|rahun|rahunga|rahungi) `, ` (?:main |mai )?(?:nahi|nhi) (?:bachunga|bachungi|bachuga|bachugi) `,
    ` (?:when|after|once) (?:im|i am|i m) gone `, ` (?:after|when) i die `, ` (?:bas )?chala jaunga hamesha `,
    'मेरे जाने के बाद', 'मेरे मरने के बाद', 'जब मैं चला जाऊंगा', 'जब मैं चली जाऊंगी', 'नहीं बचूंगा', 'नहीं बचूंगी',
  ],
  unwanted: [
    ` mere bina (?:sab|sabhi|everyone|ghar|family) `, ` (?:koi|kisi ko) (?:mujhe )?yaad (?:bhi )?(?:nahi|nhi) (?:karega|karegi|karenge|aaunga|aaungi) `, ` kisi ko (?:farak|fark|frk|farq) (?:nahi|nhi) (?:padega|padta|pdega|padhega) `,
    ` sab (?:khush|kush) (?:rahenge|rahege|ho jayenge|honge) `, ` kisi ko (?:meri|mujhse) (?:zaroorat|zarurat|jarurat|jaroorat) (?:nahi|nhi) `, ` meri wajah se (?:sab|sabhi|ghar wale|family|everyone)${G2} (?:pareshan|dukhi|tang|upset) `, ` sab (?:theek|thik|tik) ho (?:jayega|jaega|jaayega) `, ` (?:nobody|no one|noone) (?:will|would) (?:notice|care|miss) `,
    'मेरे बिना सब', 'कोई याद नहीं करेगा', 'किसी को फर्क नहीं', 'सब खुश रहेंगे',
  ],
  tired: [
    ` (?:thak|thaka|thaki|tang|pareshan|haar|ub) (?:gaya|gayi|gya|gyi|chuka|chuki|aa gaya|aa gayi)?${G2} (?:is |iss |apni |meri )?(?:zindagi|jindagi|life|jeene) se `, ` (?:zindagi|jindagi|life|jeene) se (?:thak|tang|haar|ub) `,
    ` tired of (?:living|life|being alive|everything) `, ` done with (?:life|living|everything) `,
    'जिंदगी से थक', 'जिंदगी से तंग', 'जिंदगी से परेशान', 'इस जिंदगी से',
  ],
  ending: [
    ` (?:bas|ab|bas ab|ab bas) (?:sab )?(?:khatam|khatm|khtm) (?:karna|karni|kar|kar du|kar dunga|kar dungi|kardu|karna hai) `, ` sab (?:khatam|khatm|khtm) $`, ` its over $`, ` this is the end `,
    'सब खत्म $', 'बस खत्म करना',
  ],
  message: [
    ` tell (?:mom|mummy|mum|papa|dad|everyone|them|her|him|my family|my parents)${G2} (?:im sorry|i am sorry|sorry|i love|i loved|maaf)`, ` (?:sabko|mummy ko|papa ko|mom ko|ghar walon ko|dosto ko) (?:bol|bata|keh) (?:dena|do) `,
    ` (?:pyaar|pyar|love) (?:karta|karti) tha `, ` i (?:loved|love) you al `, 'सबको बोल देना', 'माफ कर देना',
  ],
  giveup: [
    ` bas ab aur (?:nahi|nhi) `, ` ab aur (?:nahi|nhi) (?:hota|ho raha|hoga|sakta|sakti|seh|sah) `, ` (?:aur|ab) (?:nahi|nhi) (?:seh|sah|jhel) (?:sakta|sakti|paunga|paungi|pa raha|pa rahi) `,
    ` i give up $`, ` haar (?:maan|man) (?:li|liya|gaya|gayi) `, 'बस अब और नहीं', 'अब और नहीं सह',
  ],
};
const WEAK_RE = Object.fromEntries(Object.entries(WEAK).map(([k, list]) => [k, list.map((p) => (/[ऀ-ॿ]/.test(p) ? D(p) : R(p)))]));

// ---------- farewell words, counted only when said to a person / the world, never to a thing ----------
const FW = collapse('(?:alvida|alwida|tata bye|bye bye|goodbye|good bye|farewell|khuda hafiz|khudahafiz|bye|tata)');
const FW_DEVA = devaNorm('(?:अलविदा|टाटा बाय|बाय बाय|गुडबाय|गुड बाय|खुदा हाफिज)');
const PERSON = new RegExp(`^${collapse('(?:sab|sabko|sabhi|sabhiko|dosto|doston|dost|friends|everyone|everybody|all|al|guys|family|mummy|mumy|mom|papa|dad|maa|ma|bhai|didi|tum|tumhe|tumko|aap|aapko|you|u|ya)')}$`, 'u');
const PERSON_DEVA = new RegExp(`^${devaNorm('(?:सब|सबको|सभी|दोस्तों|दोस्तो|मम्मी|पापा|मां|भाई|दीदी|आप|तुम)')}$`, 'u');
const NEXT_OK = new RegExp(`^${collapse('(?:bol|bolunga|bolungi|keh|kehta|kehti|kehna|kar|karta|ab|kal|forever|hamesha|for|now|mere|my|main|mai|this|is|dosto|sabko|mummy|papa)')}$`, 'u');
const isPerson = (w) => PERSON.test(w) || PERSON_DEVA.test(w);

function farewellIn(clause) {
  for (const re of [new RegExp(` ${FW}(?= )`, 'gu'), new RegExp(` ${FW_DEVA}(?= )`, 'gu')]) {
    for (const m of clause.matchAll(re)) {
      const before = clause.slice(0, m.index + 1);
      const after = clause.slice(m.index + m[0].length).trim().split(' ').filter(Boolean);
      const obj = /(\S+) (?:ko|se|को|से) (?:hamesha ke liye |hamesha |forever |हमेशा के लिए |हमेशा )?$/u.exec(before);
      if (obj && !isPerson(obj[1])) continue; // "plastic ko alvida"
      if (after[0] === 'to') { if (after[1] && (isPerson(after[1]) || after[1] === 'al')) return true; continue; } // "goodbye to plastic"
      if (!after.length || isPerson(after[0]) || NEXT_OK.test(after[0]) || obj) return true;
    }
  }
  return false;
}

// ---------- typo tolerance for the key terms ----------
const VOWEL = /[aeiou]/;
const KEYS = [
  { term: 'suicide', short: false }, { term: 'suicidal', short: false }, { term: 'khudkushi', short: false }, { term: 'atmahatya', short: false },
  { term: 'marna', short: true }, { term: 'maut', short: true },
];
const STOP = new Set(['mat', 'mauj', 'maun', 'mast', 'math', 'maat', 'mata', 'marne', 'marni', 'marta', 'marti', 'mara', 'mari', 'maru', 'barna', 'karna', 'warna', 'varna', 'marina', 'maura', 'mount', 'mouth']);
function oneEdit(a, b, short) { // a = token, b = key term
  if (a === b) return false;
  if (short && a[0] !== b[0]) return false;
  const la = a.length; const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    const diff = [...a].map((c, i) => (c !== b[i] ? i : -1)).filter((i) => i >= 0);
    if (diff.length === 1) return !short || (VOWEL.test(a[diff[0]]) && VOWEL.test(b[diff[0]]));
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true; // swap
    return false;
  }
  const [lng, sh] = la > lb ? [a, b] : [b, a];
  for (let i = 0; i < lng.length; i++) {
    if (lng.slice(0, i) + lng.slice(i + 1) === sh) {
      if (!short) return true;
      if (la > lb) return i > 0; // an inserted letter, not at the start
      return VOWEL.test(lng[i]) && sh.length >= 4; // a dropped vowel, still 4+ letters
    }
  }
  return false;
}
/** The text with typo'd key terms replaced by the term (or null when nothing changed). */
export function fixTypos(s) {
  let changed = false;
  const out = s.replace(/[a-z]{4,12}/g, (w) => {
    if (STOP.has(w)) return w;
    for (const k of KEYS) if (oneEdit(w, k.term, k.short)) { changed = true; return k.term; }
    return w;
  });
  return changed ? out : null;
}

/** true when a category rule matches (s = searchable(text), text = the original). */
export function detectCategories(text, s = searchable(text)) {
  const variants = [s];
  const fixed = fixTypos(s);
  if (fixed) variants.push(fixed);
  for (const v of variants) if (STRONG.some((re) => re.test(v))) return true;
  // weak signals, per clause so "alvida, ..." and "..., sab khatam" keep their clause end
  const clauses = String(text).split(/[,.!?;:।\n|]+/).map((c) => searchable(c)).filter((c) => c.trim());
  const hit = new Set();
  for (const c of [...clauses, s]) {
    if (farewellIn(c)) hit.add('farewell');
    for (const [k, list] of Object.entries(WEAK_RE)) if (list.some((re) => re.test(c))) hit.add(k);
  }
  return hit.size >= 2;
}
