import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  MARRIAGE_END_REASON_LABELS,
  MARRIAGE_REGISTRY_LABELS,
  Marriage,
  RECORDS_PAGE_SIZE,
  isActiveMarriage,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { debounced } from './debounced';

type StatusFilter = 'all' | 'active' | 'dissolved';

/** D-04: marriages where a spouse belongs to the active scope. Dissolved ones are kept. */
@Component({
  selector: 'app-marriages-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    StatusBadgeComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
  ],
  templateUrl: './marriages-panel.component.html',
  styleUrl: './records-panel.scss',
})
export class MarriagesPanelComponent {
  private readonly repository = inject(RecordsRepository);

  /** Changes after a record is created or dissolved, so the list reloads. */
  readonly version = input(0);
  readonly scopeName = input.required<string>();
  readonly dissolve = output<Marriage>();

  protected readonly registries = MARRIAGE_REGISTRY_LABELS;
  protected readonly endReasons = MARRIAGE_END_REASON_LABELS;
  protected readonly isActive = isActiveMarriage;
  protected readonly pageSize = RECORDS_PAGE_SIZE;

  protected readonly status = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  private readonly query = debounced(this.search);

  protected readonly pageNumber = linkedSignal<unknown, number>({
    source: () => [this.status(), this.query(), this.from(), this.to()],
    computation: () => 1,
  });
  protected readonly hasFilters = computed(
    () =>
      this.status() !== 'all' || this.search() !== '' || this.from() !== null || this.to() !== null,
  );

  protected readonly list = rxResource({
    params: () => ({
      version: this.version(),
      page: this.pageNumber(),
      status: this.status(),
      q: this.query(),
      from: this.from(),
      to: this.to(),
    }),
    stream: ({ params }) =>
      this.repository.marriages({
        page: params.page,
        pageSize: RECORDS_PAGE_SIZE,
        status: params.status === 'all' ? null : params.status,
        q: params.q,
        from: params.from,
        to: params.to,
      }),
  });
  protected readonly result = computed(() => (this.list.hasValue() ? this.list.value() : null));
  protected readonly loadError = computed(() => userMessage(this.list.error()));

  protected setStatus(value: string): void {
    this.status.set(value as StatusFilter);
  }

  protected setDate(which: 'from' | 'to', raw: string): void {
    (which === 'from' ? this.from : this.to).set(raw === '' ? null : raw);
  }

  protected clearFilters(): void {
    this.status.set('all');
    this.search.set('');
    this.from.set(null);
    this.to.set(null);
  }
}
