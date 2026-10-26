#!/usr/bin/env node
// npm run asli:voices: make the AI voice clips with macOS `say` and the voices already installed on this Mac.
//   reads  content/voice-lines.json   (the script lines + which voice reads which line)
//   writes content/media/a0NN.m4a and the matching manifest items (type audio, answer ai, credit "AI (macOS say, <voice>)")
// Nothing is downloaded or installed. A voice that is not installed is skipped with a note.
//   --force   re-make clips that already exist
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, MEDIA_DIR, loadManifest, saveManifest } from '../lib/content.js';
import { haveTools, installedVoices, sayClip } from '../lib/media.js';

const force = process.argv.includes('--force');
const tools = haveTools();
if (!tools.say || !tools.afconvert) {
  console.error('Needs macOS say + afconvert (run this on the content Mac).');
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voice-lines.json'), 'utf8'));
const lines = new Map(script.lines.map((l) => [l.line, l]));
const installed = installedVoices().map((v) => v.name);
// macOS lists some voices as "Tara (English (India))": accept the short name too.
const resolveVoice = (name) => installed.find((n) => n === name) || installed.find((n) => n.startsWith(`${name} (`)) || null;
const manifest = loadManifest();
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Tips are about how a listener can tell, never about the speaker. Picked by the clip's language.
const TIPS = {
  en: [
    'AI tha! Har shabd ek jaisi speed pe, aur saans lene ki awaaz hi nahi.',
    'AI tha. Awaaz bahut saaf hai, peeche koi room ki awaaz nahi.',
    'AI tha! Sentence ke end pe tone ek dum flat. Insaan wahan thoda upar neeche karte hain.',
    'AI tha. Pauses ekdum barabar hain, jaise ruler se naape ho.',
  ],
  hi: [
    'AI tha! Hindi shabdon ka stress thoda robotic hai. Kaan pe bharosa rakho.',
    'AI tha. Har shabd alag alag bola, insaan Hindi mein shabd jod ke bolte hain.',
    'AI tha! Awaaz bahut saaf, na saans, na room ki awaaz.',
    'AI tha. Sawaal wali line mein bhi tone flat: insaan wahan upar jaate hain.',
  ],
};
const seenLang = { en: 0, hi: 0 };

let made = 0;
for (const v of script.ai) {
  const l = lines.get(v.line);
  if (!l) { console.warn(`${v.id}: unknown line ${v.line}`); continue; }
  const voice = resolveVoice(v.voice);
  if (!voice) { console.warn(`${v.id}: voice "${v.voice}" not installed on this Mac, skipped`); continue; }
  const src = `${v.id}.m4a`;
  const out = path.join(MEDIA_DIR, src);
  let info = null;
  if (force || !fs.existsSync(out)) {
    info = sayClip(voice, l.text, out, { rate: v.rate });
    made++;
    console.log(`${v.id}  ${v.voice.padEnd(6)} ${String(info.seconds).padStart(4)} s  ${Math.round(info.bytes / 1024)} KB  ${l.roman || l.text}`);
  }
  const item = {
    id: v.id, type: 'audio', lang: l.lang, style: 'voice', answer: 'ai', approved: true, group: `voice-${v.line}`,
    src, transcript: l.roman || l.text,
    reveal_line: (TIPS[l.lang] || TIPS.en)[seenLang[l.lang in TIPS ? l.lang : 'en']++ % 4],
    credit: `AI (macOS say, ${v.voice} voice)`,
  };
  const i = manifest.items.findIndex((x) => x.id === v.id);
  if (i >= 0) manifest.items[i] = { ...manifest.items[i], ...item, approved: manifest.items[i].approved ?? true };
  else manifest.items.push(item);
}
saveManifest(manifest);
console.log(`\n${made} clip(s) made, manifest updated. Next: npm run asli:check`);
