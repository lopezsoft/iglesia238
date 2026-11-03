import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { matchesText } from '../../../../shared/utils/pagination';
import { showsError } from '../../application/application-form';
import { LegalEntityGroup, PublicLegalEntity, groupLegalEntities } from '../data/congregation-registration.models';

/**
 * Searchable list of the legal entities a new congregation can belong to, grouped by church. Each option
 * shows the legal name and the masked NIT; choosing one stores its id in the form control.
 */
@Component({
  selector: 'app-legal-entity-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent],
  styleUrl: './legal-entity-picker.component.scss',
  template: `
    <fieldset class="picker">
      <legend class="picker__legend">Razón social de la iglesia *</legend>
      <p class="text-muted picker__lead">
        Elige la iglesia y la razón social a la que pertenecerá tu sede.
      </p>

      <div class="picker__search">
        <label class="visually-hidden" for="legal-entity-search">Buscar razón social o iglesia</label>
        <app-icon name="search" [size]="18" />
        <input
          id="legal-entity-search"
          class="input"
          type="search"
          autocomplete="off"
          placeholder="Busca por razón social, nombre comercial o iglesia"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </div>
      <p class="visually-hidden" role="status" aria-live="polite">{{ resultsText() }}</p>

      <div class="picker__groups">
        @for (group of groups(); track group.denominationId) {
          <div class="group" role="group" [attr.aria-labelledby]="'legal-group-' + group.denominationId">
            <h3 class="group__title" [id]="'legal-group-' + group.denominationId">
              <app-icon name="church" [size]="16" />
              {{ group.denominationName }}
            </h3>
            <div class="group__options">
              @for (entity of group.entities; track entity.id) {
                <label class="entity" [class.entity--selected]="control().value === entity.id">
                  <input
                    type="radio"
                    name="legalEntityId"
                    [formControl]="control()"
                    [value]="entity.id"
                    [attr.aria-describedby]="hasError() ? 'legal-entity-error' : null"
                  />
                  <span class="entity__body">
                    <span class="entity__name">{{ entity.legalName }}</span>
                    @if (entity.tradeName) {
                      <span class="text-muted text-small">{{ entity.tradeName }}</span>
                    }
                    <span class="entity__nit text-small">NIT {{ entity.taxIdMasked }}</span>
                  </span>
                </label>
              }
            </div>
          </div>
        } @empty {
          <p class="text-muted picker__empty" role="status">
            @if (entities().length === 0) {
              Todavía no hay razones sociales disponibles. Cuando la plataforma registre la de tu iglesia, podrás
              registrar tu sede aquí.
            } @else {
              Ninguna razón social coincide con «{{ query().trim() }}».
            }
          </p>
        }
      </div>

      @if (hasError()) {
        <p id="legal-entity-error" class="field__error picker__error" role="alert">
          Selecciona la razón social de tu iglesia.
        </p>
      }
    </fieldset>
  `,
})
export class LegalEntityPickerComponent {
  readonly entities = input.required<readonly PublicLegalEntity[]>();
  readonly control = input.required<FormControl<number | null>>();
  readonly revealErrors = input(false);

  protected readonly query = signal('');
  protected readonly groups = computed<LegalEntityGroup[]>(() => {
    const text = this.query();
    return groupLegalEntities(
      this.entities().filter((entity) =>
        matchesText([entity.legalName, entity.tradeName, entity.denominationName], text),
      ),
    );
  });
  protected readonly resultsText = computed(() => {
    const total = this.groups().reduce((sum, group) => sum + group.entities.length, 0);
    return total === 1 ? '1 razón social encontrada.' : `${total} razones sociales encontradas.`;
  });

  protected hasError(): boolean {
    return showsError(this.control(), this.revealErrors());
  }
}
