import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import { TAX_ID_PATTERN } from '../../../organization/structure/data/organization.models';
import {
  LegalEntityCountryField,
  legalEntityErrorTarget,
} from '../../../organization/structure/components/legal-entity-country-field';
import {
  MunicipalityPicked,
  MunicipalitySelectComponent,
} from '../../../organization/structure/components/municipality-select.component';
import {
  DenominationOption,
  LEGAL_ENTITY_LIMITS,
  PlatformLegalEntityInput,
  PlatformLegalEntityRow,
  municipalityLabel,
} from '../data/platform-legal-entities.models';
import { PlatformLegalEntitiesRepository } from '../data/platform-legal-entities.repository';

type Field =
  | 'denominationId'
  | 'legalName'
  | 'taxId'
  | 'legalRepresentative'
  | 'countryId'
  | 'regionCode'
  | 'municipalityCode'
  | 'email';

export interface PlatformLegalEntitySaved {
  readonly legalEntity: PlatformLegalEntityRow;
  readonly created: boolean;
}

/** Dialog to create the legal entity of a church or edit it (`legalEntity` set). */
@Component({
  selector: 'app-platform-legal-entity-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, MunicipalitySelectComponent, ReactiveFormsModule],
  templateUrl: './platform-legal-entity-form-dialog.component.html',
})
export class PlatformLegalEntityFormDialogComponent {
  private readonly repository = inject(PlatformLegalEntitiesRepository);
  private readonly destroyRef = inject(DestroyRef);
  private readonly legalNameInput = viewChild<ElementRef<HTMLInputElement>>('legalNameInput');
  private readonly municipalitySelect = viewChild<MunicipalitySelectComponent>('municipalitySelect');

  readonly open = model(false);
  readonly legalEntity = input<PlatformLegalEntityRow | null>(null);
  readonly denominations = input.required<readonly DenominationOption[]>();
  /** Church preselected when creating (the one the list is filtered by). */
  readonly defaultDenominationId = input<number | null>(null);
  readonly saved = output<PlatformLegalEntitySaved>();

  protected readonly limits = LEGAL_ENTITY_LIMITS;
  protected readonly isCreate = computed(() => this.legalEntity() === null);
  /** Active churches for a new entity; an existing one keeps its own church even if it is inactive. */
  protected readonly options = computed(() => this.denominations().filter((option) => option.isActive));
  protected readonly municipalityText = signal('');
  protected readonly pending = signal(false);
  protected readonly taxIdError = signal<string | null>(null);
  protected readonly countryError = signal<string | null>(null);
  protected readonly municipalityError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    denominationId: [0, [Validators.required, Validators.min(1)]],
    legalName: ['', [Validators.required, Validators.maxLength(LEGAL_ENTITY_LIMITS.legalName)]],
    tradeName: ['', Validators.maxLength(LEGAL_ENTITY_LIMITS.legalName)],
    taxId: [
      '',
      [Validators.required, Validators.pattern(TAX_ID_PATTERN), Validators.maxLength(LEGAL_ENTITY_LIMITS.taxId)],
    ],
    legalRepresentative: ['', [Validators.required, Validators.maxLength(LEGAL_ENTITY_LIMITS.legalName)]],
    countryId: [0, [Validators.required, Validators.min(1)]],
    regionCode: [''],
    municipalityCode: ['', Validators.required],
    email: ['', [Validators.email, Validators.maxLength(LEGAL_ENTITY_LIMITS.email)]],
    phone: ['', Validators.maxLength(LEGAL_ENTITY_LIMITS.phone)],
    address: ['', Validators.maxLength(LEGAL_ENTITY_LIMITS.address)],
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
        const preselected = this.defaultDenominationId();
        untracked(() => this.reset(current, preselected));
      }
    });
  }

  /** Moving past the church selector focuses the legal name input right away. */
  protected onDenominationChanged(): void {
    if (this.form.controls.denominationId.value > 0) {
      this.legalNameInput()?.nativeElement.focus();
    }
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

  protected showError(control: Field, error: string): boolean {
    const target = this.form.controls[control];
    return target.touched && target.hasError(error);
  }

  protected submit(): void {
    this.clearApiErrors();
    if (this.pending()) {
      return;
    }
    // On edit the church is fixed, so its (disabled) control does not take part in the validation.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: PlatformLegalEntityInput = {
      legalName: value.legalName.trim(),
      tradeName: value.tradeName.trim() || null,
      taxId: value.taxId.trim(),
      legalRepresentative: value.legalRepresentative.trim(),
      countryId: value.countryId,
      municipalityCode: value.municipalityCode || null,
      email: value.email.trim() || null,
      phone: value.phone.trim() || null,
      address: value.address.trim() || null,
    };
    const current = this.legalEntity();
    const request = current
      ? this.repository.update(current.id, input)
      : this.repository.create({ ...input, denominationId: value.denominationId });
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

  private reset(current: PlatformLegalEntityRow | null, preselected: number | null): void {
    const singleOptionId = this.options().length === 1 ? this.options()[0].id : 0;
    const initialDenominationId = current?.denominationId ?? preselected ?? singleOptionId;
    this.form.reset({
      denominationId: initialDenominationId,
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
    if (current) {
      this.form.controls.denominationId.disable();
    } else {
      this.form.controls.denominationId.enable();
    }
    this.municipalityText.set(current ? municipalityLabel(current) : '');
    this.country.keepCurrent(current);
    this.clearApiErrors();
    if (initialDenominationId > 0) {
      queueMicrotask(() => this.legalNameInput()?.nativeElement.focus());
    }
  }

  private clearApiErrors(): void {
    this.taxIdError.set(null);
    this.countryError.set(null);
    this.municipalityError.set(null);
    this.formError.set(null);
  }
}
