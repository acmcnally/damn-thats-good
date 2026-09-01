import { describe, expect, it } from 'vitest';
import { greeting } from '@dtg/shared';

describe('@dtg/web wiring', () => {
  it('resolves the shared workspace package', () => {
    expect(greeting('web')).toBe('Hello from web');
  });
});
