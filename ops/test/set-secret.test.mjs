// ops/set-secret.mjs: allow-list, format checks, hidden prompt (real pty), masked phone numbers, PEM, --generate,
// --replace guard, --check that never shows or sends a value. No AWS (no --lightsail here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECRETS, maskPhone } from '../set-secret.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'set-secret.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pz-secret-'));
const readEnvFile = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUB = publicKey.export({ type: 'spki', format: 'pem' });
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
const AISENSY = 'eyJhbGciOiJIUzI1NiJ9.FAKEfakeAISENSYkey0123456789.TESTonlySIGNATURE_x';
const PHONES = '9876543210, 9123456789,9876543210';

// type `input` into a real pseudo-terminal running set-secret.mjs; returns the whole terminal transcript
const PTY = `
import os, pty, sys, time, select
script, env_file, data = sys.argv[1], sys.argv[2], sys.argv[3]
args = sys.argv[4:]
pid, fd = pty.fork()
if pid == 0:
    os.environ['PLAY_ENV_FILE'] = env_file
    os.execvp('node', ['node', script] + args)
out = b''
def drain(t):
    global out
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: d = os.read(fd, 4096)
            except OSError: return
            if not d: return
            out += d
drain(1.5)
os.write(fd, data.encode())
drain(0.4)
os.write(fd, b'\\r')
drain(2.0)
os.waitpid(pid, 0)
sys.stdout.buffer.write(out)
`;
function pty(envFile, data, args) {
  const r = spawnSync('python3', ['-I', '-c', PTY, script, envFile, data, ...args], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function run(envFile, args, input) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8', input, env: { ...process.env, PLAY_ENV_FILE: envFile } });
}

test('allow-list only: unknown names are refused', () => {
  const r = run(path.join(tmp(), '.env'), ['ANTHROPIC_API_KEY']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Allowed names: AISENSY_API_KEY, LEADS_PUBLIC_KEY, LINK_HMAC_SECRET, PHONE_PEPPER, MERITTO_API_KEY, WHATSAPP_ALLOWLIST/);
  assert.equal(run(path.join(tmp(), '.env'), ['DATABASE_URL']).status, 1);
});

test('format checks', () => {
  assert.equal(SECRETS.AISENSY_API_KEY.normalize(` ${AISENSY} `), AISENSY);
  assert.throws(() => SECRETS.AISENSY_API_KEY.normalize('short'), /does not look like/);
  assert.throws(() => SECRETS.AISENSY_API_KEY.normalize('has spaces in it 0123456789abcdef'), /does not look like/);
  assert.equal(SECRETS.MERITTO_API_KEY.normalize('mk_live:abcDEF0123456789'), 'mk_live:abcDEF0123456789');
  assert.throws(() => SECRETS.MERITTO_API_KEY.normalize('abc'), /Meritto/);
  assert.throws(() => SECRETS.PHONE_PEPPER.normalize('too short'), /32 characters/);
  assert.equal(SECRETS.WHATSAPP_ALLOWLIST.normalize(PHONES), '9876543210,9123456789');
  for (const bad of ['+919876543210', '98765 43210', '987654321', 'abc', '']) assert.throws(() => SECRETS.WHATSAPP_ALLOWLIST.normalize(bad), /10-digit/, bad);
  assert.equal(maskPhone('9876543210'), '98******10');
  const stored = SECRETS.LEADS_PUBLIC_KEY.normalize(PUB);
  assert.ok(!stored.includes('\n') && stored.includes('\\n'), 'PEM stored on one line with \\n');
  assert.match(SECRETS.LEADS_PUBLIC_KEY.describe(stored), /rsa 2048 bit public key, parses ok/);
  assert.throws(() => SECRETS.LEADS_PUBLIC_KEY.normalize(PRIV), /PRIVATE key/);
  assert.throws(() => SECRETS.LEADS_PUBLIC_KEY.normalize(PUB.replace(/\n[A-Za-z0-9+/]{10}/, '\nXX')), /does not parse|not a PEM/);
});

test('hidden prompt: an AiSensy key never shows in the terminal; .env 0600', () => {
  const f = path.join(tmp(), '.env');
  const t = pty(f, AISENSY, ['AISENSY_API_KEY']);
  assert.match(t, /Paste the AiSensy/);
  assert.match(t, /Saved AISENSY_API_KEY/);
  assert.ok(!t.includes('FAKEfakeAISENSY'), 'no part of the key is echoed');
  assert.equal(readEnvFile(f).AISENSY_API_KEY, AISENSY);
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
});

test('WhatsApp allow-list: typed hidden, printed only masked', () => {
  const f = path.join(tmp(), '.env');
  const t = pty(f, PHONES, ['WHATSAPP_ALLOWLIST']);
  assert.ok(!t.includes('9876543210') && !t.includes('9123456789'), 'no full number on screen');
  assert.match(t, /2 number\(s\): 98\*{6}10, 91\*{6}89/);
  assert.equal(readEnvFile(f).WHATSAPP_ALLOWLIST, '9876543210,9123456789');
  const c = run(f, ['WHATSAPP_ALLOWLIST', '--check']);
  assert.equal(c.status, 0);
  assert.ok(!c.stdout.includes('9876543210'));
  assert.match(c.stdout, /present on \.env, format ok \(2 number\(s\): 98\*{6}10/);
});

test('LEADS_PUBLIC_KEY: multi-line paste at the hidden prompt, and --from-file', () => {
  const f = path.join(tmp(), '.env');
  const body = PUB.trim().split('\n')[1];
  const t = pty(f, PUB.trim().replace(/\n/g, '\r'), ['LEADS_PUBLIC_KEY']);
  assert.match(t, /Saved LEADS_PUBLIC_KEY.*rsa 2048 bit public key/);
  assert.ok(!t.includes(body), 'the key body is not echoed');
  assert.equal(readEnvFile(f).LEADS_PUBLIC_KEY, PUB.trim().replace(/\n/g, '\\n'));

  const f2 = path.join(tmp(), '.env');
  const pem = path.join(tmp(), 'leads_public.pem');
  fs.writeFileSync(pem, PUB);
  const r = run(f2, ['LEADS_PUBLIC_KEY', '--from-file', pem]);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!r.stdout.includes(body));
  assert.match(run(f2, ['LEADS_PUBLIC_KEY', '--check']).stdout, /format ok \(rsa 2048 bit public key, parses ok\)/);

  const priv = path.join(tmp(), 'leads_private.pem');
  fs.writeFileSync(priv, PRIV);
  const bad = run(path.join(tmp(), '.env'), ['LEADS_PUBLIC_KEY', '--from-file', priv]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /PRIVATE key/);
});

test('--generate makes 32-byte hex; a pepper is only replaced with --replace', () => {
  const f = path.join(tmp(), '.env');
  const a = run(f, ['PHONE_PEPPER', '--generate']);
  assert.equal(a.status, 0, a.stdout);
  const first = readEnvFile(f).PHONE_PEPPER;
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.ok(!a.stdout.includes(first), 'the generated value is not printed');
  const again = run(f, ['PHONE_PEPPER', '--generate']);
  assert.equal(again.status, 1);
  assert.match(again.stdout, /already exists.*--replace/);
  assert.equal(readEnvFile(f).PHONE_PEPPER, first, 'unchanged');
  assert.equal(run(f, ['PHONE_PEPPER', '--generate', '--replace']).status, 0);
  assert.notEqual(readEnvFile(f).PHONE_PEPPER, first);
  assert.equal(run(f, ['AISENSY_API_KEY', '--generate']).status, 1, 'no --generate for API keys');
  assert.equal(run(f, ['LINK_HMAC_SECRET', '--generate']).status, 0);
});

test('--check: missing / present, never the value, nothing sent; no TTY = refused', () => {
  const f = path.join(tmp(), '.env');
  const m = run(f, ['AISENSY_API_KEY', '--check']);
  assert.equal(m.status, 1);
  assert.match(m.stdout, /missing on \.env/);
  fs.writeFileSync(f, `AISENSY_API_KEY=${AISENSY}\nMERITTO_API_KEY=bad key\n`, { mode: 0o600 });
  const ok = run(f, ['AISENSY_API_KEY', '--check']);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /present on \.env, format ok .*Nothing was sent anywhere/);
  assert.ok(!ok.stdout.includes(AISENSY));
  assert.match(run(f, ['MERITTO_API_KEY', '--check']).stdout, /format NOT ok/);
  const noTty = run(path.join(tmp(), '.env'), ['AISENSY_API_KEY'], `${AISENSY}\n`);
  assert.equal(noTty.status, 1);
  assert.match(noTty.stdout, /Run this in a terminal/);
  assert.ok(!noTty.stdout.includes(AISENSY) && !noTty.stderr.includes(AISENSY));
});

test('the check path makes no network call (AISENSY --check sends nothing)', () => {
  const src = fs.readFileSync(script, 'utf8');
  assert.ok(!/\bfetch\(|https?:\/\/(?!localhost)/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'set-secret.mjs contains no fetch and no URL');
});

test('--unset removes only that name from .env (0600), and is safe when it is not there', () => {
  const f = path.join(tmp(), '.env');
  fs.writeFileSync(f, `# local\nWHATSAPP_ALLOWLIST=9876543210,9123456789\nCLAUDE_MOCK=1\nAISENSY_API_KEY=${AISENSY}\n`, { mode: 0o644 });
  const r = run(f, ['WHATSAPP_ALLOWLIST', '--unset']);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /Removed WHATSAPP_ALLOWLIST/);
  assert.ok(!r.stdout.includes('9876543210'), 'the value is not printed');
  const env = readEnvFile(f);
  assert.equal(env.WHATSAPP_ALLOWLIST, undefined);
  assert.equal(env.CLAUDE_MOCK, '1');
  assert.equal(env.AISENSY_API_KEY, AISENSY);
  assert.ok(fs.readFileSync(f, 'utf8').startsWith('# local\n'));
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  assert.match(run(f, ['WHATSAPP_ALLOWLIST', '--check']).stdout, /missing on \.env/);
  const again = run(f, ['WHATSAPP_ALLOWLIST', '--unset']);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /was not in/);
  assert.equal(run(path.join(tmp(), 'none.env'), ['MERITTO_API_KEY', '--unset']).status, 0, 'no .env at all is fine');
});

test('--unset of a pepper or link secret needs --replace', () => {
  const f = path.join(tmp(), '.env');
  assert.equal(run(f, ['PHONE_PEPPER', '--generate']).status, 0);
  const r = run(f, ['PHONE_PEPPER', '--unset']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /breaks every phone hash.*--replace/);
  assert.match(readEnvFile(f).PHONE_PEPPER, /^[0-9a-f]{64}$/, 'still there');
  assert.equal(run(f, ['PHONE_PEPPER', '--unset', '--replace']).status, 0);
  assert.equal(readEnvFile(f).PHONE_PEPPER, undefined);
});

test('--unset --lightsail drops the name through redeployWithSettings(remove)', () => {
  const src = fs.readFileSync(path.join(path.dirname(script), 'aws', 'lightsail.mjs'), 'utf8');
  assert.match(src, /export async function redeployWithSettings\(name, patch, \{ remove = \[\] \} = \{\}\)/);
  assert.match(src, /for \(const k of remove\) delete env\[k\];/);
  assert.match(fs.readFileSync(script, 'utf8'), /redeployWithSettings\('web', \{\}, \{ remove: \[name\] \}\)/);
});
