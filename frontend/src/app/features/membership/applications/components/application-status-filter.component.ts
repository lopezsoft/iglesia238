import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  APPLICATION_FILTERS,
  APPLICATION_FILTER_LABELS,
  ApplicationCounts,
  ApplicationFilter,
} from '../data/applications.models';

/** Status chips with their counts; a pressed chip filters the queue. */
@Component({
  selector: 'app-application-status-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './application-status-filter.component.scss',
  template: `
    <div class="status-filter" role="group" aria-label="Filtrar por estado">
      @for (filter of filters; track filter) {
        <button
          type="button"
          class="status-filter__chip"
          [attr.aria-pressed]="filter === active()"
          (click)="selected.emit(filter)"
        >
          <span>{{ labels[filter] }}</span>
          <span class="status-filter__count">{{ counts()?.[filter] ?? '–' }}</span>
        </button>
      }
    </div>
  `,
})
export class ApplicationStatusFilterComponent {
  readonly active = input.required<ApplicationFilter>();
  readonly counts = input<ApplicationCounts | null>(null);
  readonly selected = output<ApplicationFilter>();

  protected readonly filters = APPLICATION_FILTERS;
  protected readonly labels = APPLICATION_FILTER_LABELS;
}
