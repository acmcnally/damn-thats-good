import type { HealthResponse } from '@dtg/shared';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  /** Lightweight liveness + a single-round-trip DB connectivity probe (ADR-0010). */
  async check(): Promise<HealthResponse> {
    try {
      await this.database.db.execute(sql`select 1`);
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'error', db: 'down' };
    }
  }
}
