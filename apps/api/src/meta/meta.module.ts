import { Module } from '@nestjs/common';

import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

/** SCAFFOLD(DAMN-26): removed with the rest of the meta scaffold in DAMN-1 / DAMN-2. */
@Module({
  controllers: [MetaController],
  providers: [MetaService],
})
export class MetaModule {}
