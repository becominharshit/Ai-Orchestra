// The repo's nested npm packages: experiences/*, reel-worker, print. Used by `npm run setup` and `npm test`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every folder with a package.json that declares dependencies, root first. */
export function packages(root = ROOT) {
  const dirs = ['.'];
  const exp = path.join(root, 'experiences');
  if (fs.existsSync(exp)) for (const d of fs.readdirSync(exp).sort()) dirs.push(path.join('experiences', d));
  dirs.push('reel-worker', 'print');
  return dirs
    .filter((d) => fs.existsSync(path.join(root, d, 'package.json')))
    .map((d) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, d, 'package.json'), 'utf8'));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
      return { dir: d, deps, lock: fs.existsSync(path.join(root, d, 'package-lock.json')) };
    })
    .filter((p) => p.deps.length);
}

/** Packages whose dependencies are not installed yet (first missing module only, cheap check). */
export function missing(root = ROOT) {
  return packages(root).filter((p) => p.deps.some((dep) => !fs.existsSync(path.join(root, p.dir, 'node_modules', dep, 'package.json'))));
}

/** null when the checkout is ready for `npm test`, else the message to print. */
export function preflight(root = ROOT, { browser = true } = {}) {
  const gaps = missing(root).map((p) => p.dir);
  if (!gaps.length && browser) return null;
  return `Setup has not run on this checkout.${gaps.length ? `\n  npm packages missing in: ${gaps.join(', ')}` : ''}${browser ? '' : '\n  Playwright Chromium is not installed'}\n\nRun:  npm install && npm run setup\nthen: npm test`;
}
