// Offline mode (npm run offline): fixtures only and no outbound network. Own file: it patches global fetch.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, json } from './helpers.js';

let s;
after(async () => { await s?.close(); });

test('offline: fixtures answer, status says demo+offline, outbound requests are blocked', async () => {
  s = await startServer({ DEMO_MODE: '1', OFFLINE: '1', ADMIN_KEY: 'k', BUCKET_NAME: 'play-zenith-data' });
  const st = await (await fetch(`${s.base}/status.json`)).json();
  assert.equal(st.demo, true);
  assert.equal(st.offline, true);
  assert.equal(st.claude, 'demo');
  assert.equal(s.config.bucketName, '', 'bucket disabled offline');
  const r = await (await json(s.base, '/api/_sample/vibe', { word: 'bold', subject: 'art' })).json();
  assert.equal(r.source, 'fixture');
  assert.equal(r.reason, 'demo_mode');
  // same input -> same fixture (deterministic, so it still feels personal)
  const r2 = await (await json(s.base, '/api/_sample/vibe', { word: 'bold', subject: 'art' })).json();
  assert.equal(r2.vibe.title, r.vibe.title);
  await assert.rejects(fetch('https://api.anthropic.com/v1/messages'), /offline mode: blocked/);
  await assert.rejects(fetch('https://example.com/'), /offline mode: blocked/);
  const stats = await (await fetch(`${s.base}/admin/stats.json?key=k`)).json();
  assert.equal(stats.totals._sample.fallback, 2);
});
