import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceProvider, useAppearance } from './AppearanceProvider';
import { STORAGE_KEY } from './resolve';
import type { AppearancePref } from './types';

function Probe() {
  const { mode, palette, effectiveMode } = useAppearance();
  return <output data-testid="probe">{`${mode ?? 'null'}/${palette}/${effectiveMode}`}</output>;
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function seed(pref: Partial<AppearancePref>) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ mode: null, palette: 'terracotta', updatedAt: 0, ...pref }),
  );
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.palette;
  stubMatchMedia(false);
});
afterEach(cleanup);

describe('<AppearanceProvider>', () => {
  it('mounts from a seeded localStorage value and applies both attributes to <html>', () => {
    seed({ mode: 'dark', palette: 'plum', updatedAt: 10 });
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark/plum/dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.palette).toBe('plum');
  });

  it('follows prefers-color-scheme when mode is null', () => {
    stubMatchMedia(true);
    seed({ mode: null, palette: 'sage', updatedAt: 10 });
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('null/sage/dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('a newer remoteValue wins over the local copy', () => {
    seed({ mode: 'light', palette: 'terracotta', updatedAt: 100 });
    const remoteValue: AppearancePref = { mode: 'dark', palette: 'plum', updatedAt: 500 };
    render(
      <AppearanceProvider remoteValue={remoteValue}>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark/plum/dark');
  });

  it('a stale remoteValue does not override a newer local copy', () => {
    seed({ mode: 'dark', palette: 'sage', updatedAt: 900 });
    const remoteValue: AppearancePref = { mode: 'light', palette: 'terracotta', updatedAt: 5 };
    render(
      <AppearanceProvider remoteValue={remoteValue}>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('dark/sage/dark');
  });
});
