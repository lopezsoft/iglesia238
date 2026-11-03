import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { MunicipalitySelectComponent } from '../../../organization/structure/components/municipality-select.component';
import type { MunicipalityPicked } from '../../../organization/structure/components/municipality-select.component';
import { todayIso } from '../data/members.models';
import { PersonForm } from './person-form';

/**
 * The personal data fields of the registration and edit dialogs. The form lives in the parent so
 * it can validate and submit; this component only draws the controls and their messages.
 */
@Component({
  selector: 'app-person-fields',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MunicipalitySelectComponent],
  template: `
    <div class="stack" [formGroup]="form()">
      <div class="form-grid">
        <div class="field">
          <label [for]="id('first-name')">Nombres *</label>
          <input
            [id]="id('first-name')"
            class="input"
            formControlName="firstName"
            autocomplete="given-name"
          />
          @if (showError('firstName')) {
            <span class="field__error">Escribe los nombres (máximo 100 caracteres).</span>
          }
        </div>
        <div class="field">
          <label [for]="id('last-name')">Primer apellido *</label>
          <input
            [id]="id('last-name')"
            class="input"
            formControlName="lastName"
            autocomplete="family-name"
          />
          @if (showError('lastName')) {
            <span class="field__error">Escribe el primer apellido (máximo 80 caracteres).</span>
          }
        </div>
        <div class="field">
          <label [for]="id('second-last-name')">Segundo apellido</label>
          <input [id]="id('second-last-name')" class="input" formControlName="secondLastName" />
          @if (showError('secondLastName')) {
            <span class="field__error">Máximo 80 caracteres.</span>
          }
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label [for]="id('document-type')">Tipo de documento</label>
          <select [id]="id('document-type')" class="select" formControlName="documentTypeCode">
            <option value="">Sin documento</option>
            @for (type of catalogs.documentTypes(); track type.code) {
              <option [value]="type.code">{{ type.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label [for]="id('document-number')">Número de documento</label>
          <input
            [id]="id('document-number')"
            class="input mono"
            formControlName="documentNumber"
            inputmode="text"
          />
          <span class="field__hint">Único en la denominación.</span>
          @if (form().controls.documentNumber.errors?.['duplicate']; as duplicate) {
            <span class="field__error">{{ duplicate }}</span>
          } @else if (showError('documentNumber')) {
            <span class="field__error">Solo letras y números (3 a 30 caracteres).</span>
          }
          @if (showDocumentPairError()) {
            <span class="field__error">El tipo y el número de documento van juntos.</span>
          }
        </div>
        <div class="field">
          <label [for]="id('birth-date')">Fecha de nacimiento</label>
          <input
            [id]="id('birth-date')"
            class="input"
            type="date"
            formControlName="birthDate"
            [max]="today"
          />
          @if (showError('birthDate')) {
            <span class="field__error">La fecha de nacimiento no puede ser futura.</span>
          }
        </div>
        <div class="field">
          <label [for]="id('sex')">Sexo</label>
          <select [id]="id('sex')" class="select" formControlName="sex">
            <option value="">Sin dato</option>
            <option value="FEMALE">Femenino</option>
            <option value="MALE">Masculino</option>
          </select>
        </div>
        <div class="field">
          <label [for]="id('marital-status')">Estado civil</label>
          <select [id]="id('marital-status')" class="select" formControlName="maritalStatusCode">
            <option value="">Sin dato</option>
            @for (status of catalogs.maritalStatuses(); track status.code) {
              <option [value]="status.code">{{ status.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label [for]="id('education-level')">Nivel educativo</label>
          <select [id]="id('education-level')" class="select" formControlName="educationLevelCode">
            <option value="">Sin dato</option>
            @for (level of catalogs.educationLevels(); track level.code) {
              <option [value]="level.code">{{ level.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label [for]="id('profession')">Profesión</label>
          <input [id]="id('profession')" class="input" formControlName="profession" />
          @if (showError('profession')) {
            <span class="field__error">Máximo 120 caracteres.</span>
          }
        </div>
        <div class="field">
          <label [for]="id('occupation')">Ocupación</label>
          <input [id]="id('occupation')" class="input" formControlName="occupation" />
          @if (showError('occupation')) {
            <span class="field__error">Máximo 120 caracteres.</span>
          }
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label [for]="id('phone')">Teléfono celular</label>
          <input
            [id]="id('phone')"
            class="input mono"
            type="tel"
            formControlName="phone"
            autocomplete="tel"
          />
          @if (showError('phone')) {
            <span class="field__error">Escribe un teléfono válido (7 a 20 dígitos).</span>
          }
        </div>
        <div class="field">
          <label [for]="id('email')">Correo electrónico</label>
          <input
            [id]="id('email')"
            class="input"
            type="email"
            formControlName="email"
            autocomplete="email"
          />
          @if (showError('email')) {
            <span class="field__error">Escribe un correo válido.</span>
          }
        </div>
        <div class="field">
          <label [for]="id('address')">Dirección</label>
          <input
            [id]="id('address')"
            class="input"
            formControlName="address"
            autocomplete="street-address"
          />
          @if (showError('address')) {
            <span class="field__error">Máximo 200 caracteres.</span>
          }
        </div>
        <div class="field">
          <label [for]="id('municipality-search')">Municipio de residencia</label>
          <app-municipality-select
            [inputId]="id('municipality-search')"
            [code]="municipalityCode()"
            [label]="municipalityLabel()"
            (picked)="onMunicipalityPicked($event)"
            (cleared)="onMunicipalityCleared()"
          />
        </div>
      </div>
    </div>
  `,
})
export class PersonFieldsComponent {
  protected readonly catalogs = inject(CatalogsStore);

  readonly form = input.required<PersonForm>();
  readonly submitted = input(false);
  /** Keeps the ids unique when two forms are on the same page. */
  readonly idPrefix = input('person');

  protected readonly today = todayIso();
  private readonly pickedLabel = signal<{ code: string; label: string } | null>(null);

  protected readonly municipalityCode = signal('');
  protected readonly municipalityLabel = computed(() => {
    const code = this.municipalityCode();
    if (!code) {
      return '';
    }
    const picked = this.pickedLabel();
    return picked?.code === code ? picked.label : this.catalogs.municipalityLabel(code);
  });

  constructor() {
    this.catalogs
      .load()
      .pipe(takeUntilDestroyed())
      .subscribe({ error: () => undefined });
    // The form is an input: follow the municipality control of whichever form the parent passes.
    effect((onCleanup) => {
      const control = this.form().controls.municipalityCode;
      this.municipalityCode.set(control.value);
      const subscription = control.valueChanges.subscribe((code) =>
        this.municipalityCode.set(code),
      );
      onCleanup(() => subscription.unsubscribe());
    });
    // A code that arrives from the file is turned into its name once, then served from the cache.
    effect(() => {
      const code = this.municipalityCode();
      if (code && this.catalogs.municipalityLabel(code) === '—') {
        this.catalogs.resolveMunicipality(code).subscribe({ error: () => undefined });
      }
    });
  }

  protected id(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  protected showError(name: keyof PersonForm['controls']): boolean {
    const control = this.form().controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected showDocumentPairError(): boolean {
    const { documentNumber, documentTypeCode } = this.form().controls;
    return (
      this.form().hasError('documentPair') &&
      (documentNumber.touched || documentTypeCode.touched || this.submitted())
    );
  }

  protected onMunicipalityPicked(picked: MunicipalityPicked): void {
    this.pickedLabel.set(picked);
    this.form().controls.municipalityCode.setValue(picked.code);
  }

  protected onMunicipalityCleared(): void {
    this.form().controls.municipalityCode.setValue('');
  }
}
