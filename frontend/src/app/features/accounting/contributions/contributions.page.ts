import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { formatMoney } from '../../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { PERIOD_STATUS_LABELS } from '../data/accounting.models';
import { yearMonthOf } from '../data/accounting-rules';
import { ContributionFormComponent } from './components/contribution-form.component';
import { ContributionSummaryComponent } from './components/contribution-summary.component';
import { ContributionsTableComponent } from './components/contributions-table.component';
import { VoidContributionDialogComponent } from './components/void-contribution-dialog.component';
import { ContributionRow } from './data/contributions.models';
import { ContributionsRepository } from './data/contributions.repository';

/**
 * E-02 Aportes. Everyone with contributions.read sees the month; contributions.write adds the
 * registration form and the void action. "Toda la denominación" shows every sede read-only.
 */
@Component({
  selector: 'app-contributions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContributionFormComponent,
    ContributionSummaryComponent,
    ContributionsTableComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    RouterLink,
    VoidContributionDialogComponent,
  ],
  templateUrl: './contributions.page.html',
  styleUrl: './contributions.page.scss',
})
export class ContributionsPage {
  private readonly repository = inject(ContributionsRepository);
  private readonly auth = inject(AuthService);

  /** Query param set by "Registrar abono" in Votos. */
  readonly vowPledgeId = input<string | undefined>();

  protected readonly canWrite = computed(() => this.auth.can('contributions.write'));
  protected readonly periodStatusLabels = PERIOD_STATUS_LABELS;

  protected readonly options = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.formOptions(),
  });

  /** "YYYY-M" of the selected month; defaults to the month of today (demo calendar). */
  protected readonly selectedMonth = linkedSignal<string | undefined, string>({
    source: () => this.options.value()?.today,
    computation: (today, previous) => {
      if (previous?.value) {
        return previous.value;
      }
      if (!today) {
        return '';
      }
      const { year, month } = yearMonthOf(today);
      return `${year}-${month}`;
    },
  });

  protected readonly month = rxResource({
    params: () => {
      const key = this.selectedMonth();
      if (!key) {
        return undefined;
      }
      const [year, month] = key.split('-').map(Number);
      return { year, month, tenant: this.auth.tenant() };
    },
    stream: ({ params }) => this.repository.listMonth({ year: params.year, month: params.month }),
  });

  protected readonly preset = rxResource({
    params: () => {
      const id = Number(this.vowPledgeId());
      return Number.isInteger(id) && id > 0 && this.canWrite() ? id : undefined;
    },
    stream: ({ params }) => this.repository.vowPaymentTarget(params),
  });

  protected readonly presetError = computed(() => {
    const error = this.preset.error();
    return error ? userMessage(error) : null;
  });

  protected readonly showForm = computed(() => this.canWrite() && (this.options.value()?.congregationScoped ?? false));
  protected readonly flash = signal<string | null>(null);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<ContributionRow | null>(null);

  protected onMonthChange(event: Event): void {
    this.selectedMonth.set((event.target as HTMLSelectElement).value);
  }

  protected onRecorded(row: ContributionRow): void {
    this.flash.set(`${row.typeName} de ${formatMoney(row.amount)} registrado con el recibo ${row.receiptNumber}.`);
    this.options.reload();
    const { year, month } = yearMonthOf(row.receivedOn);
    if (this.selectedMonth() === `${year}-${month}`) {
      this.month.reload();
    } else {
      this.selectedMonth.set(`${year}-${month}`);
    }
  }

  protected askVoid(row: ContributionRow): void {
    this.voidTarget.set(row);
    this.voidOpen.set(true);
  }

  protected onVoided(row: ContributionRow): void {
    this.flash.set(`Aporte ${row.receiptNumber} anulado. El registro se conserva para auditoría.`);
    this.month.reload();
  }
}

