import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SystemUsersModule } from '../system-users/system-users.module';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SystemUsersModule, TenantModule, UserModule, AuthModule],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}
