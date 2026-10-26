// Career Studio test helpers: a FAKE AiSensy server (never the real one), test keys, a server with WhatsApp env,
// and a log tap. Dummy numbers only (9000000000 style).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PZ_NO_DOTENV = '1'; // never read the real .env in tests

export const DUMMY = ['9000000001', '9000000002', '9000000003', '9000000004', '9000000005', '9000000006'];

export function tmp(tag = 'pzc') { return fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`)); }

/** RSA test keypair written to a temp dir: { dir, privPath, pubPem, pubEnv } */
export function testKeys() {
  const dir = tmp('pzkeys');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const privPath = path.join(dir, 'play-leads-private.pem');
  fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
  return { dir, privPath, pubPem: publicKey, pubEnv: publicKey.trim().replace(/\n/g, '\\n') };
}

/**
 * Fake AiSensy: records every request body. mode(): 'ok' | 'http500' | 'rejected' | 'drop' (socket closed, no answer)
 * | 'hang' (never answers). drops: how many first requests are dropped before mode() applies.
 */
export async function fakeAiSensy({ mode = () => 'ok', drops = 0 } = {}) {
  const bodies = [];
  let dropped = 0;
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (dropped < drops) { dropped += 1; req.socket.destroy(); return; }
      let body = null;
      try { body = JSON.parse(raw); } catch { body = raw; }
      bodies.push({ url: req.url, method: req.method, headers: req.headers, body });
      const m = mode(body);
      if (m === 'hang') return;
      if (m === 'drop') { req.socket.destroy(); return; }
      if (m === 'http500') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"message":"boom"}'); }
      if (m === 'rejected') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"success":"false"}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: 'true', submitted_message_id: `fake-${bodies.length}` }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/campaign/t1/api/v2`;
  return { url, bodies, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }) };
}

const WA_KEYS = ['WHATSAPP_PDF_ON', 'WHATSAPP_DAILY_CAP', 'WHATSAPP_TOTAL_CAP', 'WHATSAPP_SESSION_CAP', 'WHATSAPP_ALLOWLIST', 'AISENSY_API_KEY', 'AISENSY_API_URL', 'AISENSY_PDF_STUDENT_CAMPAIGN', 'AISENSY_PDF_STUDENT_PARAMS', 'AISENSY_PDF_DOCUMENT', 'AISENSY_TIMEOUT_MS', 'LEADS_PUBLIC_KEY', 'LINK_HMAC_SECRET', 'PHONE_PEPPER', 'ADMIN_KEY', 'PDF_LINK_BASE', 'PLAY_MIN_MS_FC', 'PLAY_MIN_MS_JTM', 'WHATSAPP_IP_LIVE_CAP', 'LEAD_IP_LIMIT', 'STOP_IP_LIMIT'];

/** Starts a core server (mock Claude) with the Career Studio env. Returns the core helper's server + a log tap. */
export async function careerServer(env = {}, overrides = {}) {
  for (const k of WA_KEYS) delete process.env[k];
  Object.assign(process.env, { PHONE_PEPPER: 'p'.repeat(40), LINK_HMAC_SECRET: 's'.repeat(40), ADMIN_KEY: 'test-admin-key', AISENSY_TIMEOUT_MS: '1500', PLAY_MIN_MS_FC: '0', PLAY_MIN_MS_JTM: '0', ...env });
  const { startServer } = await import('../core/helpers.js');
  const logs = tapLogs();
  const s = await startServer({ CLAUDE_MOCK: '1', PZ_QUIET: '0', ...overrides });
  return { ...s, logs, close: async () => { await s.close(); logs.stop(); } };
}

/** Captures every stdout/stderr line while it runs (still prints nothing extra). */
export function tapLogs() {
  const lines = [];
  const ow = process.stdout.write.bind(process.stdout);
  const ew = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c, ...a) => { const t = String(c); lines.push(t); return t.startsWith('{"ts"') ? true : ow(c, ...a); }; // server log lines are kept out of the test output
  process.stderr.write = (c, ...a) => { lines.push(String(c)); return ew(c, ...a); };
  return { lines, stop() { process.stdout.write = ow; process.stderr.write = ew; } };
}

export const post = (base, p, body, { sid = 'testsession0001', headers = {} } = {}) => fetch(base + p, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `pz_sid=${sid}`, ...headers },
  body: JSON.stringify(body),
});

/** A play token, as the phone gets it after opening a forecast preview. */
export async function playToken(base, opts = {}) {
  const r = await post(base, '/api/career/preview', { area: 'computers-coding' }, opts);
  return (await r.json()).playToken;
}
/** POST /lead with a fresh play token (like a phone that just played). */
export async function postLead(base, body, opts = {}) {
  return post(base, '/api/career/lead', { playToken: await playToken(base, opts), ...body }, opts);
}

export const lead = (phone, extra = {}) => ({ firstName: 'Aarav', phone, band: 'class_11_12', area: 'computers-coding', consent: true, consentVersion: 'ideas4-wa-v1', ...extra });

export async function waitFor(fn, ms = 8000) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 60));
  }
}

export async function jobState(base, job) {
  return waitFor(async () => { const s = await (await fetch(`${base}/api/career/wa/status?j=${job}`)).json(); return s.state === 'sent' || s.state === 'batch' ? s : null; });
}
