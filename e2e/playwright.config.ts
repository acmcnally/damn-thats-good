import { defineConfig, devices } from '@playwright/test';

/**
 * Workflow (E2E) tier — ADR-0012. One Chromium smoke test.
 *
 * `run.ts` is the entry point (`pnpm e2e`), not `playwright test` directly: it
 * decides whether to stand up a local Docker Compose stack, point at staging, or
 * self-skip (the CI `verify` job). See run.ts and the DAMN-29 design doc.
 *
 * `E2E_BASE_URL`  — where to point. Set by run.ts (local: the compose `web` port)
 *                   or by the `e2e-staging` CI job (the staging URL).
 * `E2E_PROXY`     — proxy for the browser + request context. Set only by the
 *                   `e2e-staging` job when the runner needs tailscaled's proxy to
 *                   reach the tailnet (userspace networking). Unset otherwise.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080';
const proxy = process.env.E2E_PROXY ? { server: process.env.E2E_PROXY } : undefined;
const ci = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  forbidOnly: ci,
  // A retry absorbs a post-deploy warmup blip; `failOnFlakyTests` keeps a
  // retry-that-passes from greening the gate anyway (Playwright >= 1.45).
  retries: ci ? 1 : 0,
  failOnFlakyTests: ci,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    proxy,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
