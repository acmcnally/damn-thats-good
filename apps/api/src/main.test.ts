import { describe, expect, it } from 'vitest';
import { DB_PACKAGE } from '@dtg/db';
import { greeting } from '@dtg/shared';

describe('@dtg/api wiring', () => {
  it('resolves the shared workspace packages', () => {
    expect(greeting(DB_PACKAGE)).toBe('Hello from @dtg/db');
  });
});
