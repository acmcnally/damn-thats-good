import { useEffect, useState } from 'react';

/**
 * `matchMedia` can throw or be absent in some runtimes (restrictive webviews,
 * privacy extensions) — mirrors AppearanceProvider's `systemPrefersDark()`
 * guard so a caller here degrades to `false` instead of throwing during render.
 */
function safeMatches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Tracks a `matchMedia` query, updating on change. SSR-free — always runs client-side. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => safeMatches(query));

  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    setMatches(mql.matches);

    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
