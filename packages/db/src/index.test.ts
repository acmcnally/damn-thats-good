import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { users } from './index';

describe('@dtg/db schema', () => {
  it('defines users with the expected columns', () => {
    const { name, columns } = getTableConfig(users);
    expect(name).toBe('users');
    expect(columns.map((c) => c.name).sort()).toEqual([
      'created_at',
      'email',
      'id',
      'updated_at',
      'workos_user_id',
    ]);
  });

  it('marks workos_user_id and email NOT NULL and unique', () => {
    const { columns } = getTableConfig(users);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(byName.workos_user_id).toMatchObject({ notNull: true, isUnique: true });
    expect(byName.email).toMatchObject({ notNull: true, isUnique: true });
  });

  it('id is the primary key', () => {
    const { primaryKeys, columns } = getTableConfig(users);
    // Drizzle represents a single-column PK via the column's own primary flag, not
    // a separate composite-PK entry — assert both so this doesn't silently drift.
    expect(primaryKeys).toEqual([]);
    expect(columns.find((c) => c.name === 'id')).toMatchObject({ primary: true });
  });
});
