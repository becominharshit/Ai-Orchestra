#!/usr/bin/env node
// Makes the leads keypair (RSA 3072, OAEP-SHA256 envelope). Run once, on Avi's Mac:
//   node experiences/career/ops/leads-keygen.mjs
// The PRIVATE key goes to ~/.zenith/play-leads-private.pem (mode 0600) and never into the repo or the server.
// Only the PUBLIC key is printed (and saved next to it), for the env var LEADS_PUBLIC_KEY:
//   node ops/set-secret.mjs LEADS_PUBLIC_KEY --from-file ~/.zenith/play-leads-public.pem --lightsail
// --dir <folder> writes both somewhere else (tests). --force replaces an existing pair (old leads become unreadable).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arg } from './common.mjs';

const argv = process.argv.slice(2);
const dir = path.resolve(arg(argv, '--dir', path.join(os.homedir(), '.zenith')));
const priv = path.join(dir, 'play-leads-private.pem');
const pub = path.join(dir, 'play-leads-public.pem');
if (fs.existsSync(priv) && !argv.includes('--force')) {
  console.log(`A private key already exists at ${priv}. Leads already saved need it. Nothing changed (use --force only if you are sure).`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
fs.writeFileSync(priv, privateKey, { mode: 0o600 });
fs.chmodSync(priv, 0o600);
fs.writeFileSync(pub, publicKey, { mode: 0o644 });
console.log(`Private key saved: ${priv} (mode 0600). Back it up offline (for example an encrypted USB). Never paste it anywhere.`);
console.log(`Public key saved:  ${pub}`);
console.log('Public key (safe to share, goes into LEADS_PUBLIC_KEY):');
console.log(publicKey.trim());
console.log(`Next: node ops/set-secret.mjs LEADS_PUBLIC_KEY --from-file ${pub} --lightsail`);
