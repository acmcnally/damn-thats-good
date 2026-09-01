import { describe, expect, it } from 'vitest';
import { DB_PACKAGE } from './index';

describe('@dtg/db', () => {
  it('exposes its package name', () => {
    expect(DB_PACKAGE).toBe('@dtg/db');
  });
});
