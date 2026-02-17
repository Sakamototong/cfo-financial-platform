import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { EtlController } from './etl.controller';
import { EtlService } from './etl.service';
import { AuthModule } from '../auth/auth.module';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports: [
    AuthModule,
    FinancialModule,
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [EtlController],
  providers: [EtlService],
  exports: [EtlService],
})
export class EtlModule {}
