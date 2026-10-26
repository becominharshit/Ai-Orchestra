// AI Sharks in offline mode (DEMO_MODE=1 OFFLINE=1): safetyMode is 'degraded', so the game is CHIPS ONLY.
// Own file: offline mode patches global fetch.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, json } from '../core/helpers.js';
import { GAMES } from '../../experiences/shark/lib/v2/engine.js';

let s;
after(async () => { await s?.close(); });

test('offline: degraded, chips only; every idea type plays from chips with no network; free text is refused', async () => {
  s = await startServer({ DEMO_MODE: '1', OFFLINE: '1' });
  const cfg = await (await fetch(`${s.base}/api/core/config`)).json();
  assert.equal(cfg.safetyMode, 'degraded');
  const ME = { cookie: 'pz_sid=OfflineSession01' };
  for (const g of GAMES) {
    const pick = { game: g.id, idea: 1, customer: 2, problem: 0, paisa: 1 };
    const q = await (await json(s.base, '/api/shark/v2/questions', { parts: {}, pick }, ME)).json();
    assert.equal(q.safe, true, g.id);
    assert.equal(q.source, 'fixture');
    const answers = Object.fromEntries(q.panel.map((id, i) => [id, i === 1 ? '' : q.questions[id].chips[0]]));
    const v = await (await json(s.base, '/api/shark/v2/verdict', { parts: {}, pick, qtoken: q.qtoken, answers }, ME)).json();
    assert.ok(['deal', 'out'].includes(v.verdict), g.id);
    assert.equal(v.signed, true);
  }
  // free text: v2 cards, v2 answers and v1 are all refused in degraded mode
  assert.equal((await json(s.base, '/api/shark/v2/questions', { parts: { idea: 'Mera apna idea, hostel laundry app', customer: 'students' } })).status, 409);
  const g0 = GAMES[0];
  const pick = { game: g0.id, idea: 0, customer: 0, problem: 0, paisa: 0 };
  const q = await (await json(s.base, '/api/shark/v2/questions', { parts: {}, pick }, ME)).json();
  const typed = await json(s.base, '/api/shark/v2/verdict', { parts: {}, pick, qtoken: q.qtoken, answers: { [q.panel[0]]: 'kuch bhi apna likha hua jawab' } }, ME);
  assert.equal(typed.status, 409, 'typed answer refused');
  assert.equal((await json(s.base, '/api/shark/questions', { pitch: 'Hostel laundry app, pickup aur delivery' })).status, 409, 'v1 refused');
  await assert.rejects(fetch('https://api.anthropic.com/v1/messages'), /offline mode: blocked/);
});
