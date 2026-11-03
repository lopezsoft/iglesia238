import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { Page } from '../../../../shared/utils/pagination';
import { AttendanceSession, CatalogEntry, headcountOf } from '../data/attendance.models';

/** Sessions of a sede and meeting type, one column per category, paged on the server. */
@Component({
  selector: 'app-attendance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
  ],
  template: `
    <section class="card card--flush" aria-labelledby="attendance-history-title">
      <header class="card__header history__header">
        <div>
          <h2 id="attendance-history-title">Historial de sesiones</h2>
          <p class="text-muted text-small">{{ contextLabel() }}</p>
        </div>
        <span class="text-muted text-small">{{ result()?.total ?? 0 }} sesiones</span>
      </header>

      @if (error()) {
        <div class="history__message">
          <app-error-banner
            message="No fue posible cargar el historial de asistencia."
            (retry)="retry.emit()"
          />
        </div>
      } @else if (!result()) {
        <div class="history__message"><app-loading label="Cargando historial…" /></div>
      } @else if (result()!.total === 0) {
        <app-empty-state
          icon="calendar-check"
          [title]="filtered() ? 'Sin sesiones en ese rango' : 'Aún no hay sesiones'"
          [description]="
            filtered()
              ? 'Ninguna sesión coincide con las fechas seleccionadas.'
              : 'Las sesiones que registres aparecerán aquí, la más reciente primero.'
          "
        />
      } @else {
        <div class="table-wrap" [attr.aria-busy]="loading()">
          <table class="table">
            <caption class="visually-hidden">
              Asistencia por categoría.
              {{
                contextLabel()
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                @for (category of categories(); track category.code) {
                  <th scope="col" class="text-right">{{ category.name }}</th>
                }
                <th scope="col" class="text-right">Total</th>
                <th scope="col">Registrado por</th>
                <th scope="col"><span class="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (session of result()!.items; track session.id) {
                <tr [class.is-selected]="session.id === highlightedId()">
                  <td>
                    {{ session.sessionDate | date: 'dd/MM/yyyy' }}
                    @if (session.id === highlightedId()) {
                      <span class="badge badge--info">Guardada</span>
                    }
                  </td>
                  @for (category of categories(); track category.code) {
                    <td class="num">{{ headcount(session, category.code) }}</td>
                  }
                  <td class="num">
                    <strong>{{ session.total }}</strong>
                  </td>
                  <td>
                    <div>{{ session.recordedBy ?? 'Registro histórico' }}</div>
                    <div class="text-muted text-small">
                      {{ session.recordedAt | date: 'dd/MM/yyyy HH:mm' }}
                    </div>
                  </td>
                  <td class="text-right">
                    <div class="cluster row-actions">
                      <button
                        type="button"
                        class="btn btn--secondary btn--sm"
                        [attr.aria-label]="
                          'Corregir la sesión del ' + (session.sessionDate | date: 'dd/MM/yyyy')
                        "
                        (click)="edit.emit(session)"
                      >
                        <app-icon name="edit" [size]="16" />
                        Corregir
                      </button>
                      <button
                        type="button"
                        class="btn btn--danger-ghost btn--sm"
                        [attr.aria-label]="
                          'Eliminar la sesión del ' + (session.sessionDate | date: 'dd/MM/yyyy')
                        "
                        (click)="remove.emit(session)"
                      >
                        <app-icon name="x" [size]="16" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination
          [page]="result()!.page"
          [pageSize]="result()!.pageSize"
          [total]="result()!.total"
          (pageChange)="pageChange.emit($event)"
        />
      }
    </section>
  `,
  styles: `
    @use 'tokens' as *;

    .history__header {
      padding: $space-4 $space-5 0;
    }

    .history__message {
      padding: $space-4 $space-5;
    }

    .row-actions {
      flex-wrap: nowrap;
      justify-content: flex-end;
      gap: $space-2;
    }
  `,
})
export class AttendanceHistoryComponent {
  readonly result = input<Page<AttendanceSession> | null>(null);
  readonly categories = input.required<readonly CatalogEntry[]>();
  readonly contextLabel = input.required<string>();
  readonly highlightedId = input<number | null>(null);
  readonly loading = input(false);
  readonly error = input(false);
  /** True when the date range narrows the list, to word the empty state. */
  readonly filtered = input(false);

  readonly pageChange = output<number>();
  readonly edit = output<AttendanceSession>();
  readonly remove = output<AttendanceSession>();
  readonly retry = output<void>();

  protected readonly headcount = headcountOf;
}
