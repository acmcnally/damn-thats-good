import type { MetaResponse } from '@dtg/shared';
import { Controller, Get } from '@nestjs/common';

import { MetaService } from './meta.service';

/** SCAFFOLD(DAMN-26): `GET /api/meta` — the endpoint the skeleton page reads. */
@Controller('meta')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get()
  get(): Promise<MetaResponse> {
    return this.meta.get();
  }
}
