import { Inject, Injectable } from '@nestjs/common';
import { RegisterDashboardWidgets } from '../dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
} from '../dashboard.types.js';
import {
  DASHBOARD_STATS_READER,
  type DashboardStatsReader,
} from '../ports/dashboard-stats.reader.js';
import { statsScopeOf } from './stats-scope.js';

/** Users and pending invitations of the platform, the denomination or the congregation in scope. */
@Injectable()
@RegisterDashboardWidgets()
export class UsersOverviewWidgets implements DashboardWidgetProvider {
  readonly key = 'users-overview';
  readonly requiredPermissions = ['users.manage'] as const;
  readonly scopeKinds = ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(DASHBOARD_STATS_READER)
    private readonly stats: DashboardStatsReader,
  ) {}

  async provide({ tenant }: DashboardContext): Promise<DashboardContribution> {
    const users = await this.stats.countUsers(statsScopeOf(tenant));
    const pending = users.pendingInvitations;

    return {
      kpis: [
        {
          key: 'users',
          order: 30,
          tab: 'general',
          label: 'Usuarios activos',
          value: users.active,
          format: 'integer',
          hint: `${pending} ${pending === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}`,
          icon: 'users',
          tone: 'slate',
          link: '/users',
          previous: null,
        },
      ],
    };
  }
}
