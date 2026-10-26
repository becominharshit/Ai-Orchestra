// The key script must never echo the key. A fake key is typed into a real pseudo-terminal (python3 pty), and the
// whole terminal transcript is checked: the key must not appear in it, only in the .env file (mode 0600).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { looksLikeKey, writeEnv, readEnv } from '../set-claude-key.mjs';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'set-claude-key.mjs');
const FAKE = 'sk-ant-api03-FAKEfakeFAKEfake0123456789_test-ONLY-not-a-real-key';

const PTY = `
import os, pty, sys, time, select
key, script, env_file = sys.argv[1], sys.argv[2], sys.argv[3]
pid, fd = pty.fork()
if pid == 0:
    os.environ['PLAY_ENV_FILE'] = env_file
    os.execvp('node', ['node', script])
out = b''
def drain(t):
    global out
    end = time.time() + t
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                d = os.read(fd, 4096)
            except OSError:
                return
            if not d: return
            out += d
drain(1.5)
os.write(fd, key.encode())
drain(0.3)
os.write(fd, b'\\r')
drain(2.0)
os.waitpid(pid, 0)
sys.stdout.buffer.write(out)
`;

function runPty(key, envFile) {
  const r = spawnSync('python3', ['-I', '-c', PTY, key, script, envFile], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('key shape check', () => {
  assert.equal(looksLikeKey(FAKE), true);
  for (const bad of ['', 'sk-ant-', 'sk-proj-abcdefghijklmnopqrstuvwxyz', 'hello', 'sk-ant-short', 'sk-ant-has space in it 0123456789']) assert.equal(looksLikeKey(bad), false, bad);
});

test('writeEnv keeps other lines and sets mode 0600', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-key-'));
  const f = path.join(dir, '.env');
  fs.writeFileSync(f, '# local\nCLAUDE_MOCK=1\nANTHROPIC_API_KEY=old\n');
  writeEnv({ ANTHROPIC_API_KEY: 'new', ADMIN_KEY: 'a' }, f);
  const env = readEnv(f);
  assert.equal(env.CLAUDE_MOCK, '1');
  assert.equal(env.ANTHROPIC_API_KEY, 'new');
  assert.equal(env.ADMIN_KEY, 'a');
  assert.ok(fs.readFileSync(f, 'utf8').startsWith('# local\n'));
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hidden prompt: the key never shows in the terminal, lands only in .env (0600)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-key-'));
  const envFile = path.join(dir, '.env');
  const transcript = runPty(FAKE, envFile);
  assert.match(transcript, /Paste the Claude key/);
  assert.match(transcript, /Saved in/);
  assert.ok(!transcript.includes(FAKE), 'the key must not be echoed');
  assert.ok(!transcript.includes('FAKEfake'), 'no part of the key is echoed');
  const env = readEnv(envFile);
  assert.equal(env.ANTHROPIC_API_KEY, FAKE);
  assert.match(env.ADMIN_KEY, /^[0-9a-f]{48}$/);
  assert.match(env.REEL_SHARED_SECRET, /^[0-9a-f]{48}$/);
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a wrong value is refused, not saved and not echoed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-key-'));
  const envFile = path.join(dir, '.env');
  const transcript = runPty('sk-proj-notaclaudekey-secretvalue123', envFile);
  assert.match(transcript, /does not look like a Claude key/);
  assert.ok(!transcript.includes('secretvalue123'));
  assert.equal(fs.existsSync(envFile), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('without a terminal it refuses (so a key is never read from a pipe or a log)', () => {
  const r = spawnSync('node', [script], { input: `${FAKE}\n`, encoding: 'utf8', env: { ...process.env, PLAY_ENV_FILE: path.join(os.tmpdir(), 'pz-never.env') } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Run this in a terminal/);
  assert.ok(!r.stdout.includes(FAKE) && !r.stderr.includes(FAKE));
});
