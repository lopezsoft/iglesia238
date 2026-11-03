import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MEMBER_STATUS_LABELS, MemberStatus } from '../../../core/models/membership.model';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { ExportActionsComponent } from '../../../shared/ui/export-actions.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { TabCardItem, TabCardsComponent } from '../../../shared/ui/tab-cards.component';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { MemberCreateDialogComponent } from './components/member-create-dialog.component';
import {
  AGE_RANGES,
  MEMBER_STATUS_TONES,
  MemberFilters,
  MemberSortField,
  PositionFilter,
  SORT_OPTIONS,
  documentLabel,
  todayIso,
} from './data/members.models';
import { MembersRepository } from './data/members.repository';

const PAGE_SIZE = 10;

const EMPTY_FILTERS: MemberFilters = {
  text: '',
  status: 'ALL',
  sex: 'ALL',
  ageRange: 'ALL',
  position: 'ALL',
  congregationId: null,
};

const STATUS_TABS: readonly {
  id: 'ALL' | MemberStatus;
  title: string;
  icon: TabCardItem['icon'];
}[] = [
  { id: 'ALL', title: 'Todos', icon: 'users' },
  { id: 'ACTIVE', title: 'Activos', icon: 'check' },
  { id: 'INACTIVE', title: 'Inactivos', icon: 'clock' },
  { id: 'TRANSFERRED', title: 'Trasladados', icon: 'transfer' },
  { id: 'DECEASED', title: 'Fallecidos', icon: 'cross' },
];

@Component({
  selector: 'app-members-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    EmptyStateComponent,
    ErrorBannerComponent,
    ExportActionsComponent,
    IconComponent,
    LoadingComponent,
    MemberCreateDialogComponent,
    PageHeaderComponent,
    PaginationComponent,
    StatusBadgeComponent,
    TabCardsComponent,
  ],
  templateUrl: './members.page.html',
  styleUrl: './members.page.scss',
})
export class MembersPage {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly download = inject(FileDownloadService);

  /** Query param set after an internal transfer that took the member out of this sede. */
  readonly transferred = input<string>();

  protected readonly ageRanges = AGE_RANGES;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;
  protected readonly statusTones = MEMBER_STATUS_TONES;
  protected readonly documentLabel = documentLabel;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly filters = signal<MemberFilters>(EMPTY_FILTERS);
  protected readonly sortBy = signal<MemberSortField>('name');
  protected readonly order = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(1);
  protected readonly createOpen = signal(false);
  protected readonly exporting = signal(false);
  protected readonly exportMessage = signal<string | null>(null);
  protected readonly exportError = signal<string | null>(null);
  protected readonly noticeDismissed = signal(false);

  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly canReviewApplications = computed(() => this.auth.can('applications.review'));
  protected readonly isDenominationWide = computed(
    () => this.auth.tenant().congregationId === null,
  );
  protected readonly scopeName = computed(() =>
    this.isDenominationWide()
      ? 'toda la denominación'
      : (this.auth.activeScope()?.label ?? 'tu sede'),
  );
  /** Sedes the user can narrow the list to (only when acting on the whole denomination). */
  protected readonly congregations = computed(() => {
    const tenant = this.auth.tenant();
    return (this.auth.user()?.selectableScopes ?? [])
      .filter(
        (scope) =>
          scope.kind === 'CONGREGATION' &&
          scope.denominationId === tenant.denominationId &&
          scope.congregationId !== null,
      )
      .map((scope) => ({ id: scope.congregationId as number, label: scope.label }));
  });
  protected readonly hasFilters = computed(() => {
    const filters = this.filters();
    return (Object.keys(EMPTY_FILTERS) as (keyof MemberFilters)[]).some(
      (key) => filters[key] !== EMPTY_FILTERS[key],
    );
  });

  protected readonly members = rxResource({
    params: () => ({
      ...this.filters(),
      page: this.page(),
      pageSize: PAGE_SIZE,
      sortBy: this.sortBy(),
      order: this.order(),
      tenant: this.auth.tenant(),
    }),
    stream: ({ params }) => this.repository.list(params),
  });

  protected readonly positionCatalog = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.positionCatalog(),
  });

  protected readonly rows = computed(() =>
    this.members.hasValue() ? this.members.value().items : [],
  );
  protected readonly statusCounts = computed(() =>
    this.members.hasValue() ? this.members.value().statusCounts : null,
  );
  protected readonly total = computed(() =>
    this.members.hasValue() ? this.members.value().total : 0,
  );
  protected readonly positions = computed(() =>
    this.positionCatalog.hasValue() ? this.positionCatalog.value() : [],
  );
  protected readonly loadError = computed(() =>
    this.members.error() ? userMessage(this.members.error()) : null,
  );
  protected readonly statusTabs = computed<readonly TabCardItem[]>(() => {
    const counts = this.statusCounts();
    return STATUS_TABS.map((tab) => ({
      id: tab.id,
      title: tab.title,
      icon: tab.icon,
      subtitle: counts ? `${counts[tab.id]} ${counts[tab.id] === 1 ? 'miembro' : 'miembros'}` : '…',
    }));
  });

  protected updateFilter<K extends keyof MemberFilters>(key: K, value: MemberFilters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.page.set(1);
  }

  protected onText(value: string): void {
    this.updateFilter('text', value);
  }

  protected onStatus(status: string): void {
    const known = STATUS_TABS.find((tab) => tab.id === status);
    this.updateFilter('status', known?.id ?? 'ALL');
  }

  protected onSex(value: string): void {
    this.updateFilter('sex', value === 'FEMALE' || value === 'MALE' ? value : 'ALL');
  }

  protected onAgeRange(value: string): void {
    this.updateFilter(
      'ageRange',
      AGE_RANGES.find((range) => range.value === value)?.value ?? 'ALL',
    );
  }

  protected onPosition(value: string): void {
    const position: PositionFilter = value === 'ALL' || value === 'NONE' ? value : Number(value);
    this.updateFilter('position', position);
  }

  protected onCongregation(value: string): void {
    this.updateFilter('congregationId', value === '' ? null : Number(value));
  }

  protected onSort(value: string): void {
    this.sortBy.set(SORT_OPTIONS.find((option) => option.value === value)?.value ?? 'name');
    this.page.set(1);
  }

  /** Header click: sorts by the column, or flips the direction when it is already the sort. */
  protected toggleSort(field: MemberSortField): void {
    if (this.sortBy() === field) {
      this.order.update((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(field);
      this.order.set('asc');
    }
    this.page.set(1);
  }

  protected ariaSort(field: MemberSortField): 'ascending' | 'descending' | 'none' {
    if (this.sortBy() !== field) {
      return 'none';
    }
    return this.order() === 'asc' ? 'ascending' : 'descending';
  }

  protected clearFilters(): void {
    this.filters.set(EMPTY_FILTERS);
    this.page.set(1);
  }

  protected onCreated(memberId: number): void {
    void this.router.navigate(['/members', memberId]);
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    this.exportMessage.set(null);
    this.exportError.set(null);
    try {
      const file = await firstValueFrom(this.repository.exportCsv(this.filters()));
      this.download.save(file, `miembros-${todayIso()}.csv`);
      this.exportMessage.set('Se descargó el listado de miembros.');
    } catch (error) {
      this.exportError.set(userMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }
}
