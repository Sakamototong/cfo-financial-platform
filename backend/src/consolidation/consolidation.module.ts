import { Module } from '@nestjs/common';
import { ConsolidationController } from './consolidation.controller';
import { FinancialModule } from '../financial/financial.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FinancialModule, AuthModule],
  controllers: [ConsolidationController],
})
export class ConsolidationModule {}
