// Central config. Every env var the core reads is listed here and in .env.example.
// Reading order: real environment first, then a local .env file (git-ignored), then defaults.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

// Tiny .env loader (no dependency). Never prints values.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim(); // inline comments on unquoted values
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
// Never inside a test process (node --test sets NODE_TEST_CONTEXT, Playwright sets TEST_WORKER_INDEX) or with PZ_NO_DOTENV=1:
// the repo .env holds the real keys, and no test may read them (CHECK-20 F7).
export const IN_TEST = !!(process.env.NODE_TEST_CONTEXT || process.env.TEST_WORKER_INDEX || process.env.PZ_IN_TEST === '1');
export let dotenvLoaded = false;
if (process.env.PZ_NO_DOTENV !== '1' && !IN_TEST) { loadDotEnv(path.join(ROOT, '.env')); dotenvLoaded = true; }

const flag = (v) => v === '1' || v === 'true' || v === 'yes';
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

function readCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT.slice(0, 12);
  try {
    const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head.slice(0, 12);
    const ref = head.slice(5).trim();
    const refFile = path.join(ROOT, '.git', ref);
    if (fs.existsSync(refFile)) return fs.readFileSync(refFile, 'utf8').trim().slice(0, 12);
    const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
    const hit = packed.split('\n').find((l) => l.endsWith(' ' + ref));
    return hit ? hit.slice(0, 12) : 'unknown';
  } catch {
    return 'unknown';
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// The 5 stall experiences, in hub order (= counter order). Counter map v2 (matches the print standees, TASK-08):
// 1-2 jyotish, 3 career, 4 shark, 5 reel, 6 asli.
// Counter map v4 (BRAIN 24 Oct 19:40, TASK-20). Flags decide counters 2 and 4:
//   1 AI Jyotish · 2 AI Startup Studio (STARTUP_STUDIO=1; else AI Jyotish) · 3 AI Sharks · 4 Build Your Own AI Agent
//   (AGENT_BUILDER=1; else Career Studio) · 5 Career Studio · 6 Squad Reel Studio · 7 AI ya Asli? · 8 AI Jyotish.
// Live Projects is not a counter. Old ?c= values stay harmless: the experience comes from the path.
const BASE = {
  jyotish: { id: 'jyotish', name: 'AI Jyotish', hook: 'Haath dikhao. AI batayega tum kaun ho.', forFun: true, icon: 'palm' },
  startup: { id: 'startup', name: 'AI Startup Studio', hook: 'Apni startup, 90 second mein.', forFun: false, icon: 'rocket', flag: 'STARTUP_STUDIO' },
  shark: { id: 'shark', name: 'AI Sharks', hook: '4 cards ka pitch. 3 sharks. Deal ya out?', forFun: true, icon: 'chart' },
  agent: { id: 'agent', name: 'Build Your Own AI Agent', hook: 'Apna AI agent banao.', forFun: false, icon: 'brain', flag: 'AGENT_BUILDER' },
  career: { id: 'career', name: 'Career Studio', hook: 'Tumhara dream job 2030 mein kaisa dikhega? Khelo aur dekho.', forFun: false, icon: 'compass' },
  reel: { id: 'reel', name: 'Squad Reel Studio', hook: 'Squad lao, 3 shots lo. AI agents reel bana denge.', forFun: false, icon: 'film' },
  asli: { id: 'asli', name: 'AI ya Asli?', hook: 'AI ne banaya ya asli hai? 60 second mein pakdo.', forFun: false, icon: 'eye' },
};
/** Experiences that exist only when their flag is on (default off); the loader skips them otherwise. */
export const FLAGGED = Object.freeze({ startup: 'STARTUP_STUDIO', agent: 'AGENT_BUILDER' });
/** The experiences and their counters for these flags (counter map v4). */
export function experiencesFor({ startupStudio = false, agentBuilder = false } = {}) {
  const at = { 1: 'jyotish', 2: startupStudio ? 'startup' : 'jyotish', 3: 'shark', 4: agentBuilder ? 'agent' : 'career', 5: 'career', 6: 'reel', 7: 'asli', 8: 'jyotish' };
  const order = ['jyotish', ...(startupStudio ? ['startup'] : []), 'shark', ...(agentBuilder ? ['agent'] : []), 'career', 'reel', 'asli'];
  return order.map((id) => {
    const { flag: _f, ...e } = BASE[id];
    return { ...e, counters: Object.entries(at).filter(([, x]) => x === id).map(([c]) => Number(c)) };
  });
}
/** Counter map v4 with both flags off (the default), kept for older imports. */
export const EXPERIENCES = experiencesFor();
export const COUNTER_MAP = Object.freeze(Object.fromEntries(EXPERIENCES.flatMap((e) => e.counters.map((c) => [c, e.id]))));
export const counterMapOf = (experiences) => Object.freeze(Object.fromEntries(experiences.flatMap((e) => e.counters.map((c) => [c, e.id]))));

export function makeConfig(overrides = {}) {
  const env = { ...process.env, ...overrides };
  const offline = flag(env.OFFLINE);
  const cfg = {
    version: pkg.version,
    commit: readCommit(),
    port: num(env.PORT, 8790),
    host: env.HOST || '0.0.0.0',
    publicUrl: (env.PUBLIC_URL || 'https://play.zenithschool.ai').replace(/\/$/, ''),
    production: env.NODE_ENV === 'production',

    // Claude
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-opus-5-5',
    mock: flag(env.CLAUDE_MOCK),
    mockLatencyMs: num(env.CLAUDE_MOCK_LATENCY_MS, 900),
    demoMode: flag(env.DEMO_MODE) || offline,
    offline,
    claudeTimeoutMs: num(env.CLAUDE_TIMEOUT_MS, 25000),
    careLiveTimeoutMs: num(env.CARE_LIVE_TIMEOUT_MS, 6000), // CHECK-21 L1: a line that times out fails closed
    spendRestoreRetryMs: num(env.SPEND_RESTORE_RETRY_MS, 10000), // N21b: retry reading the spend meter from the bucket
    spendRestoreAlertMs: num(env.SPEND_RESTORE_ALERT_MS, 60000), // then a staff alert
    spendUnknownCapUsd: num(env.SPEND_UNKNOWN_CAP_USD, 75), // bucket unreadable AND no local total: this cap until the bucket loads
    staffPairTtlMs: num(env.STAFF_PAIR_TTL_MS, 10 * 60 * 1000), // staff pairing codes (/admin -> /staff) // the live crisis check's deadline; then the rules decide
    spendCapUsd: num(env.SPEND_CAP_USD, 300),
    // per-experience daily budgets (TASK-20): BUDGET_USD_<EXP>=<usd per IST day>, e.g. BUDGET_USD_STARTUP=40. Unset = no budget; 0 = banked answers only, no model calls (safety calls still run).
    budgets: Object.fromEntries(Object.entries(env).filter(([k, v]) => /^BUDGET_USD_[A-Z0-9_]{1,31}$/.test(k) && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0).map(([k, v]) => [k.slice(11).toLowerCase(), Number(v)])),
    // USD per million tokens. Opus 5.5: $4 in / $20 out. Cache reads and writes are priced too.
    prices: {
      'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
      default: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
    },

    // Limits (generous per IP because Indian mobile CGNAT puts many phones behind one IP)
    maxInFlight: num(env.MAX_IN_FLIGHT, 30),
    sessionLimit: num(env.SESSION_LIMIT, 40), // Claude-backed calls per session per window (staff phones: pz_staff cookie)
    ipLimit: num(env.IP_LIMIT, 400), // per IP per window
    limitWindowMs: num(env.LIMIT_WINDOW_MS, 10 * 60 * 1000),

    // Data and analytics
    dataDir: path.resolve(ROOT, env.DATA_DIR || './data'),
    bucketName: offline ? '' : env.BUCKET_NAME || '',
    bucketRegion: env.BUCKET_REGION || 'ap-south-1',
    bucketKeyId: env.BUCKET_KEY_ID || '',
    bucketKeySecret: env.BUCKET_KEY_SECRET || '',
    snapshotMs: num(env.SNAPSHOT_MS, 30000),
    adminKey: env.ADMIN_KEY || '',
    // The one public hero line (hub, TV About card, share cards). Avi may change it: set PUBLIC_HERO_LINE, no code change.
    publicHeroLine: env.PUBLIC_HERO_LINE || 'Zenith first-years ne AI agents ke saath banaye',
    publicHeroLineHi: env.PUBLIC_HERO_LINE_HI || 'Zenith first-years x AI agents', // short form where space is tight
    // Public text rule (CONTRACT 13.2, CHECK_build 13): ON unless PUBLIC_TEXT_STRICT=0 is set explicitly.
    // On: untemplated TV text and non-publicText share-card lines are dropped (with a count-only warning).
    publicTextStrict: env.PUBLIC_TEXT_STRICT === undefined || env.PUBLIC_TEXT_STRICT === '' ? true : flag(env.PUBLIC_TEXT_STRICT),
    // Stage mode (CONTRACT 12): all on unless set to 0
    stage: { loop: env.STAGE_LOOP !== '0', queue: env.STAGE_QUEUE !== '0', anchor: env.STAGE_ANCHOR !== '0', reward: env.STAGE_REWARD !== '0', minTurnMs: Math.max(0, Number(env.STAGE_MIN_TURN_S ?? 20)) * 1000 },
    reelWorkerUrl: (env.REEL_WORKER_URL || '').replace(/\/$/, ''),

    flags: { startupStudio: flag(env.STARTUP_STUDIO), agentBuilder: flag(env.AGENT_BUILDER) },
    experiences: experiencesFor({ startupStudio: flag(env.STARTUP_STUDIO), agentBuilder: flag(env.AGENT_BUILDER) }),
    root: ROOT,
  };
  return cfg;
}
