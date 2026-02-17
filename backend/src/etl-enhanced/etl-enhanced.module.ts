import { Module } from '@nestjs/common';
import { EtlEnhancedController } from './etl-enhanced.controller';
import { EtlEnhancedService } from './etl-enhanced.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [EtlEnhancedController],
  providers: [EtlEnhancedService],
  exports: [EtlEnhancedService],
})
export class EtlEnhancedModule {}
