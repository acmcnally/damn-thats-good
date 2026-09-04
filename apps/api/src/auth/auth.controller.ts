import type { ConfigResponse, MeResponse } from '@dtg/shared';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { CurrentUser } from './authenticated-user';
import { Public } from './public.decorator';

@Controller()
export class AuthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Protected by the global guard — no decorator needed. `req.user` is already
   * `MeResponse`-shaped (see authenticated-user.ts), so no re-mapping here. */
  @Get('me')
  me(@CurrentUser() user: MeResponse): MeResponse {
    return user;
  }

  /**
   * `@Public()` — the frontend needs this *before* it can authenticate at all (it's how
   * `AuthKitProvider` gets its Client ID). See technical-design.md's "Config / env
   * changes" for why this exists instead of a Vite build-time env var: the same built
   * image is promoted from staging to prod unchanged, so anything baked in at build
   * time would carry staging's value into prod.
   */
  @Public()
  @Get('config')
  getConfig(): ConfigResponse {
    return { workosClientId: this.config.get('WORKOS_CLIENT_ID', { infer: true }) };
  }
}
