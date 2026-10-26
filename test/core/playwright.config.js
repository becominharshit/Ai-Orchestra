// Playwright smoke for the core + sample experience. Three servers on free ports: mock Claude and offline (both with the default strict public-text rule), and a
// LAB server with PUBLIC_TEXT_STRICT=0 for synthetic TV layout tests.
//   npm run test:e2e
import { defineConfig } from '@playwright/test';

// Ports are configurable so parallel runs (builders, checkers) do not collide:
//   PZ_E2E_MOCK_PORT=8911 PZ_E2E_OFFLINE_PORT=8912 npm run test:e2e   (optional)
// Without them, two free ports are picked by the OS once in the runner; the workers inherit them via env.
import net from 'node:net';
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(String(port))); }); });
if (!process.env.PZ_E2E_MOCK_PORT) process.env.PZ_E2E_MOCK_PORT = await freePort();
if (!process.env.PZ_E2E_OFFLINE_PORT) process.env.PZ_E2E_OFFLINE_PORT = await freePort();
if (!process.env.PZ_E2E_LAB_PORT) process.env.PZ_E2E_LAB_PORT = await freePort();
export const MOCK_PORT = process.env.PZ_E2E_MOCK_PORT;
export const OFFLINE_PORT = process.env.PZ_E2E_OFFLINE_PORT;
// LAB: public-text rule off, only for synthetic TV layout/style tests (they publish made-up agent text)
export const LAB_PORT = process.env.PZ_E2E_LAB_PORT;

const common = { PZ_QUIET: '1', PZ_NO_DOTENV: '1', ANTHROPIC_API_KEY: '', HOST: '127.0.0.1', ADMIN_KEY: 'e2e-admin' };

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.js$/,
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: [['list']],
  // our own folder: other suites' Playwright runs clean test-results/ at their start and used to delete our traces mid-run
  outputDir: '../../tmp/pw-core-results',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'node core/server/index.js',
      cwd: '../..',
      url: `http://127.0.0.1:${MOCK_PORT}/healthz`,
      reuseExistingServer: false,
      env: { ...common, PORT: MOCK_PORT, CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '700', STAGE_MIN_TURN_S: '0', DATA_DIR: `./tmp/e2e-mock-${Date.now()}` },
    },
    {
      command: 'node core/server/index.js',
      cwd: '../..',
      url: `http://127.0.0.1:${OFFLINE_PORT}/healthz`,
      reuseExistingServer: false,
      env: { ...common, PORT: OFFLINE_PORT, DEMO_MODE: '1', OFFLINE: '1', DATA_DIR: `./tmp/e2e-offline-${Date.now()}` },
    },
    {
      command: 'node core/server/index.js',
      cwd: '../..',
      url: `http://127.0.0.1:${LAB_PORT}/healthz`,
      reuseExistingServer: false,
      env: { ...common, PORT: LAB_PORT, CLAUDE_MOCK: '1', CLAUDE_MOCK_LATENCY_MS: '200', PUBLIC_TEXT_STRICT: '0', DATA_DIR: `./tmp/e2e-lab-${Date.now()}` },
    },
  ],
});
