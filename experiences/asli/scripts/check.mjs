#!/usr/bin/env node
// npm run asli:check: validate content/manifest.json before every commit / deploy.
// Fails (exit 1) on: missing credit on approved items, answers outside 40-60% AI, em/en-dashes, text/code over the
// length limits, blocked words, missing media, ids that hint the answer, rounds the TV would reject.
// Also prints counts per type, the Detector Agent's offline accuracy and a sample Curator plan.
import { loadManifest, validate, curate, activeTypes, isPlayable, TV_KEYS } from '../lib/content.js';
import { accuracy } from '../lib/detector.js';
import { checkEvent } from '../../../core/server/bus.js';

const manifest = loadManifest(process.env.ASLI_MANIFEST || undefined);
const tvKeys = new Set(TV_KEYS);
const { errors, warnings, stats } = validate(manifest, { tvCheck: (ev) => checkEvent(ev, tvKeys) });

console.log('AI ya Asli? content check\n');
console.log('type    AI  real  pending');
for (const [t, s] of Object.entries(stats.byType)) console.log(`${t.padEnd(6)} ${String(s.ai).padStart(3)} ${String(s.real).padStart(5)} ${String(s.pending).padStart(8)}`);
console.log(`playable ${stats.playable.total} (${stats.playable.ai} AI / ${stats.playable.real} real), TV teasers ${stats.teasers}, all items ${stats.all}`);
const acc = accuracy(manifest.items.filter(isPlayable));
console.log(`Detector Agent offline accuracy on text+code: ${acc.right}/${acc.total} (${acc.pct}%)  (60-90% is the sweet spot)`);
console.log(`Active round types: ${activeTypes(manifest.items.filter(isPlayable)).join(', ')}`);
const sample = curate(manifest.items, { seed: 42 });
console.log(`Sample game: ${JSON.stringify(sample.plan.byType)}  ${sample.plan.ai} AI / ${sample.plan.real} real\n`);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
if (acc.pct < 55 || acc.pct > 95) console.log('warn  Detector accuracy is outside 55-95%: tune lib/detector.js so it is good but beatable');
console.log(errors.length ? `\n${errors.length} error(s). Fix them before deploying.` : '\nAll good.');
process.exit(errors.length ? 1 : 0);
