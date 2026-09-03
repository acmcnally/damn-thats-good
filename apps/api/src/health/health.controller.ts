import type { HealthResponse } from '@dtg/shared';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * `GET /api/health` — unauthenticated by design and stays that way in every
   * release (ADR-0010: the uptime monitor hits it). Returns 200 when the DB is
   * reachable, 503 otherwise, with the same body shape either way.
   */
  @Get()
  async get(): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
