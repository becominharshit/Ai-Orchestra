// R6: the load test takes experience API steps from experiences/<id>/server.js, and --strict fails on 404s.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverRoutes } from '../loadtest/scenarios.mjs';

const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'loadtest', 'run.mjs');

test('routes are read from server.js: GETs first, params, streams, uploads and files skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-lt-'));
  fs.mkdirSync(path.join(root, 'experiences', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'experiences', 'demo', 'server.js'), `
    export function register({ router, limits }) {
      router.post('/reading', limits.guard(), async (req, res) => res.json({}));
      router.get("/fixtures", (req, res) => res.json([]));
      // router.get('/commented-out', ...)
      router.get('/file/:id', () => {});
      router.post('/upload', () => {});
      router.get('/live/stream', () => {});
      router.post('/reading', () => {}); // duplicate
      router.put(\`/score\`, () => {});
    }`);
  assert.deepEqual(discoverRoutes('demo', root), [{ method: 'GET', path: '/fixtures' }, { method: 'POST', path: '/reading' }, { method: 'PUT', path: '/score' }]);
  assert.equal(discoverRoutes('nothing-here', root), null, 'no server.js = not built');
  fs.rmSync(root, { recursive: true, force: true });
});

function fakeCore() {
  const srv = http.createServer((req, res) => {
    if (req.url === '/status.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, mock: true, claude: 'mock', experiences: ['_lt_fake'], limits: { queued: 0, limited: 0 } })); }
    if (req.url.endsWith('/stream')) { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': hi\n\n'); return; }
    if (req.url.startsWith('/_lt_fake/')) { res.writeHead(404); return res.end('not built'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}
function run(args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [RUN, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

test('only core: passes normally, fails with --strict (404 page, no server.js)', async () => {
  const { srv, url } = await fakeCore();
  const normal = await run(['--url', url, '--sessions', '3', '--tvs', '1', '--exps', '_lt_fake']);
  const strict = await run(['--url', url, '--sessions', '3', '--tvs', '1', '--exps', '_lt_fake', '--strict']);
  srv.closeAllConnections(); srv.close();
  assert.equal(normal.code, 0, normal.out);
  assert.match(normal.out, /RESULT: PASS/);
  assert.match(normal.out, /_lt_fake: no server\.js yet/);
  assert.equal(strict.code, 1, strict.out);
  assert.match(strict.out, /STRICT failures/);
  assert.match(strict.out, /GET \/_lt_fake\/ -> 404: 3/);
  assert.match(strict.out, /RESULT: FAIL/);
});
