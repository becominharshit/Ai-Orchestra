// Shared test helpers: temp data dirs and a server on a random port.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from '../../core/server/index.js';

// Temp folders live inside the repo (git-ignored tmp/), never elsewhere on the machine, and are removed on exit.
const REPO_TMP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tmp');
const made = [];
process.on('exit', () => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } });
export function tmpDir(tag = 'pz') {
  fs.mkdirSync(REPO_TMP, { recursive: true });
  const d = fs.mkdtempSync(path.join(REPO_TMP, `test-${tag}-`));
  made.push(d);
  return d;
}

export async function startServer(overrides = {}, opts = {}) {
  const dataDir = overrides.DATA_DIR || tmpDir();
  const s = await createServer({ PZ_QUIET: '1', ANTHROPIC_API_KEY: '', CLAUDE_MOCK_LATENCY_MS: '20', ADMIN_KEY: 'test-admin-key', DATA_DIR: dataDir, ...overrides }, opts);
  const srv = await s.start(0, '127.0.0.1');
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { ...s, base, dataDir, close: () => s.stop() };
}

export const json = (base, p, body, headers = {}) => fetch(base + p, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
