import { createDb, type Database, type DbHandle } from '@dtg/db';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

/**
 * Owns the single Drizzle connection pool for the process. Injected wherever a
 * query is needed; `onModuleDestroy` closes the pool on shutdown (main.ts calls
 * `enableShutdownHooks`).
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly handle: DbHandle;

  constructor(config: ConfigService<Env, true>) {
    this.handle = createDb(config.get('DATABASE_URL', { infer: true }));
  }

  get db(): Database {
    return this.handle.db;
  }

  onModuleDestroy(): Promise<void> {
    return this.handle.close();
  }
}
