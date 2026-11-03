import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { formatMoney } from '../../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { ExportActionsComponent } from '../../../shared/ui/export-actions.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { VOW_PLEDGE_STATUS_LABELS, VowPledgeStatus } from '../data/accounting.models';
import { CancelVowDialogComponent } from './components/cancel-vow-dialog.component';
import { EditVowDialogComponent } from './components/edit-vow-dialog.component';
import { NewVowDialogComponent } from './components/new-vow-dialog.component';
import { VowDetailDrawerComponent } from './components/vow-detail-drawer.component';
import { VowsTableComponent } from './components/vows-table.component';
import { VowFilters, VowPledgeRow, VowsOverview } from './data/vows.models';
import { VowsRepository } from './data/vows.repository';

type StatusFilter = VowPledgeStatus | 'ALL';

const PAGE_SIZE = 10;
const STALE_DAYS = 90;
const SEARCH_DEBOUNCE_MS = 300;

/** E-03 Votos: pledges with computed payments, balance and progress, filtered and paginated by the server. */
@Component({
  selector: 'app-vows-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CancelVowDialogComponent,
    EditVowDialogComponent,
    ErrorBannerComponent,
    ExportActionsComponent,
    IconComponent,
    LoadingComponent,
    NewVowDialogComponent,
    PageHeaderComponent,
    ReadOnlyNoticeComponent,
    StatCardComponent,
    VowDetailDrawerComponent,
    VowsTableComponent,
  ],
  templateUrl: './vows.page.html',
  styleUrl: './vows.page.scss',
})
export class VowsPage {
  private readonly repository = inject(VowsRepository);
  private readonly auth = inject(AuthService);
  private readonly downloads = inject(FileDownloadService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusLabels = VOW_PLEDGE_STATUS_LABELS;
  protected readonly canWrite = computed(() => this.auth.can('contributions.write'));

  // --- Filters (the server applies them) ---------------------------------------------------------
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly typeId = signal<number | null>(null);
  protected readonly overdueOnly = signal(false);
  protected readonly searchText = signal('');
  private readonly search = toSignal(
    toObservable(this.searchText).pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly filters = computed<VowFilters>(() => ({
    status: this.status() === 'ALL' ? null : (this.status() as VowPledgeStatus),
    contributionTypeId: this.typeId(),
    search: this.search().trim() || null,
    overdueOnly: this.overdueOnly(),
  }));

  /** Back to the first page whenever a filter changes. */
  protected readonly page = linkedSignal<VowFilters, number>({ source: this.filters, computation: () => 1 });

  protected readonly overviewResource = rxResource({
    params: () => ({ filters: this.filters(), page: this.page(), tenant: this.auth.tenant() }),
    stream: ({ params }) =>
      this.repository.overview({ ...params.filters, page: params.page, pageSize: PAGE_SIZE }),
  });

  /** Keeps the last page on screen while the next one loads. */
  protected readonly overview = linkedSignal<VowsOverview | undefined, VowsOverview | undefined>({
    source: () => (this.overviewResource.hasValue() ? this.overviewResource.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  protected readonly canCreate = computed(() => this.canWrite() && (this.overview()?.congregationScoped ?? false));

  protected readonly statusChips = computed(() => {
    const counts = this.overview()?.statusCounts;
    const options: StatusFilter[] = ['ALL', 'ACTIVE', 'FULFILLED', 'CANCELLED'];
    return options.map((key) => ({
      key,
      label: key === 'ALL' ? 'Todas' : this.statusLabels[key],
      count: counts?.[key] ?? 0,
    }));
  });

  protected readonly kpis = computed(() => {
    const kpis = this.overview()?.kpis;
    if (!kpis) {
      return [];
    }
    const paidShare = kpis.pledgedTotal > 0 ? Math.round((kpis.paidTotal / kpis.pledgedTotal) * 100) : 0;
    return [
      {
        label: 'Total prometido',
        value: formatMoney(kpis.pledgedTotal),
        hint: `${kpis.pledgeCount} promesas vigentes o cumplidas`,
        icon: 'heart' as const,
        tone: 'indigo' as const,
        comparison: null,
      },
      {
        label: 'Total abonado',
        value: formatMoney(kpis.paidTotal),
        hint: `${paidShare} % del total prometido`,
        icon: 'coins' as const,
        tone: 'green' as const,
        comparison: `${paidShare} %`,
      },
      {
        label: 'Saldo por recaudar',
        value: formatMoney(kpis.balanceTotal),
        hint: `${kpis.withBalanceCount} promesas con saldo`,
        icon: 'wallet' as const,
        tone: 'orange' as const,
        comparison: null,
      },
      {
        label: 'Promesas activas',
        value: String(kpis.activeCount),
        hint: `${kpis.staleCount} sin abonos en ${STALE_DAYS} días · ${kpis.overdueCount} vencidas`,
        icon: 'activity' as const,
        tone: 'cyan' as const,
        comparison: null,
      },
    ];
  });

  // --- Dialogs and detail ----------------------------------------------------------------------------
  protected readonly flash = signal<string | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly cancelOpen = signal(false);
  protected readonly detailOpen = signal(false);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly detailVersion = signal(0);
  protected readonly target = signal<VowPledgeRow | null>(null);
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);

  protected clearFilters(): void {
    this.status.set('ALL');
    this.typeId.set(null);
    this.overdueOnly.set(false);
    this.searchText.set('');
  }

  protected onType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.typeId.set(value === '' ? null : Number(value));
  }

  protected onOverdue(event: Event): void {
    this.overdueOnly.set((event.target as HTMLInputElement).checked);
  }

  protected onSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected showDetail(row: VowPledgeRow): void {
    this.selectedId.set(row.id);
    this.detailOpen.set(true);
  }

  protected askEdit(row: VowPledgeRow): void {
    this.target.set(row);
    this.editOpen.set(true);
  }

  protected askCancel(row: VowPledgeRow): void {
    this.target.set(row);
    this.cancelOpen.set(true);
  }

  protected onCreated(row: VowPledgeRow): void {
    this.flash.set(`Promesa ${row.code} registrada. Los abonos se registran desde Aportes con el tipo Voto.`);
    this.refreshAll();
  }

  protected onUpdated(row: VowPledgeRow): void {
    this.flash.set(`Promesa ${row.code} actualizada.`);
    this.refreshAll();
  }

  protected onCancelled(row: VowPledgeRow): void {
    this.flash.set(`Promesa ${row.code} cancelada. Sus abonos se conservan.`);
    this.refreshAll();
  }

  protected exportCsv(): void {
    if (this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.repository.exportCsv(this.filters()).subscribe({
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

  private refreshAll(): void {
    this.detailVersion.update((version) => version + 1);
    this.overviewResource.reload();
  }
}
