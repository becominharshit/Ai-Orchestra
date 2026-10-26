// ops/monitor.mjs against a fake play-zenith server: CSV lines, the red alert after 2 failures, and the summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watch, readRows, summarize, summaryMarkdown, reelFrom, HEADER, ist } from '../monitor.mjs';

function fakeServer() {
  const state = { down: new Set(), demo: false, reel: true, hits: [] };
  const srv = http.createServer((req, res) => {
    state.hits.push(req.url);
    if (req.url === '/status.json') {
      if (state.down.has('site')) { res.writeHead(503); return res.end('{}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, demo: state.demo, claude: state.demo ? 'demo' : 'live', reelWorker: { ok: state.reel, ms: 12 } }));
    }
    const exp = req.url.split('/')[1];
    if (state.down.has(exp)) { res.writeHead(500); return res.end('oops'); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><p>ok</p>');
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, state, base: `http://127.0.0.1:${srv.address().port}` })));
}

test('watch writes one row per check, alerts after 2 failures in a row, and recovers', async () => {
  const { srv, state, base } = await fakeServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-mon-'));
  const logs = [];
  const log = (m) => logs.push(m);
  // round 1 all fine; rounds 2-4 shark down, reel worker down and demo on; round 5 back
  const plan = [() => {}, () => { state.down.add('shark'); state.reel = false; state.demo = true; }, () => {}, () => {}, () => { state.down.clear(); state.reel = true; state.demo = false; }];
  for (const step of plan) { step(); await watch({ base, exps: ['jyotish', 'shark'], dir, intervalMs: 1, runs: 1, quiet: true, log }); }
  srv.close();

  const day = ist().day;
  const file = path.join(dir, `uptime-${day}.csv`);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.split('\n')[0], HEADER);
  // 5 rounds x (site + 2 pages + reel-worker) = 20 rows
  assert.equal(text.trim().split('\n').length, 1 + 20);
  assert.ok(!/cookie|key|name|sk-ant/i.test(text.split('\n').slice(1).join('\n')), 'nothing personal or secret in the CSV');
  assert.ok(state.hits.includes('/jyotish/') && state.hits.includes('/status.json'));

  // the watch() calls above run separately, so alerting across rounds is tested with one multi-run watch below
  const rows = readRows(dir);
  const sum = summarize(rows);
  const shark = sum.find((s) => s.check === 'shark');
  assert.equal(shark.samples, 5);
  assert.equal(shark.minutesDown, 3);
  assert.equal(shark.incidents, 1);
  assert.equal(shark.uptimePct, 40);
  const site = sum.find((s) => s.check === 'site');
  assert.equal(site.uptimePct, 100);
  assert.equal(site.demoMinutes, 3);
  assert.equal(sum.find((s) => s.check === 'reel-worker').minutesDown, 3);
  const md = summaryMarkdown(sum);
  assert.match(md, /^\| Day \| Experience \| Uptime % \(monitor\) \| Incidents \| Total minutes down \|/);
  assert.match(md, /\| AI Sharks \| 40\.0 \| 1 \| 3 \|/);
  assert.match(md, /\| AI Jyotish \| 100\.0 \| 0 \| 0 \|/);
  assert.match(md, /demo or offline mode on for 3 of them/);
  assert.ok(!/[\u2014\u2013]/.test(md));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('red line after exactly 2 failures in a row, green line when back', async () => {
  const { srv, state, base } = await fakeServer();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-mon-'));
  const logs = [];
  let round = 0;
  state.down.add('jyotish');
  const log = (m) => {
    logs.push(m);
    if (/^\d\d:\d\d /.test(m) && ++round === 3) state.down.clear(); // fails in rounds 1-3, fine from round 4
  };
  await watch({ base, exps: ['jyotish'], dir, intervalMs: 5, runs: 4, quiet: true, log });
  srv.close();
  const red = logs.filter((l) => l.includes('DOWN: AI Jyotish failed 2 minutes in a row'));
  assert.equal(red.length, 1, 'one red alert, not one per minute');
  assert.ok(red[0].includes('\x1b[31'), 'printed in red');
  assert.equal(logs.filter((l) => l.includes('BACK UP: AI Jyotish')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a server that does not answer counts as down (http 0), not a crash', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-mon-'));
  await watch({ base: 'http://127.0.0.1:9', exps: ['asli'], dir, intervalMs: 1, runs: 1, quiet: true, log: () => {} });
  const rows = readRows(dir);
  assert.deepEqual(rows.map((r) => [r.check, r.ok, r.http]), [['site', false, 0], ['asli', false, 0]]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('reel worker shapes', () => {
  assert.equal(reelFrom({}), null);
  assert.deepEqual(reelFrom({ reelWorker: true }), { ok: true });
  assert.equal(reelFrom({ reel: { ok: false } }).ok, false);
  assert.equal(reelFrom({ workers: { reel: { ok: true, ms: 3.4 } } }).ms, 3);
});
