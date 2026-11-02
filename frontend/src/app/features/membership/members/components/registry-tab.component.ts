import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { MemberRegistryView, TRANSFER_STATUS_LABELS } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';

interface TimelineEvent {
  readonly key: string;
  readonly kind: 'entry' | 'transfer';
  readonly title: string;
  readonly badge: string;
  readonly tone: BadgeTone;
  readonly date: string;
  readonly place: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
  readonly note: string | null;
}

function toTimeline(view: MemberRegistryView): TimelineEvent[] {
  const entries: TimelineEvent[] = view.entries.map((entry) => ({
    key: `entry-${entry.id}`,
    kind: 'entry',
    title: 'Inscripción en libro de miembros',
    badge: entry.endedOn ? 'Cerrado' : 'Vigente',
    tone: entry.endedOn ? 'neutral' : 'success',
    date: entry.startedOn,
    place: entry.congregationName,
    details: [
      {
        label: 'Libro · Folio',
        value: `${entry.registryBook ?? '—'} · ${entry.registryFolio ?? '—'}`,
      },
      { label: 'Número', value: String(entry.memberNumber) },
      { label: 'Carné', value: entry.code },
    ],
    note: entry.endedOn
      ? `Registro cerrado el ${formatDate(entry.endedOn)}; el folio se conserva sin borrar.`
      : null,
  }));
  const transfers: TimelineEvent[] = view.transfers.map((transfer) => ({
    key: `transfer-${transfer.id}`,
    kind: 'transfer',
    title: transfer.isExternal ? 'Traslado a otra iglesia' : 'Traslado entre sedes',
    badge: TRANSFER_STATUS_LABELS[transfer.status],
    tone: transfer.status === 'COMPLETED' ? 'info' : 'neutral',
    date: transfer.transferDate,
    place: `${transfer.originName} → ${transfer.destinationName}`,
    details: transfer.notes ? [{ label: 'Motivo', value: transfer.notes }] : [],
    note: null,
  }));
  // Most recent first; on the same day the entry a transfer opened goes above the transfer.
  return [...entries, ...transfers].sort(
    (a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === 'entry' ? -1 : 1),
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

@Component({
  selector: 'app-registry-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ErrorBannerComponent, LoadingComponent, StatusBadgeComponent],
  styleUrls: ['./member-tab.scss', './registry-tab.component.scss'],
  template: `
    <div class="tab__header">
      <div>
        <h2>Registro y traslados</h2>
        <p class="text-muted text-small">
          Inscripciones en los libros de cada sede y traslados, del más reciente al más antiguo.
        </p>
      </div>
    </div>

    @if (loadError(); as text) {
      <app-error-banner [message]="text" (retry)="registry.reload()" />
    } @else if (registry.hasValue()) {
      <ol class="timeline">
        @for (event of timeline(); track event.key) {
          <li class="timeline__item" [class.timeline__item--transfer]="event.kind === 'transfer'">
            <span class="timeline__dot" aria-hidden="true"></span>
            <div class="timeline__body">
              <div class="cluster">
                <strong>{{ event.title }}</strong>
                <app-status-badge [label]="event.badge" [tone]="event.tone" />
              </div>
              <p class="text-muted text-small">
                {{ event.date | date: 'dd/MM/yyyy' }} · {{ event.place }}
              </p>
              @if (event.details.length) {
                <p class="cluster text-small">
                  @for (detail of event.details; track detail.label) {
                    <span
                      >{{ detail.label }}: <span class="mono">{{ detail.value }}</span></span
                    >
                  }
                </p>
              }
              @if (event.note) {
                <p class="text-muted text-small">{{ event.note }}</p>
              }
            </div>
          </li>
        } @empty {
          <li class="text-muted">Sin registros.</li>
        }
      </ol>
    } @else {
      <app-loading label="Cargando registro…" />
    }
  `,
})
export class RegistryTabComponent {
  private readonly repository = inject(MembersRepository);

  readonly memberId = input.required<number>();
  /** Changes after a transfer made from the header, to reload the timeline. */
  readonly revision = input(0);

  protected readonly registry = rxResource({
    params: () => ({ memberId: this.memberId(), revision: this.revision() }),
    stream: ({ params }) => this.repository.registry(params.memberId),
  });

  protected readonly timeline = computed(() =>
    this.registry.hasValue() ? toTimeline(this.registry.value()) : [],
  );
  protected readonly loadError = computed(() =>
    this.registry.error() ? userMessage(this.registry.error()) : null,
  );
}
