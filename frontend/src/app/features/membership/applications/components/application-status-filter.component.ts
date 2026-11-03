import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconName } from '../../../../shared/ui/icon.component';
import { TabCardItem, TabCardsComponent } from '../../../../shared/ui/tab-cards.component';
import {
  APPLICATION_FILTERS,
  APPLICATION_FILTER_LABELS,
  ApplicationCounts,
  ApplicationFilter,
  parseApplicationFilter,
} from '../data/applications.models';

const FILTER_ICONS: Readonly<Record<ApplicationFilter, IconName>> = {
  PENDING: 'clock',
  DUPLICATE: 'copy',
  APPROVED: 'check',
  REJECTED: 'ban',
  ALL: 'inbox',
};

/** Status of the queue as tab cards with their counts; the selected card filters the queue. */
@Component({
  selector: 'app-application-status-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TabCardsComponent],
  template: `
    <app-tab-cards
      ariaLabel="Filtrar solicitudes por estado"
      idPrefix="application-status"
      [items]="items()"
      [selected]="active()"
      (selectedChange)="select($event)"
    />
  `,
})
export class ApplicationStatusFilterComponent {
  readonly active = input.required<ApplicationFilter>();
  readonly counts = input<ApplicationCounts | null>(null);
  readonly selected = output<ApplicationFilter>();

  protected readonly items = computed<readonly TabCardItem[]>(() =>
    APPLICATION_FILTERS.map((filter) => {
      const count = this.counts()?.[filter];
      return {
        id: filter,
        title: APPLICATION_FILTER_LABELS[filter],
        subtitle: count === undefined ? '—' : count === 1 ? '1 solicitud' : `${count} solicitudes`,
        icon: FILTER_ICONS[filter],
      };
    }),
  );

  protected select(id: string): void {
    this.selected.emit(parseApplicationFilter(id));
  }
}
