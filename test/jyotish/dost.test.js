// Dost compatibility (TASK-15): banks, picks, scoring, and the route (bank text only, nicknames, no names).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, json } from '../core/helpers.js';
import { ENERGY, ROLES, SQUAD_LINES, NICKS, dostBanks, DOST_TEMPLATES, resolveDost, defaultDostPick, squadScore, nicksFor } from '../../experiences/jyotish/lib/dost.js';
import { breaks } from '../../experiences/jyotish/lib/guard.js';
import { makeMatcher } from '../../experiences/jyotish/lib/public.js';
import { signById } from '../../experiences/jyotish/web/lib/astro.js';
import { CHECK02B_NEG } from './probes.js';

const F = (id, number) => ({ sign: signById(id), number, age: 'teen' });
const squad = [F('leo', 6), F('pisces', 11), F('virgo', 4)];
const servers = [];
after(async () => { for (const s of servers) await s.close(); });

test('Dost banks: friendship-only reviewed lines that pass the guard', () => {
  assert.ok(ENERGY.length >= 16 && ROLES.length >= 20 && SQUAD_LINES.length >= 20);
  for (const [name, b] of Object.entries(dostBanks())) {
    for (const t of Object.values(b)) {
      if (name !== 'dost_tok') assert.equal(breaks(t), null, `${name}: ${t}`);
      assert.ok(!/[\u2013\u2014]/.test(t) && t.length <= 120, t);
    }
  }
  for (const n of NICKS) assert.ok(/^[A-Z][a-z]+[A-Z][a-z]+$/.test(n) && n.length <= 12, n);
});

test('picks: deterministic, distinct roles, broken model picks repaired; score is positive only', () => {
  const d = defaultDostPick(squad);
  assert.deepEqual(defaultDostPick(squad), d);
  assert.equal(new Set(d.roles).size, 3);
  const { pick, fixed } = resolveDost({ energy: 'nope', roles: ['sr01', 'sr01', 'zz'], lines: ['sl01', 'sl01'], adj: 'hot' }, squad);
  assert.equal(new Set(pick.roles).size, 3);
  assert.equal(pick.lines.length, 2);
  assert.notEqual(pick.lines[0], pick.lines[1]);
  assert.notEqual(pick.adj, 'hot');
  assert.ok(fixed >= 4);
  for (const s of [[F('aries', 1), F('cancer', 2)], squad, [F('leo', 33), F('leo', 33), F('leo', 33), F('leo', 33)]]) {
    const sc = squadScore(s);
    assert.ok(sc >= 70 && sc <= 99, String(sc));
  }
  assert.equal(new Set(nicksFor(squad)).size, 3);
});

test('route: bank text + nicknames only, every public string registered, names never needed', async () => {
  const isPublic = makeMatcher(dostBanks(), DOST_TEMPLATES);
  const s = await startServer({ CLAUDE_MOCK: '1' });
  servers.push(s);
  const body = { friends: squad.map((f) => ({ sign: f.sign.id, number: f.number, age: 'teen', name: 'Meher', dob: '2007-03-02' })) };
  const j = await (await json(s.base, '/api/jyotish/dost', body)).json();
  const p = j.public;
  const strings = [p.kicker, p.energy, p.energyLine, p.score, p.hint, ...p.lines, ...p.roles.flatMap((r) => [r.role, r.line, r.tv]), p.card.kicker, p.card.title, ...p.card.lines].map((x) => x.text);
  for (const t of strings) assert.ok(isPublic(t), `not public: ${t}`);
  assert.ok(!JSON.stringify(j).includes('Meher') && !JSON.stringify(j).includes('2007'), 'typed values are never echoed');
  assert.match(p.roles[0].tv.text, /^[A-Z][a-z]+[A-Z][a-z]+: The /);
  assert.match(p.card.kicker.text, /^3 dost · /);
  const one = await json(s.base, '/api/jyotish/dost', { friends: [body.friends[0]] });
  assert.equal(one.status, 400);
});

test('route, live model: free text in a pick never reaches the report', async () => {
  const bad = Object.values(CHECK02B_NEG).flat();
  const client = { beta: { messages: { create: async () => ({ content: [{ type: 'text', text: JSON.stringify({ energy: bad[0], roles: [bad[1], bad[2], 'sr03'], lines: [bad[3], 'sl02'], adj: bad[4] }) }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: 'end_turn' }) } } };
  const s = await startServer({ ANTHROPIC_API_KEY: 'sk-test-not-real' }, { claudeClient: client });
  servers.push(s);
  const j = await (await json(s.base, '/api/jyotish/dost', { friends: squad.map((f) => ({ sign: f.sign.id, number: f.number, age: 'teen' })) })).json();
  const out = JSON.stringify(j);
  for (const l of bad.slice(0, 5)) assert.ok(!out.includes(l), l);
  assert.equal(j.public.roles[2].role.text, ROLES[2].text);
});
