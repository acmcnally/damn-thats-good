import { greeting } from '@dtg/shared';
import { describe, expect, it } from 'vitest';

describe('@dtg/web wiring', () => {
  it('resolves the shared workspace package', () => {
    expect(greeting('web')).toBe('Hello from web');
  });
});
