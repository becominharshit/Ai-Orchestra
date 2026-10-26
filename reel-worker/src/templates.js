// Render-side template config: beat, shot lengths, look, captions style and the music bed.
// The phone-side copy (names, shot prompts, fixtures) lives in experiences/reel/templates.js.
// Both files must agree on ids and shot targets (test/reel/templates.test.js checks it).
//
// Looks are one cheap eq filter each: vignette/colorbalance/fade cost seconds per reel on 1 vCPU (measured).
// Music beds are synthesised by ffmpeg at boot (src/assets.js), so nothing is downloaded.
// TODO(student): make a 30 s GarageBand bed for a template, save it as reel-worker/beds/<id>.wav (48 kHz stereo)
//                and set `bedFile: '<id>.wav'` below. The worker then uses it instead of the synth beat.

// Notes in Hz for the 4-bar bass line (one note per bar).
const E1 = 41.2, F1 = 43.65, G1 = 49, A1 = 55, Bb1 = 58.27, C2 = 65.41, D2 = 73.42, E2 = 82.41, F2 = 87.31;

export const TEMPLATES = {
  intro: {
    name: 'Squad Intro',
    shots: [6, 8, 6], // target seconds per shot (the Director snaps them to the beat)
    bpm: 116,
    bed: { notes: [C2, G1, A1, F1], hats: '8th', clap: true, chord: 'major', kickEvery: 1 },
    bedFile: null,
    look: { grade: 'eq=saturation=1.18:contrast=1.05', letterbox: false },
    caption: { font: 'PlusJakartaSans-ExtraBold.ttf', size: 66, color: 'white', box: '0x4E308D@0.88', y: 0.70, upper: false, prefix: '' },
    hook: { font: 'PlusJakartaSans-ExtraBold.ttf', size: 104, color: 'white', box: '0x19173D@0.55' },
  },
  trailer: {
    name: 'Movie Trailer',
    shots: [7, 6, 7],
    bpm: 90,
    bed: { notes: [D2, Bb1, F2, C2], hats: 'off', clap: false, chord: 'minor', kickEvery: 2 },
    bedFile: null,
    look: { grade: 'eq=saturation=0.72:contrast=1.16:brightness=-0.02', letterbox: true },
    caption: { font: 'Newsreader-SemiBold.ttf', size: 70, color: 'white', box: null, y: 0.76, upper: true, prefix: '' },
    hook: { font: 'Newsreader-SemiBold.ttf', size: 112, color: 'white', box: null },
  },
  roast: {
    name: 'Hostel Roast',
    shots: [7, 7, 6],
    bpm: 128,
    bed: { notes: [E2, C2, G1, D2], hats: '8th', clap: true, chord: 'major', kickEvery: 1 },
    bedFile: null,
    look: { grade: 'eq=saturation=1.32:contrast=1.08', letterbox: false },
    caption: { font: 'PlusJakartaSans-ExtraBold.ttf', size: 64, color: '0x19173D', box: '0xFFD84D@1', y: 0.15, upper: false, prefix: '' },
    hook: { font: 'PlusJakartaSans-ExtraBold.ttf', size: 100, color: '0x19173D', box: '0xFFD84D@1' },
  },
  heist: {
    name: 'Zenith Heist',
    shots: [7, 6, 7],
    bpm: 100,
    bed: { notes: [A1, F1, C2, E1], hats: '16th', clap: false, chord: 'minor', kickEvery: 1 },
    bedFile: null,
    look: { grade: 'eq=contrast=1.1:saturation=0.82:gamma_r=0.92:gamma_b=1.12', letterbox: false },
    caption: { font: 'JetBrainsMono-Bold.ttf', size: 54, color: '0x7CF7FF', box: '0x05040F@0.82', y: 0.73, upper: false, prefix: '> ' },
    hook: { font: 'JetBrainsMono-Bold.ttf', size: 80, color: '0x7CF7FF', box: '0x05040F@0.75' },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const HOOK_S = 2; // hook text on screen 0-2 s
export const END_CARD_S = 2; // pre-rendered Zenith end card
