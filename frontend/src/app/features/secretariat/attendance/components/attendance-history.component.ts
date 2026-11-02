import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ATTENDANCE_CATEGORIES } from '../../../../core/models/catalogs';
import { AttendanceSession, headcountOf, sessionTotal } from '../data/attendance.models';

/** Last sessions of a sede and meeting type, one column per category. */
@Component({
  selector: 'app-attendance-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <section class="card card--flush" aria-labelledby="attendance-history-title">
      <header class="card__header history__header">
        <div>
          <h2 id="attendance-history-title">Historial · Últimas {{ sessions().length }} sesiones</h2>
          <p class="text-muted text-small">{{ meetingTypeName() }} · {{ congregationName() }}</p>
        </div>
        <span class="text-muted text-small">{{ recordedCount() }} sesiones registradas</span>
      </header>
      @if (sessions().length === 0) {
        <p class="text-muted history__empty">No hay sesiones registradas para esta sede y reunión.</p>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">
              Asistencia de {{ meetingTypeName() }} por categoría en {{ congregationName() }}
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                @for (category of categories; track category.code) {
                  <th scope="col" class="text-right">{{ category.name }}</th>
                }
                <th scope="col" class="text-right">Total</th>
                <th scope="col">Registrado por</th>
                @if (canEdit()) {
                  <th scope="col"><span class="visually-hidden">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (session of sessions(); track session.id) {
                <tr [class.is-selected]="session.id === highlightedId()">
                  <td>
                    {{ session.sessionDate | date: 'dd/MM/yyyy' }}
                    @if (session.id === highlightedId()) {
                      <span class="badge badge--info">Guardada</span>
                    }
                  </td>
                  @for (category of categories; track category.code) {
                    <td class="num">{{ headcount(session, category.code) }}</td>
                  }
                  <td class="num"><strong>{{ sessionTotal(session) }}</strong></td>
                  <td>
                    <div>{{ session.recordedBy ?? 'Registro histórico' }}</div>
                    <div class="text-muted text-small">{{ session.recordedAt | date: 'dd/MM/yyyy HH:mm' }}</div>
                  </td>
                  @if (canEdit()) {
                    <td class="text-right">
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        [attr.aria-label]="'Corregir la sesión del ' + (session.sessionDate | date: 'dd/MM/yyyy')"
                        (click)="edit.emit(session)"
                      >
                        Corregir
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    .history__header {
      padding: 1rem 1.25rem 0;
    }
    .history__empty {
      padding: 0 1.25rem 1.25rem;
    }
  `,
})
export class AttendanceHistoryComponent {
  readonly sessions = input.required<readonly AttendanceSession[]>();
  readonly recordedCount = input.required<number>();
  readonly meetingTypeName = input.required<string>();
  readonly congregationName = input.required<string>();
  readonly highlightedId = input<number | null>(null);
  readonly canEdit = input(false);
  readonly edit = output<AttendanceSession>();

  protected readonly categories = ATTENDANCE_CATEGORIES;
  protected readonly headcount = headcountOf;
  protected readonly sessionTotal = sessionTotal;
}
