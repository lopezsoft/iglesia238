import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { ERROR_TRANSLATORS } from './common/errors/error-translator.port.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { JwtAuthGuard } from './common/security/jwt-auth.guard.js';
import { PermissionsGuard } from './common/security/permissions.guard.js';
import { validateEnvironment } from './config/environment.js';
import { FoundationModule } from './foundation/foundation.module.js';
import { PrismaErrorTranslator } from './infrastructure/prisma/prisma-error.translator.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { AccountingSetupModule } from './modules/accounting-setup/accounting-setup.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { CashBookModule } from './modules/cash-book/cash-book.module.js';
import { CertificatesModule } from './modules/certificates/certificates.module.js';
import { ContributionsModule } from './modules/contributions/contributions.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DenominationsModule } from './modules/denominations/denominations.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { CatalogsModule } from './modules/catalogs/catalogs.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MembershipApplicationsModule } from './modules/membership-applications/membership-applications.module.js';
import { MembershipModule } from './modules/membership/membership.module.js';
import { PrivacyPoliciesModule } from './modules/privacy-policies/privacy-policies.module.js';
import { PublicModule } from './modules/public/public.module.js';
import { SecretariatRecordsModule } from './modules/secretariat-records/secretariat-records.module.js';
import { VowsModule } from './modules/vows/vows.module.js';
import { BudgetsModule } from './modules/budgets/budgets.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { TitheSettlementsModule } from './modules/tithe-settlements/tithe-settlements.module.js';

/** Composition root: the only place that wires ports to concrete infrastructure. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggingModule,
    PrismaModule,
    FoundationModule,
    HealthModule,
    DenominationsModule,
    OrganizationModule,
    UsersModule,
    AuditLogsModule,
    AccountingSetupModule,
    CashBookModule,
    AuthModule,
    CatalogsModule,
    DashboardModule,
    AttendanceModule,
    SecretariatRecordsModule,
    CertificatesModule,
    ContributionsModule,
    VowsModule,
    TitheSettlementsModule,
    BudgetsModule,
    ReportsModule,
    PublicModule,
    PrivacyPoliciesModule,
    MembershipApplicationsModule,
    MembershipModule,
  ],
  providers: [
    {
      provide: ERROR_TRANSLATORS,
      useFactory: (prisma: PrismaErrorTranslator) => [prisma],
      inject: [PrismaErrorTranslator],
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate first, then validate the scope and the permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
