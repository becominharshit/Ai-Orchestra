// A fake "live" Claude client for AI Startup Studio tests (same idea as test/shark/fake-live.mjs): core then reports
// safetyMode 'live', runs its live crisis check and judge through this client, and the startup call gets an answer
// shaped like the strict schema. No key, no network. Every call is recorded so tests can measure calls and prompt size.
//   import { fakeClient, calls, seen } from './fake-live.mjs'   (in-process, with test/core/helpers.js startServer)
//   node test/startup/fake-live.mjs                            (prints "play-zenith on http://localhost:<port>"; e2e)
// Crisis: any text containing "SENTINELCRISIS" is a crisis. Judge: approves every line unless it contains "SENTINELBAD".
// opts.startup(body) can override the startup answer (e.g. invalid ids, a note with a name in it).
// opts.careDelayMs makes the crisis check slow like a real one (CHECK-18 F2: the TV must stay idle meanwhile).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const seen = []; // texts the live crisis check received
export const calls = []; // { task, inChars, outChars } per model call

// Rough token estimate for the cost note: ~3.6 characters per token for this mixed JSON + Hinglish text.
export const estTokens = (chars) => Math.ceil(chars / 3.6);

function pick(schemaProp, i = 0) { return schemaProp.enum[i % schemaProp.enum.length]; }

export function defaultStartup(body) {
  const p = body.output_config.format.schema.properties;
  const r = (n) => Math.floor(Math.random() * n);
  const f = [...p.feature1.enum].sort(() => Math.random() - 0.5);
  const pl = [...p.plan1.enum].sort(() => Math.random() - 0.5);
  return {
    namePrefix: pick(p.namePrefix, r(p.namePrefix.enum.length)), nameSuffix: pick(p.nameSuffix, r(p.nameSuffix.enum.length)),
    tagline: pick(p.tagline, r(9)), research: pick(p.research, r(9)), feature1: f[0], feature2: f[1], feature3: f[2],
    palette: pick(p.palette, r(4)), logo: pick(p.logo, r(4)), price: 99, marketLakh: 40, plan1: pl[0], plan2: pl[1], plan3: pl[2],
    pitch: pick(p.pitch, r(9)), note: 'Simple idea, clear customer, badhiya shuruaat.',
  };
}

function answerFor(body, opts) {
  const props = body.output_config?.format?.schema?.properties || {};
  const content = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  if (props.crisis) {
    seen.push(content);
    return { task: 'care', out: { crisis: /SENTINELCRISIS/.test(content), confidence: /SENTINELCRISIS/.test(content) ? 0.99 : 0.01 } };
  }
  if (props.approved) {
    const lines = JSON.parse(content);
    return { task: 'judge', out: { approved: lines.filter((l) => !/SENTINELBAD/.test(l.text) && !(opts.rejectName && l.id === 'name')).map((l) => l.id) } };
  }
  if (props.namePrefix) return { task: 'startup', out: (opts.startup || defaultStartup)(body) };
  return { task: 'other', out: {} };
}

export function fakeClient(opts = {}) {
  return {
    beta: {
      messages: {
        create: async (body) => {
          const { task, out } = answerFor(body, opts);
          if (task === 'care' && opts.careDelayMs) await new Promise((r) => setTimeout(r, opts.careDelayMs));
          const inChars = (body.system || '').length + JSON.stringify(body.messages).length + JSON.stringify(body.output_config?.format?.schema || {}).length;
          const text = JSON.stringify(out);
          calls.push({ task, inChars, outChars: text.length, maxTokens: body.max_tokens });
          return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: estTokens(inChars), output_tokens: estTokens(text.length) } };
        },
      },
    },
  };
}

// CLI: a full server with the fake live client (PORT=0 picks a free port). STARTUP_STUDIO is switched on.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'core/server/index.js')).href);
  const s = await createServer({ STARTUP_STUDIO: '1', ...(process.env.DATA_DIR ? {} : { DATA_DIR: path.join(ROOT, 'tmp', `fake-live-${process.pid}`) }) }, { claudeClient: fakeClient({ careDelayMs: Number(process.env.CARE_DELAY_MS || 0) }) });
  const srv = await s.start(Number(process.env.PORT || 0), '127.0.0.1');
  console.log(`play-zenith on http://localhost:${srv.address().port}  mode: FAKE LIVE (tests)`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await s.stop(); process.exit(0); });
}
