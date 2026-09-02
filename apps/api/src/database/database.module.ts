import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';

/** Global so feature modules can inject `DatabaseService` without re-importing. */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
