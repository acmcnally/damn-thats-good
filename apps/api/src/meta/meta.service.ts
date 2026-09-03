import { appMeta } from '@dtg/db';
import type { MetaResponse } from '@dtg/shared';
import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

/**
 * SCAFFOLD(DAMN-26): reads the seeded `app_meta` row so the walking-skeleton page
 * can render data that came from Postgres through the API. Replaced by real recipe
 * endpoints in DAMN-1 / DAMN-2.
 */
@Injectable()
export class MetaService {
  constructor(private readonly database: DatabaseService) {}

  async get(): Promise<MetaResponse> {
    const [row] = await this.database.db.select().from(appMeta).limit(1);
    if (!row) {
      // The baseline migration seeds this row; absence means the DB is not migrated.
      throw new Error('app_meta is empty — run migrations');
    }
    return { name: row.name, seededAt: row.seededAt.toISOString() };
  }
}
