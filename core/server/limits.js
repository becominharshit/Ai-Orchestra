// Rate limits + a fair global queue for Claude-backed routes.
//
//   app.post('/reading', limits.guard(), handler)   // rate check + one in-flight slot (released on response end)
//   app.post('/cheap',   limits.rate(),  handler)   // rate check only
//
// When all MAX_IN_FLIGHT slots are busy the server answers 503 { error:'busy', queue:{ ticket, ahead, retryMs } }.
// The web kit shows "Line mein ho: N log aage" and retries with header x-queue-ticket, so people keep their place.
// Over a rate limit: 429 { error:'slow_down', retryMs, message } with Retry-After (seconds) = retryMs / 1000.
import crypto from 'node:crypto';

export const COPY = {
  busy: 'Abhi bahut log khel rahe hain. Tum line mein ho, bas thoda sa wait.',
  // The wait in the message always matches Retry-After.
  slowDown: (ms) => {
    const s = Math.ceil(ms / 1000);
    const wait = s < 60 ? `${s} second` : `${Math.ceil(s / 60)} minute`;
    return `Itni speed! Thoda saans lo, ${wait} mein phir khelna.`;
  },
};

/** Staff bypass token (cookie pz_staff), derived from ADMIN_KEY so it changes when the key changes. */
export function staffToken(adminKey) {
  return adminKey ? crypto.createHmac('sha256', adminKey).update('pz-staff-v1').digest('base64url') : '';
}
export function isStaff(req, adminKey) {
  const want = staffToken(adminKey);
  if (!want) return false;
  const m = (req.headers?.cookie || '').match(/(?:^|;\s*)pz_staff=([A-Za-z0-9_-]{20,64})/);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionId(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)pz_sid=([A-Za-z0-9_-]{8,64})/);
  return m ? m[1] : null;
}

// Middleware: gives every visitor an anonymous random id cookie (not personal, not a login).
export function sessionCookie() {
  return (req, res, next) => {
    let sid = sessionId(req);
    if (!sid) {
      sid = crypto.randomBytes(12).toString('base64url');
      res.append('Set-Cookie', `pz_sid=${sid}; Path=/; Max-Age=${60 * 60 * 24 * 3}; SameSite=Lax`);
    }
    req.sid = sid;
    next();
  };
}

export function clientIp(req) {
  // The Lightsail load balancer APPENDS the real client IP, so the LAST X-Forwarded-For entry is trustworthy.
  // Earlier entries can be typed by the phone itself (spoofing), so they are ignored.
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.socket?.remoteAddress || 'unknown';
}

class Window {
  constructor(windowMs) { this.windowMs = windowMs; this.hits = new Map(); }
  recent(key, now) {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, arr);
    return arr;
  }
  add(key, now) { this.recent(key, now).push(now); }
  sweep(now) {
    for (const [k, arr] of this.hits) if (!arr.length || now - arr[arr.length - 1] > this.windowMs) this.hits.delete(k);
  }
}

export function createLimits({ config, now = () => Date.now() }) {
  const sessions = new Window(config.limitWindowMs);
  const ips = new Window(config.limitWindowMs);
  const max = config.maxInFlight;
  let inFlight = 0;
  // Waiting tickets, in arrival order. A ticket that is not retried for TICKET_TTL_MS is dropped.
  const waiting = new Map();
  const TICKET_TTL_MS = 9000;
  const stats = { admitted: 0, queued: 0, limited: 0, peakInFlight: 0 };

  const sweepTimer = setInterval(() => { const t = now(); sessions.sweep(t); ips.sweep(t); }, 60000);
  sweepTimer.unref?.();

  // Refused calls are not recorded, so a visitor who keeps tapping does not extend their own wait.
  // retryMs = when the oldest call in the window expires, i.e. exactly when the next call is allowed.
  function checkRate(req) {
    const t = now();
    const sid = req.sid || sessionId(req) || 'nosid';
    const ip = clientIp(req);
    const s = sessions.recent(sid, t);
    const i = ips.recent(ip, t);
    if (s.length >= config.sessionLimit || i.length >= config.ipLimit) {
      const oldest = s.length >= config.sessionLimit ? s[0] : i[0];
      return { ok: false, retryMs: Math.max(1000, config.limitWindowMs - (t - oldest)) };
    }
    sessions.add(sid, t);
    ips.add(ip, t);
    return { ok: true };
  }

  /** Try to take a slot. Returns { ok:true, release } or { ok:false, ticket, ahead, retryMs }. */
  function acquire(ticket) {
    const t = now();
    for (const [k, v] of waiting) if (t - v.seen > TICKET_TTL_MS) waiting.delete(k);
    const free = max - inFlight;
    const order = [...waiting.keys()];
    const idx = ticket && waiting.has(ticket) ? order.indexOf(ticket) : -1;
    const canGo = free > 0 && (waiting.size === 0 || (idx >= 0 && idx < free) || (idx < 0 && waiting.size < free));
    if (canGo) {
      if (idx >= 0) waiting.delete(ticket);
      inFlight += 1;
      stats.admitted += 1;
      stats.peakInFlight = Math.max(stats.peakInFlight, inFlight);
      let released = false;
      return { ok: true, release: () => { if (!released) { released = true; inFlight -= 1; } } };
    }
    let tk = ticket && waiting.has(ticket) ? ticket : null;
    if (!tk) {
      tk = crypto.randomBytes(8).toString('hex');
      waiting.set(tk, { since: t, seen: t });
      stats.queued += 1;
    } else waiting.get(tk).seen = t;
    const ahead = [...waiting.keys()].indexOf(tk);
    // ahead counts the people waiting before you plus the one about to finish, so it never shows 0.
    return { ok: false, ticket: tk, ahead: ahead + 1, retryMs: 1200 + Math.min(ahead, 10) * 150 };
  }

  // Exempt from the rate limit (never from the in-flight queue): counter staff phones with the pz_staff
  // cookie (set from /admin/staff), and ?demo=hero requests, which answer from fixtures and cost nothing.
  const exempt = (req) => isStaff(req, config.adminKey) || req.headers?.['x-pz-demo'] === 'hero';

  function rate() {
    return (req, res, next) => {
      if (exempt(req)) return next();
      const r = checkRate(req);
      if (!r.ok) {
        stats.limited += 1;
        const secs = Math.ceil(r.retryMs / 1000);
        res.set('Retry-After', String(secs));
        return res.status(429).json({ error: 'slow_down', retryMs: secs * 1000, message: COPY.slowDown(secs * 1000) });
      }
      next();
    };
  }

  function guard() {
    const rl = rate();
    return (req, res, next) => {
      const ticket = String(req.headers['x-queue-ticket'] || '').slice(0, 32) || null;
      // Queue retries do not count against the rate limit again.
      const proceed = () => {
        const a = acquire(ticket);
        if (!a.ok) {
          return res.status(503).json({ error: 'busy', queue: { ticket: a.ticket, ahead: a.ahead, retryMs: a.retryMs }, message: COPY.busy });
        }
        res.on('finish', a.release);
        res.on('close', a.release);
        next();
      };
      if (ticket && waiting.has(ticket)) return proceed(); // unknown tickets do not skip the rate check
      rl(req, res, proceed);
    };
  }

  return {
    rate,
    guard,
    acquire,
    checkRate,
    get inFlight() { return inFlight; },
    status: () => ({ inFlight, max, waiting: waiting.size, ...stats }),
    close: () => clearInterval(sweepTimer),
  };
}
