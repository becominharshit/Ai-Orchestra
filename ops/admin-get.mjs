#!/usr/bin/env node
// GET a staff endpoint on play-web and print the JSON with secrets and long numbers redacted, so a checker can verify
// e.g. /api/core/ops/alerts or /admin/stats.json without ever seeing ADMIN_KEY.
//   node ops/admin-get.mjs /api/core/ops/alerts
//   node ops/admin-get.mjs /admin/stats.json --url https://staging.play.zenithschool.ai
// ADMIN_KEY and PUBLIC_URL come from the environment or the repo .env (read here, never printed). --url overrides.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** KEY=value lines of a .env file (quotes stripped, inline comments on unquoted values dropped). Never logged. */
export function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

const SECRET_KEY = /key|token|secret|pepper|password|passwd|auth|cookie|hmac|credential/i;
const LONG_DIGITS = /\p{Nd}(?:[\s.\-()+/_,]*\p{Nd}){4,}/gu;
/** Deep copy with secret-named fields replaced and every run of 5+ digits inside a string masked. Numbers stay. */
export function redact(v, k = '', d = 0) {
  if (d > 20) return '[deep]';
  if (k && SECRET_KEY.test(k) && v !== null && typeof v !== 'object') return '[redacted]';
  if (typeof v === 'string') return v.replace(LONG_DIGITS, '[number]');
  if (Array.isArray(v)) return v.map((x) => redact(x, k, d + 1));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, redact(x, kk, d + 1)]));
  return v;
}

async function main(argv) {
  const p = argv.find((a) => a.startsWith('/'));
  if (!p) { console.error('usage: node ops/admin-get.mjs <path> [--url <base>]'); return 2; }
  const ui = argv.indexOf('--url');
  // tests never read the real .env (CHECK-20 F7)
  const inTest = process.env.PZ_NO_DOTENV === '1' || process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX;
  const env = { ...(inTest ? {} : readEnvFile(path.join(REPO, '.env'))), ...process.env };
  const base = (ui >= 0 ? argv[ui + 1] : env.PUBLIC_URL || 'http://localhost:8790').replace(/\/$/, '');
  if (!env.ADMIN_KEY) { console.error('ADMIN_KEY is not set (environment or .env).'); return 2; }
  const url = new URL(base + p);
  const headers = { accept: 'application/json', 'x-admin-key': env.ADMIN_KEY };
  if (url.pathname.startsWith('/admin')) url.searchParams.set('key', env.ADMIN_KEY); // /admin/* takes the key in the query
  let r;
  try { r = await fetch(url, { headers, redirect: 'manual' }); } catch (e) { console.error(`request failed: ${e?.cause?.code || e?.name}`); return 1; }
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { nonJson: text.slice(0, 400) }; }
  // the key is never printed: not in the URL, not in the output
  console.log(JSON.stringify({ status: r.status, path: p, base, body: redact(body) }, null, 2).split(env.ADMIN_KEY).join('[redacted]'));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((c) => process.exit(c));
export { main };
