// Envelope encryption for lead records. The server holds only the PUBLIC key (env LEADS_PUBLIC_KEY), so it can
// write records but never read them back. Avi's Mac holds the private key (~/.zenith/play-leads-private.pem).
//   record -> random AES-256-GCM key -> ciphertext; the AES key is wrapped with RSA-OAEP (SHA-256).
// Stored as one JSON object per record: { v, alg, ek, iv, tag, ct } (base64).
// Small server-side lists (sent list, stop list) use AES-256-GCM with a key derived from PHONE_PEPPER instead,
// because the server itself must read them.
import crypto from 'node:crypto';

export const ALG = 'RSA-OAEP-256+A256GCM';

/** LEADS_PUBLIC_KEY is stored on one line with "\n" for the newlines (ops/set-secret.mjs). */
export function publicKeyFromEnv(v) {
  if (!v) return null;
  return crypto.createPublicKey(String(v).replace(/\\n/g, '\n'));
}

export function seal(obj, publicKey) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  const ek = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  key.fill(0);
  const b = (x) => x.toString('base64');
  return Buffer.from(JSON.stringify({ v: 1, alg: ALG, ek: b(ek), iv: b(iv), tag: b(c.getAuthTag()), ct: b(ct) }));
}

export function open(buf, privateKey) {
  const e = JSON.parse(Buffer.from(buf).toString('utf8'));
  if (e.alg !== ALG) throw new Error('unknown envelope');
  const key = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(e.ek, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
  d.setAuthTag(Buffer.from(e.tag, 'base64'));
  const pt = Buffer.concat([d.update(Buffer.from(e.ct, 'base64')), d.final()]);
  return JSON.parse(pt.toString('utf8'));
}

/** Symmetric box for the server's own lists. key = HKDF(PHONE_PEPPER, purpose). */
export function listKey(pepper, purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(pepper), Buffer.from('play-zenith-career'), Buffer.from(purpose), 32));
}
export function boxSeal(obj, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), ct]);
}
export function boxOpen(buf, key) {
  const b = Buffer.from(buf);
  if (b[0] !== 1) throw new Error('unknown box');
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(1, 13));
  d.setAuthTag(b.subarray(13, 29));
  return JSON.parse(Buffer.concat([d.update(b.subarray(29)), d.final()]).toString('utf8'));
}
