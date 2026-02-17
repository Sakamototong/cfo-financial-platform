import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantsCompatController } from '../compat/tenants.controller';
import { MyTenantsController } from './my-tenants.controller';
import { TenantService } from './tenant.service';
import { KmsModule } from '../kms/kms.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [KmsModule, AuthModule, UserModule],
  controllers: [TenantController, TenantsCompatController, MyTenantsController],
  providers: [TenantService],
  exports: [TenantService]
})
export class TenantModule {}
