import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { appMeta, DB_PACKAGE } from './index';

describe('@dtg/db schema', () => {
  it('defines app_meta with the expected columns', () => {
    const { name, columns } = getTableConfig(appMeta);
    expect(name).toBe('app_meta');
    expect(columns.map((c) => c.name).sort()).toEqual(['id', 'name', 'seeded_at']);
  });

  it('marks name and seeded_at NOT NULL', () => {
    const { columns } = getTableConfig(appMeta);
    const notNull = Object.fromEntries(columns.map((c) => [c.name, c.notNull]));
    expect(notNull).toMatchObject({ name: true, seeded_at: true });
  });
});

describe('@dtg/db (scaffold)', () => {
  it('still exposes DB_PACKAGE until Phase B', () => {
    expect(DB_PACKAGE).toBe('@dtg/db');
  });
});
