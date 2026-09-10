import { fileURLToPath } from 'node:url';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';

// Repo-root .env, resolved from this file's location (not cwd) so it works however the
// process is launched. In containers the file is absent — ConfigModule then just reads
// process.env, which Compose populates. process.env still wins over the file.
const repoEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: [repoEnvFile] }),
    DatabaseModule,
    HealthModule,
    UsersModule,
    AuthModule, // registers the global JwtAuthGuard (DAMN-1) — every route is
    // authenticated by default from here on; @Public() opts a route out.
  ],
})
export class AppModule {}
