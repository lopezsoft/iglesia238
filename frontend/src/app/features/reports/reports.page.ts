import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { userMessage } from '../../core/errors/domain-error';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent } from '../../shared/ui/feedback.components';
import { HeroComparison, HeroCardComponent } from '../../shared/ui/hero-card.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { TabCardItem, TabCardsComponent } from '../../shared/ui/tab-cards.component';
import { FileDownloadService } from '../../shared/utils/file-download.service';
import { AccountStatementComponent } from './components/account-statement.component';
import { CongregationBreakdownComponent } from './components/congregation-breakdown.component';
import { ContributionTypesComponent } from './components/contribution-types.component';
import { FundBalancesComponent } from './components/fund-balances.component';
import { MonthlyFlowComponent } from './components/monthly-flow.component';
import { ReportFiltersComponent } from './components/report-filters.component';
import {
  accountsCsv,
  congregationsCsv,
  contributionTypesCsv,
  fundsCsv,
  monthsCsv,
  reportFileName,
} from './data/report-csv';
import {
  FinancialReport,
  ReportOptions,
  ReportQuery,
  formatShare,
  formatVariation,
  variation,
} from './data/reports.models';
import { ReportsRepository } from './data/reports.repository';

type ReportTable = 'months' | 'funds' | 'accounts' | 'contribution-types' | 'congregations';
type ReportTab = 'summary' | 'funds' | 'contributions';

const TABLE_EXPORTS: Readonly<Record<ReportTable, { file: string; build: (report: FinancialReport) => string }>> = {
  months: { file: 'ingresos-egresos', build: monthsCsv },
  funds: { file: 'saldos-por-fondo', build: fundsCsv },
  accounts: { file: 'estado-de-resultados', build: accountsCsv },
  'contribution-types': { file: 'aportes-por-tipo', build: contributionTypesCsv },
  congregations: { file: 'resultados-por-sede', build: congregationsCsv },
};

const TABS: readonly TabCardItem<ReportTab>[] = [
  { id: 'summary', title: 'Resumen', subtitle: 'Flujo por mes y sedes', icon: 'bar-chart' },
  { id: 'funds', title: 'Fondos y cuentas', subtitle: 'Saldos y estado de resultados', icon: 'wallet' },
  { id: 'contributions', title: 'Aportes', subtitle: 'Por tipo de aporte', icon: 'coins' },
];

/** The whole calendar year of "today" (the server's date, in Bogota). */
export function defaultReportQuery(today: string): ReportQuery {
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31`, fundId: null, congregationId: null };
}

/** E-07 Reportes: income, expense and fund balances of the active scope (reports.read). */
@Component({
  selector: 'app-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AccountStatementComponent,
    CongregationBreakdownComponent,
    ContributionTypesComponent,
    ErrorBannerComponent,
    FundBalancesComponent,
    HeroCardComponent,
    IconComponent,
    LoadingComponent,
    MonthlyFlowComponent,
    PageHeaderComponent,
    ReportFiltersComponent,
    RouterLink,
    StatCardComponent,
    TabCardsComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly repository = inject(ReportsRepository);
  protected readonly auth = inject(AuthService);
  private readonly downloads = inject(FileDownloadService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly tabs = TABS;
  protected readonly tab = signal<ReportTab>('summary');

  protected readonly options = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.options(),
  });

  /** Options once loaded; `value()` throws while the resource is in the error state. */
  protected readonly reportOptions = computed(() => (this.options.hasValue() ? this.options.value() : undefined));

  /** Resets to the default range (and every fund and sede) whenever the scope, and so its options, change. */
  protected readonly query = linkedSignal<ReportOptions | undefined, ReportQuery | null>({
    source: () => this.reportOptions(),
    computation: (options) => (options ? defaultReportQuery(options.today) : null),
  });

  protected readonly report = rxResource({
    params: () => {
      const query = this.query();
      return query ? { query, scope: this.auth.activeScope() } : undefined;
    },
    stream: ({ params }) => this.repository.financialReport(params.query),
  });

  /** Report once loaded; `value()` throws while the resource is in the error state. */
  protected readonly data = computed(() => (this.report.hasValue() ? this.report.value() : undefined));

  /** Contributions of the range the cash book has not consolidated: the cash figures leave them out. */
  protected readonly pendingConsolidation = computed(() => {
    const pending = this.data()?.pendingConsolidation;
    return pending && pending.count > 0
      ? { count: pending.count, amount: formatMoney(pending.amount) }
      : null;
  });
  protected readonly canConsolidate = computed(() => this.auth.can('cash-transactions.write'));

  protected readonly exportMessage = signal<string | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly exportingDetail = signal(false);

  protected readonly canExportDetail = computed(() => this.auth.can('contributions.write'));

  protected readonly loadError = computed(() => {
    const error = this.options.error() ?? this.report.error();
    return error ? userMessage(error) : null;
  });

  protected readonly description = computed(
    () =>
      `Ingresos, egresos y saldos por fondo de ${this.reportOptions()?.scopeLabel ?? this.auth.activeScope()?.label ?? 'tu sede'} para el periodo seleccionado.`,
  );

  protected readonly statusText = computed(() => {
    const report = this.data();
    if (!report) {
      return '';
    }
    return (
      `${report.scopeLabel} · ${report.fundLabel} · ${this.day(report.query.from)} a ${this.day(report.query.to)}. ` +
      `Periodos de caja: ${report.closedPeriods} cerrados, ${report.openPeriods} abiertos.`
    );
  });

  protected readonly hero = computed(() => {
    const report = this.data();
    if (!report) {
      return null;
    }
    const change = variation(report.totals.balance, report.previous.balance);
    const comparison: HeroComparison = {
      text: change === null ? 'Sin comparativo' : formatVariation(change),
      tone: change === null || change === 0 ? 'neutral' : change > 0 ? 'up' : 'down',
    };
    return {
      value: formatMoney(report.totals.balance),
      comparison,
      compareLabel: `vs. ${this.day(report.previous.from)}–${this.day(report.previous.to)}`,
      date: `${this.day(report.query.from)} – ${this.day(report.query.to)}`,
      series: report.months.map((month) => month.income),
    };
  });

  protected readonly cards = computed(() => {
    const report = this.data();
    if (!report) {
      return [];
    }
    const { income, expense, balance } = report.totals;
    const months = report.months.length;
    return [
      {
        key: 'income',
        icon: 'trending-up' as const,
        tone: 'green' as const,
        label: 'Ingresos',
        value: formatMoney(income),
        hint: `${months} ${months === 1 ? 'mes' : 'meses'} · ${this.day(report.query.from)} a ${this.day(report.query.to)}`,
      },
      {
        key: 'expense',
        icon: 'trending-down' as const,
        tone: 'orange' as const,
        label: 'Egresos',
        value: formatMoney(expense),
        hint: income > 0 ? `${formatShare(expense / income)} de los ingresos del periodo` : 'Sin ingresos en el periodo',
      },
      {
        key: 'balance',
        icon: 'banknote' as const,
        tone: balance >= 0 ? ('cyan' as const) : ('red' as const),
        label: 'Saldo',
        value: formatMoney(balance),
        hint: balance >= 0 ? 'Superávit: ingresos menos egresos' : 'Déficit: los egresos superan los ingresos',
      },
      {
        key: 'variation',
        icon: 'activity' as const,
        tone: 'indigo' as const,
        label: 'Variación de ingresos vs periodo anterior',
        value: formatVariation(variation(income, report.previous.income)),
        hint:
          `Egresos ${formatVariation(variation(expense, report.previous.expense))} · ` +
          `frente a ${this.day(report.previous.from)}–${this.day(report.previous.to)}`,
      },
    ];
  });

  protected setTab(tab: string): void {
    this.tab.set(tab === 'funds' || tab === 'contributions' ? tab : 'summary');
  }

  protected applyFilters(query: ReportQuery): void {
    this.exportMessage.set(null);
    this.exportError.set(null);
    if (this.query() && sameQuery(this.query()!, query)) {
      this.report.reload();
    } else {
      this.query.set(query);
    }
  }

  protected exportTable(report: FinancialReport, table: ReportTable): void {
    const { file, build } = TABLE_EXPORTS[table];
    const fileName = reportFileName(file, report.query);
    this.downloads.save(new Blob([build(report)], { type: 'text/csv;charset=utf-8' }), fileName);
    this.exportError.set(null);
    this.exportMessage.set(`Se descargó ${fileName}.`);
  }

  /** The server writes and audits this CSV: it carries the names of the contributors. */
  protected async exportDetail(): Promise<void> {
    const query = this.query();
    if (!query || this.exportingDetail()) {
      return;
    }
    this.exportingDetail.set(true);
    this.exportMessage.set(null);
    this.exportError.set(null);
    try {
      const blob = await firstValueFrom(this.repository.contributionDetailCsv(query));
      const fileName = reportFileName('detalle-aportes', query);
      this.downloads.save(blob, fileName);
      this.exportMessage.set(`Se descargó ${fileName}. La exportación quedó registrada en auditoría.`);
    } catch (error) {
      this.exportError.set(userMessage(error));
    } finally {
      this.exportingDetail.set(false);
    }
  }

  private day(iso: string): string {
    return formatDate(iso, 'dd/MM/yyyy', this.locale);
  }
}

function sameQuery(a: ReportQuery, b: ReportQuery): boolean {
  return a.from === b.from && a.to === b.to && a.fundId === b.fundId && a.congregationId === b.congregationId;
}
