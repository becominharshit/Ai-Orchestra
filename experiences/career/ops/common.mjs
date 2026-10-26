// Shared bits for the Career Studio ops scripts (run on Avi's Mac, never on the server).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from '../lib/store.js';
import { open } from '../lib/envelope.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const PRIVATE_KEY_PATH = path.join(os.homedir(), '.zenith', 'play-leads-private.pem');

/** Loads the repo .env into process.env (values never printed). */
export function loadEnv(file = path.join(REPO, '.env')) {
  // tests (and checkers) never read the real .env: PZ_NO_DOTENV=1, or any node --test / Playwright process
  if (process.env.PZ_NO_DOTENV === '1' || process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX || process.env.PZ_IN_TEST === '1') return;
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export function arg(argv, name, dflt = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
}

/** --local <dir> (a DATA_DIR) or the bucket from BUCKET_NAME / BUCKET_KEY_ID / BUCKET_KEY_SECRET. */
export function storeFrom(argv, env = process.env) {
  const local = arg(argv, '--local');
  if (local) return createStore({ dataDir: path.resolve(local) });
  if (!env.BUCKET_NAME) throw new Error('No store: pass --local <data dir> or set BUCKET_NAME (+ BUCKET_KEY_ID, BUCKET_KEY_SECRET) in .env.');
  return createStore({ bucketName: env.BUCKET_NAME, bucketRegion: env.BUCKET_REGION || 'ap-south-1', bucketKeyId: env.BUCKET_KEY_ID, bucketKeySecret: env.BUCKET_KEY_SECRET });
}

export function privateKey(argv) {
  const p = arg(argv, '--key', PRIVATE_KEY_PATH);
  if (!fs.existsSync(p)) throw new Error(`Private key not found at ${p}. It is made by ops/leads-keygen.mjs on this Mac.`);
  return crypto.createPrivateKey(fs.readFileSync(p, 'utf8'));
}

/** Every lead record: [{ key, rec }] (decrypted in memory only). --date limits to one IST day. */
export async function readLeads(store, pk, { date = null } = {}) {
  const keys = (await store.list(date ? `leads/${date}/` : 'leads/')).filter((k) => k.endsWith('.bin'));
  const out = [];
  let bad = 0;
  for (const key of keys) {
    try { out.push({ key, rec: open(await store.get(key), pk) }); } catch { bad += 1; }
  }
  return { leads: out, bad };
}

export const maskPhone = (n) => `${String(n).slice(0, 2)}******${String(n).slice(-2)}`;
