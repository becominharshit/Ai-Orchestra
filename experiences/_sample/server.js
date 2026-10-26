// _sample: the reference experience. It shows the whole contract by example:
// a limited route, one Claude call with a JSON schema and a mock, a fixture fallback, an extra analytics count,
// and the shared safety rules (CONTRACT 13): public text from banks/templates, the judge pass, the care check.
// Copy this folder to start a new experience (see core/CONTRACT.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashSeed } from '../../core/server/demo.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The fixtures double as the vetted line bank for public surfaces (TV, share card).
const VIBES = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'vibe.json'), 'utf8'));

const SUBJECTS = ['maths', 'science', 'art', 'sports', 'music', 'coding'];

// Structured output schema: Claude must answer exactly this shape.
const VIBE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: '2-3 word vibe name, Title Case' },
    superpower: { type: 'string', description: 'one short Hinglish line' },
    lines: { type: 'array', items: { type: 'string' }, description: 'exactly 3 short, positive Hinglish lines' },
    tvLine: { type: 'string', description: 'one short line for the big screen' },
  },
  required: ['title', 'superpower', 'lines', 'tvLine'],
};

const SYSTEM = `You write a fun, positive "vibe report" for a student at a college fest stall in India.
Write in Hinglish (Roman script), Gen-Z friendly, PG, warm. Never negative, never about looks, health, money, exams or relationships.
No em-dashes or en-dashes. Keep every line under 70 characters.`;

// Real computation for the Number Agent (also computed in the browser for the live log).
export function wordNumber(word) {
  const letters = word.replace(/[^a-z]/gi, '').toLowerCase();
  const sum = [...letters].reduce((s, ch) => s + (ch.charCodeAt(0) - 96), 0);
  let n = sum;
  while (n > 9) n = String(n).split('').reduce((a, b) => a + Number(b), 0);
  return Math.max(1, n);
}

// CLAUDE_MOCK=1 answer: schema-shaped and built from the input, so the flow looks real without a key.
function mockVibe(subject, number) {
  const titles = { maths: 'Logic Ninja', science: 'Curious Builder', art: 'Creative Spark', sports: 'Team Energy', music: 'Creative Spark', coding: 'Curious Builder' };
  return {
    title: titles[subject] || 'Bold Explorer',
    superpower: `Number ${number} wali focus energy`,
    lines: [`${subject} ke saath tumhara connection solid hai.`, `Lucky number ${number}: aaj ka din tumhara hai.`, 'Tumhara agla idea kisi ka din bana dega.'],
    tvLine: `Number ${number} ki vibe, full power.`,
  };
}

// Every string this experience sends to the TV is registered here (CONTRACT 13.2).
function registerPublicText(safety) {
  const bank = {};
  VIBES.forEach((v, i) => { bank[`t${i}`] = v.title; bank[`s${i}`] = v.superpower; v.lines.forEach((l, j) => { bank[`l${i}_${j}`] = l; }); });
  safety.bank('vibe', bank);
  safety.bank('orx', {
    title: 'Vibe Scanner', conductor: 'Vibe Conductor', number: 'Number Agent', numberRole: 'Word score, in code', vibe: 'Vibe Agent',
    vibeRole: 'Claude call', card: 'Card Agent', cardRole: 'Share card, canvas', lNumber: 'NUMBER', lVibe: 'VIBE', lCard: 'CARD',
    tNumber: 'Word ka number nikalo', tVibe: 'Vibe report likho (Claude)', tCard: 'Story card banao', hCard: 'title + 3 lines', kicker: 'Vibe report', cardKicker: 'Mera vibe report',
  });
  safety.template('logNumber', '{letters} letters, {vowels} vowels, sum {sum} -> number {n}', { letters: 'int:0..20', vowels: 'int:0..20', sum: 'int:0..600', n: 'int:1..9' });
  safety.template('handNumber', 'lucky number = {n}', { n: 'int:1..9' });
  safety.template('logVibe', '{source} in {sec}.{tenth}s, {count} lines', { source: 'list:sources', sec: 'int:0..120', tenth: 'int:0..9', count: 'int:0..9' });
  safety.template('logCard', '{w}x{h} PNG ready, {kb} KB', { w: 'int:1080..1080', h: 'int:1920..1920', kb: 'count' });
  safety.template('done', 'Vibe report ready in {sec}.{tenth}s', { sec: 'int:0..120', tenth: 'int:0..9' });
}

export default function register({ app, claude, demo, limits, analytics, safety, stage }) {
  analytics.declare(['vibe_subject']); // extra count-only event; dimension is a short enum
  registerPublicText(safety);
  safety.agents(['conductor', 'number', 'vibe', 'card']); // the only agent ids this experience's TV events may use
  // Stage mode (CONTRACT 12): a fun board for the TV loop. Scores are computed here, never sent by the phone.
  stage.declare({ boards: [{ id: 'lucky', title: 'Aaj ke lucky numbers', unit: '', order: 'desc', min: 1, max: 9 }], panels: { leaderboard: 'lucky' } });

  app.post('/vibe', limits.guard(), async (req, res) => {
    // the server is the authority for the care path: a modified phone still gets the care card, no game.
    // inputLive waits for the live AI crisis check (at most 3 s; rules only when it is unavailable), so a crisis the
    // rules miss still gets the care card on THIS request. Every visitor-text route does this (CONTRACT 13).
    const hit = await safety.inputLive(req, req.body?.word);
    if (safety.isUnchecked(hit)) return safety.uncheckedResponse(res); // the live check could not decide: not used, chips path
    if (safety.isCrisis(hit)) return safety.careResponse(res);
    const word = String(req.body?.word || '').replace(/[^a-z ]/gi, '').trim().slice(0, 20) || 'curious';
    const subject = SUBJECTS.includes(req.body?.subject) ? req.body.subject : 'coding';
    const number = wordNumber(word);
    const t0 = Date.now();

    const r = await demo.wrap('vibe', { seed: `${subject}:${number}`, req }, () => claude.run({
      task: 'vibe',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Word: ${word}\nFavourite subject: ${subject}\nLucky number (computed): ${number}` }],
      schema: VIBE_SCHEMA,
      maxTokens: 800,
      effort: 'low',
      mock: () => mockVibe(subject, number),
    }));

    analytics.count('vibe_subject', { subject });
    // Phone-only AI text goes through the judge; anything not approved is replaced by a bank line.
    const pick = r.reason === 'hero' ? 0 : hashSeed(`${subject}:${number}`) % VIBES.length;
    const fix = VIBES[pick];
    const ai = { title: r.data.title, superpower: r.data.superpower, lines: (r.data.lines || []).slice(0, 3) };
    const { flagged } = await safety.judge([{ id: 'title', text: ai.title }, { id: 'superpower', text: ai.superpower }, ...ai.lines.map((t, i) => ({ id: `l${i}`, text: t }))]);
    const bad = new Set(flagged);
    const vibe = {
      title: bad.has('title') ? fix.title : ai.title,
      superpower: bad.has('superpower') ? fix.superpower : ai.superpower,
      lines: ai.lines.map((t, i) => (bad.has(`l${i}`) ? fix.lines[i] : t)),
    };
    // Public surfaces (TV, share card) only ever get bank lines.
    const pub = {
      kicker: safety.publicText('orx', 'cardKicker'),
      title: safety.publicText('vibe', `t${pick}`),
      superpower: safety.publicText('vibe', `s${pick}`),
      lines: fix.lines.map((_, j) => safety.publicText('vibe', `l${pick}_${j}`)),
    };
    // big-screen players (they picked a generated nickname) land on the TV leaderboard; this also ends their turn
    const board = stage.post(req, 'lucky', { score: number });
    res.json({
      number,
      vibe,
      public: pub,
      board: board.ok ? { rank: board.rank } : null,
      source: r.demo ? (r.reason === 'hero' ? 'hero' : 'fixture') : claude.mode() === 'mock' ? 'mock' : 'claude',
      reason: r.reason,
      ms: Date.now() - t0,
    });
  });
}
