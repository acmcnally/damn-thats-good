import '@testing-library/jest-dom/vitest';

import { afterEach, vi } from 'vitest';

/**
 * jsdom ships no `matchMedia`. `AppearanceProvider` and `resolve.ts` call it
 * (prefers-color-scheme). Default: not-matching, with working add/removeListener
 * so effects can subscribe. Individual tests override `matches` by re-stubbing.
 */
function stubMatchMedia(matches = false): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

stubMatchMedia(false);

afterEach(() => {
  stubMatchMedia(false);
});
