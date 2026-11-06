import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { userMessage } from '../../../../core/errors/domain-error';
import { Municipality } from '../../../../core/models/catalogs';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  FIELD_LIMITS,
  LegalEntityInput,
  LegalEntityRow,
  TAX_ID_PATTERN,
  placeLabel,
} from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import { LegalEntityCountryField, legalEntityErrorTarget } from './legal-entity-country-field';
import { MunicipalityPicked, MunicipalitySelectComponent } from './municipality-select.component';

type LegalEntityField =
  | 'legalName'
  | 'taxId'
  | 'legalRepresentative'
  | 'countryId'
  | 'regionCode'
  | 'municipalityCode'
  | 'email';

export interface LegalEntitySaved {
  readonly legalEntity: LegalEntityRow;
  readonly created: boolean;
}

/** Dialog to create a legal entity (razón social) or edit it (`legalEntity` set). */
@Component({
  selector: 'app-legal-entity-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, MunicipalitySelectComponent, ReactiveFormsModule],
  templateUrl: './legal-entity-form-dialog.component.html',
})
export class LegalEntityFormDialogComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly destroyRef = inject(DestroyRef);
  private readonly municipalitySelect = viewChild<MunicipalitySelectComponent>('municipalitySelect');

  readonly open = model(false);
  readonly legalEntity = input<LegalEntityRow | null>(null);
  readonly saved = output<LegalEntitySaved>();

  protected readonly limits = FIELD_LIMITS;
  /** Name of the chosen municipality, shown while the DIVIPOLA code is set. */
  protected readonly municipalityText = signal('');
  protected readonly isCreate = computed(() => this.legalEntity() === null);
  protected readonly pending = signal(false);
  protected readonly taxIdError = signal<string | null>(null);
  protected readonly countryError = signal<string | null>(null);
  protected readonly municipalityError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    legalName: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.legalName)]],
    tradeName: ['', Validators.maxLength(FIELD_LIMITS.legalName)],
    taxId: [
      '',
      [
        Validators.required,
        Validators.pattern(TAX_ID_PATTERN),
        Validators.maxLength(FIELD_LIMITS.taxId),
      ],
    ],
    legalRepresentative: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.legalName)]],
    countryId: [0, [Validators.required, Validators.min(1)]],
    regionCode: [''],
    municipalityCode: ['', Validators.required],
    email: ['', [Validators.email, Validators.maxLength(FIELD_LIMITS.email)]],
    phone: ['', Validators.maxLength(FIELD_LIMITS.phone)],
    address: ['', Validators.maxLength(FIELD_LIMITS.address)],
  });

  protected readonly country = new LegalEntityCountryField(
    this.form.controls.countryId,
    this.form.controls.municipalityCode,
    this.form.controls.regionCode,
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.legalEntity();
        untracked(() => this.reset(current));
      }
    });
  }

  /** A municipality or region of the previous country cannot stay: the person picks one of the new country. */
  protected onCountryChanged(): void {
    this.countryError.set(null);
    this.form.controls.regionCode.setValue('');
    this.onMunicipalityCleared();
  }

  /** Changing the department/state clears any municipality from another department and focuses the city input. */
  protected onRegionChanged(): void {
    this.onMunicipalityCleared();
    if (this.form.controls.regionCode.value) {
      this.municipalitySelect()?.focusInput();
    }
  }

  protected onMunicipalityPicked(picked: MunicipalityPicked): void {
    this.form.controls.municipalityCode.setValue(picked.code);
    this.form.controls.municipalityCode.markAsTouched();
    this.municipalityText.set(picked.label);
    this.municipalityError.set(null);
  }

  protected onMunicipalityEntityPicked(municipality: Municipality): void {
    if (municipality.regionCode) {
      this.form.controls.regionCode.setValue(municipality.regionCode);
    }
  }

  protected onMunicipalityCleared(): void {
    this.form.controls.municipalityCode.setValue('');
    this.municipalityText.set('');
  }

  protected showRegionError(): boolean {
    return (
      this.country.hasMunicipalities() !== false &&
      this.form.controls.regionCode.touched &&
      !this.form.controls.regionCode.value &&
      !this.form.controls.municipalityCode.value
    );
  }

  protected showError(control: LegalEntityField, error: string): boolean {
    const target = this.form.controls[control];
    return target.touched && target.hasError(error);
  }

  protected submit(): void {
    this.clearApiErrors();
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: LegalEntityInput = {
      legalName: value.legalName,
      tradeName: value.tradeName || null,
      taxId: value.taxId,
      legalRepresentative: value.legalRepresentative,
      countryId: value.countryId,
      municipalityCode: value.municipalityCode || null,
      email: value.email || null,
      phone: value.phone || null,
      address: value.address || null,
    };
    const current = this.legalEntity();
    const request = current
      ? this.repository.updateLegalEntity(current.id, input)
      : this.repository.createLegalEntity(input);
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (legalEntity) => {
        this.pending.set(false);
        this.open.set(false);
        this.saved.emit({ legalEntity, created: current === null });
      },
      error: (error: unknown) => {
        this.pending.set(false);
        const targets = {
          taxId: this.taxIdError,
          country: this.countryError,
          municipality: this.municipalityError,
          form: this.formError,
        };
        targets[legalEntityErrorTarget(error)].set(userMessage(error));
      },
    });
  }

  private reset(current: LegalEntityRow | null): void {
    this.form.reset({
      legalName: current?.legalName ?? '',
      tradeName: current?.tradeName ?? '',
      taxId: current?.taxId ?? '',
      legalRepresentative: current?.legalRepresentative ?? '',
      // 0 lets the country field preselect the default country.
      countryId: current?.countryId ?? 0,
      regionCode: current?.regionCode ?? '',
      municipalityCode: current?.municipalityCode ?? '',
      email: current?.email ?? '',
      phone: current?.phone ?? '',
      address: current?.address ?? '',
    });
    this.municipalityText.set(current ? placeLabel(current) : '');
    this.country.keepCurrent(current);
    this.clearApiErrors();
  }

  private clearApiErrors(): void {
    this.taxIdError.set(null);
    this.countryError.set(null);
    this.municipalityError.set(null);
    this.formError.set(null);
  }
}
