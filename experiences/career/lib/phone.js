// Indian mobile numbers: normalise, check, mask, hash. A number never goes into a log, analytics, the bus or the TV.
import crypto from 'node:crypto';

/** "+91 98765-43210" / "098765 43210" / "9876543210" -> "9876543210", or null if it is not an Indian mobile number. */
export function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/[\s().-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "9876543210" -> "+91 98xxxxx210" (the confirm screen shows this; the server never sends it back). */
export const maskPhone = (n) => `+91 ${String(n).slice(0, 2)}xxxxx${String(n).slice(-3)}`;

/** Peppered hash (HMAC-SHA256, hex). Same number + same pepper = same hash; without the pepper it cannot be reversed by lookup. */
export function phoneHash(phone, pepper) {
  if (!pepper) throw new Error('PHONE_PEPPER is not set');
  return crypto.createHmac('sha256', pepper).update(`in:${phone}`).digest('hex');
}

/** First name only: first word, letters/marks/'.- only, max 40. */
export function firstName(raw) {
  const w = String(raw ?? '').trim().split(/\s+/)[0] || '';
  return w.replace(/[^\p{L}\p{M}'.-]/gu, '').slice(0, 40);
}
