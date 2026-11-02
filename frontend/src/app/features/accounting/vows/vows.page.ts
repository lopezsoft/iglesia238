import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { MoneyPipe, formatMoney } from '../../../shared/pipes/money.pipe';
import {
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
  ReadOnlyNoticeComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { matchesText, paginate } from '../../../shared/utils/pagination';
import { VOW_PLEDGE_STATUS_LABELS, VowPledgeStatus } from '../data/accounting.models';
import { NewVowDialogComponent } from './components/new-vow-dialog.component';
import { VowDetailDrawerComponent } from './components/vow-detail-drawer.component';
import { VowPledgeRow } from './data/vows.models';
import { VowsRepository } from './data/vows.repository';
import { VOW_STATUS_TONES } from './vow-status';

type StatusFilter = VowPledgeStatus | 'ALL';

const PAGE_SIZE = 10;
const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

/** E-03 Votos: pledges with computed payments, balance and progress. */
@Component({
  selector: 'app-vows-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    MoneyPipe,
    NewVowDialogComponent,
    PageHeaderComponent,
    PaginationComponent,
    ReadOnlyNoticeComponent,
    StatCardComponent,
    StatusBadgeComponent,
    VowDetailDrawerComponent,
  ],
  templateUrl: './vows.page.html',
  styleUrl: './vows.page.scss',
})
export class VowsPage {
  private readonly repository = inject(VowsRepository);
  private readonly auth = inject(AuthService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusLabels = VOW_PLEDGE_STATUS_LABELS;
  protected readonly statusTones = VOW_STATUS_TONES;
  protected readonly canWrite = computed(() => this.auth.can('contributions.write'));

  protected readonly overview = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.overview(),
  });

  protected readonly canCreate = computed(() => this.canWrite() && (this.overview.value()?.congregationScoped ?? false));
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly query = signal('');
  protected readonly flash = signal<string | null>(null);
  protected readonly newOpen = signal(false);
  protected readonly detailOpen = signal(false);
  protected readonly selectedId = signal<number | null>(null);

  private readonly rows = computed(() => this.overview.value()?.rows ?? []);

  protected readonly filters = computed(() => {
    const rows = this.rows();
    const options: StatusFilter[] = ['ALL', 'ACTIVE', 'FULFILLED', 'CANCELLED'];
    return options.map((key) => ({
      key,
      label: key === 'ALL' ? 'Todas' : this.statusLabels[key],
      count: key === 'ALL' ? rows.length : rows.filter((r) => r.status === key).length,
    }));
  });

  protected readonly filtered = computed(() =>
    this.rows().filter(
      (row) =>
        (this.status() === 'ALL' || row.status === this.status()) &&
        matchesText([row.personName, row.memberCode, row.code], this.query()),
    ),
  );
  protected readonly pageNumber = linkedSignal({ source: this.filtered, computation: () => 1 });
  protected readonly page = computed(() => paginate(this.filtered(), { page: this.pageNumber(), pageSize: PAGE_SIZE }));

  protected readonly kpis = computed(() => {
    const rows = this.rows().filter((r) => r.status !== 'CANCELLED');
    const pledged = rows.reduce((sum, r) => sum + r.pledgedAmount, 0);
    const paid = rows.reduce((sum, r) => sum + r.paid, 0);
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const today = this.overview.value()?.today ?? '';
    const stale = active.filter((r) => daysBetween(r.lastPaymentOn ?? r.pledgedOn, today) > STALE_DAYS).length;
    return [
      { label: 'Total prometido', value: formatMoney(pledged), hint: `${rows.length} promesas vigentes o cumplidas` },
      {
        label: 'Total abonado',
        value: formatMoney(paid),
        hint: `${pledged > 0 ? Math.round((paid / pledged) * 100) : 0} % del total prometido`,
      },
      {
        label: 'Saldo por recaudar',
        value: formatMoney(pledged - paid),
        hint: `${rows.filter((r) => r.balance > 0).length} promesas con saldo`,
      },
      { label: 'Promesas activas', value: String(active.length), hint: `${stale} sin abonos en los últimos ${STALE_DAYS} días` },
    ];
  });

  protected readonly year = computed(() => (this.overview.value()?.today ?? '').slice(0, 4));

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected showDetail(row: VowPledgeRow): void {
    this.selectedId.set(row.id);
    this.detailOpen.set(true);
  }

  protected onCreated(row: VowPledgeRow): void {
    this.flash.set(`Promesa ${row.code} registrada. Los abonos se registran desde Aportes con el tipo Voto.`);
    this.overview.reload();
  }
}

function daysBetween(from: string, to: string): number {
  if (!from || !to) {
    return 0;
  }
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
