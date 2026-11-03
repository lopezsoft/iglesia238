import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/time/bogota-time.js';
import { RegisterDashboardWidgets } from '../dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
} from '../dashboard.types.js';
import {
  AUDIT_ACTIVITY_READER,
  type AuditActivityReader,
  DASHBOARD_STATS_READER,
  type DashboardStatsReader,
} from '../ports/dashboard-stats.reader.js';
import { statsScopeOf } from './stats-scope.js';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Platform administrator: how many denominations and congregations the platform serves. */
@Injectable()
@RegisterDashboardWidgets()
export class PlatformOverviewWidgets implements DashboardWidgetProvider {
  readonly key = 'platform-overview';
  readonly requiredPermissions = ['denominations.manage'] as const;
  readonly scopeKinds = ['PLATFORM'] as const;

  constructor(
    @Inject(DASHBOARD_STATS_READER)
    private readonly stats: DashboardStatsReader,
  ) {}

  async provide(): Promise<DashboardContribution> {
    const [denominations, congregations] = await Promise.all([
      this.stats.countDenominations(),
      this.stats.countActiveCongregations({
        denominationId: null,
        congregationId: null,
      }),
    ]);
    return {
      kpis: [
        {
          key: 'denominations',
          order: 10,
          tab: 'general',
          label: 'Denominaciones activas',
          value: denominations.active,
          format: 'integer',
          hint: plural(denominations.inactive, 'inactiva', 'inactivas'),
          icon: 'landmark',
          tone: 'indigo',
          link: '/denominations',
          previous: null,
        },
        {
          key: 'congregations',
          order: 20,
          tab: 'general',
          label: 'Sedes activas',
          value: congregations,
          format: 'integer',
          hint: 'En todas las denominaciones',
          icon: 'building',
          tone: 'cyan',
          link: null,
          previous: null,
        },
      ],
    };
  }
}

/** Platform administrator: sign-in security of the period, from the audit trail and the accounts. */
@Injectable()
@RegisterDashboardWidgets()
export class PlatformSecurityWidgets implements DashboardWidgetProvider {
  readonly key = 'platform-security';
  readonly requiredPermissions = ['users.manage'] as const;
  readonly scopeKinds = ['PLATFORM'] as const;

  constructor(
    @Inject(DASHBOARD_STATS_READER)
    private readonly stats: DashboardStatsReader,
    @Inject(AUDIT_ACTIVITY_READER) private readonly audit: AuditActivityReader,
    private readonly clock: Clock,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const scope = statsScopeOf(tenant);
    const [locked, failed, signedIn, users] = await Promise.all([
      this.stats.countLockedAccounts(this.clock.now()),
      this.audit.countEvents(scope, window.current, 'LOGIN_FAILED'),
      this.audit.countEvents(scope, window.current, 'LOGIN'),
      this.stats.countUsers(scope),
    ]);
    const period = window.label.toLowerCase();

    return {
      panels: [
        {
          key: 'platform-security',
          order: 10,
          tab: 'indicators',
          title: 'Seguridad y accesos',
          subtitle: `Inicios de sesión y cuentas · ${period}`,
          icon: 'shield-check',
          tone: 'indigo',
          link: '/users',
          linkLabel: 'Ver usuarios',
          stats: [
            {
              key: 'sign-ins',
              label: 'Inicios de sesión',
              value: signedIn,
              format: 'integer',
              meta: `Correctos · ${period}`,
              icon: 'log-out',
              tone: 'green',
            },
            {
              key: 'failed-sign-ins',
              label: 'Intentos fallidos',
              value: failed,
              format: 'integer',
              meta: `Contraseña o correo incorrectos · ${period}`,
              icon: 'alert',
              tone: 'orange',
            },
            {
              key: 'locked-accounts',
              label: 'Cuentas bloqueadas',
              value: locked,
              format: 'integer',
              meta: 'Bloqueo temporal ahora mismo',
              icon: 'lock',
              tone: 'red',
            },
            {
              key: 'pending-invitations',
              label: 'Invitaciones pendientes',
              value: users.pendingInvitations,
              format: 'integer',
              meta: 'Esperan crear su contraseña',
              icon: 'mail',
              tone: 'cyan',
            },
          ],
        },
      ],
    };
  }
}
