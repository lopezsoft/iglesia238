import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  APPLICATION_STATUS_LABELS,
  ApplicationStatus,
} from '../../../core/models/membership.model';
import { IconComponent } from '../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { PendingApplicationsOverview } from '../data/dashboard.models';

const STATUS_TONES: Partial<Record<ApplicationStatus, BadgeTone>> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
};

/** applications.review: the newest unresolved applications with a link to review each one. */
@Component({
  selector: 'app-pending-applications-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, RouterLink, StatusBadgeComponent],
  styleUrl: './dashboard-widget.scss',
  template: `
    <section class="card card--flush" aria-labelledby="applications-title">
      <header class="widget__header">
        <div>
          <h2 id="applications-title">Solicitudes por revisar</h2>
          <p class="text-muted text-small">
            Inscripciones públicas recibidas en {{ scopeLabel() }}
          </p>
        </div>
      </header>
      @if (overview().items.length === 0) {
        <p class="widget__empty text-muted">No hay solicitudes pendientes. Todo al día.</p>
      } @else {
        <ul class="widget__list">
          @for (item of overview().items; track item.id) {
            <li class="widget__row">
              <span class="widget__avatar" aria-hidden="true">{{ item.initials }}</span>
              <div class="widget__main">
                <p class="widget__name">{{ item.fullName }}</p>
                <p class="text-muted text-small">
                  {{ item.congregationName }}
                  @if (item.note) {
                    · {{ item.note }}
                  }
                </p>
              </div>
              <div class="widget__meta">
                <span class="text-muted text-small">{{ item.createdAt | date: 'dd/MM/yyyy' }}</span>
                <app-status-badge
                  [label]="statusLabels[item.status]"
                  [tone]="tones[item.status] ?? 'neutral'"
                />
                <a
                  class="btn btn--secondary btn--sm"
                  routerLink="/applications"
                  [queryParams]="{ id: item.id }"
                  [attr.aria-label]="'Revisar la solicitud de ' + item.fullName"
                >
                  Revisar
                </a>
              </div>
            </li>
          }
        </ul>
      }
      <footer class="widget__footer">
        <span class="text-muted text-small">
          Mostrando {{ overview().items.length }} de {{ overview().total }} solicitudes sin resolver
        </span>
        <a routerLink="/applications" class="widget__more">
          Ver todas las solicitudes <app-icon name="chevron-right" [size]="16" />
        </a>
      </footer>
    </section>
  `,
})
export class PendingApplicationsWidgetComponent {
  readonly overview = input.required<PendingApplicationsOverview>();
  readonly scopeLabel = input.required<string>();

  protected readonly statusLabels = APPLICATION_STATUS_LABELS;
  protected readonly tones = STATUS_TONES;
}
