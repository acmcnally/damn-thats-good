import '@testing-library/jest-dom/vitest';

import { afterEach } from 'vitest';

import { stubMatchMedia } from './src/test/matchMedia';

/**
 * jsdom ships no `matchMedia`. `AppearanceProvider` and `resolve.ts` call it
 * (prefers-color-scheme); NavRail's `useMediaQuery` calls it too. Default:
 * not-matching, with working add/removeListener so effects can subscribe.
 * Individual tests override by re-stubbing (see src/test/matchMedia.ts).
 */
stubMatchMedia(false);

afterEach(() => {
  stubMatchMedia(false);
});
