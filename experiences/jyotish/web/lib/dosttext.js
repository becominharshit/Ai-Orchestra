// Dost compatibility text the phone puts on the TV (orchestra names, tasks, log templates). Browser-safe.
// Registered as public text by server.js (lib/dost.js); every log line is one of these templates.
import { SIGNS, LIFE_PATHS } from './astro.js';

export const DOST_ORX = {
  title: 'Dost Compatibility',
  orchestrator: { id: 'guru', name: 'Jyotish Guru', role: 'Orchestrator', icon: 'crown' },
  agents: [
    { id: 'rashi', name: 'Rashi Agent', role: 'Sun signs, in code', icon: 'star' },
    { id: 'ank', name: 'Ank Agent', role: 'Life paths, in code', icon: 'dice' },
    { id: 'squad', name: 'Squad Agent', role: 'Squad energy match', icon: 'target' },
    { id: 'roles', name: 'Role Agent', role: 'Who brings what', icon: 'compass' },
  ],
  task: { rashi: 'Sabke sun sign nikalo', ank: 'Sabke life path nikalo', squad: 'Squad energy match karo', roles: 'Roles baanto' },
  log: { picks: 'Squad report ke liye reviewed lines chuni' },
  handoff: { signs: 'signs ready', numbers: 'numbers ready', energy: 'squad energy', roles: 'roles ready' },
};

export const DOST_LOG_TEMPLATES = {
  dost_log_friend: ['Dost {i}: {sign}, life path {n}', { i: 'int:1..4', sign: SIGNS.map((s) => s.en), n: LIFE_PATHS.map(String) }],
  dost_log_mix: ['{n} dost, {k} alag elements, vibe match {score}%', { n: 'int:2..4', k: 'int:1..4', score: 'int:0..100' }],
  dost_log_roles: ['{n} roles baante, sab alag', { n: 'int:2..4' }],
  dost_done: ['Squad report ready in {s}s', { s: 'int:0..600' }],
};
