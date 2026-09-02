import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MetaModule } from './meta/meta.module';

@Module({
  imports: [
    // envFilePath is resolved from cwd: the repo-root .env during `pnpm dev` (cwd is
    // apps/api). In containers the file is absent and Compose sets the vars directly —
    // ConfigModule then just reads process.env.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['../../.env'] }),
    DatabaseModule,
    HealthModule,
    MetaModule, // SCAFFOLD(DAMN-26)
  ],
})
export class AppModule {}
