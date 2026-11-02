import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/ui/icon.component';
import { AuditHighlight } from '../data/dashboard.models';

/** audit-logs.read: the latest sensitive actions of the scope. */
@Component({
  selector: 'app-recent-audit-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, RouterLink],
  styleUrl: './dashboard-widget.scss',
  template: `
    <section class="card card--flush" aria-labelledby="audit-title">
      <header class="widget__header">
        <div>
          <h2 id="audit-title">Últimos eventos de auditoría</h2>
          <p class="text-muted text-small">Los cambios nunca incluyen datos personales</p>
        </div>
      </header>
      @if (entries().length === 0) {
        <p class="widget__empty text-muted">Aún no hay eventos registrados.</p>
      } @else {
        <ul class="widget__list">
          @for (entry of entries(); track entry.id) {
            <li class="widget__row">
              <span class="widget__avatar" aria-hidden="true"
                ><app-icon name="shield" [size]="16"
              /></span>
              <div class="widget__main">
                <p class="widget__name">{{ entry.actionLabel }} · {{ entry.entityLabel }}</p>
                <p class="text-muted text-small">{{ entry.userName }} · {{ entry.scopeLabel }}</p>
              </div>
              <span class="text-muted text-small mono">{{
                entry.createdAt | date: 'dd/MM/yyyy HH:mm'
              }}</span>
            </li>
          }
        </ul>
      }
      <footer class="widget__footer">
        <span></span>
        <a routerLink="/audit" class="widget__more">
          Ver auditoría <app-icon name="chevron-right" [size]="16" />
        </a>
      </footer>
    </section>
  `,
})
export class RecentAuditWidgetComponent {
  readonly entries = input.required<readonly AuditHighlight[]>();
}
