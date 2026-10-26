// Acceptance 8: 50 concurrent visitor sessions of the sample in mock mode, no failures (queue path exercised).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

test('load: 50 concurrent sessions + 8 stage TVs + 10 big-screen turns + 25 duel rooms pass; extra calls queue', { timeout: 120000 }, async () => {
  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(here, 'load.mjs'), '--sessions', '50', '--latency', '600'], { cwd: path.resolve(here, '..', '..') }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${err.message}\n${stdout}\n${stderr}`)); else resolve(stdout);
    });
  });
  const r = JSON.parse(out.slice(out.indexOf('{')));
  assert.equal(r.errors, 0);
  assert.equal(r.ok, 50);
  assert.ok(r.queued > 0, 'with 50 sessions and MAX_IN_FLIGHT 30 some calls must queue');
  assert.ok(r.peakInFlight <= r.maxInFlight);
  assert.equal(r.duelRooms, '25/25');
  assert.equal(r.bigScreenTurns, '10/10');
  assert.equal(r.stageTvs, 8);
});
