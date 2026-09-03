import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

// Tiers per ADR-0012:
//   unit           — pure logic, node env, every build
//   component-web  — React Testing Library in jsdom + MSW, every build
//   component-api  — supertest against the real Nest app + a Testcontainers Postgres
//                    (needs Docker; runs in `pnpm verify` / CI). SWC transform so
//                    NestJS decorator metadata survives (mirrors apps/api/.swcrc).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'e2e/*.test.ts', // run.ts mode-dispatch helpers (no Docker, no browser)
          ],
          exclude: [...configDefaults.exclude, '**/*.component.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'component-web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.component.test.{ts,tsx}'],
          setupFiles: ['./apps/web/vitest.setup.ts'],
        },
      },
      {
        plugins: [swc.vite()],
        test: {
          name: 'component-api',
          environment: 'node',
          include: ['apps/api/src/**/*.component.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
