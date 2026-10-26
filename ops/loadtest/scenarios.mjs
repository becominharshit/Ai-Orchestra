// What one simulated visitor does inside each experience, after the common part (hub, page, config, track start).
//
// The API steps come from the experience itself: every `router.get('/x')` / `router.post('/x')` found in
// experiences/<id>/server.js becomes a call to /api/<id>/x (core mounts each router at /api/<id>). GETs go first, then
// POSTs, in the order they appear in the file. Skipped: routes with :params, streams, uploads and file downloads
// (the reel worker has its own load test, TASK-04). An experience without server.js yet is "not built yet".
//
// POST bodies: BODIES[<id>][<path>] if given below, else { fictional: true }. In mock mode a body the route does
// not accept comes back as a 4xx, which the load test reports but does not count as a failure.
// TODO(student): when an experience is finished, put a realistic FICTIONAL body for each POST route in BODIES
// (no real names or photos), so the load test reaches the Claude proxy and its queue in mock mode.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A visitor reads and taps between calls. Short in the test so it finishes quickly, but not zero.
const think = () => sleep(150 + Math.random() * 450);

// 1x1 grey JPEG, base64 (contains no person), for vision routes.
export const TINY_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

/** Fictional request bodies per experience and route path (as written in server.js). */
export const BODIES = {
  // jyotish: { '/reading': { firstName: 'Test', dob: '2009-04-12', place: 'Gurugram', palm: TINY_JPEG } },
};

const SKIP = /:|\*|stream|upload|file|download|admin/i;

/** The API routes an experience declares, read from its server.js (a light regex, no code is run). */
export function discoverRoutes(id, root = ROOT) {
  const f = path.join(root, 'experiences', id, 'server.js');
  if (!fs.existsSync(f)) return null;
  const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = [];
  const re = /\b[A-Za-z_$][\w$]*\.(get|post|put)\(\s*(['"`])(\/[^'"`]*)\2/g;
  for (let m; (m = re.exec(src));) {
    const [, method, , p] = m;
    if (SKIP.test(p)) continue;
    if (!found.some((r) => r.method === method.toUpperCase() && r.path === p)) found.push({ method: method.toUpperCase(), path: p });
  }
  return [...found.filter((r) => r.method === 'GET'), ...found.filter((r) => r.method !== 'GET')];
}

/** Runs one visitor's API steps for an experience. Returns { built, steps } for the summary. */
export async function runScenario(id, { api, routes = discoverRoutes(id) }) {
  if (!routes) return { built: false, steps: 0 };
  for (const r of routes) {
    await think();
    const body = r.method === 'GET' ? undefined : (BODIES[id]?.[r.path] ?? { fictional: true });
    await api(r.method, `/api/${id}${r.path}`, body, { expApi: true });
  }
  return { built: true, steps: routes.length };
}
