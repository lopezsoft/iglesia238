import { Inject, Injectable } from '@nestjs/common';
import { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { DashboardWidgetRegistry } from './dashboard-widget-registry.js';
import type {
  DashboardContribution,
  DashboardPeriod,
  DashboardSummary,
  DashboardWidgetProvider,
  HeroWidget,
} from './dashboard.types.js';
import { buildPeriodWindow } from './period-window.js';
import {
  DASHBOARD_SCOPE_READER,
  type DashboardScopeReader,
} from './ports/dashboard-scope.reader.js';

interface Keyed {
  readonly key: string;
  readonly order: number;
}

/** Orders by `order` then key and drops repeated keys, so two providers cannot show the same widget twice. */
function arrange<T extends Keyed>(items: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const item of items) {
    if (!unique.has(item.key)) {
      unique.set(item.key, item);
    }
  }
  return [...unique.values()].sort(
    (a, b) => a.order - b.order || a.key.localeCompare(b.key),
  );
}

function strongestHero(
  contributions: readonly DashboardContribution[],
): HeroWidget | null {
  const heroes = contributions.flatMap((c) => (c.hero ? [c.hero] : []));
  return (
    heroes.sort(
      (a, b) => b.priority - a.priority || a.key.localeCompare(b.key),
    )[0] ?? null
  );
}

/**
 * Orchestrates the dashboard: it asks every provider that applies to the scope and permissions of the
 * request, in parallel, and merges the answers. A provider that fails is left out and reported, so one
 * slow or broken area never blanks the whole page.
 */
@Injectable()
export class GetDashboardSummaryUseCase {
  constructor(
    private readonly registry: DashboardWidgetRegistry,
    @Inject(DASHBOARD_SCOPE_READER)
    private readonly scopes: DashboardScopeReader,
    private readonly clock: Clock,
    private readonly logger: SmartLogger,
  ) {}

  async execute(
    tenant: TenantContext,
    period: DashboardPeriod,
  ): Promise<DashboardSummary> {
    const window = buildPeriodWindow(period, this.clock.today());
    const applicable = this.registry
      .all()
      .filter((provider) => this.applies(provider, tenant));

    const [scope, outcomes] = await Promise.all([
      this.scopes.describe(tenant),
      Promise.allSettled(
        applicable.map((provider) => provider.provide({ tenant, window })),
      ),
    ]);

    const contributions: DashboardContribution[] = [];
    const unavailable: string[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        contributions.push(outcome.value);
        return;
      }
      const key = applicable[index].key;
      unavailable.push(key);
      this.logger.error(
        `Dashboard provider "${key}" failed: ${String(outcome.reason)}`,
        GetDashboardSummaryUseCase.name,
      );
    });

    return {
      period,
      periodLabel: window.label,
      previousLabel: window.previousLabel,
      asOf: window.today,
      range: window.current,
      scope,
      hero: strongestHero(contributions),
      kpis: arrange(contributions.flatMap((c) => c.kpis ?? [])),
      panels: arrange(contributions.flatMap((c) => c.panels ?? [])),
      lists: arrange(contributions.flatMap((c) => c.lists ?? [])),
      trends: arrange(contributions.flatMap((c) => c.trends ?? [])),
      unavailable: unavailable.sort(),
    };
  }

  private applies(provider: DashboardWidgetProvider, tenant: TenantContext) {
    return (
      provider.scopeKinds.includes(tenant.kind) &&
      tenant.hasAll(...provider.requiredPermissions)
    );
  }
}
