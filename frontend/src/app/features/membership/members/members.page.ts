import { DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import { MEMBER_STATUS_LABELS, MemberStatus } from '../../../core/models/membership.model';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { buildMembersCsv, membersCsvFileName } from './data/members-csv';
import {
  AGE_RANGES,
  MEMBER_STATUS_TONES,
  MemberFilters,
  PositionFilter,
  STATUS_FILTER_OPTIONS,
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
};

@Component({
  selector: 'app-members-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    PageHeaderComponent,
    PaginationComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './members.page.html',
  styleUrl: './members.page.scss',
})
export class MembersPage {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  /** Query param set after an internal transfer that took the member out of this sede. */
  readonly transferred = input<string>();

  protected readonly statusOptions = STATUS_FILTER_OPTIONS;
  protected readonly ageRanges = AGE_RANGES;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;
  protected readonly statusTones = MEMBER_STATUS_TONES;
  protected readonly documentLabel = documentLabel;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly filters = signal<MemberFilters>(EMPTY_FILTERS);
  protected readonly page = signal(1);
  protected readonly registerInfoOpen = signal(false);
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

  protected updateFilter<K extends keyof MemberFilters>(key: K, value: MemberFilters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.page.set(1);
  }

  protected onText(value: string): void {
    this.updateFilter('text', value);
  }

  protected onStatus(status: 'ALL' | MemberStatus): void {
    this.updateFilter('status', status);
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

  protected clearFilters(): void {
    this.filters.set(EMPTY_FILTERS);
    this.page.set(1);
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    this.exportMessage.set(null);
    this.exportError.set(null);
    try {
      const rows = await firstValueFrom(this.repository.exportRows(this.filters()));
      const csv = buildMembersCsv(rows, this.isDenominationWide());
      this.download(csv, membersCsvFileName(todayIso()));
      this.exportMessage.set(
        rows.length === 1 ? 'Se exportó 1 miembro.' : `Se exportaron ${rows.length} miembros.`,
      );
    } catch (error) {
      this.exportError.set(userMessage(error));
    } finally {
      this.exporting.set(false);
    }
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
    link.click();
    view.URL.revokeObjectURL(url);
  }
}
