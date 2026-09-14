/**
 * Single JS-side source for the shell's mobile cutoff. AppShell.module.css's
 * `@media (max-width: 640px)` can't import this — CSS media queries can't
 * reference custom properties — so it's kept in sync by hand, cross-referenced
 * in a comment there (same accepted pattern as the palette allow-list
 * duplicated between appearance/types.ts and index.html's FOUC script).
 */
export const MOBILE_BREAKPOINT_PX = 640;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
