import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MEMBER_STATUS_LABELS } from '../../../../core/models/membership.model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PersonMatch, documentLabel } from '../data/applications.models';

/** C-03: the document of the application already belongs to a person of the denomination. */
@Component({
  selector: 'app-duplicate-warning',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    .duplicate-warning__actions {
      margin-top: 0.75rem;
    }
  `,
  template: `
    <div class="alert alert--warning" role="alert">
      <app-icon name="alert" [size]="20" />
      <div>
        <strong>Posible persona duplicada</strong>
        <p>
          Coincidencia por documento: <span class="mono">{{ document() }}</span> ya pertenece a
          Persona #{{ match().personId }} · {{ match().fullName }}
          @if (match().congregationName) {
            ({{ match().congregationName }})
          }
        </p>
        @if (match().memberId !== null) {
          <p class="text-small text-muted">
            Carné <span class="mono">{{ match().memberCode }}</span> · {{ memberStatus() }}
          </p>
        }
        <p class="text-small text-muted">
          Resuelve la coincidencia antes de aprobar. Si es la misma persona, la solicitud se enlaza
          a su registro y no se crea un miembro nuevo.
        </p>
        @if (canResolve()) {
          <div class="cluster duplicate-warning__actions">
            <button
              type="button"
              class="btn btn--primary"
              [disabled]="pending()"
              (click)="markDuplicate.emit(match().personId)"
            >
              Marcar como duplicada y enlazar
            </button>
            <button
              type="button"
              class="btn btn--secondary"
              [disabled]="pending()"
              (click)="dismiss.emit()"
            >
              No es la misma persona
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class DuplicateWarningComponent {
  readonly match = input.required<PersonMatch>();
  readonly canResolve = input(true);
  readonly pending = input(false);
  readonly markDuplicate = output<number>();
  readonly dismiss = output<void>();

  protected readonly document = computed(() =>
    documentLabel(this.match().documentTypeCode, this.match().documentNumber),
  );
  protected readonly memberStatus = computed(() => {
    const status = this.match().memberStatus;
    return status ? `Miembro ${MEMBER_STATUS_LABELS[status].toLowerCase()}` : '';
  });
}
