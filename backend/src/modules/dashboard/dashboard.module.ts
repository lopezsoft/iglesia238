import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { DashboardWidgetRegistry } from './application/dashboard-widget-registry.js';
import { GetDashboardSummaryUseCase } from './application/get-dashboard-summary.use-case.js';
import { DASHBOARD_OPERATIONS_READER } from './application/ports/dashboard-operations.reader.js';
import { DASHBOARD_SCOPE_READER } from './application/ports/dashboard-scope.reader.js';
import {
  AUDIT_ACTIVITY_READER,
  DASHBOARD_STATS_READER,
} from './application/ports/dashboard-stats.reader.js';
import {
  ActivityWidgets,
  RecentAuditWidgets,
} from './application/providers/audit.widgets.js';
import {
  PlatformOverviewWidgets,
  PlatformSecurityWidgets,
} from './application/providers/platform.widgets.js';
import {
  ApplicationsWidgets,
  AttendanceWidgets,
  CertificatesWidgets,
  CongregationsWidgets,
  MembersWidgets,
} from './application/providers/operations.widgets.js';
import { UsersOverviewWidgets } from './application/providers/users.widgets.js';
import { PrismaAuditActivityReader } from './infrastructure/prisma-audit-activity.reader.js';
import { PrismaDashboardOperationsReader } from './infrastructure/prisma-dashboard-operations.reader.js';
import { PrismaDashboardScopeReader } from './infrastructure/prisma-dashboard-scope.reader.js';
import { PrismaDashboardStatsReader } from './infrastructure/prisma-dashboard-stats.reader.js';
import { DashboardController } from './presentation/dashboard.controller.js';

/**
 * The dashboard only orchestrates. Each area puts its widgets on the page with a provider class marked
 * @RegisterDashboardWidgets() in any module (see backend/README.md); the ones below are the platform and
 * access-management widgets, plus the secretariat counts (members, applications, certificates, attendance)
 * that only read through a single port.
 */
@Module({
  imports: [PrismaModule, DiscoveryModule],
  controllers: [DashboardController],
  providers: [
    DashboardWidgetRegistry,
    GetDashboardSummaryUseCase,
    { provide: DASHBOARD_SCOPE_READER, useClass: PrismaDashboardScopeReader },
    { provide: DASHBOARD_STATS_READER, useClass: PrismaDashboardStatsReader },
    { provide: AUDIT_ACTIVITY_READER, useClass: PrismaAuditActivityReader },
    {
      provide: DASHBOARD_OPERATIONS_READER,
      useClass: PrismaDashboardOperationsReader,
    },
    PlatformOverviewWidgets,
    PlatformSecurityWidgets,
    UsersOverviewWidgets,
    ActivityWidgets,
    RecentAuditWidgets,
    MembersWidgets,
    ApplicationsWidgets,
    CertificatesWidgets,
    AttendanceWidgets,
    CongregationsWidgets,
  ],
})
export class DashboardModule {}
