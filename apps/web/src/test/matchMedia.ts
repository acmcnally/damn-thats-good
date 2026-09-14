import { vi } from 'vitest';

/**
 * Stubs `window.matchMedia`. Two forms:
 *  - `stubMatchMedia(matches)` — every query matches/doesn't (the global
 *    default in vitest.setup.ts, and fine for a test that only ever renders
 *    one media feature, e.g. AppearanceProvider's own prefers-color-scheme
 *    tests in isolation).
 *  - `stubMatchMedia(query, matches)` — only that exact query string matches;
 *    everything else resolves `false`. Needed once more than one real media
 *    query can be alive in the same render (e.g. NavRail's breakpoint check
 *    alongside AppearanceProvider's prefers-color-scheme check) — a blanket
 *    stub would leak into the other query and flip it too.
 */
export function stubMatchMedia(matches: boolean): void;
export function stubMatchMedia(query: string, matches: boolean): void;
export function stubMatchMedia(a: boolean | string, b?: boolean): void {
  const resolve = typeof a === 'string' ? (query: string) => query === a && (b ?? true) : () => a;

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: resolve(query),
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
