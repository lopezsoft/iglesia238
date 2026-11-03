import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MEMBER_STATUS_LABELS } from '../../../../core/models/membership.model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PersonMatch, canLinkMatch, documentLabel } from '../data/applications.models';

/**
 * C-03: the document of the application already belongs to a person of the denomination. The
 * reviewer decides: approve on top of that person (a relative, a guardian or a former member who
 * joins), mark the application as a duplicate, or say it is somebody else.
 */
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
        <strong>Este documento ya está registrado</strong>
        <p>
          <span class="mono">{{ document() }}</span> pertenece a {{ match().fullName }}
          @if (match().congregationName) {
            ({{ match().congregationName }})
          }
        </p>
        @if (match().memberId !== null) {
          <p class="text-small text-muted">
            Número de miembro <span class="mono">{{ match().memberCode ?? '—' }}</span> · {{ memberStatus() }}
          </p>
        } @else {
          <p class="text-small text-muted">Está registrada como persona, pero todavía no es miembro.</p>
        }
        <p class="text-small text-muted">
          {{ guidance() }}
        </p>
        @if (canResolve()) {
          <div class="cluster duplicate-warning__actions">
            @if (linkable()) {
              <button type="button" class="btn btn--primary" [disabled]="pending()" (click)="link.emit(match().personId)">
                {{ match().memberId !== null ? 'Readmitir a esta persona' : 'Aprobar sobre esta persona' }}
              </button>
            }
            <button
              type="button"
              class="btn btn--secondary"
              [disabled]="pending()"
              (click)="markDuplicate.emit(match().personId)"
            >
              Marcar como duplicada
            </button>
            <button type="button" class="btn btn--ghost" [disabled]="pending()" (click)="dismiss.emit()">
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
  /** Approve the application linked to the existing person. */
  readonly link = output<number>();
  readonly markDuplicate = output<number>();
  readonly dismiss = output<void>();

  protected readonly document = computed(() =>
    documentLabel(this.match().documentTypeCode, this.match().documentNumber),
  );
  protected readonly linkable = computed(() => canLinkMatch(this.match()));
  protected readonly memberStatus = computed(() => {
    const status = this.match().memberStatus;
    return status ? `Miembro ${MEMBER_STATUS_LABELS[status].toLowerCase()}` : '';
  });
  protected readonly guidance = computed(() => {
    switch (this.match().memberStatus) {
      case 'ACTIVE':
        return 'Ya es miembro activo: marca la solicitud como duplicada. No se crea otro registro.';
      case 'DECEASED':
        return 'Figura como fallecida: no puede ser readmitida. Marca la solicitud como duplicada o recházala.';
      case 'INACTIVE':
      case 'TRANSFERRED':
        return 'Si vuelve a la iglesia, readmítela: se reactiva su registro y recibe un nuevo número en esta sede.';
      default:
        return 'Si es la misma persona, aprueba sobre su registro: se completa su ficha y se crea su membresía, sin duplicarla.';
    }
  });
}
