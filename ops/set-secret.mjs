#!/usr/bin/env node
// Stores one named secret for play-zenith, the same way ops/set-claude-key.mjs stores the Claude key:
// typed or pasted at a hidden prompt (nothing shows), never printed, never on a command line, never in a log.
// It goes into .env (0600, git-ignored) and, with --lightsail, into the play-web settings (same image redeployed
// with the merged settings). Only the names below are accepted, each with a format check.
//
//   node ops/set-secret.mjs <NAME>                     hidden prompt -> .env
//   node ops/set-secret.mjs <NAME> --lightsail         hidden prompt -> .env AND play-web
//   node ops/set-secret.mjs <NAME> --lightsail --from-env   no prompt: sends the value already in .env to play-web
//   node ops/set-secret.mjs <NAME> --from-file <path>  read the value from a file instead of the prompt (any name;
//                                                      meant for LEADS_PUBLIC_KEY, a .pem file)
//   node ops/set-secret.mjs LINK_HMAC_SECRET --generate    random 32-byte hex (also PHONE_PEPPER)
//   node ops/set-secret.mjs <NAME> --check [--lightsail]   present? format ok? (never the value; NO API call,
//                                                      nothing is sent: for AISENSY_API_KEY this is on purpose)
//   node ops/set-secret.mjs <NAME> --unset [--lightsail]   remove the value from .env (and from play-web), for
//                                                      example WHATSAPP_ALLOWLIST at go-live
//   --replace   needed to change or unset LINK_HMAC_SECRET or PHONE_PEPPER once they exist (changing them breaks every
//               link or phone hash made before)
//
// How values are stored (for the code that reads them):
//   LEADS_PUBLIC_KEY   one line, the PEM's newlines written as the two characters \n. Read it with
//                      process.env.LEADS_PUBLIC_KEY.replace(/\\n/g, '\n').
//   WHATSAPP_ALLOWLIST 10-digit numbers joined by commas, no spaces ("9876543210,9123456789").
// The claude key stays with ops/set-claude-key.mjs (it also has a live --check).
// TODO(student): add MERITTO_API_KEY --check against a read-only Meritto endpoint, once Meritto documents one.
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_FILE, readEnv, writeEnv } from './set-claude-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** "9876543210" -> "98******10". Lists show only masked numbers. */
export const maskPhone = (n) => `${String(n).slice(0, 2)}******${String(n).slice(-2)}`;

function pemFromAny(raw) {
  const text = String(raw).replace(/\\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.join('\n');
}

/**
 * The allow-list. normalize(raw) -> the value to store (or throws a plain message that never contains the value).
 * describe(stored) -> a safe line for --check.
 */
export const SECRETS = {
  AISENSY_API_KEY: {
    about: 'AiSensy (WhatsApp) API key',
    normalize(raw) {
      const v = String(raw).trim();
      if (!/^[A-Za-z0-9._-]{20,4096}$/.test(v)) throw new Error('That does not look like an AiSensy API key (one long line of letters, digits, dots, dashes; at least 20).');
      return v;
    },
    describe: (v) => `${v.length} characters`,
  },
  LEADS_PUBLIC_KEY: {
    about: 'public key (PEM) the leads export is encrypted with',
    multiline: /^-----END [A-Z ]*KEY-----$/,
    normalize(raw) {
      const pem = pemFromAny(raw);
      if (/PRIVATE KEY/.test(pem)) throw new Error('That is a PRIVATE key. Only the PUBLIC key goes on the server. Nothing was saved; keep the private key off this app.');
      if (!/^-----BEGIN (RSA )?PUBLIC KEY-----\n[\s\S]+\n-----END (RSA )?PUBLIC KEY-----$/.test(pem)) throw new Error('That is not a PEM public key (it starts with -----BEGIN PUBLIC KEY----- and ends with -----END PUBLIC KEY-----).');
      let k;
      try { k = createPublicKey(pem); } catch { throw new Error('The PEM block does not parse as a public key (a line may be missing). Nothing was saved.'); }
      if (k.type !== 'public') throw new Error('That is not a public key.');
      return pem.replace(/\n/g, '\\n');
    },
    describe(v) {
      try { const k = createPublicKey(pemFromAny(v)); const d = k.asymmetricKeyDetails || {}; return `${k.asymmetricKeyType}${d.modulusLength ? ` ${d.modulusLength} bit` : ''} public key, parses ok`; } catch { return 'does NOT parse as a public key'; }
    },
  },
  LINK_HMAC_SECRET: {
    about: 'secret that signs share and download links',
    generate: true, sticky: true,
    normalize(raw) {
      const v = String(raw).trim();
      if (!/^[A-Za-z0-9+/=_-]{32,512}$/.test(v)) throw new Error('Use at least 32 characters with no spaces, or run with --generate.');
      return v;
    },
    describe: (v) => `${v.length} characters`,
  },
  PHONE_PEPPER: {
    about: 'pepper for hashing phone numbers',
    generate: true, sticky: true,
    normalize(raw) { return SECRETS.LINK_HMAC_SECRET.normalize(raw); },
    describe: (v) => `${v.length} characters`,
  },
  MERITTO_API_KEY: {
    about: 'Meritto (CRM) API key',
    normalize(raw) {
      const v = String(raw).trim();
      if (!/^[A-Za-z0-9._:-]{16,512}$/.test(v)) throw new Error('That does not look like a Meritto API key (one line of letters, digits, dots, dashes, colons; at least 16).');
      return v;
    },
    describe: (v) => `${v.length} characters`,
  },
  WHATSAPP_ALLOWLIST: {
    about: 'WhatsApp numbers allowed to receive test sends (10 digits each, comma-separated)',
    normalize(raw) {
      const parts = String(raw).split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) throw new Error('Type at least one 10-digit number (comma-separated for more).');
      const bad = parts.filter((p) => !/^\d{10}$/.test(p));
      if (bad.length) throw new Error(`${bad.length} of ${parts.length} entries are not 10-digit numbers (no +91, no spaces inside a number). Nothing was saved.`);
      return [...new Set(parts)].join(',');
    },
    describe: (v) => { const n = v.split(',').filter(Boolean); return `${n.length} number(s): ${n.map(maskPhone).join(', ')}`; },
  },
};

const fingerprint = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 12);

function askHidden(question, { multiline } = {}) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let line = ''; const lines = [];
    stdin.setRawMode(true); // raw mode: the terminal does not echo what is typed or pasted
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = (v) => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); resolve(v); };
    function onData(chunk) {
      for (const ch of chunk.replace(/\x1b\[20[01]~/g, '')) {
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\nStopped. Nothing was saved.\n'); process.exit(1); }
        if (ch === '\r' || ch === '\n') {
          if (!multiline) return finish(line);
          if (line.trim()) lines.push(line.trim());
          const done = multiline.test(line.trim());
          line = '';
          if (done) return finish(lines.join('\n'));
          continue;
        }
        if (ch === '\u007f' || ch === '\b') line = line.slice(0, -1);
        else line += ch;
      }
    }
    stdin.on('data', onData);
  });
}

/** Removes any copy of the value from an error message before it is shown. */
const redact = (msg, v) => (v ? String(msg).split(String(v)).join('[hidden]') : String(msg));

/** Removes names from .env, keeping every other line as it is. Mode 0600. Returns true if a line was removed. */
export function unsetEnv(names, file = ENV_FILE) {
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const keep = lines.filter((l) => !names.some((n) => new RegExp(`^\\s*${n}\\s*=`).test(l)));
  if (keep.length === lines.length) return false;
  fs.writeFileSync(file, keep.join('\n'), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return true;
}

async function unset(name, spec, { lightsail, replace, local, out }) {
  let live;
  let ls;
  if (lightsail) {
    ls = await import('./aws/lightsail.mjs');
    live = ls.currentEnv(ls.CONF.web, ls.getService(ls.target('web')))[name];
  }
  if (spec.sticky && (local[name] || live) && !replace) {
    out(`${name} exists${live ? ' on play-web' : ' in .env'}. Removing it breaks every ${name === 'PHONE_PEPPER' ? 'phone hash' : 'link'} made before. Add --replace if that is really wanted. Nothing changed.`);
    return 1;
  }
  out(unsetEnv([name]) ? `Removed ${name} from ${path.relative(root, ENV_FILE) || '.env'}.` : `${name} was not in ${path.relative(root, ENV_FILE) || '.env'}; nothing to remove there.`);
  if (!lightsail) return 0;
  if (!live) { out(`${name} is not set on play-web either; no redeploy.`); return 0; }
  out(`Removing ${name} from play-web (same image, redeployed) ...`);
  try { await ls.redeployWithSettings('web', {}, { remove: [name] }); } catch (e) { out(redact(e.message, live)); return 1; }
  out(`Done. Check it with: node ops/set-secret.mjs ${name} --check --lightsail (it should say missing).`);
  return 0;
}

export async function main(argv, { out = console.log } = {}) {
  const name = argv[0];
  const spec = SECRETS[name];
  if (!spec) { out(`Use: node ops/set-secret.mjs <NAME> [--lightsail] [--check] [--unset] [--from-file <path>] [--generate] [--replace]\nAllowed names: ${Object.keys(SECRETS).join(', ')}.`); return 1; }
  const has = (f) => argv.includes(f);
  const lightsail = has('--lightsail');
  const local = readEnv();

  if (has('--unset')) return unset(name, spec, { lightsail, replace: has('--replace'), local, out });

  if (has('--check')) {
    let v = local[name];
    let where = '.env';
    if (lightsail) {
      const ls = await import('./aws/lightsail.mjs');
      const c = ls.target('web');
      v = ls.currentEnv(c, ls.getService(c))[name];
      where = 'play-web';
    }
    if (!v) { out(`${name}: missing on ${where}.`); return 1; }
    let ok = true;
    try { spec.normalize(v); } catch { ok = false; }
    const same = lightsail && local[name] ? (fingerprint(local[name]) === fingerprint(v) ? ', same as .env' : ', DIFFERENT from .env') : '';
    out(`${name}: present on ${where}, format ${ok ? 'ok' : 'NOT ok'} (${spec.describe(v)}${same}). Nothing was sent anywhere.`);
    return ok ? 0 : 1;
  }

  let value;
  try {
    if (has('--generate')) {
      if (!spec.generate) { out(`--generate is only for ${Object.keys(SECRETS).filter((k) => SECRETS[k].generate).join(' and ')}.`); return 1; }
      value = randomBytes(32).toString('hex');
    } else if (has('--from-env')) {
      value = local[name];
      if (!value) { out(`There is no ${name} in .env yet. Run without --from-env first. Nothing changed.`); return 1; }
      value = spec.normalize(value);
    } else if (has('--from-file')) {
      const f = argv[argv.indexOf('--from-file') + 1];
      if (!f || !fs.existsSync(f)) { out('--from-file needs the path of an existing file. Nothing was saved.'); return 1; }
      value = spec.normalize(fs.readFileSync(f, 'utf8'));
    } else {
      if (!process.stdin.isTTY) { out('Run this in a terminal: it asks for the value at a hidden prompt. Nothing was saved.'); return 1; }
      const q = spec.multiline
        ? `Paste the ${spec.about} (all lines, from -----BEGIN to -----END), nothing will show: `
        : `Paste the ${spec.about}, then press Enter (nothing will show while you paste): `;
      value = spec.normalize(await askHidden(q, { multiline: spec.multiline }));
    }
  } catch (e) {
    out(`${redact(e.message, value)}${/Nothing was saved/.test(e.message) ? '' : ' Nothing was saved.'}`);
    return 1;
  }

  // a pepper or link secret that already exists is only replaced on purpose
  let live;
  if (lightsail) {
    const ls = await import('./aws/lightsail.mjs');
    live = ls.currentEnv(ls.CONF.web, ls.getService(ls.target('web')))[name];
  }
  const existing = [local[name], live].filter(Boolean).find((v) => v !== value);
  if (spec.sticky && existing && !has('--replace') && !has('--from-env')) {
    out(`${name} already exists${live ? ' on play-web' : ' in .env'}. Changing it breaks every ${name === 'PHONE_PEPPER' ? 'phone hash' : 'link'} made before. Add --replace if that is really wanted. Nothing was saved.`);
    return 1;
  }

  if (!has('--from-env')) {
    writeEnv({ [name]: name === 'LEADS_PUBLIC_KEY' ? `"${value}"` : value });
    out(`Saved ${name} in ${path.relative(root, ENV_FILE) || '.env'} on this laptop only (git ignores it, mode 0600): ${spec.describe(value)}.`);
  }
  if (!lightsail) return 0;

  const ls = await import('./aws/lightsail.mjs');
  out(`Setting ${name} on play-web (value not shown) ...`);
  try { await ls.redeployWithSettings('web', { [name]: value }); } catch (e) { out(redact(e.message, value)); return 1; }
  out(`Done. Check it with: node ops/set-secret.mjs ${name} --check --lightsail`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => { console.error(String(e.message).replace(/[A-Za-z0-9._:+/=-]{24,}/g, '[hidden]')); process.exit(1); });
