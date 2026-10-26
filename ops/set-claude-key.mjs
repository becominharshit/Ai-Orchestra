#!/usr/bin/env node
// Stores the Claude (Anthropic) API key for play-zenith. The key is pasted into a hidden prompt: nothing shows on
// the screen, nothing is printed, and it is never put in a log, a command line or any file except .env (0600,
// ignored by git and by Docker builds).
//
//   node ops/set-claude-key.mjs                       hidden prompt -> .env (this laptop: npm run dev)
//   node ops/set-claude-key.mjs --lightsail           hidden prompt -> .env AND play-web (same image, redeployed
//                                                     with the merged settings; ADMIN_KEY and REEL_SHARED_SECRET are
//                                                     made at random if missing and kept in step with play-reel)
//   node ops/set-claude-key.mjs --lightsail --from-env    no prompt: sends the key already in .env to play-web
//   node ops/set-claude-key.mjs --check               one tiny API call with the .env key: prints "works" or "does not work"
//   node ops/set-claude-key.mjs --check --lightsail   the same with the key that play-web has
// TODO(student): add --rotate, which swaps in a new key and checks it before the old one is deleted in the Console.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = process.env.PLAY_ENV_FILE || path.join(root, '.env');
const MODEL = 'claude-opus-5-5';
export const KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;

export function looksLikeKey(s) { return KEY_RE.test(String(s || '').trim()); }

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    stdin.setRawMode(true); // raw mode: the terminal does not echo what is typed or pasted
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk.replace(/\x1b\[20[01]~/g, '')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\nStopped. Nothing was saved.\n'); process.exit(1); }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

export function readEnv(file = ENV_FILE) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
/** Sets keys in .env, keeping every other line as it is. Mode 0600. */
export function writeEnv(values, file = ENV_FILE) {
  const names = Object.keys(values);
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => !names.some((n) => new RegExp(`^\\s*${n}\\s*=`).test(l))) : [];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [k, v] of Object.entries(values)) lines.push(`${k}=${v}`);
  lines.push('');
  writeFileSync(file, lines.join('\n'), { mode: 0o600 });
  chmodSync(file, 0o600);
}

/** One tiny call (model lookup, no tokens used). Returns true / false, never the key or the error body. */
export async function keyWorks(key) {
  if (!looksLikeKey(key)) return false;
  try {
    const r = await fetch(`https://api.anthropic.com/v1/models/${MODEL}`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(15000) });
    return r.ok;
  } catch { return false; }
}

async function main(argv) {
  const lightsail = argv.includes('--lightsail');
  const fromEnv = argv.includes('--from-env');

  if (argv.includes('--check')) {
    let key = readEnv().ANTHROPIC_API_KEY;
    if (lightsail) {
      const ls = await import('./aws/lightsail.mjs');
      const c = ls.target('web');
      key = ls.currentEnv(c, ls.getService(c)).ANTHROPIC_API_KEY;
    }
    console.log((await keyWorks(key)) ? 'works' : 'does not work');
    return;
  }

  let key;
  if (fromEnv) {
    key = readEnv().ANTHROPIC_API_KEY;
    if (!looksLikeKey(key)) { console.log('There is no Claude key in .env yet. Run without --from-env first. Nothing changed.'); process.exit(1); }
  } else {
    if (!process.stdin.isTTY) { console.log('Run this in a terminal: it asks for the key at a hidden prompt. Nothing was saved.'); process.exit(1); }
    key = (await askHidden('Paste the Claude key, then press Enter (nothing will show while you paste): ')).trim();
    if (!looksLikeKey(key)) { console.log('That does not look like a Claude key (it should start with sk-ant-). Nothing was saved. Run the command again.'); process.exit(1); }
  }

  const local = readEnv();
  const values = { ANTHROPIC_API_KEY: key };
  if (!local.ADMIN_KEY) values.ADMIN_KEY = randomBytes(24).toString('hex');
  if (!local.REEL_SHARED_SECRET) values.REEL_SHARED_SECRET = randomBytes(24).toString('hex');
  writeEnv(values);
  if (!fromEnv) console.log(`Saved in ${path.relative(root, ENV_FILE) || '.env'} on this laptop only (git ignores it, mode 0600)${values.ADMIN_KEY ? '; ADMIN_KEY made' : ''}${values.REEL_SHARED_SECRET ? '; REEL_SHARED_SECRET made' : ''}.`);
  if (!lightsail) return;

  const ls = await import('./aws/lightsail.mjs');
  const s = ls.sharedSecrets(); // live play-web wins, then live play-reel, then .env
  console.log('Setting ANTHROPIC_API_KEY, ADMIN_KEY and REEL_SHARED_SECRET on play-web (values not shown) ...');
  await ls.redeployWithSettings('web', { ANTHROPIC_API_KEY: key, ADMIN_KEY: s.ADMIN_KEY, REEL_SHARED_SECRET: s.REEL_SHARED_SECRET });
  const reel = ls.getService(ls.target('reel'));
  const reelEnv = ls.currentEnv(ls.CONF.reel, reel);
  if (reel?.currentDeployment && reelEnv.REEL_SHARED_SECRET !== s.REEL_SHARED_SECRET) {
    console.log('play-reel had a different REEL_SHARED_SECRET: bringing it in step (value not shown) ...');
    await ls.redeployWithSettings('reel', { REEL_SHARED_SECRET: s.REEL_SHARED_SECRET });
  }
  // keep the laptop in step, so the local server and "lightsail.mjs admin" use the same admin key
  writeEnv({ ADMIN_KEY: s.ADMIN_KEY, REEL_SHARED_SECRET: s.REEL_SHARED_SECRET });
  console.log(`Done. play-web has the key. Check it with: node ops/set-claude-key.mjs --check --lightsail`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2)).catch((e) => { console.error(String(e.message).replaceAll(/sk-ant-[A-Za-z0-9_-]+/g, '[hidden]')); process.exit(1); });
