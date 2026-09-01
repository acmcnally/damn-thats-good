import { configDefaults, defineConfig } from 'vitest/config';

// Tiers per ADR-0012. The component tier has two flavours with different needs:
//   - web: jsdom + (later) React Testing Library + MSW
//   - api: node + (later) supertest against a real Postgres via Testcontainers
// The Testcontainers setup and the Playwright workflow tier arrive with DAMN-26/27.
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
          name: 'component-web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.component.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'component-api',
          environment: 'node',
          include: ['apps/api/src/**/*.component.test.ts'],
        },
      },
    ],
  },
});
