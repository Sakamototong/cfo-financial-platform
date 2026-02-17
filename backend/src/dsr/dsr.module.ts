import { Module } from '@nestjs/common';
import { DsrController } from './dsr.controller';
import { DsrService } from './dsr.service';
import { DatabaseModule } from '../database/database.module';
import { KmsModule } from '../kms/kms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, KmsModule, AuthModule],
  controllers: [DsrController],
  providers: [DsrService],
  exports: [DsrService],
})
export class DsrModule {}
