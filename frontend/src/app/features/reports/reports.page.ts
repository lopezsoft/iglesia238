import { DOCUMENT, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { userMessage } from '../../core/errors/domain-error';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent } from '../../shared/ui/feedback.components';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { CongregationBreakdownComponent } from './components/congregation-breakdown.component';
import { ContributionTypesComponent } from './components/contribution-types.component';
import { FundBalancesComponent } from './components/fund-balances.component';
import { MonthlyFlowComponent } from './components/monthly-flow.component';
import { ReportFiltersComponent } from './components/report-filters.component';
import {
  congregationsCsv,
  contributionDetailCsv,
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

/** How long a CSV blob URL stays valid after the download starts. */
const BLOB_URL_TTL_MS = 10_000;

type ReportTable ='months' | 'funds' | 'contribution-types' | 'congregations';

const TABLE_EXPORTS: Readonly<
  Record<ReportTable, { file: string; build: (report: FinancialReport) => string }>
> = {
  months: { file: 'ingresos-egresos', build: monthsCsv },
  funds: { file: 'saldos-por-fondo', build: fundsCsv },
  'contribution-types': { file: 'aportes-por-tipo', build: contributionTypesCsv },
  congregations: { file: 'resultados-por-sede', build: congregationsCsv },
};

interface SummaryCard {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}

/** The whole calendar year of the demo "today". */
export function defaultReportQuery(today: string): ReportQuery {
  const year = today.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31`, fundId: null };
}

/** E-07 Reportes: income, expense and fund balances of the active scope (reports.read). */
@Component({
  selector: 'app-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CongregationBreakdownComponent,
    ContributionTypesComponent,
    ErrorBannerComponent,
    FundBalancesComponent,
    IconComponent,
    LoadingComponent,
    MonthlyFlowComponent,
    PageHeaderComponent,
    ReportFiltersComponent,
    StatCardComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly repository = inject(ReportsRepository);
  protected readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);

  protected readonly options = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.options(),
  });

  /** Options once loaded; `value()` throws while the resource is in the error state. */
  protected readonly reportOptions = computed(() =>
    this.options.hasValue() ? this.options.value() : undefined,
  );

  /** Resets to the default range (and every fund) whenever the scope, and so its options, change. */
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
  protected readonly data = computed(() =>
    this.report.hasValue() ? this.report.value() : undefined,
  );

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
      `Ingresos, egresos y saldos por fondo de ${this.auth.activeScope()?.label ?? 'tu sede'} para el periodo seleccionado.`,
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

  protected readonly cards = computed<SummaryCard[]>(() => {
    const report = this.data();
    if (!report) {
      return [];
    }
    const { income, expense, balance } = report.totals;
    const months = report.months.length;
    return [
      {
        key: 'income',
        label: 'Ingresos',
        value: formatMoney(income),
        hint: `${months} ${months === 1 ? 'mes' : 'meses'} · ${this.day(report.query.from)} a ${this.day(report.query.to)}`,
      },
      {
        key: 'expense',
        label: 'Egresos',
        value: formatMoney(expense),
        hint:
          income > 0
            ? `${formatShare(expense / income)} de los ingresos del periodo`
            : 'Sin ingresos en el periodo',
      },
      {
        key: 'balance',
        label: 'Saldo',
        value: formatMoney(balance),
        hint:
          balance >= 0
            ? 'Superávit: ingresos menos egresos'
            : 'Déficit: los egresos superan los ingresos',
      },
      {
        key: 'variation',
        label: 'Variación de ingresos vs periodo anterior',
        value: formatVariation(variation(income, report.previous.income)),
        hint:
          `Egresos ${formatVariation(variation(expense, report.previous.expense))} · ` +
          `frente a ${this.day(report.previous.from)}–${this.day(report.previous.to)}`,
      },
    ];
  });

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
    this.download(build(report), fileName);
    this.exportError.set(null);
    this.exportMessage.set(`Se descargó ${fileName}.`);
  }

  protected async exportDetail(): Promise<void> {
    const query = this.query();
    if (!query || this.exportingDetail()) {
      return;
    }
    this.exportingDetail.set(true);
    this.exportMessage.set(null);
    this.exportError.set(null);
    try {
      const rows = await firstValueFrom(this.repository.contributionDetail(query));
      const fileName = reportFileName('detalle-aportes', query);
      this.download(contributionDetailCsv(rows), fileName);
      this.exportMessage.set(
        `Se descargó ${fileName} con ${rows.length} ${rows.length === 1 ? 'aporte' : 'aportes'}.`,
      );
    } catch (error) {
      this.exportError.set(userMessage(error));
    } finally {
      this.exportingDetail.set(false);
    }
  }

  private day(iso: string): string {
    return formatDate(iso, 'dd/MM/yyyy', this.locale);
  }

  private download(content: string, fileName: string): void {
    const view = this.document.defaultView;
    if (!view) {
      return;
    }
    const url = view.URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    this.document.body.appendChild(link);
    link.click();
    link.remove();
    // Safari resolves the blob after click(): revoking synchronously aborts the download.
    view.setTimeout(() => view.URL.revokeObjectURL(url), BLOB_URL_TTL_MS);
  }
}

function sameQuery(a: ReportQuery, b: ReportQuery): boolean {
  return a.from === b.from && a.to === b.to && a.fundId === b.fundId;
}
