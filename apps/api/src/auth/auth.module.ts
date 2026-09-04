import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { WorkosModule } from './workos.module';

@Module({
  imports: [WorkosModule, UsersModule],
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
