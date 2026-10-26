// AI Startup Studio: every reviewed line the experience can show (BRAIN 24 Oct, CHECK_build 12 and 13).
// Nothing a visitor types ever lands in here or on a public surface. The model only picks ids from these banks.
// Copy rules: Hinglish, positive, PG, no em/en dashes, no guarantees, no real company or person names.
// TODO(student): add a problem area by copying one block below, then run `node --test test/startup/`.

// Name suffixes, shared by every area. The generator glues an area prefix + a suffix ("Thali" + "Dost").
// Round 2 (CHECK-18): Nest, Mate, Loop, Verse, Wise, Kit and Lab dropped (brand collisions, clunky or double meanings).
export const SUFFIXES = ['Hub', 'Go', 'Box', 'Dost', 'Pal', 'Yaar', 'Bee', 'Spot', 'Sathi'];

// "Kiske liye?" chips
export const WHO = [
  { id: 'students', label: 'School students' },
  { id: 'hostel', label: 'Hostel aur PG wale' },
  { id: 'families', label: 'Ghar aur families' },
  { id: 'shops', label: 'Local dukaan wale' },
];

// "Vibe kya ho?" chips. `palette` = the default palette for that vibe.
export const VIBES = [
  { id: 'desi', label: 'Desi aur warm', palette: 1 },
  { id: 'tech', label: 'Smart aur techy', palette: 0 },
  { id: 'eco', label: 'Green aur simple', palette: 2 },
  { id: 'bold', label: 'Bold aur fun', palette: 3 },
];

// Palettes and logo templates live in web/logo.js (shared with the phone and the TV).
export { PALETTES } from '../web/logo.js';
import { LOGO_NAMES } from '../web/logo.js';
export const LOGOS = LOGO_NAMES;

// Problem areas. unit = what the price is per; price and market (lakh people) are bounds the model must stay in;
// cost = rough share of the price that goes to costs (for the margin line); shark = the matching AI Sharks idea type.
export const AREAS = [
  {
    id: 'hostel_food', label: 'Hostel food', sub: 'Mess ka khana, next level', unit: 'thali', price: [49, 149], market: [20, 60], cost: 0.62, shark: 'tiffin',
    pre: ['Thali', 'Rasoi', 'Mess', 'Chatpata', 'Garam', 'Swaad'],
    tag: ['Hostel ka khana, ghar wala swaad.', 'Har thali mein thoda ghar.', 'Mess menu, ab tumhari choice se.', 'Garam khana, time pe, har din.'],
    research: ['Hostel wale students roz mess menu skip karte hain.', 'Raat 10 baje ke baad achha khana dhoondhna mushkil hai.', 'Students ghar jaisa khana miss karte hain, budget mein.'],
    feat: ['Weekly menu voting, students khud chunein', 'Late night thali, raat 11 baje tak', 'Ghar wali aunties ke saath tie up', 'Monthly meal pass, roz ka hisaab nahi', 'Live tracking, khana kab pahunchega', 'Thali rating, har din better'],
    plan: ['Ek hostel se shuru, 7 din ka trial menu', 'Hostel chat groups mein weekly menu poll', 'Har referral pe ek free sweet dish', 'Fest aur exam weeks mein special combo'],
    pitch: ['Hostel ka khana ab boring nahi, ghar jaisa aur time pe.', 'Roz ki thali, students ki pasand se bani.', 'Mess se better, ghar jaisa, pocket friendly.'],
  },
  {
    id: 'exam_stress', label: 'Exam stress', sub: 'Padhai ka plan, calm mind', unit: 'month', price: [49, 199], market: [50, 150], cost: 0.3, shark: 'study',
    pre: ['Padhai', 'Revise', 'Focus', 'Shaant', 'Syllabus', 'Notes'],
    tag: ['Plan clear, mind calm, revision on track.', 'Padhai ka plan, bina panic.', 'Chhote steps, bada confidence.', 'Revision ab simple aur shaant.'],
    research: ['Board exams se pehle students ko plan banana mushkil lagta hai.', 'Bahut students last week mein saara syllabus revise karte hain.', 'Students chahte hain koi daily chhota target de.'],
    feat: ['Daily 3 task plan, syllabus ke hisaab se', 'Pomodoro timer, dost ke saath study rooms', 'Revision reminders, smart order mein', 'Doubt wall, seniors se jawab', 'Weekly progress card, parents ke liye bhi', 'Calm break ideas, 5 minute wale'],
    plan: ['Ek coaching batch ke saath free 2 week pilot', 'Seniors ko campus ambassador banao', 'Exam season mein reels: daily 1 tip', 'Har referral pe ek premium week'],
    pitch: ['Exam se pehle panic nahi, ek clear daily plan.', 'Tumhara syllabus, chhote daily targets mein.', 'Padhai ka GPS: aaj kya padhna hai, bas itna.'],
  },
  {
    id: 'delhi_traffic', label: 'Delhi traffic', sub: 'Jam kam, time zyada', unit: 'ride', price: [15, 60], market: [40, 120], cost: 0.55, shark: 'cycle',
    pre: ['Raasta', 'Gaadi', 'Route', 'Safar', 'Pahiya', 'Jaldi'],
    tag: ['Jam se bahar, time pe andar.', 'Shehar wahi, safar smart.', 'Har din ka raasta, thoda easy.', 'Kam signal, zyada smile.'],
    research: ['Delhi mein log roz ghanton traffic mein bitate hain.', 'Students ko metro station se last mile ride nahi milti.', 'Office aur school time pe roads sabse zyada bhari hoti hain.'],
    feat: ['Shared e-rickshaw booking, metro gate se', 'Live jam map, community updates ke saath', 'School pool rides, verified drivers', 'Cycle rental, har metro station pe', 'Best time to leave alerts', 'Green rides pe reward points'],
    plan: ['Ek metro station se shuru, 10 e-rickshaws ke saath', 'Society chat groups mein pool rides', 'Pehli 3 rides half price', 'School aur coaching ke bahar pickup points'],
    pitch: ['Metro se ghar tak, bina wait ke.', 'Delhi ka traffic wahi, tumhara safar smart.', 'Shared rides jo time aur paisa dono bachayein.'],
  },
  {
    id: 'kirana', label: 'Kirana delivery', sub: 'Gali ki dukaan, online', unit: 'order', price: [20, 60], market: [80, 200], cost: 0.5, shark: 'snacks',
    pre: ['Kirana', 'Bazaar', 'Thela', 'Saamaan', 'Pados', 'Ration'],
    tag: ['Apni gali ki dukaan, ab ek tap pe.', 'Local dukaan, fast delivery.', 'Mohalle ka apnapan, online.', 'Saamaan wahi, wait nahi.'],
    research: ['Mohalle ki dukaanein bade apps se compete karna chahti hain.', 'Families roz chhote orders ke liye dukaan tak jaati hain.', 'Kirana wale uncle ke paas apna online store nahi hai.'],
    feat: ['Chat se order, dukaan wale ke liye simple app', '15 minute delivery, 1 km ke andar', 'Monthly ration list, ek tap reorder', 'Digital khata, har dukaan ke liye', 'Neighbourhood delivery partners, students bhi', 'Festival offers, local dukaanon ke'],
    plan: ['Ek mohalla, 5 dukaanein, pehla mahina free', 'Society gate pe QR posters', 'Pehle order pe free delivery', 'Har dukaan wale ko referral bonus'],
    pitch: ['Gali ki dukaan ko fast delivery ki superpower.', 'Local dukaan, online speed, wahi apnapan.', 'Mohalle ki dukaanon ka apna delivery network.'],
  },
  {
    id: 'pocket_money', label: 'Pocket money', sub: 'Paisa samjho, smart bano', unit: 'month', price: [29, 99], market: [60, 150], cost: 0.35, shark: 'thrift',
    pre: ['Bachat', 'Hisaab', 'Kharcha', 'Budget', 'Chillar'],
    tag: ['Chhoti bachat, bade sapne.', 'Pocket money ka smart hisaab.', 'Har rupaye ki kahani.', 'Kharcha samjho, goal pao.'],
    research: ['Teens ko pata nahi chalta pocket money kahan gayi.', 'Parents chahte hain bachche paise ka hisaab seekhein.', 'Students ek goal ke liye bachat karna chahte hain, jaise naya phone.'],
    feat: ['Savings goals, photo ke saath', 'Weekly kharcha summary, simple charts', 'Parents ke saath shared goals', 'Money quiz, har hafte naya level', 'Bachat streaks aur badges', 'Split bills, doston ke saath'],
    plan: ['Ek school club ke saath money week', 'Parents chat groups mein demo video', 'Pehla goal set karo, ek badge free', 'Teen creators ke saath bachat challenge'],
    pitch: ['Pocket money ko goals mein badlo, ek ek rupaye se.', 'Teens ka pehla smart gullak.', 'Kharcha samjho, bachat karo, goal tak pahuncho.'],
  },
  {
    id: 'cricket', label: 'Cricket', sub: 'Gully se ground tak', unit: 'match', price: [29, 149], market: [50, 200], cost: 0.5, shark: 'esports',
    pre: ['Gully', 'Sixer', 'Wicket', 'Boundary', 'Innings'],
    tag: ['Gully cricket, ab pro level.', 'Har match ka scorecard, har player ka star moment.', 'Team banao, ground book karo, khelo.', 'Sunday match, ab bina jhanjhat.'],
    research: ['Gully teams ko khelne ke liye ground aur opponents nahi milte.', 'Local matches ka koi score record nahi rehta.', 'Bahut teams ko match ke din ek extra player chahiye hota hai.'],
    feat: ['Ground booking, ghante ke hisaab se', 'Live scoring app, ball by ball', 'Player stats card, share karne layak', 'Opponent team finder, area ke hisaab se', 'Weekend leagues, trophy aur medals', 'Match highlights, phone se'],
    plan: ['Ek colony league, 8 teams ke saath', 'Har match ka scorecard reels pe', 'Pehli ground booking pe 20% off', 'Local coaches ke saath weekend camps'],
    pitch: ['Gully cricket ko scorecard, ground aur stage do.', 'Har gully team ka apna pro dashboard.', 'Team banao, match dhoondo, score share karo.'],
  },
  {
    id: 'fitness', label: 'Fitness', sub: 'Roz thoda move karo', unit: 'month', price: [99, 299], market: [30, 100], cost: 0.4, shark: 'cycle',
    pre: ['Kasrat', 'Daud', 'Move', 'Stretch', 'Akhada'],
    tag: ['Roz 20 minute, full energy.', 'Fitness jo dosti jaisi lage.', 'Chhote steps, strong routine.', 'Park mein milo, saath mein move karo.'],
    research: ['Teens ko akele workout routine banaye rakhna mushkil lagta hai.', 'Parks subah khaali padte hain, log group dhoondhte hain.', 'Bahut log gym ki jagah ghar ke paas group activity chahte hain.'],
    feat: ['Morning run clubs, colony ke hisaab se', '20 minute home routines, video ke saath', 'Step challenges, doston ke saath', 'Yoga aur stretch sessions, weekend pe', 'Sports buddy finder, badminton se football tak', 'Streak calendar aur badges'],
    plan: ['Ek park, ek free Sunday session', 'Society groups mein 30 din ka step challenge', 'Pehla mahina half price', 'Local coaches ke saath tie up'],
    pitch: ['Fitness ko akela kaam nahi, ek group plan banao.', 'Ghar ke paas, doston ke saath, roz thoda move.', 'Tumhari colony ka fitness club, phone pe.'],
  },
  {
    id: 'admissions', label: 'College admissions', sub: 'Sahi course, sahi info', unit: 'session', price: [99, 499], market: [20, 80], cost: 0.3, shark: 'study',
    pre: ['Daakhila', 'Course', 'Raah', 'Form', 'Chuno', 'Option'],
    tag: ['Sahi course, sahi time, sahi info.', 'Admission ka confusion, ab clear.', 'Har form, har date, ek jagah.', 'Raasta khud chuno, poori info ke saath.'],
    research: ['Class 12 ke students ko admission dates aur forms track karna mushkil lagta hai.', 'Families ko courses compare karne ke liye simple info chahiye.', 'Students seniors se asli experience sunna chahte hain.'],
    feat: ['Deadline calendar, har form ki date', 'Course compare tool, fees aur subjects', 'Senior chat, 15 minute ke sessions', 'Document checklist, step by step', 'Scholarship finder, simple filters', 'Parents ke liye Hindi guide'],
    plan: ['Class 12 ke 3 coaching batches mein free webinar', 'Seniors ko mentors banao', 'Deadline reminders, free chat alerts', 'Admission season mein live Q and A'],
    pitch: ['Admission season ka confusion, ek clear calendar mein.', 'Courses compare karo, seniors se pucho, form time pe bharo.', 'Har Class 12 student ka admission co-pilot.'],
  },
  {
    id: 'tiffin', label: 'Ghar ka tiffin', sub: 'PG wale, ghar ka swaad', unit: 'month', price: [1499, 3999], market: [15, 50], cost: 0.65, shark: 'tiffin',
    pre: ['Dabba', 'Tiffin', 'Handi', 'Chulha', 'Roti', 'Tadka'],
    tag: ['Ghar ka khana, PG tak.', 'Roz ka tiffin, ghar wali feel.', 'Tadka ghar ka, delivery time ki.', 'Naye shehar mein bhi ghar ka swaad.'],
    research: ['PG mein rehne wale students roz bahar ka khana khaate hain.', 'Ghar pe khana banane wali aunties extra kamana chahti hain.', 'Naye shehar mein aaye students ko ghar ka swaad yaad aata hai.'],
    feat: ['Monthly tiffin plan, skip din ka refund', 'Home chefs, verified kitchens', 'Weekly menu, regional options', 'Steel dabba return system, zero plastic', 'Lunch aur dinner slots', 'Rating aur feedback har din'],
    plan: ['Ek PG area, 5 home chefs, 50 tiffins', 'PG owners ke saath tie up', 'Pehla hafta trial price pe', 'Har referral pe ek din free'],
    pitch: ['Naye shehar mein bhi roz ghar ka khana.', 'Home chefs se PG tak, garam tiffin, roz.', 'Ghar ka swaad, monthly plan mein.'],
  },
  {
    id: 'thrift', label: 'Thrift fashion', sub: 'Purane kapde, naya style', unit: 'piece', price: [149, 699], market: [20, 80], cost: 0.45, shark: 'thrift',
    pre: ['Kapda', 'Swap', 'Retro', 'Desi', 'Wardrobe'],
    tag: ['Purana style, nayi kahani.', 'Wardrobe swap karo, planet bachao.', 'Kam kharcha, zyada style.', 'Har piece ki second innings.'],
    research: ['Teens ki wardrobes mein bahut kapde kam pehne jaate hain.', 'Students budget mein trendy kapde chahte hain.', 'Bahut log kapde phenkne ki jagah kisi ko dena chahte hain.'],
    feat: ['Swap events, har mahine', 'Photo se listing, 1 minute mein', 'Upcycle workshops, local tailors ke saath', 'Style points, har swap pe', 'Size aur style filters', 'Pickup aur drop, colony ke andar'],
    plan: ['Ek school fest mein pehla swap stall', 'Before and after reels', 'Pehli listing free', 'Local tailors ke saath upcycle combo'],
    pitch: ['Purane kapdon ko naya style aur nayi wardrobe do.', 'Swap karo, style karo, kam kharcha karo.', 'Teens ka apna thrift store, colony ke andar.'],
  },
  {
    id: 'pets', label: 'Street dogs aur pets', sub: 'Gali ke dost, safe aur khush', unit: 'month', price: [99, 499], market: [10, 40], cost: 0.5, shark: 'pets',
    pre: ['Bhow', 'Doggo', 'Tail', 'Woof', 'Pooch', 'Paw'],
    tag: ['Gali ke dost, ab safe aur khush.', 'Har pet ka happy din.', 'Feed karo, care karo, saath raho.', 'Mohalle ke doggos ka apna app.'],
    research: ['Colonies mein log street dogs ki care karna chahte hain, par coordinate nahi kar paate.', 'Pet parents ko trusted walkers aur sitters nahi milte.', 'Students animals ke liye volunteer karna chahte hain.'],
    feat: ['Feeding schedule, colony volunteers ke saath', 'Trusted dog walkers, students bhi', 'Adoption board, local shelters se', 'Lost and found alerts', 'Pet sitter booking, weekend ke liye', 'Grooming slots, ghar ke paas'],
    plan: ['Ek colony, ek feeding group', 'Local shelters ke saath adoption weekend', 'Pehli walk free', 'Pet lovers ke liye cute reels'],
    pitch: ['Mohalle ke doggos ke liye ek friendly care network.', 'Pet parents ko trusted helpers, ek tap pe.', 'Feed, walk, adopt: sab ek app mein.'],
  },
  {
    id: 'plants', label: 'Plants aur balcony', sub: 'Har ghar thoda green', unit: 'kit', price: [199, 799], market: [15, 60], cost: 0.5, shark: 'plants',
    pre: ['Patta', 'Gamla', 'Bagicha', 'Mitti', 'Kyari'],
    tag: ['Har balcony, ek chhota bagicha.', 'Thoda green, bahut sukoon.', 'Plant lagao, roz muskurao.', 'Gamla se garden tak.'],
    research: ['City flats mein log plants chahte hain par care nahi samajh aati.', 'Naye plant parents ke plants pehle mahine mein sookh jaate hain.', 'Schools aur societies green projects karna chahte hain.'],
    feat: ['Starter kits, balcony size ke hisaab se', 'Watering reminders, plant ke hisaab se', 'Plant care chat, photo bhejo', 'Monthly seed box', 'Society garden events', 'Gamla painting workshops'],
    plan: ['Ek society mein free plant day', 'Schools ke saath green week', 'Pehla kit festival offer pe', '30 din ki grow diary reels'],
    pitch: ['Har city balcony ko ek chhota bagicha banao.', 'Plants jo khush rahein, smart reminders ke saath.', 'Starter kit se green habit tak.'],
  },
  {
    id: 'eco_waste', label: 'Plastic aur kachra', sub: 'Waste ko value banao', unit: 'pickup', price: [20, 99], market: [50, 150], cost: 0.5, shark: 'eco',
    pre: ['Kabaad', 'Recycle', 'Green', 'Saaf', 'Reuse'],
    tag: ['Kachra kam, value zyada.', 'Har bottle ki second life.', 'Saaf gali, smart mohalla.', 'Recycle karo, reward pao.'],
    research: ['Colonies mein dry waste alag karne ka system nahi hota.', 'Log recycle karna chahte hain, par pickup nahi milta.', 'Schools eco clubs ke liye real projects dhoondhte hain.'],
    feat: ['Doorstep dry waste pickup, weekly', 'Reward points har kilo pe', 'Segregation guide, simple stickers', 'School eco leaderboards', 'Upcycled products store', 'Society waste dashboard'],
    plan: ['Ek society, weekly Sunday pickup', 'School eco clubs ke saath challenge', 'Pehla pickup free', 'Local scrap dealers ke saath partnership'],
    pitch: ['Mohalle ke kachre ko rewards aur recycling mein badlo.', 'Doorstep pickup, seedha recycling, points tumhare.', 'Har ghar ka dry waste, sahi jagah.'],
  },
  {
    id: 'elders', label: 'Dadi nani tech', sub: 'Phone seekhna, ab aasaan', unit: 'session', price: [99, 299], market: [30, 100], cost: 0.35, shark: 'elders',
    pre: ['Dadi', 'Nani', 'Aasaan', 'Baithak', 'Sahayak'],
    tag: ['Dadi nani, ab smartphone pro.', 'Tech seekhna, ab aasaan aur mazedaar.', 'Ek call, ek helper, poori madad.', 'Bade log, bade smart.'],
    research: ['Grandparents ko video call aur UPI seekhne mein help chahiye.', 'Families door rehti hain, grandparents ko tech help kam milti hai.', 'Students weekend pe kuch meaningful karna chahte hain.'],
    feat: ['Student tech helpers, ghar pe visit', 'Hindi video lessons, bade font mein', 'Online fraud se bachne ki tips', 'Weekly video call setup', 'Helpline, ek tap pe', 'Bill payment practice mode'],
    plan: ['Ek society mein free tech Sunday', 'Students ko volunteer badges', 'Pehla session free', 'Family chat groups mein demo'],
    pitch: ['Students aur grandparents ka tech dosti club.', 'Dadi nani ke liye phone seekhna, ab aasaan.', 'Ek helper, ek call, poori tech madad.'],
  },
  {
    id: 'music', label: 'Music practice', sub: 'Riyaaz, band aur stage', unit: 'month', price: [199, 599], market: [15, 50], cost: 0.4, shark: 'esports',
    pre: ['Sur', 'Taal', 'Raag', 'Dhun', 'Sargam'],
    tag: ['Roz ka riyaaz, stage ka confidence.', 'Sur milao, band banao.', 'Garage se stage tak.', 'Har gaane ki shuruaat yahin.'],
    research: ['Young musicians ko practice space aur bandmates nahi milte.', 'Students guitar shuru karte hain, par routine chhoot jaata hai.', 'Local events ko naye performers chahiye.'],
    feat: ['Practice room booking, ghante ke hisaab se', 'Bandmate finder, instrument ke hisaab se', 'Daily riyaaz tracker', 'Open mic nights, har mahine', 'Online feedback, senior musicians se', 'Gig board, local events ke'],
    plan: ['Ek cafe mein monthly open mic', 'School music clubs ke saath jam session', 'Pehla practice hour free', 'Performance reels'],
    pitch: ['Young musicians ke liye practice, band aur stage, ek jagah.', 'Riyaaz track karo, band dhoondo, gig pao.', 'Garage band se pehle stage tak.'],
  },
  {
    id: 'gaming', label: 'Gaming aur esports', sub: 'Khelo, seekho, team banao', unit: 'month', price: [49, 199], market: [40, 150], cost: 0.4, shark: 'esports',
    pre: ['Khel', 'Maidan', 'Clutch', 'Combo', 'Squad'],
    tag: ['Game on, team strong.', 'Casual se clutch tak.', 'Har gamer ki apni squad.', 'Khelo smart, khelo saath.'],
    research: ['Teens ko apne level ke teammates dhoondhne mein time lagta hai.', 'Local gamers ke liye safe tournaments kam hain.', 'Parents chahte hain gaming balanced aur safe rahe.'],
    feat: ['Squad finder, skill level ke hisaab se', 'Safe local tournaments, trophies ke saath', 'Screen time planner, parents ke saath', 'Coaching clips, pro tips', 'Team chat, filtered aur safe', 'Game night events, cafe mein'],
    plan: ['Ek gaming cafe ke saath weekend cup', 'School clubs mein squad leagues', 'Pehla mahina free trial', 'Highlight reels'],
    pitch: ['Gamers ke liye safe squads aur fair tournaments.', 'Team dhoondo, skill badhao, balance rakho.', 'Casual gamers se champions tak ka raasta.'],
  },
  {
    id: 'books', label: 'Purani books', sub: 'Books share karo, padhai sasti', unit: 'book', price: [49, 199], market: [30, 100], cost: 0.4, shark: 'study',
    pre: ['Kitaab', 'Panna', 'Pustak', 'Shelf', 'Chapter', 'Bookmark'],
    tag: ['Purani kitaab, naya reader.', 'Books share karo, padhai sasti karo.', 'Har shelf se ek nayi kahani.', 'Seniors ki books, juniors ka fayda.'],
    research: ['Har saal students nayi books kharidte hain, purani rakh di jaati hain.', 'Juniors ko seniors ki books aur notes chahiye hote hain.', 'Families padhai ka kharcha kam karna chahti hain.'],
    feat: ['Book swap, class ke hisaab se', 'Seniors ke notes, verified sets', 'Doorstep pickup aur drop', 'Book condition rating', 'Reading clubs, monthly', 'Donate option, local libraries ko'],
    plan: ['Ek school ki Class 10 batch se shuru', 'Result day ke baad book swap fair', 'Pehli listing free', 'Seniors ko top seller badges'],
    pitch: ['Seniors ki books ko juniors tak, aadhe daam mein.', 'Har purani kitaab ki doosri class.', 'Book swap jo padhai sasti aur green banaye.'],
  },
  {
    id: 'laundry', label: 'Hostel laundry', sub: 'Kapde saaf, time free', unit: 'kg', price: [30, 99], market: [15, 50], cost: 0.55, shark: 'laundry',
    pre: ['Dhobi', 'Dhulai', 'Press', 'Fold', 'Iron', 'Fresh'],
    tag: ['Kapde saaf, time free.', 'Hostel laundry, ab ek tap pe.', 'Press wale kapde, padhai pe focus.', 'Har hafte fresh, bina jhanjhat.'],
    research: ['Hostel students ka weekend kapde dhone mein chala jaata hai.', 'Local dhobis ko regular customers chahiye.', 'Students ko time pe press kiye kapde chahiye hote hain.'],
    feat: ['Hostel pickup, 48 ghante mein wapas', 'Per kg pricing, simple bill', 'Monthly laundry pass', 'Live status, kab ready hoga', 'Local dhobi partners', 'Exam week express service'],
    plan: ['Ek hostel, 2 dhobi partners', 'Hostel notice boards pe QR', 'Pehli pickup free', 'Room to room referral'],
    pitch: ['Hostel laundry, pickup se press tak, ek tap mein.', 'Weekend tumhara, kapde humare.', 'Local dhobis aur students ka smart laundry network.'],
  },
];

export const UNITS = [...new Set(AREAS.map((a) => a.unit))];
export const areaById = (id) => AREAS.find((a) => a.id === id) || null;

// Fixed UI and orchestra text that reaches the TV (registered as a bank in lib/text.js).
export const ORX = {
  title: 'Startup Studio',
  founder: 'Founder Agent', founderRole: 'Team ko kaam deta hai',
  research: 'Research Agent', researchRole: 'Kiski problem, kitne log',
  product: 'Product Agent', productRole: '3 features chunta hai',
  brand: 'Brand Agent', brandRole: 'Naam, tagline, logo',
  finance: 'Finance Agent', financeRole: 'Price aur pehla plan',
  pitch: 'Pitch Agent', pitchRole: 'Ek line ka pitch',
  tResearch: 'Problem aur market samjho', tProduct: '3 features chuno', tBrand: 'Naam, tagline aur logo banao',
  tFinance: 'Price aur pehle 1,000 customers ka plan', tPitch: 'Ek line ka pitch likho',
  hResearch: 'market size', hProduct: '3 features', hBrand: 'brand kit', hFinance: 'numbers', hPitch: 'pitch',
  kicker: 'AI Startup Studio', cardKicker: 'AI Startup Studio · Ideas 4.0', born: 'Ek nayi startup ka janam',
  boardKicker: 'AAJ KI STARTUPS', boardTitle: 'Aaj stall pe bani startups', boardHook: 'Scan karo, apni startup 90 second mein',
  sResearch: 'DATA', sProduct: 'PROD', sBrand: 'BRAND', sFinance: 'CFO', sPitch: 'PITCH', // short roster tags (CHECK-18 N8)
  roughLabel: 'Rough estimate', priceLabel: 'Price', marginLabel: 'Margin (rough)', revLabel: 'Pehle 1,000 customers',
};
