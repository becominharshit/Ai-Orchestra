#!/usr/bin/env node
// play.zenithschool.ai on AWS Lightsail (Mumbai), the Field App way. Touches ONLY resources named play-*.
// Every AWS call goes through aws() below, which (1) refuses any resource name that does not start with play-,
// and (2) refuses anything that is not a read (get-*) unless the command is one that is allowed to change things.
//
//   node ops/aws/lightsail.mjs plan                                   read-only: what would be made + live monthly prices
//   node ops/aws/lightsail.mjs create --yes-from-avi "<their words>"  makes play-web, play-reel, play-data (paid)
//   node ops/aws/lightsail.mjs cert                                   requests play-cert, writes the DNS PDF for Nalin
//   node ops/aws/lightsail.mjs deploy reel|web [--image play-web:<tag>] [--allow-dirty]   build (linux/amd64), push, deploy,
//        wait for /healthz. Refuses uncommitted files that go into the image unless --allow-dirty.
//   node ops/aws/lightsail.mjs deploy reel|web --dry-run              read-only: the settings a deploy would set (names only)
//   node ops/aws/lightsail.mjs status                                 services, bucket, certificate, /status.json
//   node ops/aws/lightsail.mjs logs web|reel                          last 80 log lines
//   node ops/aws/lightsail.mjs rollback web|reel                      the image of the previous deployment
//   node ops/aws/lightsail.mjs connect                                attach play.zenithschool.ai once play-cert is ISSUED
//   node ops/aws/lightsail.mjs admin                                  copies the /admin link to the clipboard (never printed)
//   node ops/aws/lightsail.mjs teardown --confirm play-teardown [--keep-data]   deletes play-* only
//
// Secrets (ANTHROPIC_API_KEY, ADMIN_KEY, REEL_SHARED_SECRET, bucket keys) are never printed. They live only in the
// container service settings and, for the laptop, in .env (git-ignored).
// TODO(student): add a "cost" command that reads the Lightsail bill so far (aws ce get-cost-and-usage).
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const CONF = JSON.parse(fs.readFileSync(path.join(here, 'environments.json'), 'utf8'));
const REGION = CONF.region;
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------------------------
const NAME_RE = /^play-[a-z0-9][a-z0-9-]*$/;
/** Throws unless the name is one of ours (play-*). Used on every name we send to AWS. */
export function assertOurs(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new Error(`Refusing to touch "${name}": this script only works on play-* resources (never field-*, zenith-*, cf-*).`);
  }
  return name;
}
for (const n of [CONF.web.service, CONF.reel.service, CONF.bucket.name, CONF.bucket.fallbackName, CONF.certificate.name].filter(Boolean)) assertOurs(n);

let writesAllowed = false;
/** Only create, cert, deploy, rollback, connect, teardown and set-claude-key --lightsail call this. */
export function allowWrites() { writesAllowed = true; }
export function writesAreAllowed() { return writesAllowed; }

const NAME_FLAGS = new Set(['--service-name', '--bucket-name', '--certificate-name', '--resource-name']);
const READ_ONLY_OK = new Set(['get-caller-identity']);
/** Checks an aws argument list before it runs. Exported for the guard test. */
export function guardArgs(args) {
  const [svc, sub] = args;
  if (svc === 'sts' && sub === 'get-caller-identity') return;
  if (svc !== 'lightsail') throw new Error(`Refusing "aws ${svc} ${sub}": only Lightsail calls are made here.`);
  const named = [];
  for (let i = 0; i < args.length; i++) if (NAME_FLAGS.has(args[i])) named.push(assertOurs(args[i + 1]));
  const isRead = /^get-/.test(sub) || READ_ONLY_OK.has(sub);
  if (!isRead && !writesAllowed) throw new Error(`Read-only command: refusing "aws lightsail ${sub}". Nothing was changed.`);
  if (!isRead && named.length === 0) throw new Error(`Refusing "aws lightsail ${sub}" without a play-* name on the command line.`);
}

function awsEnv() {
  const env = { ...process.env };
  if (!env.AWS_ACCESS_KEY_ID && !env.AWS_PROFILE) env.AWS_PROFILE = CONF.profile;
  return env;
}
/** Runs one aws CLI call (JSON in, JSON out). stderr is kept for the error message; nothing is echoed. */
export function aws(args, { json = true } = {}) {
  guardArgs(args);
  try {
    const out = execFileSync('aws', [...args, '--region', REGION, ...(json ? ['--output', 'json'] : [])], { encoding: 'utf8', env: awsEnv(), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    return json && out.trim() ? JSON.parse(out) : out;
  } catch (e) {
    const msg = String(e.stderr || e.message || '').trim().split('\n').filter(Boolean).pop() || 'aws call failed';
    const err = new Error(`aws lightsail ${args[1]}: ${msg}`);
    err.awsMessage = msg;
    throw err;
  }
}
const notFound = (e) => /NotFound|does not exist|DoesNotExist/i.test(e.awsMessage || e.message);

function withJsonFile(obj, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-'));
  const f = path.join(dir, 'in.json');
  fs.writeFileSync(f, JSON.stringify(obj), { mode: 0o600 });
  try { return fn(`file://${f}`); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function checkAccount() {
  const id = aws(['sts', 'get-caller-identity']).Account;
  if (CONF.account && id !== CONF.account) throw new Error(`The AWS profile points at account ${id}, not the Zenith account ${CONF.account}. Nothing was changed.`);
  return id;
}

// ---------------------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------------------
export function target(name) {
  const c = CONF[name];
  if (!c || !c.service || !['web', 'reel'].includes(name)) throw new Error(`Unknown service "${name}": use web or reel.`);
  assertOurs(c.service);
  return { name, ...c };
}
export function getService(c) {
  try { return aws(['lightsail', 'get-container-services', '--service-name', c.service]).containerServices[0]; } catch (e) { if (notFound(e)) return null; throw e; }
}
export const currentEnv = (c, svc) => svc?.currentDeployment?.containers?.[c.container]?.environment || {};

function getBucket(name) {
  try { return aws(['lightsail', 'get-buckets', '--bucket-name', name]).buckets[0] || null; } catch (e) { if (notFound(e)) return null; throw e; }
}
/** The bucket we actually use: play-data, or the fallback name if play-data was taken in S3 when it was created. */
export function ourBucket() {
  for (const n of [CONF.bucket.name, CONF.bucket.fallbackName].filter(Boolean)) { const b = getBucket(n); if (b) return b; }
  return null;
}
export function getCert() {
  try { return aws(['lightsail', 'get-certificates', '--certificate-name', CONF.certificate.name, '--include-certificate-details']).certificates?.[0] || null; } catch (e) { if (notFound(e)) return null; throw e; }
}
/** Is a bucket name still free in the global S3 namespace? Anonymous request, no AWS account involved. */
async function s3NameFree(name) {
  try {
    const r = await fetch(`https://${name}.s3.${REGION}.amazonaws.com/`, { signal: AbortSignal.timeout(8000) });
    const body = await r.text();
    if (/NoSuchBucket/.test(body)) return 'free';
    return 'taken by another AWS account';
  } catch { return 'unknown (no network)'; }
}

// ---------------------------------------------------------------------------------------------------------------
// plan (read-only)
// ---------------------------------------------------------------------------------------------------------------
export async function plan() {
  const account = aws(['sts', 'get-caller-identity']).Account;
  const powers = aws(['lightsail', 'get-container-service-powers']).powers;
  const bundles = aws(['lightsail', 'get-bucket-bundles']).bundles;
  const power = (n) => powers.find((p) => p.name === n && p.isActive !== false) || (() => { throw new Error(`No live price for power ${n}`); })();
  const bundle = bundles.find((b) => b.bundleId === CONF.bucket.bundle) || (() => { throw new Error(`No live price for bucket bundle ${CONF.bucket.bundle}`); })();
  const all = aws(['lightsail', 'get-container-services']).containerServices.map((s) => s.containerServiceName);
  const rows = [];
  for (const t of ['web', 'reel']) {
    const c = target(t);
    const p = power(c.power);
    const exists = all.includes(c.service);
    rows.push({ name: c.service, kind: 'container service', size: `${c.power} (${p.cpuCount} vCPU, ${p.ramSizeInGb} GB) x${c.scale}`, now: exists ? 'EXISTS' : 'would create', usd: p.price * c.scale });
  }
  const b = ourBucket();
  rows.push({ name: b?.name || CONF.bucket.name, kind: 'bucket (private)', size: `${bundle.bundleId} (${bundle.storagePerMonthInGb} GB, ${bundle.transferPerMonthInGb} GB transfer)`, now: b ? 'EXISTS' : `would create (S3 name ${await s3NameFree(CONF.bucket.name)})`, usd: bundle.price });
  const cert = getCert();
  rows.push({ name: CONF.certificate.name, kind: 'certificate', size: CONF.certificate.domain, now: cert ? `EXISTS (${cert.certificateDetail?.status})` : 'would request', usd: 0 });

  const total = rows.reduce((s, r) => s + r.usd, 0);
  const pad = (s, n) => String(s).padEnd(n);
  say(`PLAN (read-only: nothing is created). Account ${account}, region ${REGION}, profile ${process.env.AWS_PROFILE || CONF.profile}.`);
  say(`Prices read live just now from "aws lightsail get-container-service-powers" and "get-bucket-bundles".`);
  say('');
  say(`  ${pad('Resource', 18)}${pad('Kind', 20)}${pad('Size', 44)}${pad('Now', 34)}USD/month`);
  for (const r of rows) say(`  ${pad(r.name, 18)}${pad(r.kind, 20)}${pad(r.size, 44)}${pad(r.now, 34)}${r.usd.toFixed(2)}${r.kind === 'certificate' ? ' (Lightsail certificates are free)' : ''}`);
  say(`  ${pad('TOTAL', 116)}${total.toFixed(2)} USD/month`);
  const until = Date.parse('2026-10-29T23:59:59+05:30');
  const days = Math.max(1, Math.ceil((until - Date.now()) / 86400000));
  say('');
  say(`Estimate if everything is deleted on 29 Oct (${days} days from today): about ${(total * days / 30.4).toFixed(2)} USD`);
  say('  (inference: Lightsail prorates monthly prices by the hour; 30.4 days per month. Data transfer above the bundle quota is extra.)');
  const others = all.filter((n) => !n.startsWith('play-'));
  say(`Not touched: ${others.length} other container services (${others.join(', ')}). The script refuses any name that is not play-*.`);
  return { account, rows, total };
}

// ---------------------------------------------------------------------------------------------------------------
// create / cert (paid or DNS-facing: the lead runs these after Avi's yes)
// ---------------------------------------------------------------------------------------------------------------
const tagSafe = (s) => String(s).replace(/[^\p{L}\p{N} +\-=._:/@]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);
function tags(extra = {}) {
  return Object.entries({ ...CONF.tags, ...extra }).map(([key, value]) => `key=${key},value=${tagSafe(value)}`);
}

export async function create(yes) {
  if (!yes || yes.trim().length < 3) throw new Error('create needs Avi\'s written yes: --yes-from-avi "<their words, and when>". Nothing was created.');
  checkAccount();
  allowWrites();
  const t = tags({ 'approved-by-avi': yes });
  say(`Creating the play-* resources on AWS Lightsail (Mumbai). Approval saved on each one: "${tagSafe(yes)}"`);
  for (const name of ['web', 'reel']) {
    const c = target(name);
    if (getService(c)) { say(`  ${c.service}: already there, left as it is.`); continue; }
    aws(['lightsail', 'create-container-service', '--service-name', c.service, '--power', c.power, '--scale', String(c.scale), '--tags', ...t]);
    say(`  ${c.service}: created (${c.power}, ${c.scale} node). It needs a few minutes to start; nothing to wait for now.`);
  }
  if (ourBucket()) say(`  ${ourBucket().name}: already there, left as it is.`);
  else {
    let made = null;
    for (const n of [CONF.bucket.name, CONF.bucket.fallbackName].filter(Boolean)) {
      try {
        aws(['lightsail', 'create-bucket', '--bucket-name', n, '--bundle-id', CONF.bucket.bundle, '--tags', ...t]);
        made = n; break;
      } catch (e) {
        if (/already|exists|taken|not available/i.test(e.awsMessage || '')) { say(`  ${n}: that name is taken, trying ${CONF.bucket.fallbackName} instead.`); continue; }
        throw e;
      }
    }
    if (!made) throw new Error('Could not create the bucket: every name in environments.json is taken. Add another play-* fallbackName.');
    // new Lightsail buckets are private already; this makes it explicit (retried while the bucket is still being set up)
    for (let i = 0; i < 6; i++) {
      try { aws(['lightsail', 'update-bucket', '--bucket-name', made, '--access-rules', 'getObject=private,allowPublicOverrides=false']); break; } catch { await sleep(10000); }
    }
    say(`  ${made}: created (${CONF.bucket.bundle}), private.`);
  }
  say('');
  say('ALL DONE. Next command: node ops/aws/lightsail.mjs cert');
}

export async function cert() {
  checkAccount();
  allowWrites();
  say(`Step 1 of 3: asking AWS for an HTTPS certificate for ${CONF.certificate.domain} ...`);
  const had = getCert();
  if (!had) {
    aws(['lightsail', 'create-certificate', '--certificate-name', CONF.certificate.name, '--domain-name', CONF.certificate.domain, '--tags', ...tags()]);
    say(`  Done: certificate ${CONF.certificate.name} requested.`);
  } else say(`  The certificate was already requested earlier (it is ${had.certificateDetail?.status}). Using it.`);

  say('Step 2 of 3: waiting for AWS to give the DNS records (usually under a minute) ...');
  let records = [];
  for (let i = 0; i < 30; i++) {
    records = dnsRecordsFrom(getCert());
    if (records.length) break;
    await sleep(10000);
    say(`  still waiting (${(i + 1) * 10} s) ...`);
  }
  if (!records.length) throw new Error('AWS has not given the DNS record yet. Nothing is wrong: wait 2 minutes and run the same command again (it will not request a second certificate).');
  // the play-web address exists from the moment the service is created, even while it is still starting up
  const web = getService(target('web'));
  if (!web?.url) say('  Note: play-web does not exist yet, so the second record is marked "not known yet". Run create first, then this command again.');

  say('Step 3 of 3: writing the PDF for Nalin ...');
  const { makeDnsPdf } = await import('./make-dns-pdf.mjs');
  const out = await makeDnsPdf({ validation: records, serviceUrl: web?.url, sample: false });
  say('');
  say('ALL DONE. The PDF for Nalin is here:');
  say(`  ${out.pdf}`);
  say('(The same records as plain text, for WhatsApp or email:');
  say(`  ${out.txt})`);
  say('');
  say('What to do now: send that PDF to Nalin. Once Nalin has added the records, the certificate is usually issued');
  say('within about 30 minutes. Then the lead runs: node ops/aws/lightsail.mjs connect');
  if (process.platform === 'darwin' && process.stdout.isTTY) spawnSync('open', [out.pdf], { stdio: 'ignore' });
}
/** Validation CNAMEs from a get-certificates answer (unique by name). */
export function dnsRecordsFrom(c) {
  const seen = new Map();
  for (const v of c?.certificateDetail?.domainValidationRecords || []) {
    const r = v.resourceRecord;
    if (r?.name && r?.value) seen.set(r.name, { domain: v.domainName, type: r.type || 'CNAME', name: r.name.replace(/\.$/, ''), value: r.value.replace(/\.$/, '') });
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------------------------------------------
// deploy / rollback
// ---------------------------------------------------------------------------------------------------------------
export function gitCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

// Paths of the repo that never go into the play-web image (mirror of .dockerignore). reel uses only reel-worker/.
const NOT_IN_WEB_IMAGE = [/^ops\//, /^docs\//, /^print\//, /^test\//, /^reel-worker\//, /^data\//, /^tmp\//, /^test-results/, /^playwright-report\//, /(^|\/)node_modules\//, /^experiences\/[^/]+\/(data\/(leads|pdfs|whatsapp)|content\/inbox|ops)\//,
  /(^|\/)\.DS_Store$/, /\.log$/, /(^|\/)\.env$/, /(^|\/)\.env\.(?!example$)/, /(^|\/)test\//, /\.test\.m?js$/, /^\.gitignore$/, /^\.dockerignore$/, /^README\.md$/];
/** From `git status --porcelain --untracked-files=all`: the changed or untracked files that would go into this image. */
export function dirtyImageFiles(c, porcelain) {
  const files = String(porcelain).split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
  if (c.context && c.context !== '.') return files.filter((f) => f.startsWith(`${c.context.replace(/\/$/, '')}/`));
  return files.filter((f) => !NOT_IN_WEB_IMAGE.some((re) => re.test(f)));
}
/** The commit that describes what will be built: HEAD, or "<sha6>-dirty" with --allow-dirty. Refuses a dirty tree otherwise. */
export function imageSourceCommit(c, allowDirty, { git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  const head = process.env.GIT_COMMIT || git(['rev-parse', 'HEAD']).trim();
  const dirty = dirtyImageFiles(c, git(['status', '--porcelain', '--untracked-files=all']));
  if (!dirty.length) return head;
  const list = dirty.slice(0, 10).join(', ') + (dirty.length > 10 ? ` and ${dirty.length - 10} more` : '');
  if (!allowDirty) throw new Error(`Not deploying: ${dirty.length} file(s) that go into the ${c.service} image are not committed (${list}). Commit them first, so GIT_COMMIT describes the image, or add --allow-dirty.`);
  say(`WARNING: deploying uncommitted files (${list}); GIT_COMMIT will say "${head.slice(0, 6)}-dirty".`);
  return `${head.slice(0, 6)}-dirty`;
}
/** --image: only this service's own images (play-web:..., play-reel:...), and the commit comes from the image label. */
export function imageCommit(c, tag, { inspect = (t) => execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "play.commit" }}', t], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } = {}) {
  if (!new RegExp(`^${c.service}(:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?$`).test(String(tag))) throw new Error(`Refusing --image "${tag}": only ${c.service} images (${c.service}:<tag>) go into ${c.service}.`);
  let commit = '';
  try { commit = inspect(tag); } catch { throw new Error(`Image ${tag} is not on this Mac.`); }
  if (!commit || commit === '<no value>') throw new Error(`Image ${tag} has no play.commit label: build it with "deploy ${c.name}" (without --image).`);
  return { tag, commit };
}

function build(c, commit) {
  const dockerfile = path.join(ROOT, c.dockerfile);
  if (!fs.existsSync(dockerfile)) throw new Error(`${c.dockerfile} does not exist yet${c.name === 'reel' ? ' (TASK-04 delivers it)' : ''}.`);
  const tag = `${c.service}:${commit.slice(0, 12) || Date.now()}`;
  say(`Building ${tag} for linux/amd64 from ${c.dockerfile} ...`);
  const b = spawnSync('docker', ['build', '--platform', 'linux/amd64', '--provenance=false', '--build-arg', `GIT_COMMIT=${commit}`, '--label', `play.commit=${commit}`, '-f', dockerfile, '-t', tag, path.join(ROOT, c.context)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (b.status !== 0) throw new Error('docker build failed');
  return { tag, commit };
}

/** Push a local image to the service's image store; returns the name to deploy (":play-web.web-abc1234.1"). */
function push(c, localTag, label) {
  guardArgs(['lightsail', 'push-container-image', '--service-name', c.service]);
  say(`Pushing ${localTag} to ${c.service} (label ${label}) ...`);
  const out = execFileSync('aws', ['lightsail', 'push-container-image', '--region', REGION, '--service-name', c.service, '--label', label, '--image', localTag], { encoding: 'utf8', env: awsEnv(), stdio: ['ignore', 'pipe', 'inherit'] });
  const m = out.match(/":?(play-(?:web|reel)\.[\w-]+\.\d+)"/) || out.match(/:(play-(?:web|reel)\.[\w-]+\.\d+)/);
  if (!m) throw new Error('Could not read the pushed image name from push-container-image.');
  return `:${m[1]}`;
}

async function waitReady(c) {
  for (let i = 0; i < 80; i++) {
    const s = getService(c);
    if (!s) throw new Error(`${c.service} does not exist: run "create" first (after Avi's yes).`);
    if (['READY', 'RUNNING'].includes(s.state)) return s;
    if (['DISABLED', 'DELETING'].includes(s.state)) throw new Error(`${c.service} is ${s.state}.`);
    say(`  ${c.service} is ${s.state}, waiting ...`);
    await sleep(15000);
  }
  throw new Error(`${c.service} did not become READY in 20 minutes.`);
}

/** Shared secrets: the live web value wins, then the live reel value, then the laptop .env, then a new random one. */
export function readDotEnv(file = path.join(ROOT, '.env')) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
export function sharedSecrets() {
  const web = currentEnv(CONF.web, getService(target('web')));
  const reel = currentEnv(CONF.reel, getService(target('reel')));
  const local = readDotEnv();
  const pick = (k) => web[k] || reel[k] || local[k] || randomBytes(24).toString('hex');
  return { ADMIN_KEY: web.ADMIN_KEY || local.ADMIN_KEY || randomBytes(24).toString('hex'), REEL_SHARED_SECRET: pick('REEL_SHARED_SECRET') };
}

/**
 * The bucket key for play-web. A Lightsail bucket holds at most 2 access keys and shows a secret only once, so:
 *  1. keep the key of the live deployment;
 *  2. else reuse a key that an earlier (for example FAILED) deployment of this service already carries, if AWS still has it;
 *  3. else, if 2 keys exist, delete the oldest one that no deployment uses, then create one. Never a third.
 * call/log are injectable for the test (ops/test/bucket-keys.test.mjs).
 */
export function bucketKeys(old, { dry = false, bucket, service, call = aws, log = say } = {}) {
  if (old.BUCKET_KEY_ID && old.BUCKET_KEY_SECRET) return { BUCKET_KEY_ID: old.BUCKET_KEY_ID, BUCKET_KEY_SECRET: old.BUCKET_KEY_SECRET };
  if (!bucket) return {};
  const existing = call(['lightsail', 'get-bucket-access-keys', '--bucket-name', bucket]).accessKeys || [];
  const ids = new Set(existing.map((k) => k.accessKeyId));
  const deps = service ? (call(['lightsail', 'get-container-service-deployments', '--service-name', service]).deployments || []) : [];
  const used = new Set();
  for (const d of [...deps].sort((a, b) => b.version - a.version)) {
    for (const ct of Object.values(d.containers || {})) {
      const e = ct.environment || {};
      if (e.BUCKET_KEY_ID) used.add(e.BUCKET_KEY_ID);
      if (e.BUCKET_KEY_ID && e.BUCKET_KEY_SECRET && ids.has(e.BUCKET_KEY_ID)) {
        log(`Reusing the bucket key of ${service} deployment ${d.version} (${d.state}); no new key made.`);
        return { BUCKET_KEY_ID: e.BUCKET_KEY_ID, BUCKET_KEY_SECRET: e.BUCKET_KEY_SECRET };
      }
    }
  }
  if (dry) return { BUCKET_KEY_ID: `(would be made; ${existing.length} of 2 keys exist)`, BUCKET_KEY_SECRET: '(would be made)' };
  if (existing.length >= 2) {
    const spare = existing.filter((k) => !used.has(k.accessKeyId) && k.accessKeyId !== old.BUCKET_KEY_ID).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (!spare) throw new Error(`${bucket} already has 2 access keys and both are named in a deployment. Nothing was changed; delete one by hand in the Lightsail console.`);
    call(['lightsail', 'delete-bucket-access-key', '--bucket-name', bucket, '--access-key-id', spare.accessKeyId]);
    log(`${bucket} had 2 access keys and the live site uses neither: deleted the oldest unused one (made ${spare.createdAt}).`);
    const left = call(['lightsail', 'get-bucket-access-keys', '--bucket-name', bucket]).accessKeys || [];
    if (left.length >= 2) throw new Error(`${bucket} still has 2 access keys. Nothing more was changed.`);
  }
  const k = call(['lightsail', 'create-bucket-access-key', '--bucket-name', bucket]).accessKey;
  return { BUCKET_KEY_ID: k.accessKeyId, BUCKET_KEY_SECRET: k.secretAccessKey };
}

/** The settings for one deployment: plain ones from environments.json, secrets kept from the live deployment. */
function settingsFor(c, svc, commit, dry = false) {
  const old = currentEnv(c, svc);
  const s = sharedSecrets();
  let env;
  if (c.name === 'web') {
    const reel = getService(target('reel'));
    const b = ourBucket();
    const keys = b ? bucketKeys(old, { dry, bucket: b.name, service: c.service }) : {};
    env = {
      ...c.settings,
      ADMIN_KEY: s.ADMIN_KEY,
      REEL_SHARED_SECRET: s.REEL_SHARED_SECRET,
      REEL_WORKER_URL: (reel?.url || old.REEL_WORKER_URL || '').replace(/\/$/, ''),
      ...(b ? { BUCKET_NAME: b.name, BUCKET_REGION: REGION, ...keys } : {}), // core passes BUCKET_KEY_* to the S3 client itself
      GIT_COMMIT: commit || old.GIT_COMMIT || '',
    };
  } else {
    env = { ...c.settings, REEL_SHARED_SECRET: s.REEL_SHARED_SECRET, GIT_COMMIT: commit || old.GIT_COMMIT || '' };
  }
  // anything set later by hand or by ops/set-claude-key.mjs (ANTHROPIC_API_KEY ...) is kept as it is
  for (const [k, v] of Object.entries(old)) if (!(k in env) && !/^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|REGION)$/.test(k)) env[k] = v;
  for (const k of Object.keys(env)) if (env[k] === undefined || env[k] === null || env[k] === '') delete env[k];
  return env;
}

/** Starts a deployment and waits until it is ACTIVE and answers. Never prints the environment. */
export async function deployAndWait(c, containers, publicEndpoint, commit) {
  const input = { serviceName: c.service, containers, publicEndpoint };
  const out = withJsonFile(input, (f) => aws(['lightsail', 'create-container-service-deployment', '--service-name', c.service, '--cli-input-json', f]));
  const version = out.containerService.nextDeployment?.version;
  say(`${c.service}: deployment ${version} started (settings set without printing them).`);
  const t0 = Date.now();
  for (;;) {
    await sleep(15000);
    const s = getService(c);
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    if (s.currentDeployment?.version === version && s.currentDeployment.state === 'ACTIVE' && !s.nextDeployment) {
      say(`Live after ${mins} min: ${s.url}`);
      await waitWorking(c, s.url, commit);
      return s;
    }
    if (s.nextDeployment?.state === 'FAILED' || (s.currentDeployment?.version === version && s.currentDeployment.state === 'FAILED')) throw new Error(`Deployment failed: run "node ops/aws/lightsail.mjs logs ${c.name}". The previous version stays live.`);
    if (!s.nextDeployment && s.currentDeployment?.version !== version) throw new Error(`Deployment ${version} was cancelled (the previous version stays live): run "node ops/aws/lightsail.mjs logs ${c.name}".`);
    if (Date.now() - t0 > 25 * 60000) throw new Error('Still not live after 25 minutes.');
    say(`  waiting (${mins} min): ${s.nextDeployment?.state || s.currentDeployment?.state}`);
  }
}

function endpointFor(c) {
  return { containerName: c.container, containerPort: c.port, healthCheck: { path: c.healthPath, intervalSeconds: 10, timeoutSeconds: 5, healthyThreshold: 2, unhealthyThreshold: 5, successCodes: '200' } };
}

async function waitWorking(c, url, commit) {
  const want = (commit || '').slice(0, 7);
  for (let i = 0; i < 30; i++) {
    try {
      const h = await fetch(new URL(c.healthPath, url), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (h.ok && !c.statusPath) { say(`${c.service}: ${c.healthPath} answers 200.`); return; }
      if (h.ok) {
        const s = await (await fetch(new URL(c.statusPath, url), { cache: 'no-store', signal: AbortSignal.timeout(8000) })).json();
        const got = String(s.commit || '');
        if (want && got && !got.startsWith(want) && !want.startsWith(got.slice(0, 7))) say(`  the old copy still answers (build ${got}); waiting for ${want}`);
        else { say(`Everything is working: version ${s.version ?? '?'}, build ${got || '?'}, claude ${s.claude ?? "?"}, demo ${s.demo ?? "?"}, spend ${s.spentUsd ?? "?"} of cap ${s.capUsd ?? "?"} USD.`); return s; }
      } else say(`  ${c.healthPath} answered ${h.status}`);
    } catch (e) { say(`  not answering yet (${e.message})`); }
    await sleep(6000);
  }
  throw new Error(`${c.service} is live but ${c.healthPath} / ${c.statusPath || ''} does not answer properly.`);
}

export async function deploy(name, args) {
  const c = target(name);
  checkAccount();
  if (args.dryRun) {
    // read-only rehearsal: which settings the deployment would get (names only), nothing built, pushed or changed
    const svc = getService(c);
    if (!svc) throw new Error(`${c.service} does not exist yet.`);
    const env = settingsFor(c, svc, gitCommit(), true);
    say(`${c.service} is ${svc.state}. A deploy would build ${c.dockerfile} (linux/amd64), push it and set these settings (values not shown):`);
    say(`  ${Object.keys(env).sort().join(', ')}`);
    if (name === 'web') say(`  REEL_WORKER_URL: ${env.REEL_WORKER_URL || '(empty: play-reel has no URL yet)'}`);
    try { say(`  image source: ${imageSourceCommit(c, false)} (clean, would be GIT_COMMIT)`); } catch (e) { say(`  image source: ${e.message}`); }
    return;
  }
  // checks first (dirty tree, --image), then the build: all before anything on AWS changes
  const { tag: localTag, commit } = args.image ? imageCommit(c, args.image) : build(c, imageSourceCommit(c, args.allowDirty));
  allowWrites();
  const svc = await waitReady(c);
  if (name === 'web' && !getService(target('reel'))?.currentDeployment) say('Note: play-reel has no deployment yet, so REEL_WORKER_URL stays empty. Deploy reel first, then web again.');
  const label = `${name}-${(commit.endsWith('-dirty') ? commit : commit.slice(0, 7)).replace(/[^a-z0-9-]/g, '') || 'manual'}`;
  const image = push(c, localTag, label);
  const env = settingsFor(c, svc, commit);
  await deployAndWait(c, { [c.container]: { image, environment: env, ports: { [c.port]: 'HTTP' } } }, endpointFor(c), commit);
}

/** Same image, settings changed (ops/set-claude-key.mjs, ops/set-secret.mjs). Values are never printed; remove drops names. */
export async function redeployWithSettings(name, patch, { remove = [] } = {}) {
  const c = target(name);
  checkAccount();
  allowWrites();
  let svc = getService(c);
  // another deployment in flight (DEPLOYING/UPDATING): wait for it rather than skip, up to 15 min
  for (const until = Date.now() + 15 * 60_000; svc && svc.state !== 'RUNNING' && /^(DEPLOYING|UPDATING|PENDING)$/.test(svc.state) && Date.now() < until;) {
    say(`${c.service} is ${svc.state}; waiting for it to be RUNNING before changing settings ...`);
    await sleep(20000);
    svc = getService(c);
  }
  const cur = svc?.currentDeployment?.containers?.[c.container];
  if (!cur) throw new Error(`${c.service} has no live deployment yet: run "deploy ${name}" first. Nothing changed.`);
  if (svc.state !== 'RUNNING') throw new Error(`${c.service} is ${svc.state}; try again when it is RUNNING. Nothing changed.`);
  const env = { ...cur.environment, ...patch };
  for (const k of remove) delete env[k]; // used by ops/set-secret.mjs --unset
  return deployAndWait(c, { [c.container]: { image: cur.image, environment: env, ports: cur.ports } }, svc.currentDeployment.publicEndpoint, env.GIT_COMMIT);
}

export async function rollback(name) {
  const c = target(name);
  checkAccount();
  allowWrites();
  const deps = aws(['lightsail', 'get-container-service-deployments', '--service-name', c.service]).deployments || [];
  const svc = getService(c);
  const cur = svc?.currentDeployment;
  if (!cur) throw new Error(`${c.service} has no live deployment.`);
  const prev = deps.filter((d) => d.version < cur.version && d.state !== 'FAILED').sort((a, b) => b.version - a.version)[0];
  if (!prev) throw new Error('No earlier deployment to go back to.');
  const image = prev.containers[c.container].image;
  say(`Rolling ${c.service} back from deployment ${cur.version} to the image of deployment ${prev.version} (${image}), keeping today's settings.`);
  const env = currentEnv(c, svc);
  await deployAndWait(c, { [c.container]: { image, environment: { ...env, GIT_COMMIT: prev.containers[c.container].environment?.GIT_COMMIT || '' }, ports: cur.containers[c.container].ports } }, cur.publicEndpoint, prev.containers[c.container].environment?.GIT_COMMIT);
}

// ---------------------------------------------------------------------------------------------------------------
// status / logs / connect / admin / teardown
// ---------------------------------------------------------------------------------------------------------------
export async function status() {
  for (const name of ['web', 'reel']) {
    const c = target(name);
    const s = getService(c);
    if (!s) { say(`${c.service}: not created`); continue; }
    say(`${c.service}: ${s.state}, ${s.power} x${s.scale}, ${s.url}`);
    say(`  live deployment ${s.currentDeployment?.version ?? 'none'} ${s.currentDeployment?.containers?.[c.container]?.image || ''}${s.nextDeployment ? `, next ${s.nextDeployment.version} ${s.nextDeployment.state}` : ''}`);
    const env = currentEnv(c, s);
    const set = (name === 'web' ? ['ANTHROPIC_API_KEY', 'ADMIN_KEY', 'REEL_SHARED_SECRET', 'BUCKET_KEY_ID', 'REEL_WORKER_URL'] : ['REEL_SHARED_SECRET']).map((k) => `${k} ${env[k] ? 'set' : 'MISSING'}`);
    say(`  settings: ${set.join(', ')} (values never shown)`);
    if (Object.keys(s.publicDomainNames || {}).length) say(`  domains: ${JSON.stringify(s.publicDomainNames)}`);
    if (s.currentDeployment) {
      try {
        const h = await fetch(new URL(c.healthPath, s.url), { signal: AbortSignal.timeout(8000) });
        say(`  ${c.healthPath}: ${h.status}`);
        if (c.statusPath) { const st = await (await fetch(new URL(c.statusPath, s.url), { signal: AbortSignal.timeout(8000) })).json(); say(`  ${c.statusPath}: ok ${st.ok}, version ${st.version}, build ${st.commit}, claude ${st.claude}, demo ${st.demo}, spend ${st.spentUsd} of ${st.capUsd} USD`); }
      } catch (e) { say(`  no answer (${e.message})`); }
    }
  }
  const b = ourBucket();
  say(b ? `${b.name}: ${b.state?.code}, ${b.bundleId}, objects private: ${b.accessRules?.getObject === 'private'}` : `${CONF.bucket.name}: not created`);
  const ce = getCert();
  say(ce ? `${CONF.certificate.name} (${CONF.certificate.domain}): ${ce.certificateDetail?.status}` : `${CONF.certificate.name}: not requested`);
}

export function logs(name) {
  const c = target(name);
  const l = aws(['lightsail', 'get-container-log', '--service-name', c.service, '--container-name', c.container]).logEvents || [];
  for (const e of l.slice(-80)) say(`${e.createdAt} ${e.message}`);
}

export function connect() {
  const c = target('web');
  checkAccount();
  allowWrites();
  const ce = getCert();
  const st = ce?.certificateDetail?.status;
  if (st !== 'ISSUED') { say(`${CONF.certificate.name} is ${st || 'not requested'}: Nalin's DNS records are not live yet (docs/DNS_RECORDS_FOR_NALIN_PLAY.pdf). Nothing changed.`); return; }
  aws(['lightsail', 'update-container-service', '--service-name', c.service, '--public-domain-names', JSON.stringify({ [CONF.certificate.name]: [CONF.certificate.domain] })]);
  say(`${CONF.certificate.domain} attached to ${c.service}. Try https://${CONF.certificate.domain}/healthz in a few minutes.`);
}

export function admin() {
  const c = target('web');
  const s = getService(c);
  const key = currentEnv(c, s).ADMIN_KEY;
  if (!key) { say('play-web has no ADMIN_KEY yet (deploy web first).'); return; }
  const host = Object.values(s.publicDomainNames || {}).flat()[0] ? `https://${CONF.domain}` : String(s.url).replace(/\/$/, '');
  const r = spawnSync('pbcopy', [], { input: `${host}/admin?key=${key}` });
  say(r.status === 0 ? `The admin link for ${host}/admin is on the clipboard (not shown). Paste it in the browser.` : 'Could not use the clipboard (pbcopy). Nothing shown.');
}

export async function teardown(confirm, keepData) {
  if (confirm !== 'play-teardown') throw new Error('teardown deletes the play-* resources: add --confirm play-teardown. Nothing was deleted.');
  checkAccount();
  allowWrites();
  for (const name of ['web', 'reel']) {
    const c = target(name);
    if (!getService(c)) { say(`${c.service}: already gone.`); continue; }
    aws(['lightsail', 'delete-container-service', '--service-name', c.service]);
    say(`${c.service}: deleting.`);
  }
  const b = ourBucket();
  if (b && !keepData) { aws(['lightsail', 'delete-bucket', '--bucket-name', b.name, '--force-delete']); say(`${b.name}: deleted (with the counters snapshot; export it first with npm run stats if needed).`); }
  else if (b) say(`${b.name}: kept (--keep-data).`);
  for (let i = 0; i < 20 && getCert(); i++) {
    try { aws(['lightsail', 'delete-certificate', '--certificate-name', CONF.certificate.name]); say(`${CONF.certificate.name}: deleted.`); break; } catch (e) {
      say(`  certificate still in use while the service is deleting (${e.awsMessage}); retrying ...`);
      await sleep(15000);
    }
  }
  say('Done. Ask Nalin to remove the play and the _xxxx.play CNAME records (they are harmless if left).');
}

// ---------------------------------------------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, tgt, ...rest] = process.argv.slice(2);
  const argv = [tgt, ...rest].filter((x) => x !== undefined);
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const run = {
    plan: () => plan(),
    create: () => create(flag('--yes-from-avi')),
    cert: () => cert(),
    deploy: () => deploy(tgt, { image: flag('--image'), dryRun: argv.includes('--dry-run'), allowDirty: argv.includes('--allow-dirty') }),
    status: () => status(),
    logs: () => logs(tgt),
    rollback: () => rollback(tgt),
    connect: () => connect(),
    admin: () => admin(),
    teardown: () => teardown(flag('--confirm'), argv.includes('--keep-data')),
  }[cmd];
  if (!run) { say('Use: plan | create --yes-from-avi "<text>" | cert | deploy reel|web [--image play-web:<tag>] [--allow-dirty] [--dry-run] | status | logs web|reel | rollback web|reel | connect | admin | teardown --confirm play-teardown [--keep-data]'); process.exit(1); }
  Promise.resolve().then(run).catch((e) => {
    const m = String(e.message || e);
    if (/credentials|ExpiredToken|InvalidClientTokenId|SignatureDoesNotMatch|could not be found|Unable to locate|SSO/i.test(m)) console.error(`AWS sign-in did not work for profile "${process.env.AWS_PROFILE || CONF.profile}". Sign in again (aws sso login --profile ${CONF.profile}, or check ~/.aws), then run the same command again.\n(${m})`);
    else console.error(`STOPPED: ${m}`);
    console.error('Running the same command again is safe: it skips anything that already exists.');
    process.exit(1);
  });
}
