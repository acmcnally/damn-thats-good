import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { recipes, recipeTags, recipeVersions, tags, users } from './index';

describe('@dtg/db schema', () => {
  it('defines users with the expected (renamed) columns', () => {
    const { name, columns } = getTableConfig(users);
    expect(name).toBe('users');
    expect(columns.map((c) => c.name).sort()).toEqual([
      'create_dt_tm',
      'email',
      'id',
      'update_dt_tm',
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

  it('defines recipes with the expected columns', () => {
    const { name, columns } = getTableConfig(recipes);
    expect(name).toBe('recipes');
    expect(columns.map((c) => c.name).sort()).toEqual([
      'book_id',
      'create_dt_tm',
      'current_version_id',
      'id',
      'name',
      'provenance',
      'servings',
      'update_cnt',
      'update_dt_tm',
      'visibility',
    ]);
  });

  it('defaults recipes.visibility to private and update_cnt to 1', () => {
    const { columns } = getTableConfig(recipes);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(byName.visibility?.default).toBe('private');
    expect(byName.update_cnt?.default).toBe(1);
  });

  it('defines recipe_versions with a unique (recipe_id, version_number) index', () => {
    const { name, columns, indexes } = getTableConfig(recipeVersions);
    expect(name).toBe('recipe_versions');
    expect(columns.map((c) => c.name).sort()).toEqual([
      'author_id',
      'content',
      'create_dt_tm',
      'id',
      'note',
      'recipe_id',
      'version_number',
    ]);
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({ config: { unique: true } });
  });

  it('defines tags with a unique (book_id, name) index', () => {
    const { name, indexes } = getTableConfig(tags);
    expect(name).toBe('tags');
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({ config: { unique: true } });
  });

  it('defines recipe_tags as a pure join table with a composite primary key', () => {
    const { name, columns, primaryKeys } = getTableConfig(recipeTags);
    expect(name).toBe('recipe_tags');
    expect(columns.map((c) => c.name).sort()).toEqual(['recipe_id', 'tag_id']);
    expect(primaryKeys).toHaveLength(1);
  });
});
