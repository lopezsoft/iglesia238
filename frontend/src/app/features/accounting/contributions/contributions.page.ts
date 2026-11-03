import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { formatMoney } from '../../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { ExportActionsComponent } from '../../../shared/ui/export-actions.component';
import { HeroCardComponent } from '../../../shared/ui/hero-card.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { ContributionCategory, ContributionDisplayStatus, PaymentMethod } from '../data/accounting.models';
import { monthKey, parseMonthKey, yearMonthOf } from '../data/year-month';
import { ContributionDetailDrawerComponent } from './components/contribution-detail-drawer.component';
import { CUSTOM_PERIOD, ContributionFiltersComponent } from './components/contribution-filters.component';
import { ContributionFormComponent } from './components/contribution-form.component';
import { ContributionSummaryComponent } from './components/contribution-summary.component';
import { ContributionsTableComponent } from './components/contributions-table.component';
import { VoidContributionDialogComponent } from './components/void-contribution-dialog.component';
import { ContributionFilters, ContributionListing, ContributionRow } from './data/contributions.models';
import { ContributionsRepository } from './data/contributions.repository';

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * E-02 Aportes. Everyone with contributions.read sees the month, with server-side filters and
 * pagination; contributions.write adds the registration form and the void action.
 * "Toda la denominación" shows every sede read-only.
 */
@Component({
  selector: 'app-contributions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ContributionDetailDrawerComponent,
    ContributionFiltersComponent,
    ContributionFormComponent,
    ContributionSummaryComponent,
    ContributionsTableComponent,
    ErrorBannerComponent,
    ExportActionsComponent,
    HeroCardComponent,
    IconComponent,
    LoadingComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    RouterLink,
    SectionPanelComponent,
    VoidContributionDialogComponent,
  ],
  templateUrl: './contributions.page.html',
  styleUrl: './contributions.page.scss',
})
export class ContributionsPage {
  private readonly repository = inject(ContributionsRepository);
  private readonly auth = inject(AuthService);
  private readonly downloads = inject(FileDownloadService);

  /** Query param set by "Registrar abono" in Votos. */
  readonly vowPledgeId = input<string | undefined>();

  protected readonly canWrite = computed(() => this.auth.can('contributions.write'));

  protected readonly options = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.formOptions(),
  });
  /** `value()` throws while a resource is in error, so the template reads this instead. */
  protected readonly optionsData = computed(() => (this.options.hasValue() ? this.options.value() : undefined));

  // --- Filters (the server applies them) ---------------------------------------------------------
  /** "YYYY-M" of the selected month, or `custom`; defaults to the month of today. */
  protected readonly periodKey = linkedSignal<string | undefined, string>({
    source: () => this.optionsData()?.today,
    computation: (today, previous) => {
      if (previous?.value) {
        return previous.value;
      }
      return today ? monthKey(yearMonthOf(today)) : '';
    },
  });
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly category = signal<ContributionCategory | null>(null);
  protected readonly typeId = signal<number | null>(null);
  protected readonly method = signal<PaymentMethod | null>(null);
  protected readonly status = signal<ContributionDisplayStatus | null>(null);
  protected readonly searchText = signal('');
  private readonly search = toSignal(
    toObservable(this.searchText).pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged()),
    { initialValue: '' },
  );

  /** The filters as the API receives them; undefined while the period is not complete. */
  protected readonly filters = computed<ContributionFilters | undefined>(() => {
    const key = this.periodKey();
    let period: Pick<ContributionFilters, 'year' | 'month' | 'from' | 'to'>;
    if (key === CUSTOM_PERIOD) {
      if (!this.from() || !this.to() || this.from() > this.to()) {
        return undefined;
      }
      period = { from: this.from(), to: this.to() };
    } else {
      const month = parseMonthKey(key);
      if (!month) {
        return undefined;
      }
      period = month;
    }
    return {
      ...period,
      category: this.category(),
      contributionTypeId: this.typeId(),
      paymentMethod: this.method(),
      status: this.status(),
      search: this.search().trim() || null,
    };
  });

  /** Back to the first page whenever a filter changes. */
  protected readonly page = linkedSignal<ContributionFilters | undefined, number>({
    source: this.filters,
    computation: () => 1,
  });

  protected readonly listingResource = rxResource({
    params: () => {
      const filters = this.filters();
      return filters ? { filters, page: this.page(), tenant: this.auth.tenant() } : undefined;
    },
    stream: ({ params }) => this.repository.list({ ...params.filters, page: params.page, pageSize: PAGE_SIZE }),
  });

  /** Keeps the last page on screen while the next one loads, so the table does not flash. */
  private readonly lastListing = linkedSignal<ContributionListing | undefined, ContributionListing | undefined>({
    source: () => (this.listingResource.hasValue() ? this.listingResource.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  /** Nothing is shown while the period is incomplete, so a stale month never sits under a new filter. */
  protected readonly listing = computed(() => (this.filters() ? this.lastListing() : undefined));

  protected readonly invalidRange = computed(
    () => this.periodKey() === CUSTOM_PERIOD && !!this.from() && !!this.to() && this.from() > this.to(),
  );

  protected readonly heroComparison = computed(() => {
    const listing = this.listing();
    return listing
      ? { text: `${listing.total} ${listing.total === 1 ? 'aporte' : 'aportes'}`, tone: 'neutral' as const }
      : null;
  });
  protected readonly heroNote = computed(() => {
    const voided = this.listing()?.voidedCount ?? 0;
    return voided > 0 ? `${voided} ${voided === 1 ? 'anulado' : 'anulados'} no suman` : null;
  });
  protected readonly heroValue = computed(() => formatMoney(this.listing()?.totalAmount ?? 0));

  // --- Registration and void --------------------------------------------------------------------------
  private readonly presetResource = rxResource({
    params: () => {
      const id = Number(this.vowPledgeId());
      return Number.isInteger(id) && id > 0 && this.canWrite() ? id : undefined;
    },
    stream: ({ params }) => this.repository.vowPaymentTarget(params),
  });
  protected readonly preset = computed(() => (this.presetResource.hasValue() ? this.presetResource.value() : undefined));
  protected readonly presetError = computed(() => {
    const error = this.presetResource.error();
    return error ? userMessage(error) : null;
  });

  protected readonly showForm = computed(() => this.canWrite() && (this.optionsData()?.congregationScoped ?? false));
  protected readonly formOpen = signal(true);
  protected readonly flash = signal<string | null>(null);
  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<ContributionRow | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailId = signal<number | null>(null);
  protected readonly detailVersion = signal(0);
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** The receipt just issued, to offer its PDF next to the success message. */
  protected readonly flashReceipt = signal<ContributionRow | null>(null);
  protected readonly receiptError = signal<string | null>(null);

  protected clearFilters(): void {
    this.category.set(null);
    this.typeId.set(null);
    this.method.set(null);
    this.status.set(null);
    this.searchText.set('');
  }

  protected onRecorded(row: ContributionRow): void {
    this.flash.set(`${row.typeName} de ${formatMoney(row.amount)} registrado con el recibo ${row.receiptNumber}.`);
    this.flashReceipt.set(row.voucherId === null ? null : row);
    this.options.reload();
    const key = monthKey(yearMonthOf(row.receivedOn));
    if (this.periodKey() === key) {
      this.listingResource.reload();
    } else {
      this.periodKey.set(key);
    }
  }

  protected showDetail(row: ContributionRow): void {
    this.detailId.set(row.id);
    this.detailOpen.set(true);
  }

  protected askVoid(row: ContributionRow): void {
    this.voidTarget.set(row);
    this.voidOpen.set(true);
  }

  protected onVoided(row: ContributionRow): void {
    this.flash.set(`Aporte ${row.receiptNumber} anulado. El registro se conserva para auditoría.`);
    this.flashReceipt.set(null);
    this.detailVersion.update((version) => version + 1);
    this.listingResource.reload();
  }

  protected closeFlash(): void {
    this.flash.set(null);
    this.flashReceipt.set(null);
  }

  /** The receipt as a PDF: fetched with the session (a plain link has no bearer token) and saved. */
  protected downloadReceipt(row: ContributionRow): void {
    if (row.voucherId === null) {
      return;
    }
    this.receiptError.set(null);
    this.repository.receiptPdf(row.voucherId).subscribe({
      next: (blob) => this.downloads.save(blob, `${row.receiptNumber}.pdf`),
      error: (error: unknown) => this.receiptError.set(userMessage(error)),
    });
  }

  protected exportCsv(): void {
    const filters = this.filters();
    if (!filters || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.repository.exportCsv(filters).subscribe({
      next: (file) => {
        this.downloads.save(file.blob, file.filename);
        this.exporting.set(false);
      },
      error: (error: unknown) => {
        this.exportError.set(userMessage(error));
        this.exporting.set(false);
      },
    });
  }
}
