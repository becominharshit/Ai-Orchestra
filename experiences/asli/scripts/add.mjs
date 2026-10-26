#!/usr/bin/env node
// npm run asli:add      take everything in content/inbox/, convert it, add it to the manifest with approved:false
// npm run asli:list     show items waiting for review (and where to see/hear them)
// npm run asli:approve -- a011 i003 ...     approve reviewed items (or: -- --all-pending)
//
// Inbox layout (see content/inbox/README.md for the full brief that goes to students):
//   inbox/real/voice/E1_01.m4a    a student's own voice reading line E1 of content/voice-lines.json
//   inbox/real/image/food_01.jpg  a student's own photo (no faces, no number plates, no screens)
//   inbox/ai/voice/heygen_E3.m4a  AI voice from another tool (credit from the file name prefix or --ai-credit)
//   inbox/ai/image/higgsfield_food_01.png   AI image (Higgsfield / Adobe Firefly)
//   inbox/items.txt               text and code items, blocks separated by a line with ===
//
// Real student media needs --consent (the lead confirms the consent line below was agreed by each student).
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_DIR, MEDIA_DIR, ID_PREFIX, loadManifest, saveManifest, validate } from '../lib/content.js';
import { haveTools, toClip, toPhoto, durationS } from '../lib/media.js';

export const CONSENT_LINE = 'Main (student) confirm karta/karti hoon ki yeh photo/awaaz meri apni hai, isme kisi aur ka chehra, naam ya personal info nahi hai, aur Zenith School of AI isse Ideas 4.0 stall game, TV screen aur Zenith ke Instagram videos mein use kar sakta hai. Main kabhi bhi hatwa sakta/sakti hoon.';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const INBOX = path.join(CONTENT_DIR, 'inbox');
const AUDIO_EXT = /\.(m4a|mp3|wav|aac|aif|aiff|caf|mp4|mov)$/i;
const IMAGE_EXT = /\.(jpe?g|heic|heif|png|webp|tiff?)$/i;
const AI_TOOLS = { higgsfield: 'AI (Higgsfield)', firefly: 'AI (Adobe Firefly)', heygen: 'AI (HeyGen)', say: 'AI (macOS say)', claude: 'AI (Claude)' };

const TIPS = {
  'real:audio': 'Asli! Zenith student ki apni awaaz. Saans, halki si hasi aur room ki awaaz: insaan wala signal.',
  'ai:audio': 'AI tha! Har shabd ek jaisi speed pe, aur saans lene ki awaaz hi nahi.',
  'real:image': 'Asli photo! Choti kamiyan dekho: dhool, tedhi lines, random cheezein. AI sab kuch perfect bana deta hai.',
  'ai:image': 'AI tha! Haath, likha hua text aur reflections dekho: AI wahan aksar galti karta hai.',
};

const manifest = loadManifest();
const nextId = (type) => {
  const p = ID_PREFIX[type];
  const used = manifest.items.filter((it) => it.id.startsWith(p)).map((it) => Number(it.id.slice(1)));
  return `${p}${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`;
};
const lines = (() => { try { return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, 'voice-lines.json'), 'utf8')).lines; } catch { return []; } })();

function credits(dir) {
  const f = path.join(dir, '_credits.txt');
  const map = new Map();
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) { const m = l.match(/^\s*([^:#]+?)\s*:\s*(.+)$/); if (m) map.set(m[1], m[2].trim()); }
  return map;
}
function aiCredit(file) {
  const pre = file.toLowerCase().split(/[_\-. ]/)[0];
  return AI_TOOLS[pre] || opt('--ai-credit') || null;
}
const doneDir = path.join(INBOX, '_done', new Date().toISOString().slice(0, 10));
function archive(file) {
  fs.mkdirSync(doneDir, { recursive: true });
  fs.renameSync(file, path.join(doneDir, `${Date.now()}_${path.basename(file)}`));
}

// ---------------- list / approve ----------------
if (flag('--list')) {
  const pending = manifest.items.filter((it) => !it.approved);
  if (!pending.length) console.log('Nothing waiting for review.');
  for (const it of pending) {
    const what = it.src ? `content/media/${it.src}` : JSON.stringify(it.body).slice(0, 70);
    console.log(`${it.id}  ${it.type.padEnd(5)} ${it.answer.padEnd(4)}  ${what}   credit: ${it.credit}`);
  }
  console.log('\nReview every item (look, listen, read) before approving: npm run asli:approve -- <ids>');
  process.exit(0);
}
if (flag('--approve')) {
  const ids = flag('--all-pending') ? manifest.items.filter((it) => !it.approved).map((it) => it.id) : args.filter((a) => /^[tcai]\d{3}$/.test(a));
  if (!ids.length) { console.error('Give ids: npm run asli:approve -- a011 i002 (or -- --all-pending)'); process.exit(1); }
  for (const id of ids) { const it = manifest.items.find((x) => x.id === id); if (!it) { console.error(`${id}: not found`); process.exit(1); } it.approved = true; }
  const v = validate(manifest);
  const bad = v.errors.filter((e) => ids.some((id) => e.startsWith(`${id}:`)));
  if (bad.length) { console.error('Not approved, fix these first:\n  ' + bad.join('\n  ')); process.exit(1); }
  saveManifest(manifest);
  console.log(`Approved ${ids.length}: ${ids.join(' ')}. Run npm run asli:check, commit content/ and redeploy.`);
  process.exit(0);
}

// ---------------- add ----------------
const tools = haveTools();
const added = [];
const realMedia = ['real/voice', 'real/image'].some((d) => fs.existsSync(path.join(INBOX, d)) && fs.readdirSync(path.join(INBOX, d)).some((f) => AUDIO_EXT.test(f) || IMAGE_EXT.test(f)));
if (realMedia && !flag('--consent')) {
  console.error(`Real student photos/voices found. Every student must have agreed to this line (WhatsApp or form is fine):\n\n  "${CONSENT_LINE}"\n\nUnder 18? Their parent agrees too. Then run: npm run asli:add -- --consent`);
  process.exit(1);
}
fs.mkdirSync(MEDIA_DIR, { recursive: true });

for (const [answer, kind] of [['real', 'voice'], ['ai', 'voice'], ['real', 'image'], ['ai', 'image']]) {
  const dir = path.join(INBOX, answer, kind);
  if (!fs.existsSync(dir)) continue;
  const cmap = credits(dir);
  for (const f of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, f);
    const type = kind === 'voice' ? 'audio' : 'image';
    if (!(type === 'audio' ? AUDIO_EXT : IMAGE_EXT).test(f)) continue;
    let credit = cmap.get(f) || (answer === 'real' ? (type === 'audio' ? 'Zenith student, own voice (consent on file)' : 'Zenith student, own photo (consent on file)') : aiCredit(f));
    if (!credit) { console.warn(`skip ${answer}/${kind}/${f}: name it higgsfield_..., firefly_..., heygen_... or pass --ai-credit "AI (Tool)"`); continue; }
    if (answer === 'ai' && !credit.startsWith('AI (')) credit = `AI (${credit})`;
    const id = nextId(type);
    try {
      let item;
      if (type === 'audio') {
        if (!tools.afconvert || !tools.avconvert) throw new Error('needs macOS afconvert + avconvert');
        const srcDur = durationS(file);
        const info = toClip(file, path.join(MEDIA_DIR, `${id}.m4a`), { start: Number(opt('--start') || 0) });
        const code = (f.match(/^([EH]\d)/i) || [])[1]?.toUpperCase();
        const line = lines.find((l) => l.line === code);
        item = { id, type, lang: line?.lang || '', style: 'voice', answer, approved: false, group: line ? `voice-${line.line}` : undefined, src: `${id}.m4a`, transcript: line ? (line.roman || line.text) : '', reveal_line: TIPS[`${answer}:audio`], credit };
        console.log(`${id}  ${answer}/voice  ${f}  ${srcDur.toFixed(1)} s -> ${info.seconds} s, ${Math.round(info.bytes / 1024)} KB${srcDur > 5 ? '  (trimmed to 5 s)' : ''}${srcDur < 1.2 ? '  (very short, check it)' : ''}`);
      } else {
        if (!tools.sips) throw new Error('needs macOS sips');
        const info = toPhoto(file, path.join(MEDIA_DIR, `${id}.jpg`));
        const subject = f.replace(IMAGE_EXT, '').replace(/^(higgsfield|firefly)[_-]/i, '').replace(/[_-]\d+$/, '').replace(/[_-]/g, ' ');
        item = { id, type, lang: '', style: 'photo', answer, approved: false, group: opt('--group') || undefined, src: `${id}.jpg`, alt: `Photo: ${subject}`.slice(0, 60), reveal_line: TIPS[`${answer}:image`], credit };
        console.log(`${id}  ${answer}/image  ${f}  -> ${info.width}x${info.height}, ${Math.round(info.bytes / 1024)} KB (metadata removed)`);
      }
      if (answer === 'real') { item.consent = true; item.consent_note = `consent line agreed, added ${new Date().toISOString().slice(0, 10)}`; }
      manifest.items.push(Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)));
      added.push(id);
      archive(file);
    } catch (e) {
      console.error(`failed ${answer}/${kind}/${f}: ${e.message.split('\n')[0]}`);
    }
  }
}

// items.txt: text and code blocks
const itemsFile = path.join(INBOX, 'items.txt');
if (fs.existsSync(itemsFile)) {
  const blocks = fs.readFileSync(itemsFile, 'utf8').split(/^===\s*$/m).map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    const head = {};
    const m = b.match(/^([\s\S]*?)^body:\s*\n?([\s\S]*)$/m);
    if (!m) { console.warn('skip a block without "body:"'); continue; }
    for (const l of m[1].split('\n')) { const kv = l.match(/^(\w+):\s*(.*)$/); if (kv) head[kv[1].toLowerCase()] = kv[2].trim(); }
    const type = head.type === 'code' ? 'code' : 'text';
    const answer = head.answer === 'ai' ? 'ai' : head.answer === 'real' ? 'real' : null;
    if (!answer) { console.warn('skip a block without "answer: ai|real"'); continue; }
    const body = type === 'code' ? m[2].replace(/\s+$/, '') : m[2].trim().replace(/\s+/g, ' ');
    const id = nextId(type);
    manifest.items.push({ id, type, lang: head.lang || (type === 'code' ? 'code' : 'hinglish'), style: head.style || 'modern', answer, approved: false, body,
      reveal_line: head.reveal || (answer === 'real' ? 'Asli! Ek Zenith student ne khud likha. Chhoti si galti ya apna style: insaan wala signal.' : 'AI tha! Bahut saaf, bahut balanced: AI ki pehchaan.'),
      credit: head.credit || (answer === 'real' ? 'Zenith student (own words)' : 'AI (Claude)') });
    added.push(id);
    console.log(`${id}  ${answer}/${type}  ${body.slice(0, 60).replace(/\n/g, ' ')}`);
  }
  archive(itemsFile);
}

saveManifest(manifest);
const v = validate(manifest);
const mine = v.errors.filter((e) => added.some((id) => e.startsWith(`${id}:`)));
console.log(`\nAdded ${added.length} item(s) as approved:false.${mine.length ? `\nFix before approving:\n  ${mine.join('\n  ')}` : ''}`);
console.log('Next: npm run asli:list, review each one, then npm run asli:approve -- <ids>');
