import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TokenInvalidError, type TokenVerifier } from '../auth/token-verifier';
import type { UserLookup } from '../auth/user-lookup';
import { bootstrapComponentApp } from '../test-support/component-app';

// Component tier (ADR-0012): the real Nest app (guards, controllers, services)
// against a throwaway Postgres — same shape as app.component.test.ts. WorkOS itself
// stays mocked throughout via the stub verifier/lookup.
let app: INestApplication;
let teardown: () => Promise<void>;
let subCounter = 0;

const KNOWN_TOKENS: Record<string, string> = {};

const stubVerifier: TokenVerifier = {
  verify(bearerToken) {
    const sub = KNOWN_TOKENS[`Bearer ${bearerToken}`];
    if (!sub) return Promise.reject(new TokenInvalidError('unknown test token'));
    return Promise.resolve({ sub });
  },
};

const stubUserLookup: UserLookup = {
  lookup(workosUserId) {
    return Promise.resolve({ email: `${workosUserId}@example.test` });
  },
};

beforeAll(async () => {
  ({ app, teardown } = await bootstrapComponentApp({
    tokenVerifier: stubVerifier,
    userLookup: stubUserLookup,
    configure: (app) => app.setGlobalPrefix('api'),
  }));
});

afterAll(async () => {
  await teardown?.();
});

/** Registers a fresh bearer token for a brand-new user (own book, via `BookContextGuard`'s
 * get-or-create) — disjoint per test case, same shape as app.component.test.ts's split. */
function freshToken(): string {
  const token = `test-user-${++subCounter}`;
  KNOWN_TOKENS[`Bearer ${token}`] = `workos_${token}`;
  return token;
}

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function minimalContent(itemText = 'flour') {
  return {
    ingredients: [
      {
        id: crypto.randomUUID(),
        kind: 'ingredient',
        raw: `2 cups ${itemText}`,
        quantity: '2 cups',
        item: itemText,
        parseStatus: 'auto',
      },
    ],
    steps: [{ id: crypto.randomUUID(), kind: 'step', text: 'Mix it all together.' }],
  };
}

function createBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Test Recipe',
    servings: 'Serves 4',
    provenance: 'A test fixture',
    tags: ['Dinner'],
    content: minimalContent(),
    ...overrides,
  };
}

describe('POST /api/recipes', () => {
  it('creates a recipe with its first version and tags, atomically', async () => {
    const token = freshToken();
    const res = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Test Recipe',
      servings: 'Serves 4',
      provenance: 'A test fixture',
      tags: ['dinner'], // normalized lowercase (decision #6)
      visibility: 'private',
      currentVersionNumber: 1,
      updateCnt: 1,
    });
    expect(res.body.content.ingredients).toHaveLength(1);
  });

  it('is race-safe when two creates in the same book submit overlapping tag names', async () => {
    const token = freshToken();
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/recipes')
        .set(authed(token))
        .send(createBody({ name: 'Recipe A', tags: ['Shared', 'OnlyA'] })),
      request(app.getHttpServer())
        .post('/api/recipes')
        .set(authed(token))
        .send(createBody({ name: 'Recipe B', tags: ['shared', 'OnlyB'] })),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const tags = await request(app.getHttpServer()).get('/api/tags').set(authed(token));
    const sharedRows = tags.body.filter((t: { name: string }) => t.name === 'shared');
    expect(sharedRows).toHaveLength(1); // exactly one "shared" row, not two
  });

  it('de-duplicates same-request tag variants ("Dessert" and "dessert")', async () => {
    const token = freshToken();
    const res = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody({ tags: ['Dessert', 'dessert'] }));
    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(['dessert']);
  });
});

describe('GET /api/recipes and /api/recipes/:id — scoping', () => {
  it("never exposes a second user's book", async () => {
    const ownerToken = freshToken();
    const otherToken = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(ownerToken))
      .send(createBody());

    const otherList = await request(app.getHttpServer())
      .get('/api/recipes')
      .set(authed(otherToken));
    expect(otherList.body).toEqual([]);

    const otherDetail = await request(app.getHttpServer())
      .get(`/api/recipes/${created.body.id}`)
      .set(authed(otherToken));
    expect(otherDetail.status).toBe(404);
  });

  it('lists a created recipe for its own owner', async () => {
    const token = freshToken();
    await request(app.getHttpServer()).post('/api/recipes').set(authed(token)).send(createBody());
    const list = await request(app.getHttpServer()).get('/api/recipes').set(authed(token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('content');
  });
});

describe('PATCH /api/recipes/:id — metadata concurrency', () => {
  it('succeeds with the correct expectedUpdtCnt', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    const res = await request(app.getHttpServer())
      .patch(`/api/recipes/${created.body.id}`)
      .set(authed(token))
      .send({ expectedUpdtCnt: created.body.updateCnt, name: 'Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.updateCnt).toBe(created.body.updateCnt + 1);
  });

  it('412s on a stale expectedUpdtCnt, attaching the current row', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());
    const staleCnt = created.body.updateCnt;

    await request(app.getHttpServer())
      .patch(`/api/recipes/${created.body.id}`)
      .set(authed(token))
      .send({ expectedUpdtCnt: staleCnt, name: 'First rename' });

    const res = await request(app.getHttpServer())
      .patch(`/api/recipes/${created.body.id}`)
      .set(authed(token))
      .send({ expectedUpdtCnt: staleCnt, name: 'Stale rename' });

    expect(res.status).toBe(412);
    expect(res.body.current).toMatchObject({ name: 'First rename' });
  });

  it('adds and drops tags in the same request, leaving the correct final set', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody({ tags: ['keep', 'drop'] }));

    const res = await request(app.getHttpServer())
      .patch(`/api/recipes/${created.body.id}`)
      .set(authed(token))
      .send({ expectedUpdtCnt: created.body.updateCnt, tags: ['keep', 'new'] });

    expect(res.status).toBe(200);
    expect(res.body.tags.sort()).toEqual(['keep', 'new']);
  });
});

describe('PUT /api/recipes/:id/content — optimistic concurrency', () => {
  it('is a no-op (same version) when the submitted content is unchanged', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    const res = await request(app.getHttpServer())
      .put(`/api/recipes/${created.body.id}/content`)
      .set(authed(token))
      .send({ baseVersionId: created.body.currentVersionId, content: created.body.content });

    expect(res.status).toBe(200);
    expect(res.body.currentVersionId).toBe(created.body.currentVersionId);
    expect(res.body.currentVersionNumber).toBe(1);
  });

  it('creates a new version when content actually changes', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    const res = await request(app.getHttpServer())
      .put(`/api/recipes/${created.body.id}/content`)
      .set(authed(token))
      .send({ baseVersionId: created.body.currentVersionId, content: minimalContent('sugar') });

    expect(res.status).toBe(200);
    expect(res.body.currentVersionNumber).toBe(2);
    expect(res.body.currentVersionId).not.toBe(created.body.currentVersionId);
  });

  it('412s on a stale baseVersionId, attaching the current version', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    await request(app.getHttpServer())
      .put(`/api/recipes/${created.body.id}/content`)
      .set(authed(token))
      .send({ baseVersionId: created.body.currentVersionId, content: minimalContent('sugar') });

    const res = await request(app.getHttpServer())
      .put(`/api/recipes/${created.body.id}/content`)
      .set(authed(token))
      .send({ baseVersionId: created.body.currentVersionId, content: minimalContent('salt') });

    expect(res.status).toBe(412);
    expect(res.body.current.currentVersionNumber).toBe(2);
  });

  it('under a race, exactly one of two concurrent saves against the same stale baseVersionId succeeds', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody());

    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .put(`/api/recipes/${created.body.id}/content`)
        .set(authed(token))
        .send({ baseVersionId: created.body.currentVersionId, content: minimalContent('sugar') }),
      request(app.getHttpServer())
        .put(`/api/recipes/${created.body.id}/content`)
        .set(authed(token))
        .send({ baseVersionId: created.body.currentVersionId, content: minimalContent('salt') }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 412]);
  });
});

describe('DELETE /api/recipes/:id', () => {
  it('deletes a recipe with versions and tags, without a foreign-key-violation error', async () => {
    const token = freshToken();
    const created = await request(app.getHttpServer())
      .post('/api/recipes')
      .set(authed(token))
      .send(createBody({ tags: ['keep-me'] }));

    const res = await request(app.getHttpServer())
      .delete(`/api/recipes/${created.body.id}`)
      .set(authed(token));
    expect(res.status).toBe(204);

    const detail = await request(app.getHttpServer())
      .get(`/api/recipes/${created.body.id}`)
      .set(authed(token));
    expect(detail.status).toBe(404);
  });
});
