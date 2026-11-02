import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CONTRIBUTION_CATEGORY_LABELS } from '../../data/accounting.models';
import { ContributionTypeRow } from '../data/accounting-setup.models';

/** Contribution types with their category, linked income account and an active switch. */
@Component({
  selector: 'app-contribution-types-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card--flush" aria-labelledby="types-title">
      <div class="types-header">
        <h2 id="types-title">Tipos de aporte</h2>
        <p class="text-muted text-small">
          Cada tipo se contabiliza en una cuenta imputable de ingreso. Los tipos inactivos no aparecen al registrar aportes.
        </p>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Categoría</th>
              <th scope="col">Cuenta contable asociada</th>
              <th scope="col">Activo</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (type of types(); track type.id) {
              <tr>
                <td>
                  <div>{{ type.name }}</div>
                  <div class="mono text-muted text-small">{{ type.code }}</div>
                </td>
                <td>
                  <span class="badge badge--info">{{ categoryLabels[type.category] }}</span>
                  <span class="mono text-muted text-small"> {{ type.category }}</span>
                </td>
                <td>
                  <span class="mono">{{ type.accountCode }}</span>
                  <span class="text-muted"> · {{ type.accountName }}</span>
                </td>
                <td>
                  <div class="cluster switch-cell">
                    <button
                      type="button"
                      role="switch"
                      class="switch"
                      [attr.aria-checked]="type.isActive"
                      [attr.aria-label]="'Tipo ' + type.name + ' activo'"
                      [disabled]="!canManage() || busyId() === type.id"
                      (click)="toggle.emit(type)"
                    >
                      <span class="switch__thumb" aria-hidden="true"></span>
                    </button>
                    <span class="text-small">{{ type.isActive ? 'Activo' : 'Inactivo' }}</span>
                  </div>
                </td>
                <td class="text-right">
                  @if (canManage()) {
                    <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Editar tipo ' + type.name" (click)="edit.emit(type)">
                      Editar
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="text-muted text-small types-footer">{{ summary() }}</p>
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;
    .types-header {
      padding: $space-5 $space-5 $space-4;
    }
    .types-footer {
      padding: $space-3 $space-5;
    }
    .switch-cell {
      flex-wrap: nowrap;
    }
    .switch {
      position: relative;
      width: 2.5rem;
      height: 1.5rem;
      padding: 0;
      border: 0;
      border-radius: $radius-pill;
      background: $color-border-strong;
      cursor: pointer;

      &[aria-checked='true'] {
        background: $color-success;
      }

      &:focus-visible {
        @include focus-ring;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
    }
    .switch__thumb {
      position: absolute;
      top: 0.1875rem;
      left: 0.1875rem;
      width: 1.125rem;
      height: 1.125rem;
      border-radius: 50%;
      background: $color-surface;
      box-shadow: $shadow-card;
      transition: transform 120ms ease;

      .switch[aria-checked='true'] & {
        transform: translateX(1rem);
      }
    }
  `,
})
export class ContributionTypesTableComponent {
  readonly types = input.required<readonly ContributionTypeRow[]>();
  readonly canManage = input(false);
  /** Type whose active flag is being saved. */
  readonly busyId = input<number | null>(null);
  readonly toggle = output<ContributionTypeRow>();
  readonly edit = output<ContributionTypeRow>();

  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly summary = computed(() => {
    const active = this.types().filter((t) => t.isActive).length;
    return `${this.types().length} tipos de aporte · ${active} activos`;
  });
}
