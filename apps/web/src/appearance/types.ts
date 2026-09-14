/**
 * Appearance preference types. Web-presentation only.
 *
 * TODO: DAMN-14 — promote `ColorMode` / `Palette` to `@dtg/shared` if the
 * profile DTO ends up needing them for cross-device sync.
 */

/** The three color-only palettes. Terracotta is the default. */
export const PALETTES = ['terracotta', 'sage', 'plum'] as const;
export type Palette = (typeof PALETTES)[number];

export const DEFAULT_PALETTE: Palette = 'terracotta';

/**
 * `null` = follow the OS (`prefers-color-scheme`) — the default until the user
 * first flips the Light/Dark switch. Once set it is `'light' | 'dark'` and V1
 * has no UI back to `null`: a known one-way door.
 *
 * TODO: DAMN-14 — a "System" option on the switch would restore `null`; any
 * sync logic there must preserve `null` as a real state.
 */
export type ColorMode = 'light' | 'dark' | null;

/** The concrete light/dark actually applied, after resolving `null` against the OS. */
export type EffectiveMode = 'light' | 'dark';

/**
 * Shape persisted to `localStorage` under `dtg.appearance`.
 *
 * `updatedAt` (epoch ms, stamped on every write) ships now because it cannot be
 * added retroactively to clients that wrote without it. `readStored()` tolerates
 * its absence (treats it as `0`).
 *
 * TODO: DAMN-14 — this is the signal the login reconcile compares a server
 * value against the local copy with.
 */
export interface AppearancePref {
  mode: ColorMode;
  palette: Palette;
  updatedAt: number;
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}
