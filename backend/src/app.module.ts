import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TenantModule } from './tenant/tenant.module';
import { KmsModule } from './kms/kms.module';
import { AuthModule } from './auth/auth.module';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { FinancialModule } from './financial/financial.module';
import { EtlModule } from './etl/etl.module';
import { ScenarioModule } from './scenario/scenario.module';
import { ProjectionModule } from './projection/projection.module';
import { ReportsModule } from './reports/reports.module';
import { UserModule } from './user/user.module';
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { DimModule } from './dim/dim.module';
import { AdminModule } from './admin/admin.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ConsolidationModule } from './consolidation/consolidation.module';
import { SystemUsersModule } from './system-users/system-users.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { CoaModule } from './coa/coa.module';
import { BudgetModule } from './budget/budget.module';
import { EtlEnhancedModule } from './etl-enhanced/etl-enhanced.module';
import { CashflowModule } from './cashflow/cashflow.module';
import { VersionControlModule } from './version-control/version-control.module';
import { DsrModule } from './dsr/dsr.module';
import { HealthModule } from './health/health.module';
import { BillingModule } from './billing/billing.module';
import { throttleConfig } from './config/throttle.config';
import { RedisThrottlerStorage } from './config/redis-throttler.storage';
import { RedisThrottlerStorageModule } from './config/redis-throttler-storage.module';
// import { PrivacyModule } from './privacy/privacy.module';
// import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    // Redis storage module must be loaded first for ThrottlerModule injection
    RedisThrottlerStorageModule,
    // Rate Limiting with Redis-backed storage for stability and horizontal scaling.
    // RedisThrottlerStorage falls back to in-memory if Redis is unavailable.
    ThrottlerModule.forRootAsync({
      imports: [RedisThrottlerStorageModule],
      useFactory: (redisStorage: RedisThrottlerStorage) => ({
        throttlers: throttleConfig,
        storage: redisStorage,
      } as any),
      inject: [RedisThrottlerStorage],
    }),
    // Core modules
    LoggerModule,
    DatabaseModule,
    HealthModule,
    KmsModule,
    TenantModule,
    AuthModule,
    ConsolidationModule,
    FinancialModule,
    EtlModule,
    ScenarioModule,
    ProjectionModule,
    ReportsModule,
    UserModule,
    DimModule,
    AdminModule,
    WorkflowModule,
    SystemUsersModule,
    SuperAdminModule,
    CoaModule,
    BudgetModule,
    EtlEnhancedModule,
    CashflowModule,
    VersionControlModule,
    DsrModule,
    BillingModule,
    // Privacy and Audit modules (commented out for now)
    // PrivacyModule,
    // AuditModule,
    // AI assistant
    // (no module needed; controller/service registered below)
  ],
  controllers: [AiController],
  providers: [
    AiService,
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
