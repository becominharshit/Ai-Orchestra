// Stateless PDF links: https://play.zenithschool.ai/p/<token> (30 days). The token names the PDF object and its
// expiry, signed with LINK_HMAC_SECRET. Opening it re-signs a short-lived bucket URL, so the link outlives the
// 24-hour media URL Meta fetches. The token holds no personal data (a date and a random id).
import crypto from 'node:crypto';

const sig = (secret, payload) => crypto.createHmac('sha256', secret).update(`pdf:${payload}`).digest('base64url').slice(0, 27);

/** key "pdfs/2026-10-27/<rand>.pdf" -> token "20261027.<rand>.<exp36>.<sig>" */
export function makeToken(key, secret, { days = 30, now = Date.now() } = {}) {
  const m = /^pdfs\/(\d{4})-(\d{2})-(\d{2})\/([A-Za-z0-9_-]{16,32})\.pdf$/.exec(key);
  if (!m || !secret) throw new Error('cannot make link');
  const exp = Math.floor(now / 1000 + days * 86400).toString(36);
  const payload = `${m[1]}${m[2]}${m[3]}.${m[4]}.${exp}`;
  return `${payload}.${sig(secret, payload)}`;
}

/** token -> { key } or null (bad signature, bad shape or expired). Constant-time compare. */
export function readToken(token, secret, { now = Date.now() } = {}) {
  const m = /^(\d{8})\.([A-Za-z0-9_-]{16,32})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{27})$/.exec(String(token || ''));
  if (!m || !secret) return null;
  const payload = `${m[1]}.${m[2]}.${m[3]}`;
  const want = Buffer.from(sig(secret, payload));
  const got = Buffer.from(m[4]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (parseInt(m[3], 36) * 1000 < now) return null;
  const d = m[1];
  return { key: `pdfs/${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}/${m[2]}.pdf` };
}
