import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../../common/accounting/accounting-rules.js';
import { RegisterDashboardWidgets } from '../../../dashboard/application/dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
  DateRange,
} from '../../../dashboard/application/dashboard.types.js';
import { lastMonths } from '../../../dashboard/application/period-window.js';
import {
  FINANCIAL_DATA_READER,
  type FinancialDataReader,
} from '../ports/financial-data.reader.js';
import type { DailyAmount } from '../report.models.js';
import { totalsOf } from '../financial-report.builder.js';
import { ReportScopeResolver } from '../report-scope.resolver.js';

/** Above the activity hero (10) and below anything a specialised area may decide to show. */
export const CONTRIBUTIONS_HERO_PRIORITY = 50;
const TREND_MONTHS = 6;

function sumRange(
  daily: ReadonlyMap<string, number>,
  range: DateRange,
): number {
  let cents = 0;
  for (const [date, amount] of daily) {
    if (date >= range.from && date <= range.to) {
      cents += toCents(amount);
    }
  }
  return fromCents(cents);
}

/**
 * Contributions of the period against the period before, the six-month trend and the cash income and
 * expense of the month. Visible to whoever reads reports; the figures are taken from the sedes in scope.
 */
@Injectable()
@RegisterDashboardWidgets()
export class IncomeWidgets implements DashboardWidgetProvider {
  readonly key = 'financial-income';
  readonly requiredPermissions = ['reports.read'] as const;
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  constructor(
    private readonly scopes: ReportScopeResolver,
    @Inject(FINANCIAL_DATA_READER) private readonly reader: FinancialDataReader,
  ) {}

  async provide({
    tenant,
    window,
  }: DashboardContext): Promise<DashboardContribution> {
    const scope = await this.scopes.resolve(tenant, null);
    const filter = this.scopes.filterOf(scope, null);
    const months = lastMonths(window.today, TREND_MONTHS);
    const monthStart = `${window.today.slice(0, 7)}-01`;

    // One daily query feeds the hero, its comparison, the sparkline and the monthly trend.
    const earliest = [
      window.previous.from,
      window.current.from,
      window.seriesDays[0] ?? window.current.from,
      `${months[0].key}-01`,
    ].sort()[0];
    const [daily, accounts, cash] = await Promise.all([
      this.reader.sumContributionsByDay(filter, {
        from: earliest,
        to: window.today,
      }),
      this.reader.listAccounts(scope.denominationId),
      this.reader.sumCash(filter, { from: monthStart, to: window.today }),
    ]);
    const perDay = this.byDay(daily);
    const series = window.seriesDays.map((day) => perDay.get(day) ?? 0);
    const monthTotals = totalsOf(
      cash,
      new Map(accounts.map((account) => [account.id, account.nature])),
    );

    return {
      hero: {
        key: 'contributions',
        priority: CONTRIBUTIONS_HERO_PRIORITY,
        eyebrow: 'Tesorería',
        title: '¿Cómo van los aportes?',
        label: `Aportes recibidos · ${window.label}`,
        value: sumRange(perDay, window.current),
        format: 'currency',
        previous: sumRange(perDay, window.previous),
        series: series.some((value) => value > 0) ? series : [],
        link: '/reports',
      },
      kpis: [
        {
          key: 'month-income',
          order: 40,
          tab: 'general',
          label: 'Ingresos de caja del mes',
          value: monthTotals.income,
          format: 'currency',
          hint: 'Movimientos del libro de caja',
          icon: 'trending-up',
          tone: 'green',
          link: '/reports',
          previous: null,
        },
        {
          key: 'month-expense',
          order: 41,
          tab: 'general',
          label: 'Egresos de caja del mes',
          value: monthTotals.expense,
          format: 'currency',
          hint: 'Movimientos del libro de caja',
          icon: 'trending-down',
          tone: 'orange',
          link: '/reports',
          previous: null,
        },
      ],
      trends: [
        {
          key: 'contributions-trend',
          order: 20,
          tab: 'indicators',
          title: 'Aportes de los últimos 6 meses',
          subtitle: 'Aportes registrados por mes',
          format: 'currency',
          tone: 'green',
          points: months.map((month) => ({
            label: month.label,
            value: this.monthTotal(perDay, month.key),
          })),
        },
      ],
    };
  }

  private byDay(rows: readonly DailyAmount[]): Map<string, number> {
    const days = new Map<string, number>();
    for (const row of rows) {
      days.set(
        row.date,
        fromCents(toCents(days.get(row.date) ?? 0) + toCents(row.amount)),
      );
    }
    return days;
  }

  private monthTotal(daily: ReadonlyMap<string, number>, key: string): number {
    return sumRange(daily, { from: `${key}-01`, to: `${key}-31` });
  }
}
