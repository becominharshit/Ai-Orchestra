// Squad Reel Studio templates, phone side: names, shot prompts and target lengths.
// The render side (beat, look, caption style, music bed) is reel-worker/src/templates.js.
// Ids and shot seconds must match in both files (test/reel/templates.test.js checks it).
// Copy rules: Hinglish, kind, PG. "Hostel Roast" roasts the situation, never a person.
// TODO(student): add a 5th template here and in reel-worker/src/templates.js (plus fixtures/captions_<id>.json, hook_<id>.json).

export const TEMPLATES = [
  {
    id: 'intro',
    name: 'Squad Intro',
    vibe: 'Bright, bouncy, sab ka swag',
    icon: 'star',
    bpm: 116,
    accent: '#62BBF3',
    shots: [
      { seconds: 6, prompt: 'Sab ek frame mein aao aur ek saath wave karo', tip: 'Phone seedha (vertical) pakdo' },
      { seconds: 8, prompt: 'Ek ek karke apna signature pose do', tip: 'Har dost ko 2 second' },
      { seconds: 6, prompt: 'Finale: group hug ya high five', tip: 'Sab hasna mat bhoolna' },
    ],
  },
  {
    id: 'trailer',
    name: 'Movie Trailer',
    vibe: 'Slow-mo drama, blockbuster feel',
    icon: 'film',
    bpm: 90,
    accent: '#A88BFF',
    shots: [
      { seconds: 7, prompt: 'Hero entry: camera ki taraf slow walk', tip: 'Thoda door se shuru karo' },
      { seconds: 6, prompt: 'Dramatic look: sab ek saath camera ki taraf mudo', tip: 'Full attitude, zero hasi' },
      { seconds: 7, prompt: 'Climax: jump ya freeze pose', tip: 'Ek, do, teen, jump!' },
    ],
  },
  {
    id: 'roast',
    name: 'Hostel Roast',
    vibe: 'Hostel life ki comedy, sab relatable',
    icon: 'chat',
    bpm: 128,
    accent: '#FFC861',
    shots: [
      { seconds: 7, prompt: 'Raat ke 2 baje wala Maggi moment act karo', tip: 'Situation pe hasna hai, kisi dost pe nahi' },
      { seconds: 7, prompt: 'Assignment deadline wala panic, sab milke', tip: 'Overacting allowed' },
      { seconds: 6, prompt: 'Phir bhi sab chill: thumbs up!', tip: 'Big smile, camera ki taraf' },
    ],
  },
  {
    id: 'heist',
    name: 'Zenith Heist',
    vibe: 'Mission mode, cool spy vibes',
    icon: 'target',
    bpm: 100,
    accent: '#5EEAD4',
    shots: [
      { seconds: 7, prompt: 'Plan banao: sab ek phone pe jhuk ke dekho', tip: 'Serious face, secret mission' },
      { seconds: 6, prompt: 'Slow walk, sunglasses on (ya imagine karo)', tip: 'Line mein chalo' },
      { seconds: 7, prompt: 'Mission complete: sab ek saath "Zenith!" bolo', tip: 'Loud and proud' },
    ],
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id);
export const byId = (id) => TEMPLATES.find((t) => t.id === id) || null;
