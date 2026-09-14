/**
 * Inline SVG person mark in `currentColor`. Decorative — the surrounding control
 * carries the accessible name.
 *
 * TODO: DAMN-24 — the only avatar there is until user photo storage lands.
 */

import type { SVGProps } from 'react';

export function DefaultAvatar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z" />
    </svg>
  );
}
