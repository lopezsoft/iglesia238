import { Inject, Injectable } from '@nestjs/common';
import { RegisterDashboardWidgets } from '../dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
} from '../dashboard.types.js';
import {
  DASHBOARD_OPERATIONS_READER,
  type DashboardOperationsReader,
} from '../ports/dashboard-operations.reader.js';
import {
  DASHBOARD_STATS_READER,
  type DashboardStatsReader,
} from '../ports/dashboard-stats.reader.js';
import { statsScopeOf } from './stats-scope.js';

/** A card that expires within this many days is shown as a warning. */
const CARD_WARNING_DAYS = 30;
/** The membership hero loses to the contributions hero (50) and wins over the audit activity one. */
const MEMBERS_HERO_PRIORITY = 40;
const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Active members of the sede or the denomination and how many joined in the period. */
@Injectable()
@RegisterDashboardWidgets()
export class MembersWidgets implements DashboardWidgetProvider {
  readonly key = 'members';
  readonly requiredPermissions = ['members.read'] as const;
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(DASHBOARD_OPERATIONS_READER)
    private readonly operations: DashboardOperationsReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const counts = await this.operations.countMembers(
      statsScopeOf(tenant),
      window.current,
      window.previous,
    );
    return {
      hero: {
        key: 'members',
        priority: MEMBERS_HERO_PRIORITY,
        eyebrow: 'Membresía',
        title: 'Miembros activos',
        label: 'Miembros activos',
        value: counts.active,
        format: 'integer',
        previous: null,
        series: [],
        link: '/members',
      },
      kpis: [
        {
          key: 'members-joined',
          order: 60,
          tab: 'general',
          label: `Nuevos miembros · ${window.label}`,
          value: counts.joinedInRange,
          format: 'integer',
          hint: `${window.previousLabel}: ${counts.joinedInPrevious}`,
          icon: 'user-plus',
          tone: 'green',
          link: '/members',
          previous: counts.joinedInPrevious,
        },
      ],
    };
  }
}

/** Applications that still wait for a decision: the queue of whoever reviews them. */
@Injectable()
@RegisterDashboardWidgets()
export class ApplicationsWidgets implements DashboardWidgetProvider {
  readonly key = 'applications';
  readonly requiredPermissions = ['applications.review'] as const;
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(DASHBOARD_OPERATIONS_READER)
    private readonly operations: DashboardOperationsReader,
  ) {}

  async provide({ tenant }: DashboardContext): Promise<DashboardContribution> {
    const open = await this.operations.countOpenApplications(
      statsScopeOf(tenant),
    );
    return {
      kpis: [
        {
          key: 'applications-open',
          order: 5,
          tab: 'general',
          label: 'Solicitudes por revisar',
          value: open,
          format: 'integer',
          hint:
            open === 0
              ? 'No hay solicitudes pendientes'
              : 'Esperan una decisión del equipo de secretaría',
          icon: 'inbox',
          tone: open === 0 ? 'slate' : 'orange',
          link: '/applications',
          previous: null,
        },
      ],
    };
  }
}

/** Certificates issued in the period and cards about to expire, for one sede or a whole denomination. */
@Injectable()
@RegisterDashboardWidgets()
export class CertificatesWidgets implements DashboardWidgetProvider {
  readonly key = 'certificates';
  readonly requiredPermissions = ['certificates.issue'] as const;
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(DASHBOARD_OPERATIONS_READER)
    private readonly operations: DashboardOperationsReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const scope = statsScopeOf(tenant);
    const [issued, issuedBefore, expiring] = await Promise.all([
      this.operations.countCertificatesIssued(scope, window.current),
      this.operations.countCertificatesIssued(scope, window.previous),
      this.operations.countCardsExpiring(
        scope,
        window.today,
        addDays(window.today, CARD_WARNING_DAYS),
      ),
    ]);
    return {
      kpis: [
        {
          key: 'certificates-issued',
          order: 70,
          tab: 'general',
          label: `Certificados emitidos · ${window.label}`,
          value: issued,
          format: 'integer',
          hint: `${window.previousLabel}: ${issuedBefore}`,
          icon: 'certificate',
          tone: 'indigo',
          link: '/certificates',
          previous: issuedBefore,
        },
        {
          key: 'cards-expiring',
          order: 71,
          tab: 'general',
          label: 'Carnés por vencer',
          value: expiring,
          format: 'integer',
          hint: `Vencen en los próximos ${CARD_WARNING_DAYS} días`,
          icon: 'id-card',
          tone: expiring === 0 ? 'slate' : 'orange',
          link: '/certificates',
          previous: null,
        },
      ],
    };
  }
}

/** Attendance of the last recorded session and how many sessions the period has. */
@Injectable()
@RegisterDashboardWidgets()
export class AttendanceWidgets implements DashboardWidgetProvider {
  readonly key = 'attendance';
  readonly requiredPermissions = ['attendance.write'] as const;
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(DASHBOARD_OPERATIONS_READER)
    private readonly operations: DashboardOperationsReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const scope = statsScopeOf(tenant);
    const [latest, sessions, sessionsBefore] = await Promise.all([
      this.operations.latestAttendance(scope),
      this.operations.countAttendanceSessions(scope, window.current),
      this.operations.countAttendanceSessions(scope, window.previous),
    ]);
    return {
      kpis: [
        {
          key: 'attendance-latest',
          order: 80,
          tab: 'general',
          label: 'Última asistencia registrada',
          value: latest ? latest.headcount : 'Sin registros',
          format: latest ? 'integer' : 'text',
          hint: latest
            ? `${latest.meetingTypeName} · ${latest.sessionDate}`
            : 'Aún no se ha registrado asistencia',
          icon: 'calendar-check',
          tone: 'cyan',
          link: '/attendance',
          previous: null,
        },
        {
          key: 'attendance-sessions',
          order: 81,
          tab: 'indicators',
          label: `Reuniones registradas · ${window.label}`,
          value: sessions,
          format: 'integer',
          hint: `${window.previousLabel}: ${sessionsBefore}`,
          icon: 'calendar-check',
          tone: 'cyan',
          link: '/attendance',
          previous: sessionsBefore,
        },
      ],
    };
  }
}

/** Active sedes of the denomination for the person who manages them. */
@Injectable()
@RegisterDashboardWidgets()
export class CongregationsWidgets implements DashboardWidgetProvider {
  readonly key = 'congregations-overview';
  readonly requiredPermissions = ['congregations.manage'] as const;
  readonly scopeKinds = ['DENOMINATION'] as const;

  constructor(
    @Inject(DASHBOARD_STATS_READER)
    private readonly stats: DashboardStatsReader,
  ) {}

  async provide({ tenant }: DashboardContext): Promise<DashboardContribution> {
    const total = await this.stats.countActiveCongregations(
      statsScopeOf(tenant),
    );
    return {
      kpis: [
        {
          key: 'sedes',
          order: 15,
          tab: 'general',
          label: 'Sedes activas',
          value: total,
          format: 'integer',
          hint: null,
          icon: 'church',
          tone: 'indigo',
          link: '/organization',
          previous: null,
        },
      ],
    };
  }
}
