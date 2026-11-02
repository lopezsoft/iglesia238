import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { AuditFilters, AuditFiltersComponent, EMPTY_AUDIT_FILTERS } from './components/audit-filters.component';
import { AuditTableComponent } from './components/audit-table.component';
import { AUDIT_PAGE_SIZE } from './data/audit-log.models';
import { AuditLogRepository } from './data/audit-log.repository';

/** A-06 Registro de auditoría: read-only, newest first, IPs masked. */
@Component({
  selector: 'app-audit-log-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AuditFiltersComponent,
    AuditTableComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PageHeaderComponent,
    PaginationComponent,
    StatCardComponent,
  ],
  templateUrl: './audit-log.page.html',
  styleUrl: './audit-log.page.scss',
})
export class AuditLogPage {
  private readonly repository = inject(AuditLogRepository);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly pageSize = AUDIT_PAGE_SIZE;
  protected readonly filters = signal<AuditFilters>(EMPTY_AUDIT_FILTERS);
  protected readonly page = signal(1);

  protected readonly entries = rxResource({
    params: () => ({
      scope: this.auth.activeScope(),
      query: { ...this.filters(), page: this.page(), pageSize: AUDIT_PAGE_SIZE },
    }),
    stream: ({ params }) => this.repository.list(params.query),
  });
  protected readonly options = rxResource({
    params: () => ({ scope: this.auth.activeScope() }),
    stream: () => this.repository.filterOptions(),
  });

  protected readonly loadError = computed(() => {
    const error = this.entries.error();
    return error ? userMessage(error) : null;
  });
  protected readonly description = computed(() => {
    const scope = this.auth.activeScope();
    return scope?.kind === 'PLATFORM'
      ? 'Acciones sensibles de todas las denominaciones: quién, qué, cuándo y desde dónde.'
      : `Acciones sensibles realizadas en ${scope?.label ?? 'tu denominación'}: quién, qué, cuándo y desde dónde.`;
  });

  protected readonly rangeHint = computed(() => {
    const { from, to } = this.filters();
    if (!from && !to) {
      return 'Todo el historial';
    }
    const format = (day: string): string => formatDate(day, 'dd/MM/yyyy', this.locale);
    return `${from ? format(from) : 'Inicio'} – ${to ? format(to) : 'hoy'}`;
  });

  protected applyFilters(filters: AuditFilters): void {
    this.filters.set(filters);
    this.page.set(1);
  }
}
