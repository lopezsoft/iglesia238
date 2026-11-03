import { Test } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { Injectable } from '@nestjs/common';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import type { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  DashboardWidgetRegistry,
  RegisterDashboardWidgets,
} from './dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
  HeroWidget,
  KpiWidget,
} from './dashboard.types.js';
import { GetDashboardSummaryUseCase } from './get-dashboard-summary.use-case.js';

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-11-02T15:00:00.000Z');
  }
}

const kpi = (key: string, order: number): KpiWidget => ({
  key,
  order,
  tab: 'general',
  label: key,
  value: 1,
  format: 'integer',
  hint: null,
  icon: 'users',
  tone: 'slate',
  link: null,
  previous: null,
});

const hero = (key: string, priority: number): HeroWidget => ({
  key,
  priority,
  eyebrow: key,
  title: key,
  label: key,
  value: 1,
  format: 'integer',
  previous: null,
  series: [],
  link: null,
});

function provider(
  overrides: Partial<DashboardWidgetProvider> & {
    contribution?: DashboardContribution;
  },
): DashboardWidgetProvider & { calls: DashboardContext[] } {
  const calls: DashboardContext[] = [];
  return {
    key: overrides.key ?? 'p',
    requiredPermissions: overrides.requiredPermissions ?? [],
    scopeKinds: overrides.scopeKinds ?? [
      'PLATFORM',
      'DENOMINATION',
      'CONGREGATION',
    ],
    calls,
    provide:
      overrides.provide ??
      ((context) => {
        calls.push(context);
        return Promise.resolve(overrides.contribution ?? {});
      }),
  };
}

function build(providers: DashboardWidgetProvider[]) {
  const error = vi.fn();
  const logger = { error } as unknown as SmartLogger;
  const registry = {
    all: () => providers,
  } as unknown as DashboardWidgetRegistry;
  const scopes = {
    describe: (tenant: {
      kind: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';
    }) =>
      Promise.resolve({
        kind: tenant.kind,
        label: 'Sede Norte',
        denominationName: 'Iglesia',
      }),
  };
  return {
    error,
    useCase: new GetDashboardSummaryUseCase(
      registry,
      scopes,
      new FixedClock(),
      logger,
    ),
  };
}

describe('GetDashboardSummaryUseCase', () => {
  it('asks only the providers whose permissions and scope kind match the request', async () => {
    const allowed = provider({
      key: 'a',
      requiredPermissions: ['members.read'],
    });
    const missingPermission = provider({
      key: 'b',
      requiredPermissions: ['members.read', 'audit-logs.read'],
    });
    const otherScope = provider({ key: 'c', scopeKinds: ['PLATFORM'] });
    const { useCase } = build([allowed, missingPermission, otherScope]);

    await useCase.execute(
      buildTenantContext({ permissions: ['members.read'] }),
      'today',
    );

    expect(allowed.calls).toHaveLength(1);
    expect(missingPermission.calls).toHaveLength(0);
    expect(otherScope.calls).toHaveLength(0);
  });

  it('gives the providers the scope of the request and the period window', async () => {
    const spy = provider({ key: 'a' });
    const tenant = buildTenantContext({ kind: 'DENOMINATION' });
    const { useCase } = build([spy]);

    const summary = await useCase.execute(tenant, '7d');

    expect(spy.calls[0].tenant).toBe(tenant);
    expect(spy.calls[0].window.current).toEqual({
      from: '2026-10-27',
      to: '2026-11-02',
    });
    expect(summary).toMatchObject({
      period: '7d',
      periodLabel: '7 días',
      asOf: '2026-11-02',
      scope: { kind: 'DENOMINATION', label: 'Sede Norte' },
    });
  });

  it('merges the widgets, ordered by `order` and without repeated keys', async () => {
    const first = provider({
      key: 'a',
      contribution: { kpis: [kpi('b', 20), kpi('a', 10)] },
    });
    const second = provider({
      key: 'b',
      contribution: { kpis: [kpi('a', 5), kpi('c', 30)] },
    });
    const { useCase } = build([first, second]);

    const summary = await useCase.execute(buildTenantContext(), 'today');

    expect(summary.kpis.map((item) => item.key)).toEqual(['a', 'b', 'c']);
    expect(summary.kpis[0].order).toBe(10);
  });

  it('shows the hero with the highest priority', async () => {
    const { useCase } = build([
      provider({ key: 'a', contribution: { hero: hero('activity', 10) } }),
      provider({
        key: 'b',
        contribution: { hero: hero('contributions', 100) },
      }),
    ]);

    const summary = await useCase.execute(buildTenantContext(), 'today');

    expect(summary.hero?.key).toBe('contributions');
  });

  it('has no hero when nobody offers one', async () => {
    const { useCase } = build([
      provider({ key: 'a', contribution: { kpis: [kpi('a', 1)] } }),
    ]);

    expect(
      (await useCase.execute(buildTenantContext(), 'today')).hero,
    ).toBeNull();
  });

  it('survives a failing provider, reports it and logs it', async () => {
    const broken = provider({
      key: 'accounting',
      provide: () => Promise.reject(new Error('boom')),
    });
    const healthy = provider({
      key: 'a',
      contribution: { kpis: [kpi('a', 1)] },
    });
    const { useCase, error } = build([broken, healthy]);

    const summary = await useCase.execute(buildTenantContext(), 'today');

    expect(summary.kpis).toHaveLength(1);
    expect(summary.unavailable).toEqual(['accounting']);
    expect(error).toHaveBeenCalledOnce();
  });

  it('returns an empty page, not an error, when no provider applies', async () => {
    const { useCase } = build([]);

    const summary = await useCase.execute(buildTenantContext(), 'month');

    expect(summary).toMatchObject({
      hero: null,
      kpis: [],
      panels: [],
      lists: [],
      trends: [],
      unavailable: [],
    });
  });
});

describe('DashboardWidgetRegistry', () => {
  @Injectable()
  @RegisterDashboardWidgets()
  class DiscoveredWidgets implements DashboardWidgetProvider {
    readonly key = 'discovered';
    readonly requiredPermissions = [];
    readonly scopeKinds = ['PLATFORM'] as const;
    provide() {
      return Promise.resolve({});
    }
  }

  @Injectable()
  class NotMarked {
    readonly key = 'ignored';
    provide() {
      return Promise.resolve({});
    }
  }

  it('finds the providers marked with @RegisterDashboardWidgets() in any module', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [DashboardWidgetRegistry, DiscoveredWidgets, NotMarked],
    }).compile();

    const keys = moduleRef
      .get(DashboardWidgetRegistry)
      .all()
      .map((item) => item.key);

    expect(keys).toEqual(['discovered']);
  });
});
