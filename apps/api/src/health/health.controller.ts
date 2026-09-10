import type { HealthResponse } from '@dtg/shared';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * `GET /api/health` — unauthenticated by design and stays that way in every
   * release (ADR-0010: the uptime monitor hits it; DAMN-1's global auth guard
   * exempts it via `@Public()`). Returns 200 when the DB is reachable, 503
   * otherwise, with the same body shape either way.
   */
  @Public()
  @Get()
  async get(): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
