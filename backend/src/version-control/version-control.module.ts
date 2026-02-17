import { Module } from '@nestjs/common';
import { VersionControlService } from './version-control.service';
import { VersionControlController } from './version-control.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [VersionControlController],
  providers: [VersionControlService],
  exports: [VersionControlService],
})
export class VersionControlModule {}
