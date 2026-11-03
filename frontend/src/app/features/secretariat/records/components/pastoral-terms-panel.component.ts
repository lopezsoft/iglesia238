import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { EmptyStateComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PastoralTerm, RecordsCongregation, durationLabel } from '../data/records.models';

interface SedeTimeline {
  readonly congregation: RecordsCongregation;
  /** Most recent first. */
  readonly terms: readonly PastoralTerm[];
}

/** D-05: one timeline of pastoral terms per sede; the open term is the current pastor. */
@Component({
  selector: 'app-pastoral-terms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, EmptyStateComponent],
  templateUrl: './pastoral-terms-panel.component.html',
  styleUrl: './pastoral-terms-panel.component.scss',
})
export class PastoralTermsPanelComponent {
  readonly terms = input.required<readonly PastoralTerm[]>();
  readonly congregations = input.required<readonly RecordsCongregation[]>();
  /** Today in Bogotá, from the API: the open term lasts until today. */
  readonly today = input.required<string>();
  readonly closeTerm = output<PastoralTerm>();

  protected readonly durationOf = (term: PastoralTerm) =>
    durationLabel(term.startedOn, term.endedOn, this.today());

  protected readonly timelines = computed<SedeTimeline[]>(() =>
    this.congregations().map((congregation) => ({
      congregation,
      terms: this.terms()
        .filter((term) => term.congregationId === congregation.id)
        .sort((a, b) => b.startedOn.localeCompare(a.startedOn)),
    })),
  );

  protected readonly scopeNote = computed(() => {
    const sedes = this.congregations();
    return sedes.length === 1
      ? `Solo ves ${sedes[0].name} porque tu rol está asignado a esa sede.`
      : `Ves las ${sedes.length} sedes activas de la denominación.`;
  });
}
