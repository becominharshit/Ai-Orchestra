// Abuse guards for the WhatsApp form (no OTP at the stall, so we make every lead cost a real play):
//   1. Play tokens: the server hands out a signed, single-use token only after a play in that tab:
//      a forecast preview (POST /api/career/preview) or a Job Time Machine round (POST /api/career/agents).
//      The token is valid from `nbf` (the play takes time) for 30 minutes and buys at most ONE lead.
//      HMAC-SHA256 with LINK_HMAC_SECRET. Works without cookies (the phone keeps the token in memory).
//   2. Per-IP windows (no cookies needed): /lead, /stop and live sends. Limits are generous because many phones
//      share one mobile CGNAT IP, but they cap what one script can do.
import crypto from 'node:crypto';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function createPlayTokens({ secret, ttlMs = 30 * 60000, now = () => Date.now() }) {
  const key = secret || crypto.randomBytes(32).toString('hex'); // no secret in dev: per-process key (tokens are short-lived anyway)
  const used = new Map(); // nonce -> expiry (memory; single node by design)
  const sign = (p) => crypto.createHmac('sha256', key).update(`play:${p}`).digest('base64url').slice(0, 32);
  setInterval(() => { const t = now(); for (const [n, e] of used) if (e < t) used.delete(n); }, 60000).unref?.();

  /** kind: 'fc' (forecast preview) | 'jtm' (Job Time Machine). minMs: earliest use after issue. */
  function issue(kind, { minMs = 0 } = {}) {
    const t = now();
    const p = b64({ k: kind, n: crypto.randomBytes(12).toString('base64url'), nbf: t + minMs, exp: t + ttlMs });
    return `${p}.${sign(p)}`;
  }

  /** Checks and USES the token. Returns null when fine, else 'missing' | 'bad' | 'early' | 'expired' | 'used'. */
  function consume(token) {
    if (typeof token !== 'string' || !token) return 'missing';
    const m = /^([A-Za-z0-9_-]{20,300})\.([A-Za-z0-9_-]{32})$/.exec(token);
    if (!m) return 'bad';
    const want = Buffer.from(sign(m[1]));
    const got = Buffer.from(m[2]);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return 'bad';
    let p;
    try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return 'bad'; }
    const t = now();
    if (!p || typeof p.n !== 'string' || !['fc', 'jtm'].includes(p.k)) return 'bad';
    if (t < p.nbf) return 'early';
    if (t > p.exp) return 'expired';
    if (used.has(p.n)) return 'used';
    used.set(p.n, p.exp); // synchronous: two parallel requests with one token cannot both pass
    return null;
  }
  return { issue, consume };
}

/** Sliding-window counter per key (IP). take() counts and answers in one synchronous step. */
export function createWindow({ max: startMax, windowMs, now = () => Date.now() }) {
  let max = startMax;
  const hits = new Map();
  const live = (k) => { const t = now() - windowMs; const a = (hits.get(k) || []).filter((x) => x > t); hits.set(k, a); return a; };
  setInterval(() => { for (const k of hits.keys()) if (!live(k).length) hits.delete(k); }, Math.min(windowMs, 300000)).unref?.();
  return {
    take(k) { const a = live(k); if (a.length >= max) return false; a.push(now()); return true; },
    giveBack(k) { const a = hits.get(k); if (a?.length) a.pop(); },
    count: (k) => live(k).length,
    get max() { return max; },
    setMax(n) { max = n; },
    windowMs,
  };
}
