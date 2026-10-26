// A fake "live" Claude client for Build Your Own AI Agent tests: core reports safetyMode 'live' and every model call
// (plan, judge, crisis check) goes through this client, with no key and no network.
//   import { fakeClient, calls, reset } from './fake-live.mjs'   (in-process, with test/core/helpers.js startServer)
//   node test/agent/fake-live.mjs                                 (prints "play-zenith on http://localhost:<port>"; e2e)
// Plan answers are realistic but slightly messy on purpose (a tool left out, notes not last, one risky wording line),
// so the tests see the code repair the plan and the judge replace the risky line with a reviewed one.
// Env for tests: FAKE_PLAN=slow (answers after 30 s, past the plan deadline), FAKE_PLAN=hang (ignores its timeout,
// answers after 40 s), FAKE_PLAN=fail (500), FAKE_JUDGE=slow, FAKE_WORD=<line> (every wording slot gets it).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const calls = []; // { task, inChars, outChars } per call, never the text itself
export const reset = () => { calls.length = 0; };
export const RISKY = 'Is plan se 100% marks pakke, guarantee!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function planFor(schema) {
  const p = schema.properties;
  const tools = p.steps.items.properties.tool.enum;
  const says = p.steps.items.properties.say.enum;
  const items = p.steps.items.properties.item.enum.filter((x) => x !== 'all');
  const word = process.env.FAKE_WORD; // a hostile planner: free text where ids belong (it must never reach the phone)
  const say = (t) => word || says.filter((id) => id.startsWith(`w_${t}_`))[1] || says[0];
  const steps = [];
  if (tools.includes('calendar')) steps.push({ tool: 'calendar', item: 'all', say: say('calendar') });
  if (tools.includes('notes')) steps.push({ tool: 'notes', item: 'all', say: say('notes') });
  if (tools.includes('lookup')) items.forEach((it) => steps.push({ tool: 'lookup', item: it, say: say('lookup') }));
  // calculator deliberately left out: the code adds it back (repair); notes not last: the code moves it
  const tips = p.tips.items.enum;
  return { steps, weights: items.map((_, i) => (i === 0 ? 3 : 2)), sessionMin: p.sessionMin.enum[1] ?? p.sessionMin.enum[0], breakMin: p.breakMin.enum[0], lightDay: true, intro: word || p.intro.enum[1], tips: word ? [word, RISKY] : [tips.at(-1), RISKY, tips[0]] };
}

function answerFor(body) {
  const schema = body.output_config?.format?.schema || {};
  const props = schema.properties || {};
  const content = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  if (props.crisis) return { task: 'care', out: { crisis: /SENTINELCRISIS/.test(content), confidence: /SENTINELCRISIS/.test(content) ? 0.99 : 0.01 } };
  if (props.approved) return { task: 'judge', out: { approved: JSON.parse(content).map((l) => l.id) } }; // approves all; core's rules still flag RISKY
  if (props.steps) return { task: 'plan', out: planFor(schema) };
  if (props.ok) return { task: 'name', out: { ok: !/Fakebad/i.test(content) } }; // the live first-name check
  return { task: 'other', out: {} };
}

export function fakeClient() {
  return {
    beta: {
      messages: {
        create: async (body, opts = {}) => {
          const { task, out } = answerFor(body);
          if (task === 'plan' && process.env.FAKE_PLAN === 'fail') throw Object.assign(new Error('fake overloaded'), { status: 529 });
          const slow = (task === 'plan' && process.env.FAKE_PLAN === 'slow') || (task === 'judge' && process.env.FAKE_JUDGE === 'slow');
          if (task === 'plan' && process.env.FAKE_PLAN === 'hang') await new Promise((r) => setTimeout(r, 40000).unref()); // a client that ignores its timeout
          if (slow) {
            const t = opts.timeout || 25000;
            await sleep(Math.min(t, 30000));
            if (t < 30000) throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' });
          }
          const text = JSON.stringify(out);
          const inChars = (body.system || '').length + JSON.stringify(body.messages).length + JSON.stringify(body.output_config || {}).length;
          calls.push({ task, inChars, outChars: text.length });
          return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: Math.ceil(inChars / 3.5), output_tokens: Math.ceil(text.length / 3.5) } };
        },
      },
    },
  };
}

// CLI: a full server with the fake live client, for the e2e (PORT=0 picks a free port).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { createServer } = await import(pathToFileURL(path.join(ROOT, 'core/server/index.js')).href);
  const s = await createServer({}, { claudeClient: fakeClient() });
  const srv = await s.start(Number(process.env.PORT || 0), '127.0.0.1');
  console.log(`play-zenith on http://localhost:${srv.address().port}  mode: FAKE LIVE (tests)`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await s.stop(); process.exit(0); });
}
