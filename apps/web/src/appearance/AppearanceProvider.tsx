/**
 * Owns the live appearance state after mount (the inline FOUC script in
 * index.html sets the initial attributes before first paint). Writes
 * `data-palette` / `data-theme` on <html>, persists to localStorage, and tracks
 * the OS `prefers-color-scheme` while `mode` is `null` (follow system).
 *
 * TODO: DAMN-14 — cross-device sync. `remoteValue` (a server-synced pref) and
 * `onLocalChange` are its injection points, unused today; wired now so DAMN-14
 * needn't rewrite the provider.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
   * TODO: DAMN-14 — a server-synced preference. Read once at mount; when newer
   * than the local copy it wins the initial render. DAMN-14 owns the rest of the
   * contract: reacting to an async-arriving value, and deciding whether/how a
   * remote win is written back to localStorage (this component does not persist
   * it, to avoid restamping the server's `updatedAt`).
   */
  remoteValue?: AppearancePref;
  /** TODO: DAMN-14 — called with the full pref (incl. fresh `updatedAt`) after a real local edit. */
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

  // Apply to <html>. Mirrors the FOUC script's attribute writes, and toggles a
  // short-lived `theme-transition` class so the palette/mode swap animates —
  // base.css scopes the cross-fade to that class so it never lags ordinary
  // hover / active / focus feedback.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    const timer = window.setTimeout(() => root.classList.remove('theme-transition'), 250);
    root.dataset.palette = pref.palette;
    if (effectiveMode === 'dark') {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
    return () => {
      window.clearTimeout(timer);
      root.classList.remove('theme-transition');
    };
  }, [pref.palette, effectiveMode]);

  // Persist + notify only on a real user edit. A value that arrived via
  // `remoteValue` or was just read from storage is never echoed back as a local
  // change — the future sync merge relies on `updatedAt` being a true edit
  // signal, and this keeps a StrictMode remount from restamping it.
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (!userEditedRef.current) return;
    const written = writeStored(pref);
    onLocalChange?.(written);
  }, [pref, onLocalChange]);

  const setMode = useCallback((mode: ColorMode) => {
    userEditedRef.current = true;
    setPref((p) => ({ ...p, mode }));
  }, []);
  const setPalette = useCallback((palette: Palette) => {
    userEditedRef.current = true;
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
