import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { EmptyStateComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { paginate } from '../../../../shared/utils/pagination';
import { ChildDedication, ParentReference } from '../data/records.models';

const PAGE_SIZE = 10;

/** D-04: presentations of children of the active scope, most recent first. */
@Component({
  selector: 'app-dedications-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, EmptyStateComponent, PaginationComponent],
  template: `
    <div class="stack">
      <div class="alert alert--warning" role="note">
        <app-icon name="lock" />
        <div>
          <strong>Datos de menores: acceso restringido</strong>
          <p class="text-small">
            Información protegida por la Ley 1581 de 2012. Solo los roles con members.write la consultan; los
            documentos se muestran enmascarados y cada registro queda en auditoría.
          </p>
        </div>
      </div>

      <section class="card card--flush" aria-labelledby="dedications-title">
        <header class="card__header panel__header">
          <h2 id="dedications-title">Presentación de niños</h2>
          <span class="text-muted text-small">Ordenado por fecha de presentación, más reciente primero</span>
        </header>
        @if (rows().length === 0) {
          <app-empty-state
            icon="book"
            title="Sin presentaciones registradas"
            description="Las presentaciones de niños de la sede aparecerán aquí."
          />
        } @else {
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">Presentaciones de niños registradas en {{ scopeName() }}</caption>
              <thead>
                <tr>
                  <th scope="col">Niño(a)</th>
                  <th scope="col">Fecha de nacimiento</th>
                  <th scope="col">Padres o acudientes</th>
                  <th scope="col">Fecha de presentación</th>
                  <th scope="col">Oficiante</th>
                </tr>
              </thead>
              <tbody>
                @for (row of page().items; track row.id) {
                  <tr>
                    <td>
                      <div>{{ row.child.fullName }}</div>
                      <div class="text-muted text-small mono">{{ row.child.maskedDocument ?? 'Sin documento' }}</div>
                    </td>
                    <td>{{ row.child.birthDate ? (row.child.birthDate | date: 'dd/MM/yyyy') : '—' }}</td>
                    <td>
                      @for (parent of parents(row); track $index) {
                        <div>
                          {{ parent.name }}
                          @if (parent.memberCode) {
                            <span class="chip chip--mono">{{ parent.memberCode }}</span>
                          } @else {
                            <span class="text-muted text-small">(sin registro)</span>
                          }
                        </div>
                      } @empty {
                        <span class="text-muted">—</span>
                      }
                    </td>
                    <td>{{ row.dedicatedOn | date: 'dd/MM/yyyy' }}</td>
                    <td>{{ row.pastor?.fullName ?? 'Sin registrar' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="rows().length" (pageChange)="pageNumber.set($event)" />
        }
      </section>
    </div>
  `,
  styles: `
    .panel__header {
      padding: 1rem 1.25rem 0;
    }
  `,
})
export class DedicationsPanelComponent {
  readonly rows = input.required<readonly ChildDedication[]>();
  readonly scopeName = input.required<string>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly pageNumber = linkedSignal({ source: this.rows, computation: () => 1 });
  protected readonly page = computed(() =>
    paginate(this.rows(), { page: this.pageNumber(), pageSize: PAGE_SIZE }),
  );

  protected parents(row: ChildDedication): ParentReference[] {
    return [row.father, row.mother].filter((parent): parent is ParentReference => parent !== null);
  }
}
