import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import {
  DenominationFormDrawerComponent,
  DenominationSaved,
} from './components/denomination-form-drawer.component';
import { DenominationStatusDialogComponent } from './components/denomination-status-dialog.component';
import {
  DENOMINATION_STATUS_OPTIONS,
  DenominationStatusFilter,
  DenominationSummary,
  clampPage,
  denominationInitials,
} from './data/denominations.models';
import { DenominationsRepository } from './data/denominations.repository';

const PAGE_SIZE = 10;

/** B-01: denominations (tenants) of the platform, managed by the platform admin. */
@Component({
  selector: 'app-denominations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DenominationFormDrawerComponent,
    DenominationStatusDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    PageHeaderComponent,
    PaginationComponent,
    RouterLink,
    SectionPanelComponent,
    StatCardComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './denominations.page.html',
  styleUrl: './denominations.page.scss',
})
export class DenominationsPage {
  private readonly repository = inject(DenominationsRepository);
  private readonly auth = inject(AuthService);

  protected readonly statusOptions = DENOMINATION_STATUS_OPTIONS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly canManage = computed(() => this.auth.can('denominations.manage'));
  protected readonly canReadAudit = computed(() => this.auth.can('audit-logs.read'));

  protected readonly search = signal('');
  protected readonly status = signal<DenominationStatusFilter>('all');
  protected readonly page = linkedSignal({
    source: () => ({ search: this.search(), status: this.status() }),
    computation: () => 1,
  });

  protected readonly denominations = rxResource({
    params: () => ({
      search: this.search(),
      status: this.status(),
      page: this.page(),
      pageSize: PAGE_SIZE,
    }),
    stream: ({ params }) => this.repository.list(params),
  });
  protected readonly stats = rxResource({ stream: () => this.repository.stats() });
  /** Stats, or null while loading or after an error (`value()` throws in that state). */
  protected readonly summary = computed(() => (this.stats.hasValue() ? this.stats.value() : null));
  protected readonly averageCongregations = computed(() => {
    const stats = this.summary();
    return stats && stats.total > 0 ? (stats.congregations / stats.total).toFixed(1) : '—';
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<DenominationSummary | null>(null);
  protected readonly statusOpen = signal(false);
  protected readonly statusTarget = signal<DenominationSummary | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly loadError = computed(() => {
    const error = this.denominations.error();
    return error ? userMessage(error) : null;
  });

  constructor() {
    // A status change can empty the last page (e.g. deactivating its only row while filtering
    // by "Activa"): move back to the new last page instead of showing an empty list.
    effect(() => {
      if (!this.denominations.hasValue()) {
        return;
      }
      const { items, total } = this.denominations.value();
      const page = clampPage(this.page(), total, PAGE_SIZE);
      if (items.length === 0 && page !== this.page()) {
        this.page.set(page);
      }
    });
  }

  protected initials(name: string): string {
    return denominationInitials(name);
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as DenominationStatusFilter);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(denomination: DenominationSummary): void {
    this.editing.set(denomination);
    this.formOpen.set(true);
  }

  protected openStatus(denomination: DenominationSummary): void {
    this.statusTarget.set(denomination);
    this.statusOpen.set(true);
  }

  protected onSaved({ denomination, created }: DenominationSaved): void {
    this.notice.set(
      created
        ? `Denominación «${denomination.name}» creada con su plantilla inicial y la política de datos en borrador.`
        : `Cambios guardados en «${denomination.name}».`,
    );
    this.reload();
  }

  protected onStatusChanged(denomination: DenominationSummary): void {
    this.notice.set(
      denomination.isActive
        ? `Denominación «${denomination.name}» activada de nuevo.`
        : `Denominación «${denomination.name}» desactivada. Sus usuarios ya no pueden iniciar sesión.`,
    );
    this.reload();
  }

  private reload(): void {
    this.denominations.reload();
    this.stats.reload();
  }
}
