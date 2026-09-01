import { describe, expect, it } from 'vitest';

// Proves the node-environment "component-api" project runs (ADR-0012).
// supertest against a Testcontainers Postgres arrives with DAMN-26.
describe('component tier (api)', () => {
  it('runs in a Node environment', () => {
    expect(typeof process.versions.node).toBe('string');
  });
});
