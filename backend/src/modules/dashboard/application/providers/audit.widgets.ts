import { Inject, Injectable } from '@nestjs/common';
import { auditActionLabel, auditEntityLabel } from '../audit-labels.js';
import { RegisterDashboardWidgets } from '../dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
} from '../dashboard.types.js';
import { lastMonths } from '../period-window.js';
import {
  AUDIT_ACTIVITY_READER,
  type AuditActivityReader,
} from '../ports/dashboard-stats.reader.js';
import { statsScopeOf } from './stats-scope.js';

export const RECENT_AUDIT_LIMIT = 5;
export const TREND_MONTHS = 6;
/** The lowest priority: any area with a business figure (contributions, members) wins the hero. */
export const ACTIVITY_HERO_PRIORITY = 10;

/**
 * Hero and trend built from the audit trail: how many things happened in the period, against the period
 * before. It is the only headline every administrator can have, whatever the areas of the church are.
 */
@Injectable()
@RegisterDashboardWidgets()
export class ActivityWidgets implements DashboardWidgetProvider {
  readonly key = 'activity';
  readonly requiredPermissions = ['audit-logs.read'] as const;
  readonly scopeKinds = ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(AUDIT_ACTIVITY_READER) private readonly audit: AuditActivityReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const scope = statsScopeOf(tenant);
    const months = lastMonths(window.today, TREND_MONTHS);
    const [current, previous, perDay, perMonth] = await Promise.all([
      this.audit.countEvents(scope, window.current),
      this.audit.countEvents(scope, window.previous),
      this.audit.eventsPerDay(scope, window.seriesDays),
      this.audit.eventsPerMonth(
        scope,
        months.map((month) => month.key),
        window.today,
      ),
    ]);

    return {
      hero: {
        key: 'activity',
        priority: ACTIVITY_HERO_PRIORITY,
        eyebrow: 'Actividad registrada',
        title:
          tenant.kind === 'PLATFORM'
            ? '¿Cómo va la plataforma?'
            : '¿Cómo va la actividad?',
        label: `Eventos registrados · ${window.label}`,
        value: current,
        format: 'integer',
        previous,
        // A flat line of zeros says nothing: draw only when something happened.
        series: perDay.some((value) => value > 0) ? perDay : [],
        link: '/audit',
      },
      trends: [
        {
          key: 'activity-trend',
          order: 10,
          tab: 'indicators',
          title: 'Actividad de los últimos 6 meses',
          subtitle: 'Eventos registrados por mes',
          format: 'integer',
          tone: 'indigo',
          points: months.map((month, index) => ({
            label: month.label,
            value: perMonth[index] ?? 0,
          })),
        },
      ],
    };
  }
}

/** The newest audit entries of the scope, without personal data. */
@Injectable()
@RegisterDashboardWidgets()
export class RecentAuditWidgets implements DashboardWidgetProvider {
  readonly key = 'recent-audit';
  readonly requiredPermissions = ['audit-logs.read'] as const;
  readonly scopeKinds = ['PLATFORM', 'DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    @Inject(AUDIT_ACTIVITY_READER) private readonly audit: AuditActivityReader,
  ) {}

  async provide({ tenant }: DashboardContext): Promise<DashboardContribution> {
    const rows = await this.audit.recent(
      statsScopeOf(tenant),
      RECENT_AUDIT_LIMIT,
    );

    return {
      lists: [
        {
          key: 'recent-audit',
          order: 100,
          tab: 'general',
          title: 'Últimos eventos de auditoría',
          subtitle: 'Los cambios nunca incluyen datos personales',
          icon: 'shield',
          tone: 'slate',
          emptyText: 'Aún no hay eventos registrados.',
          link: '/audit',
          linkLabel: 'Ver auditoría',
          items: rows.map((row) => ({
            id: String(row.id),
            title: `${auditActionLabel(row.action)} · ${auditEntityLabel(row.entity)}`,
            subtitle: `${row.userName} · ${row.scopeLabel}`,
            occurredAt: row.createdAt.toISOString(),
            badge: null,
          })),
        },
      ],
    };
  }
}
