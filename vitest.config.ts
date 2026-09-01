import { configDefaults, defineConfig } from 'vitest/config';

// Two tiers (ADR-0012). The API component tier (Testcontainers Postgres) and the
// Playwright workflow tier arrive with DAMN-26 / DAMN-27 and are not wired here.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.component.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.component.test.{ts,tsx}'],
        },
      },
    ],
  },
});
