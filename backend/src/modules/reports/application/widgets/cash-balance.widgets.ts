import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  monthLabel,
  toCents,
} from '../../../../common/accounting/accounting-rules.js';
import { RegisterDashboardWidgets } from '../../../dashboard/application/dashboard-widget-registry.js';
import type {
  DashboardContext,
  DashboardContribution,
  DashboardWidgetProvider,
  PanelStat,
} from '../../../dashboard/application/dashboard.types.js';
import {
  FINANCIAL_DATA_READER,
  type FinancialDataReader,
} from '../ports/financial-data.reader.js';
import { ReportScopeResolver } from '../report-scope.resolver.js';

const MAX_FUNDS = 8;

/**
 * Balance of each fund: what the year started with plus the cash movements until today. When the
 * scope is a single sede it also names the accounting period that is open.
 */
@Injectable()
@RegisterDashboardWidgets()
export class CashBalanceWidgets implements DashboardWidgetProvider {
  readonly key = 'cash-balances';
  readonly requiredPermissions = ['cash-transactions.write'] as const;
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
    const year = Number(window.today.slice(0, 4));

    const [funds, openings, movements, periods] = await Promise.all([
      this.reader.listFunds(scope.denominationId),
      this.reader.sumOpeningBalances(filter, year),
      this.reader.sumCash(filter, { from: `${year}-01-01`, to: window.today }),
      this.reader.listPeriods(filter, year),
    ]);

    const balances = funds
      .map((fund) => {
        const opening = openings
          .filter((row) => row.fundId === fund.id)
          .reduce((sum, row) => sum + toCents(row.amount), 0);
        const net = movements
          .filter((row) => row.fundId === fund.id)
          .reduce(
            (sum, row) =>
              sum +
              (row.direction === 'IN'
                ? toCents(row.amount)
                : -toCents(row.amount)),
            0,
          );
        return { fund, cents: opening + net };
      })
      .filter(({ fund, cents }) => fund.isActive || cents !== 0)
      .sort((a, b) => b.cents - a.cents);
    const total = balances.reduce((sum, row) => sum + row.cents, 0);

    const openPeriod = scope.wide
      ? undefined
      : periods
          .filter((period) => period.status === 'OPEN')
          .sort((a, b) => b.month - a.month)[0];

    const stats: PanelStat[] = [
      {
        key: 'total',
        label: 'Saldo total',
        value: fromCents(total),
        format: 'currency',
        meta: `${balances.length} ${balances.length === 1 ? 'fondo' : 'fondos'}`,
        icon: 'banknote',
        tone: 'green',
      },
      ...balances.slice(0, MAX_FUNDS).map(({ fund, cents }) => ({
        key: `fund-${fund.id}`,
        label: fund.name,
        value: fromCents(cents),
        format: 'currency' as const,
        meta: null,
        icon: 'wallet',
        tone: cents < 0 ? ('red' as const) : ('cyan' as const),
      })),
    ];

    return {
      panels: [
        {
          key: 'cash-balances',
          order: 20,
          tab: 'general',
          title: 'Saldos de caja',
          subtitle: openPeriod
            ? `Periodo abierto: ${monthLabel({ year, month: openPeriod.month })}`
            : 'Saldo acumulado del año por fondo',
          icon: 'wallet',
          tone: 'green',
          link: '/accounting/cash-book',
          linkLabel: 'Ver libro de caja',
          stats,
        },
      ],
    };
  }
}
