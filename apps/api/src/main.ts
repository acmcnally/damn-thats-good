import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks(); // let DatabaseService.onModuleDestroy close the pool
  // Express doesn't parse cookies by default. Only the E2E auth bypass (DAMN-1) reads
  // one (`e2e_bypass`) — no signing secret needed, the cookie carries zero trust on its
  // own (see JwtAuthGuard / technical-design.md's E2E-bypass invariant).
  app.use(cookieParser());

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });

  await app.listen(port);
  console.log(`api listening on http://localhost:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  console.error('api: failed to start', err);
  process.exit(1);
});
