import 'reflect-metadata';

import type { Server } from 'node:http';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import type { Env } from './config/env';

// NestJS's own shutdown path (`enableShutdownHooks`/`app.close()`) runs DI destroy
// hooks — closing DatabaseService's pool — BEFORE it touches the HTTP server, and even
// then its Express adapter's `close()` immediately `socket.destroy()`s every open
// connection rather than draining. So a request in flight when the signal arrives
// loses its DB connection first, then gets its socket killed outright. Handle shutdown
// ourselves instead: stop accepting new connections and let in-flight ones finish
// (bounded, in case a client is holding a stale keep-alive socket open) before tearing
// down the DI container/DB pool.
const SHUTDOWN_GRACE_MS = 10_000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Express doesn't parse cookies by default. Only the E2E auth bypass (DAMN-1) reads
  // one (`e2e_bypass`) — no signing secret needed, the cookie carries zero trust on its
  // own (see JwtAuthGuard / technical-design.md's E2E-bypass invariant).
  app.use(cookieParser());

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('API_PORT', { infer: true });

  await app.listen(port);
  console.log(`api listening on http://localhost:${port}/api`);

  const httpServer = app.getHttpServer() as Server;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      console.log(`api: ${signal} received, draining connections`);
      const forceTimer = setTimeout(() => {
        console.log('api: shutdown grace period elapsed, closing remaining connections');
        httpServer.closeAllConnections();
      }, SHUTDOWN_GRACE_MS);
      httpServer.close(() => {
        clearTimeout(forceTimer);
        void app.close().then(() => process.exit(0));
      });
    });
  }
}

bootstrap().catch((err: unknown) => {
  console.error('api: failed to start', err);
  process.exit(1);
});
