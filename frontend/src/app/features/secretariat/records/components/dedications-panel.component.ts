import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  ChildDedication,
  ParentReference,
  RECORDS_PAGE_SIZE,
  RecordsCongregation,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { debounced } from './debounced';

/** D-04: presentations of children of the active scope, most recent first, filtered and paged on the server. */
@Component({
  selector: 'app-dedications-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
  ],
  templateUrl: './dedications-panel.component.html',
  styleUrl: './records-panel.scss',
})
export class DedicationsPanelComponent {
  private readonly repository = inject(RecordsRepository);

  /** Changes after a record is created, so the list reloads. */
  readonly version = input(0);
  readonly congregations = input.required<readonly RecordsCongregation[]>();
  readonly scopeName = input.required<string>();

  protected readonly search = signal('');
  protected readonly congregationId = signal<number | null>(null);
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  private readonly query = debounced(this.search);

  protected readonly pageNumber = linkedSignal<unknown, number>({
    source: () => [this.query(), this.congregationId(), this.from(), this.to()],
    computation: () => 1,
  });
  protected readonly pageSize = RECORDS_PAGE_SIZE;
  protected readonly hasFilters = computed(
    () =>
      this.search() !== '' ||
      this.congregationId() !== null ||
      this.from() !== null ||
      this.to() !== null,
  );

  protected readonly list = rxResource({
    params: () => ({
      version: this.version(),
      page: this.pageNumber(),
      q: this.query(),
      congregationId: this.congregationId(),
      from: this.from(),
      to: this.to(),
    }),
    stream: ({ params }) =>
      this.repository.dedications({
        page: params.page,
        pageSize: RECORDS_PAGE_SIZE,
        q: params.q,
        congregationId: params.congregationId,
        from: params.from,
        to: params.to,
      }),
  });
  protected readonly result = computed(() => (this.list.hasValue() ? this.list.value() : null));
  protected readonly loadError = computed(() => userMessage(this.list.error()));

  // Detail of one record. Opening it is audited by the API (records about minors are restricted).
  protected readonly detailId = signal<number | null>(null);
  protected readonly detailOpen = linkedSignal<number | null, boolean>({
    source: this.detailId,
    computation: (id) => id !== null,
  });
  protected readonly detail = rxResource({
    params: () => this.detailId() ?? undefined,
    stream: ({ params }) => this.repository.dedication(params),
  });
  protected readonly detailData = computed(() =>
    this.detail.hasValue() ? this.detail.value() : null,
  );
  protected readonly detailError = computed(() => userMessage(this.detail.error()));

  protected parents(row: ChildDedication): { role: string; parent: ParentReference }[] {
    return [
      { role: 'Padre', parent: row.father },
      { role: 'Madre', parent: row.mother },
      { role: 'Acudiente', parent: row.guardian },
    ].filter((item): item is { role: string; parent: ParentReference } => item.parent !== null);
  }

  protected setDate(which: 'from' | 'to', raw: string): void {
    (which === 'from' ? this.from : this.to).set(raw === '' ? null : raw);
  }

  protected setCongregation(raw: string): void {
    this.congregationId.set(raw === '' ? null : Number(raw));
  }

  protected clearFilters(): void {
    this.search.set('');
    this.congregationId.set(null);
    this.from.set(null);
    this.to.set(null);
  }

  protected open(row: ChildDedication): void {
    this.detailId.set(row.id);
  }

  protected closeDetail(open: boolean): void {
    this.detailOpen.set(open);
    if (!open) {
      this.detailId.set(null);
    }
  }
}
