import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { EmptyStateComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import {
  MARRIAGE_END_REASON_LABELS,
  MARRIAGE_REGISTRY_LABELS,
  Marriage,
  isActiveMarriage,
} from '../data/records.models';

type StatusFilter = 'all' | 'active' | 'dissolved';

const PAGE_SIZE = 10;

/** Display number of a marriage record, e.g. MAT-0007. */
export function marriageCode(id: number): string {
  return `MAT-${String(id).padStart(4, '0')}`;
}

/** D-04: marriages where a spouse belongs to the active scope. Dissolved ones are kept. */
@Component({
  selector: 'app-marriages-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, StatusBadgeComponent, EmptyStateComponent, PaginationComponent],
  template: `
    <section class="card card--flush" aria-labelledby="marriages-title">
      <header class="card__header panel__header">
        <div>
          <h2 id="marriages-title">Matrimonios</h2>
          <p class="text-muted text-small">Un matrimonio disuelto no se elimina: conserva su historial y queda en auditoría.</p>
        </div>
        <div class="field">
          <label for="marriage-filter">Estado</label>
          <select id="marriage-filter" class="select" [value]="status()" (change)="setStatus($event)">
            <option value="all">Todos</option>
            <option value="active">Vigentes</option>
            <option value="dissolved">Disueltos</option>
          </select>
        </div>
      </header>
      @if (filtered().length === 0) {
        <app-empty-state icon="book" title="No hay matrimonios con este estado." />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">Matrimonios registrados en {{ scopeName() }}</caption>
            <thead>
              <tr>
                <th scope="col">Registro</th>
                <th scope="col">Cónyuges</th>
                <th scope="col">Fecha</th>
                <th scope="col">Lugar</th>
                <th scope="col">Oficiante</th>
                <th scope="col">Estado</th>
                @if (canWrite()) {
                  <th scope="col">Acciones</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of page().items; track row.id) {
                <tr>
                  <td class="code">{{ code(row.id) }}</td>
                  <td>
                    @for (spouse of [row.spouse1, row.spouse2]; track spouse.id) {
                      <div>
                        {{ spouse.fullName }}
                        @if (spouse.memberCode) {
                          <span class="chip chip--mono">{{ spouse.memberCode }}</span>
                        }
                      </div>
                    }
                  </td>
                  <td>
                    <div>{{ row.marriedOn ? (row.marriedOn | date: 'dd/MM/yyyy') : '—' }}</div>
                    <div class="text-muted text-small">{{ row.registeredWith ? registries[row.registeredWith] : '' }}</div>
                  </td>
                  <td>{{ row.place ?? '—' }}</td>
                  <td>{{ row.officiant?.fullName ?? 'Sin registrar' }}</td>
                  <td>
                    @if (isActive(row)) {
                      <app-status-badge label="Vigente" tone="success" />
                    } @else {
                      <app-status-badge label="Disuelto" />
                      <div class="text-muted text-small">
                        {{ row.endedOn | date: 'dd/MM/yyyy' }} · {{ row.endReason ? endReasons[row.endReason] : '' }}
                      </div>
                    }
                  </td>
                  @if (canWrite()) {
                    <td>
                      @if (isActive(row)) {
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          [attr.aria-label]="'Registrar disolución del matrimonio ' + code(row.id)"
                          (click)="dissolve.emit(row)"
                        >
                          Registrar disolución
                        </button>
                      } @else {
                        <span class="text-muted text-small">Registro cerrado</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="filtered().length" (pageChange)="pageNumber.set($event)" />
      }
    </section>
  `,
  styles: `
    .panel__header {
      padding: 1rem 1.25rem 0;
    }
  `,
})
export class MarriagesPanelComponent {
  readonly rows = input.required<readonly Marriage[]>();
  readonly scopeName = input.required<string>();
  readonly canWrite = input(false);
  readonly dissolve = output<Marriage>();

  protected readonly registries = MARRIAGE_REGISTRY_LABELS;
  protected readonly endReasons = MARRIAGE_END_REASON_LABELS;
  protected readonly code = marriageCode;
  protected readonly isActive = isActiveMarriage;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly status = signal<StatusFilter>('all');

  protected readonly filtered = computed(() => {
    const status = this.status();
    return this.rows().filter(
      (row) => status === 'all' || (status === 'active') === isActiveMarriage(row),
    );
  });
  protected readonly pageNumber = linkedSignal({ source: this.filtered, computation: () => 1 });
  protected readonly page = computed(() =>
    paginate(this.filtered(), { page: this.pageNumber(), pageSize: PAGE_SIZE }),
  );

  protected setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as StatusFilter);
  }
}
