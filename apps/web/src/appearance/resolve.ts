/**
 * Pure appearance helpers. No React, no direct DOM: unit-tested in isolation.
 * `AppearanceProvider` is the only caller.
 */

import type { AppearancePref, ColorMode, EffectiveMode } from './types';
import { DEFAULT_PALETTE, isPalette } from './types';

export const STORAGE_KEY = 'dtg.appearance';

const DEFAULT_PREF: AppearancePref = {
  mode: null,
  palette: DEFAULT_PALETTE,
  updatedAt: 0,
};

function coerceMode(value: unknown): ColorMode {
  return value === 'light' || value === 'dark' ? value : null;
}

/**
 * Read + validate the stored preference. Any malformed / partial / absent value
 * degrades to the default rather than throwing — this runs on every mount and a
 * corrupt entry must never white-screen the app. A missing `updatedAt` (a client
 * that predates the field) reads as `0` so a real server value always wins the
 * merge.
 */
export function readStored(
  storage: Pick<Storage, 'getItem'> | undefined = safeStorage(),
): AppearancePref {
  if (!storage) return { ...DEFAULT_PREF };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULT_PREF };
  }
  if (!raw) return { ...DEFAULT_PREF };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: coerceMode(parsed.mode),
      palette: isPalette(parsed.palette) ? parsed.palette : DEFAULT_PALETTE,
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

/** Persist the preference, stamping `updatedAt`. Returns what was written. */
export function writeStored(
  pref: Omit<AppearancePref, 'updatedAt'>,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
  now: number = Date.now(),
): AppearancePref {
  const next: AppearancePref = { ...pref, updatedAt: now };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, disabled) — the in-memory state
    // still drives the current session.
  }
  return next;
}

/** Resolve `mode` (possibly `null` = follow system) to a concrete light/dark. */
export function resolveEffectiveMode(mode: ColorMode, systemPrefersDark: boolean): EffectiveMode {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Pick the newer of a local and a remote preference by `updatedAt` — the seam
 * for a future login reconcile of a server value against the local copy. A tie
 * keeps `remote` (the server is canonical when nothing distinguishes them).
 */
export function mergePref(local: AppearancePref, remote: AppearancePref): AppearancePref {
  return remote.updatedAt >= local.updatedAt ? remote : local;
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
