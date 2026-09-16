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

/**
 * jsdom implements `<dialog>` as an element but not its imperative modal API
 * (`showModal`/`close`) — every real target browser has shipped this for years.
 * Approximate it well enough for component tests: `showModal` sets the `open`
 * attribute, `close` clears it and fires the native `close` event components may
 * listen for. No focus trap / top-layer / `::backdrop` — jsdom has no layout to
 * make those meaningful anyway.
 */
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
if (typeof HTMLDialogElement.prototype.close !== 'function') {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
