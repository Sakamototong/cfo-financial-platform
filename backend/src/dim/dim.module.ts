import { Module } from '@nestjs/common';
import { DimController } from './dim.controller';
import { DimService } from './dim.service';
import { DatabaseModule } from '../database/database.module';
import { LoggerModule } from '../logger/logger.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [DatabaseModule, LoggerModule, AuthModule, UserModule],
  controllers: [DimController],
  providers: [DimService],
  exports: [DimService],
})
export class DimModule {}
