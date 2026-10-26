// Screening of the model's Job Time Machine drafts before they go to the visitor's phone (they never reach a TV):
//   1. core's judge (ctx.safety.judge), which fails closed;
//   2. Career rules on top, even when the judge approves: put-downs about the visitor, job-loss fear copy, any
//      medicine or dose instruction (lib/public.js careerRuleHit).
// A flagged line is replaced by a plain, reviewed line, never by another model line. The Doctor job never gets here:
// its lines are picked from a reviewed bank (lib/jobs.js DOCTOR_BANK).
import { careerRuleHit } from './public.js';

export const SAFE_LINES = {
  plan: () => 'Team ne kaam baant liya. 2 calls tumhari.',
  research: () => 'Research ka ek point ready hai.',
  drafts: (i) => `Option ${i + 1}: simple aur saaf`,
  analysis: () => 'Report ready hai.',
  review: () => 'Sab check ho gaya. Final faisla insaan ka.',
  call_options: (i) => `Option ${i + 1}`,
};

/** @returns {Promise<{ agents, flagged: string[] }>} */
export async function screenAgents(a, judge) {
  const items = [['plan', a.plan], ...a.research.map((t, i) => [`research.${i}`, t]), ...a.drafts.map((t, i) => [`drafts.${i}`, t]), ['analysis', a.analysis], ['review', a.review], ...a.call_options.map((t, i) => [`call_options.${i}`, t])].map(([id, text]) => ({ id, text }));
  let flagged;
  try { ({ flagged } = await judge(items)); } catch { flagged = items.map((x) => x.id); }
  if (!Array.isArray(flagged)) flagged = items.map((x) => x.id); // a broken judge answer flags everything
  flagged = [...new Set([...flagged, ...items.filter((x) => careerRuleHit(x.text)).map((x) => x.id)])];
  if (!flagged.length) return { agents: a, flagged };
  const out = structuredClone(a);
  for (const id of flagged) {
    const [k, i] = id.split('.');
    if (!(k in SAFE_LINES)) continue;
    if (i === undefined) out[k] = SAFE_LINES[k](0); else out[k][Number(i)] = SAFE_LINES[k](Number(i));
  }
  return { agents: out, flagged };
}
