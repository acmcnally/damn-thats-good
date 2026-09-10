import { Module } from '@nestjs/common';

import { WorkosModule } from '../auth/workos.module';
import { UsersService } from './users.service';

@Module({
  imports: [WorkosModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
