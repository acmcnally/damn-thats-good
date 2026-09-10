import { afterEach, describe, expect, it, vi } from 'vitest';

import { mergePref, readStored, resolveEffectiveMode, STORAGE_KEY, writeStored } from './resolve';
import type { AppearancePref } from './types';

function fakeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(STORAGE_KEY, initial);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    _raw: () => store.get(STORAGE_KEY),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readStored', () => {
  it('returns the default when nothing is stored', () => {
    expect(readStored(fakeStorage())).toEqual({ mode: null, palette: 'terracotta', updatedAt: 0 });
  });

  it('returns the default for malformed JSON', () => {
    expect(readStored(fakeStorage('{not json'))).toEqual({
      mode: null,
      palette: 'terracotta',
      updatedAt: 0,
    });
  });

  it('parses a valid stored value', () => {
    const raw = JSON.stringify({ mode: 'dark', palette: 'plum', updatedAt: 1234 });
    expect(readStored(fakeStorage(raw))).toEqual({
      mode: 'dark',
      palette: 'plum',
      updatedAt: 1234,
    });
  });

  it('coerces an unknown palette to terracotta', () => {
    const raw = JSON.stringify({ mode: 'light', palette: 'chartreuse', updatedAt: 5 });
    expect(readStored(fakeStorage(raw)).palette).toBe('terracotta');
  });

  it('coerces an unknown mode to null (follow system)', () => {
    const raw = JSON.stringify({ mode: 'sepia', palette: 'sage', updatedAt: 5 });
    expect(readStored(fakeStorage(raw)).mode).toBeNull();
  });

  it('tolerates a missing updatedAt (treats it as 0)', () => {
    const raw = JSON.stringify({ mode: 'dark', palette: 'sage' });
    expect(readStored(fakeStorage(raw))).toEqual({ mode: 'dark', palette: 'sage', updatedAt: 0 });
  });

  it('tolerates a non-numeric updatedAt', () => {
    const raw = JSON.stringify({ mode: 'dark', palette: 'sage', updatedAt: 'yesterday' });
    expect(readStored(fakeStorage(raw)).updatedAt).toBe(0);
  });

  it('returns the default when getItem throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(readStored(throwing)).toEqual({ mode: null, palette: 'terracotta', updatedAt: 0 });
  });
});

describe('writeStored', () => {
  it('round-trips and stamps updatedAt', () => {
    const storage = fakeStorage();
    const written = writeStored({ mode: 'dark', palette: 'plum' }, storage, 999);
    expect(written).toEqual({ mode: 'dark', palette: 'plum', updatedAt: 999 });
    expect(readStored(storage)).toEqual(written);
  });

  it('does not throw when setItem throws (localStorage unavailable)', () => {
    const throwing = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeStored({ mode: 'light', palette: 'sage' }, throwing, 1)).not.toThrow();
  });
});

describe('resolveEffectiveMode', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    [null, false, 'light'],
    [null, true, 'dark'],
  ] as const)('mode=%s systemDark=%s -> %s', (mode, systemDark, expected) => {
    expect(resolveEffectiveMode(mode, systemDark)).toBe(expected);
  });
});

describe('mergePref', () => {
  const local: AppearancePref = { mode: 'dark', palette: 'plum', updatedAt: 100 };

  it('keeps the newer of the two by updatedAt', () => {
    const remote: AppearancePref = { mode: 'light', palette: 'sage', updatedAt: 200 };
    expect(mergePref(local, remote)).toBe(remote);
  });

  it('keeps local when it is newer', () => {
    const remote: AppearancePref = { mode: 'light', palette: 'sage', updatedAt: 50 };
    expect(mergePref(local, remote)).toBe(local);
  });

  it('prefers remote on a tie', () => {
    const remote: AppearancePref = { mode: 'light', palette: 'sage', updatedAt: 100 };
    expect(mergePref(local, remote)).toBe(remote);
  });
});
