import { startTestDb, type TestDb } from '@dtg/db/testing';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Component tier (ADR-0012): the real Nest app + real Drizzle against a throwaway
// Postgres. One container for the file — starting it is the slow part.
//
// AppModule is imported *dynamically* inside beforeAll: `ConfigModule.forRoot` validates
// the env the moment app.module.ts is evaluated, so DATABASE_URL has to be set first.
let db: TestDb;
let app: INestApplication;

beforeAll(async () => {
  db = await startTestDb();
  process.env.DATABASE_URL = db.url;

  const { AppModule } = await import('./app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await db?.teardown();
});

describe('GET /api/health', () => {
  it('returns 200 / db up against a real Postgres', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('GET /api/meta', () => {
  it('returns the seeded app_meta row', async () => {
    const res = await request(app.getHttpServer()).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Damn That's Good" });
    expect(typeof res.body.seededAt).toBe('string');
  });
});
