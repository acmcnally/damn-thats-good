import { describe, expect, it } from 'vitest';

// Proves the jsdom-backed "component" test project is wired (ADR-0012).
// React Testing Library + MSW arrive with the real web app in DAMN-26.
describe('component tier (jsdom)', () => {
  it('provides a DOM', () => {
    const el = document.createElement('div');
    el.textContent = 'ready';
    expect(el.textContent).toBe('ready');
  });
});
