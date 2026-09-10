/**
 * Appearance preference types — DAMN-32.
 *
 * Web-presentation only. DAMN-14 promotes `ColorMode` / `Palette` to
 * `@dtg/shared` if/when the profile DTO needs them for cross-device sync.
 */

/** The three color-only palettes. Terracotta is the default. */
export const PALETTES = ['terracotta', 'sage', 'plum'] as const;
export type Palette = (typeof PALETTES)[number];

export const DEFAULT_PALETTE: Palette = 'terracotta';

/**
 * `null` = follow the OS (`prefers-color-scheme`) — the default until the user
 * first flips the Light/Dark switch. Once set it is `'light' | 'dark'` and V1
 * has no UI back to `null` (a known one-way door; DAMN-14 can add a "System"
 * option and must preserve `null` as a real state).
 */
export type ColorMode = 'light' | 'dark' | null;

/** The concrete light/dark actually applied, after resolving `null` against the OS. */
export type EffectiveMode = 'light' | 'dark';

/**
 * Shape persisted to `localStorage` under `dtg.appearance`.
 *
 * `updatedAt` (epoch ms, stamped on every write) is the merge signal DAMN-14
 * needs to reconcile a server value against the local copy on login — it cannot
 * be added retroactively to clients that wrote without it, so it ships now.
 * `readStored()` tolerates its absence (treats it as `0`).
 */
export interface AppearancePref {
  mode: ColorMode;
  palette: Palette;
  updatedAt: number;
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === 'string' && (PALETTES as readonly string[]).includes(value);
}
