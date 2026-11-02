import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { CongregationOverview } from '../data/dashboard.models';

/** congregations.manage: members and pending applications of each sede in scope. */
@Component({
  selector: 'app-congregations-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusBadgeComponent],
  styleUrl: './dashboard-widget.scss',
  template: `
    <section class="card card--flush" aria-labelledby="sedes-title">
      <header class="widget__header">
        <div>
          <h2 id="sedes-title">Sedes</h2>
          <p class="text-muted text-small">
            {{ activeCount() }} activas · {{ totals().members }} miembros activos ·
            {{ totals().pending }} solicitudes pendientes
          </p>
        </div>
        <a class="btn btn--secondary btn--sm" routerLink="/organization">Administrar sedes</a>
      </header>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">
            Miembros activos y solicitudes pendientes por sede
          </caption>
          <thead>
            <tr>
              <th scope="col">Sede</th>
              <th scope="col" class="text-right">Miembros activos</th>
              <th scope="col" class="text-right">Solicitudes pendientes</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (sede of congregations(); track sede.id) {
              <tr>
                <th scope="row">{{ sede.name }}</th>
                <td class="num">{{ sede.activeMembers }}</td>
                <td class="num">{{ sede.pendingApplications }}</td>
                <td>
                  <app-status-badge
                    [label]="sede.isActive ? 'Activa' : 'Inactiva'"
                    [tone]="sede.isActive ? 'success' : 'neutral'"
                  />
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="text-muted">La denominación aún no tiene sedes.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class CongregationsWidgetComponent {
  readonly congregations = input.required<readonly CongregationOverview[]>();

  protected readonly activeCount = computed(
    () => this.congregations().filter((c) => c.isActive).length,
  );
  protected readonly totals = computed(() =>
    this.congregations().reduce(
      (sum, c) => ({
        members: sum.members + c.activeMembers,
        pending: sum.pending + c.pendingApplications,
      }),
      { members: 0, pending: 0 },
    ),
  );
}
