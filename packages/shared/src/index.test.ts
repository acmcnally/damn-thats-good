import { describe, expect, it } from 'vitest';

import { greeting, SHARED_PACKAGE } from './index';

describe('@dtg/shared', () => {
  it('exposes its package name', () => {
    expect(SHARED_PACKAGE).toBe('@dtg/shared');
  });

  it('builds a greeting', () => {
    expect(greeting('web')).toBe('Hello from web');
  });
});
