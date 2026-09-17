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

  /**
   * `GET /api/health/live` — liveness only, deliberately independent of the DB.
   * Caddy's active health check (infra/Caddyfile) targets this instead of the DB-
   * inclusive `/api/health`: a transient DB blip must not mark the whole `api:3000`
   * upstream down and 502 every `/api/*` route through it, including ones that
   * never touch the database (`/api/config`). `/api/health` itself keeps its
   * documented DB-inclusive contract (ADR-0010) for the external uptime monitor.
   */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
