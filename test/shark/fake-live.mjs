// A fake "live" Claude client for AI Sharks tests: core then reports safetyMode 'live' and runs its live crisis
// check (inputLive) through this client, so tests can prove every visitor field is checked, with no key and no network.
//   import { fakeClient, seen } from './fake-live.mjs'      (in-process, with test/core/helpers.js startServer)
//   node test/shark/fake-live.mjs                           (prints "play-zenith on http://localhost:<port>"; for e2e)
// Crisis check: any text containing "SENTINELCRISIS" (or a real crisis phrase core's rules already catch) is a crisis.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { questionsFor, verdictFor } from '../../experiences/shark/lib/engine.js';
import { questionsV2, verdictV2 } from '../../experiences/shark/lib/v2/engine.js';

export const seen = []; // every text the live crisis check received (in order)

function answerFor(body) {
  const schema = body.output_config?.format?.schema || {};
  const props = schema.properties || {};
  const content = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  if (props.crisis) {
    seen.push(content);
    if (/SENTINELFAIL/.test(content)) throw Object.assign(new Error('fake live check failure'), { status: 500 });
    return { crisis: /SENTINELCRISIS/.test(content), confidence: /SENTINELCRISIS/.test(content) ? 0.99 : 0.01 };
  }
  if (props.flagged) return { flagged: [] };
  if (props.axes) return verdictV2({ idea: 'x' }, {}, props.sharks.required);
  if (props.questions) {
    const ids = props.questions.required || [];
    return ids.includes('vc') ? questionsFor('') : questionsV2({ idea: 'x' }, ids);
  }
  if (props.sharks) return { ...verdictFor('', {}, {}) };
  return {};
}

export function fakeClient() {
  return {
    beta: {
      messages: {
        create: async (body) => {
          const out = answerFor(body);
          return { content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 50 } };
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
