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
    <div class="form-grid" [formGroup]="form()">
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

      <div class="field">
        <label [for]="id('sex')">Sexo</label>
        <select [id]="id('sex')" class="select" formControlName="sex">
          <option value="">Sin dato</option>
          <option value="FEMALE">Femenino</option>
          <option value="MALE">Masculino</option>
        </select>
      </div>

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
        <label [for]="id('document-issue-region')">Departamento de expedición</label>
        <select
          [id]="id('document-issue-region')"
          class="select"
          [value]="documentIssueRegionCode()"
          (change)="onDocumentIssueRegionChange($any($event.target).value)"
        >
          <option value="">Selecciona el departamento…</option>
          @for (region of catalogs.defaultRegions(); track region.code) {
            <option [value]="region.code">{{ region.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label [for]="id('document-issue-place')">Municipio de expedición del documento</label>
        <app-municipality-select
          [inputId]="id('document-issue-place')"
          [selectByRegion]="true"
          [regionCode]="documentIssueRegionCode()"
          [code]="documentIssuePlaceCode()"
          [label]="documentIssuePlaceLabel()"
          (picked)="onDocumentIssuePlacePicked($event)"
          (cleared)="onDocumentIssuePlaceCleared()"
        />
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
        <label [for]="id('marital-status')">Estado civil</label>
        <select [id]="id('marital-status')" class="select" formControlName="maritalStatusCode">
          <option value="">Sin dato</option>
          @for (status of catalogs.maritalStatuses(); track status.code) {
            <option [value]="status.code">{{ status.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label [for]="id('birth-region')">Departamento de nacimiento</label>
        <select
          [id]="id('birth-region')"
          class="select"
          [value]="birthRegionCode()"
          (change)="onBirthRegionChange($any($event.target).value)"
        >
          <option value="">Selecciona el departamento…</option>
          @for (region of catalogs.defaultRegions(); track region.code) {
            <option [value]="region.code">{{ region.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label [for]="id('birth-place')">Lugar de nacimiento (municipio)</label>
        <app-municipality-select
          [inputId]="id('birth-place')"
          [selectByRegion]="true"
          [regionCode]="birthRegionCode()"
          [code]="birthPlaceCode()"
          [label]="birthPlaceLabel()"
          (picked)="onBirthPlacePicked($event)"
          (cleared)="onBirthPlaceCleared()"
        />
      </div>

      <div class="field">
        <label [for]="id('spouse-full-name')">Nombre completo del cónyuge</label>
        <input
          [id]="id('spouse-full-name')"
          class="input"
          formControlName="spouseFullName"
          placeholder="Escribe el nombre del cónyuge para habilitar el tipo de matrimonio"
        />
        @if (showError('spouseFullName')) {
          <span class="field__error">Máximo 160 caracteres.</span>
        }
      </div>

      @if (
        form().controls.spouseFullName.value.trim() !== '' ||
        form().controls.maritalStatusCode.value === 'MARRIED' ||
        form().controls.maritalStatusCode.value === 'FREE_UNION' ||
        form().controls.marriageIsCivil.value ||
        form().controls.marriageIsChristian.value ||
        form().controls.marriageIsCatholic.value
      ) {
        <div class="field">
          <label>Tipo de matrimonio</label>
          <div class="cluster">
            <label class="checkbox">
              <input type="checkbox" formControlName="marriageIsCivil" />
              <span>Civil</span>
            </label>
            <label class="checkbox">
              <input type="checkbox" formControlName="marriageIsChristian" />
              <span>Cristiano</span>
            </label>
            <label class="checkbox">
              <input type="checkbox" formControlName="marriageIsCatholic" />
              <span>Católico</span>
            </label>
          </div>
        </div>
      }

      <div class="field field--full">
        <label [for]="id('tribunal-opinion')">Concepto del Tribunal Eclesiástico</label>
        <input [id]="id('tribunal-opinion')" class="input" formControlName="tribunalOpinion" />
        @if (showError('tribunalOpinion')) {
          <span class="field__error">Máximo 500 caracteres.</span>
        }
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

      <div class="field">
        <label [for]="id('workplace')">Lugar de trabajo</label>
        <input [id]="id('workplace')" class="input" formControlName="workplace" />
        @if (showError('workplace')) {
          <span class="field__error">Máximo 150 caracteres.</span>
        }
      </div>

      <div class="field">
        <label [for]="id('children-count')">Número de hijos</label>
        <input
          [id]="id('children-count')"
          class="input"
          type="number"
          min="0"
          max="30"
          formControlName="childrenCount"
        />
      </div>

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
        <label [for]="id('landline-phone')">Teléfono fijo</label>
        <input
          [id]="id('landline-phone')"
          class="input mono"
          type="tel"
          formControlName="landlinePhone"
        />
        @if (showError('landlinePhone')) {
          <span class="field__error">Escribe un teléfono válido (7 a 20 dígitos).</span>
        }
      </div>

      <div class="field">
        <label [for]="id('work-phone')">Teléfono oficina</label>
        <input
          [id]="id('work-phone')"
          class="input mono"
          type="tel"
          formControlName="workPhone"
        />
        @if (showError('workPhone')) {
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
        <label [for]="id('residence-region')">Departamento de residencia</label>
        <select
          [id]="id('residence-region')"
          class="select"
          [value]="residenceRegionCode()"
          (change)="onResidenceRegionChange($any($event.target).value)"
        >
          <option value="">Selecciona el departamento…</option>
          @for (region of catalogs.defaultRegions(); track region.code) {
            <option [value]="region.code">{{ region.name }}</option>
          }
        </select>
      </div>

      <div class="field">
        <label [for]="id('municipality-search')">Municipio de residencia</label>
        <app-municipality-select
          [inputId]="id('municipality-search')"
          [selectByRegion]="true"
          [regionCode]="residenceRegionCode()"
          [code]="municipalityCode()"
          [label]="municipalityLabel()"
          (picked)="onMunicipalityPicked($event)"
          (cleared)="onMunicipalityCleared()"
        />
      </div>

      <div class="field">
        <label [for]="id('neighborhood')">Barrio</label>
        <input [id]="id('neighborhood')" class="input" formControlName="neighborhood" />
        @if (showError('neighborhood')) {
          <span class="field__error">Máximo 100 caracteres.</span>
        }
      </div>

      <div class="field">
        <label [for]="id('address')">Dirección</label>
        <input
          [id]="id('address')"
          class="input"
          type="text"
          formControlName="address"
          autocomplete="street-address"
        />
        @if (showError('address')) {
          <span class="field__error">Máximo 200 caracteres.</span>
        }
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

  protected readonly documentIssueRegionCode = signal('');
  protected readonly documentIssuePlaceCode = signal('');
  protected readonly documentIssuePlaceLabel = computed(() => {
    const code = this.documentIssuePlaceCode();
    return code ? this.catalogs.municipalityLabel(code) : '';
  });

  protected readonly birthRegionCode = signal('');
  protected readonly birthPlaceCode = signal('');
  protected readonly birthPlaceLabel = computed(() => {
    const code = this.birthPlaceCode();
    return code ? this.catalogs.municipalityLabel(code) : '';
  });

  protected readonly residenceRegionCode = signal('');
  protected readonly municipalityCode = signal('');
  protected readonly municipalityLabel = computed(() => {
    const code = this.municipalityCode();
    return code ? this.catalogs.municipalityLabel(code) : '';
  });

  constructor() {
    this.catalogs
      .load()
      .pipe(takeUntilDestroyed())
      .subscribe({ error: () => undefined });
    if (typeof this.catalogs.loadDefaultRegions === 'function') {
      this.catalogs
        .loadDefaultRegions()
        .pipe(takeUntilDestroyed())
        .subscribe({ error: () => undefined });
    }

    // Follow the municipality controls of whichever form the parent passes.
    effect((onCleanup) => {
      const form = this.form();
      const syncMunicipality = (code: string) => {
        this.municipalityCode.set(code);
        if (code) {
          this.residenceRegionCode.set(this.inferRegionCode(code));
        }
      };
      const syncIssuePlace = (code: string) => {
        this.documentIssuePlaceCode.set(code);
        if (code) {
          this.documentIssueRegionCode.set(this.inferRegionCode(code));
        }
      };
      const syncBirthPlace = (code: string) => {
        this.birthPlaceCode.set(code);
        if (code) {
          this.birthRegionCode.set(this.inferRegionCode(code));
        }
      };

      syncMunicipality(form.controls.municipalityCode.value);
      syncIssuePlace(form.controls.documentIssuePlaceCode.value);
      syncBirthPlace(form.controls.birthPlaceCode.value);

      const sub1 = form.controls.municipalityCode.valueChanges.subscribe(syncMunicipality);
      const sub2 = form.controls.documentIssuePlaceCode.valueChanges.subscribe(syncIssuePlace);
      const sub3 = form.controls.birthPlaceCode.valueChanges.subscribe(syncBirthPlace);
      onCleanup(() => {
        sub1.unsubscribe();
        sub2.unsubscribe();
        sub3.unsubscribe();
      });
    });

    // Resolve any municipality code that arrives from the file so its name and regionCode are cached.
    effect(() => {
      const codes = [
        this.municipalityCode(),
        this.documentIssuePlaceCode(),
        this.birthPlaceCode(),
      ];
      for (const code of codes) {
        if (code && this.catalogs.municipalityLabel(code) === '—') {
          this.catalogs.resolveMunicipality(code).subscribe({
            next: (mun) => {
              if (code === this.municipalityCode() && !this.residenceRegionCode()) {
                this.residenceRegionCode.set(mun.regionCode);
              }
              if (code === this.documentIssuePlaceCode() && !this.documentIssueRegionCode()) {
                this.documentIssueRegionCode.set(mun.regionCode);
              }
              if (code === this.birthPlaceCode() && !this.birthRegionCode()) {
                this.birthRegionCode.set(mun.regionCode);
              }
            },
            error: () => undefined,
          });
        }
      }
    });
  }

  private inferRegionCode(code: string): string {
    const cached =
      typeof this.catalogs.municipality === 'function'
        ? this.catalogs.municipality(code)
        : undefined;
    if (cached?.regionCode) {
      return cached.regionCode;
    }
    return code.length >= 2 ? code.slice(0, 2) : '';
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

  protected onDocumentIssueRegionChange(regionCode: string): void {
    this.documentIssueRegionCode.set(regionCode);
    this.form().controls.documentIssuePlaceCode.setValue('');
  }

  protected onDocumentIssuePlacePicked(picked: MunicipalityPicked): void {
    this.form().controls.documentIssuePlaceCode.setValue(picked.code);
  }

  protected onDocumentIssuePlaceCleared(): void {
    this.form().controls.documentIssuePlaceCode.setValue('');
  }

  protected onBirthRegionChange(regionCode: string): void {
    this.birthRegionCode.set(regionCode);
    this.form().controls.birthPlaceCode.setValue('');
  }

  protected onBirthPlacePicked(picked: MunicipalityPicked): void {
    this.form().controls.birthPlaceCode.setValue(picked.code);
  }

  protected onBirthPlaceCleared(): void {
    this.form().controls.birthPlaceCode.setValue('');
  }

  protected onResidenceRegionChange(regionCode: string): void {
    this.residenceRegionCode.set(regionCode);
    this.form().controls.municipalityCode.setValue('');
  }

  protected onMunicipalityPicked(picked: MunicipalityPicked): void {
    this.form().controls.municipalityCode.setValue(picked.code);
  }

  protected onMunicipalityCleared(): void {
    this.form().controls.municipalityCode.setValue('');
  }
}
