import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { APPLICATION_STATUS_LABELS } from '../../../../core/models/membership.model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  APPLICATION_STATUS_TONES,
  ApplicationSummary,
  documentLabel,
} from '../data/applications.models';

/** Rows of the review queue; the selected one is marked with aria-current. */
@Component({
  selector: 'app-application-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, StatusBadgeComponent],
  styleUrl: './application-list.component.scss',
  template: `
    <ul class="application-list" role="list" aria-label="Solicitudes">
      @for (item of items(); track item.id) {
        <li>
          <button
            type="button"
            class="application-list__row"
            [attr.aria-current]="item.id === selectedId() ? 'true' : null"
            (click)="selected.emit(item.id)"
          >
            <span class="application-list__text">
              <span class="application-list__name">{{ item.fullName }}</span>
              <span class="mono text-muted">{{ document(item) }}</span>
              <span class="text-small text-muted">
                Recibida el {{ item.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                @if (showCongregation()) {
                  · {{ item.congregationName }}
                }
              </span>
              @if (item.hasDuplicateMatch) {
                <span class="application-list__flag text-small">
                  <app-icon name="alert" [size]="14" />
                  Posible duplicado
                </span>
              }
              @if (item.isMinor) {
                <span class="text-small text-muted">Menor de edad · con acudiente</span>
              }
            </span>
            <app-status-badge
              [label]="statusLabels[item.status]"
              [tone]="statusTones[item.status]"
            />
          </button>
        </li>
      }
    </ul>
  `,
})
export class ApplicationListComponent {
  readonly items = input.required<readonly ApplicationSummary[]>();
  readonly selectedId = input<number | null>(null);
  /** Denomination-wide scope: each row says which sede received it. */
  readonly showCongregation = input(false);
  readonly selected = output<number>();

  protected readonly statusLabels = APPLICATION_STATUS_LABELS;
  protected readonly statusTones = APPLICATION_STATUS_TONES;

  protected document(item: ApplicationSummary): string {
    return documentLabel(item.documentTypeCode, item.documentNumber);
  }
}
