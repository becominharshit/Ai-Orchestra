# AI Jyotish tests

- `astro.test.js` sun sign boundaries (every cusp, leap year), life path incl. master numbers 11/22/33, DOB checks.
- `guard.test.js` adversarial lines per rule, no false positives on common Hinglish, all fixtures pass clean.
- `server.test.js` routes in-process with a fake Claude client: request shape for the real model, adversarial
  answers end to end, mock/offline/hero picks, TV image slot, palm bytes never on disk or in logs.
- `e2e.mjs` Playwright: phone 375x812 + TV 1920x1080 (+ capture landscape/portrait), mock, hero and offline;
  follow gate, TV safety, timing, share card size, no console errors. `--shots` writes `docs/shots/TASK-02/`.

Run: `node --test --test-concurrency=1 test/jyotish/*.test.js` and `node test/jyotish/e2e.mjs`.
Servers start on random ports, so nothing clashes with a dev server.
