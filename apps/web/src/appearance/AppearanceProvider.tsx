/**
 * AppearanceProvider — DAMN-32.
 *
 * Owns the live appearance state after mount (the inline FOUC script in
 * index.html sets the initial attributes before first paint). Writes
 * `data-palette` / `data-theme` on <html>, persists to localStorage, and tracks
 * the OS `prefers-color-scheme` while `mode` is `null` (follow system).
 *
 * DAMN-14 seam: `remoteValue` (a server-synced pref) and `onLocalChange` (called
 * on every local edit) are the injection points for cross-device sync — unused
 * in DAMN-32, wired so DAMN-14 needn't rewrite the provider.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { mergePref, readStored, resolveEffectiveMode, writeStored } from './resolve';
import type { AppearancePref, ColorMode, EffectiveMode, Palette } from './types';

interface AppearanceContextValue {
  mode: ColorMode;
  palette: Palette;
  effectiveMode: EffectiveMode;
  setMode: (mode: ColorMode) => void;
  setPalette: (palette: Palette) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

interface AppearanceProviderProps {
  children: ReactNode;
  /**
   * DAMN-14: a server-synced preference. Read once at mount and, when newer than
   * the local copy, wins. DAMN-14 will need an effect here if the server value
   * can arrive asynchronously after mount.
   */
  remoteValue?: AppearancePref;
  /** DAMN-14: called with the full pref (incl. fresh `updatedAt`) after any local edit. */
  onLocalChange?: (pref: AppearancePref) => void;
}

export function AppearanceProvider({
  children,
  remoteValue,
  onLocalChange,
}: AppearanceProviderProps) {
  const [pref, setPref] = useState<{ mode: ColorMode; palette: Palette }>(() => {
    const local = readStored();
    const initial = remoteValue ? mergePref(local, { ...remoteValue }) : local;
    return { mode: initial.mode, palette: initial.palette };
  });

  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // Re-resolve when the OS theme changes (only observable while mode is null).
  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const effectiveMode = resolveEffectiveMode(pref.mode, prefersDark);

  // Apply to <html>. Mirrors the FOUC script's attribute writes.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = pref.palette;
    if (effectiveMode === 'dark') {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
  }, [pref.palette, effectiveMode]);

  // Persist + notify — but only when `pref` actually diverges from what's
  // stored. This skips the no-op initial render (and any StrictMode / remount
  // re-fire) so `updatedAt` is bumped by a real user change, never just by
  // mounting the app — DAMN-14's merge signal depends on that.
  useEffect(() => {
    const stored = readStored();
    if (stored.mode === pref.mode && stored.palette === pref.palette) return;
    const written = writeStored(pref);
    onLocalChange?.(written);
  }, [pref, onLocalChange]);

  const setMode = useCallback((mode: ColorMode) => {
    setPref((p) => ({ ...p, mode }));
  }, []);
  const setPalette = useCallback((palette: Palette) => {
    setPref((p) => ({ ...p, palette }));
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ mode: pref.mode, palette: pref.palette, effectiveMode, setMode, setPalette }),
    [pref.mode, pref.palette, effectiveMode, setMode, setPalette],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within an <AppearanceProvider>');
  }
  return ctx;
}
