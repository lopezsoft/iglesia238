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
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  CongregationInput,
  CongregationRow,
  FIELD_LIMITS,
  placeLabel,
} from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import { MunicipalityPicked, MunicipalitySelectComponent } from './municipality-select.component';

type CongregationField =
  | 'name'
  | 'legalEntityId'
  | 'municipalityCode'
  | 'address'
  | 'email'
  | 'code';

const CODE_ERRORS: ReadonlySet<string> = new Set(['DUPLICATE_CODE', 'INVALID_CODE']);
/** 400 when the municipality is not of the country of the legal entity. */
const MUNICIPALITY_COUNTRY_MISMATCH = 'MUNICIPALITY_COUNTRY_MISMATCH';

export interface CongregationSaved {
  readonly congregation: CongregationRow;
  readonly created: boolean;
}

/** Dialog to create a sede or edit it (`congregation` set). */
@Component({
  selector: 'app-congregation-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, MunicipalitySelectComponent, ReactiveFormsModule],
  templateUrl: './congregation-form-dialog.component.html',
  styleUrl: './congregation-form-dialog.component.scss',
})
export class CongregationFormDialogComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model(false);
  readonly congregation = input<CongregationRow | null>(null);
  readonly denominationName = input('');
  readonly saved = output<CongregationSaved>();

  protected readonly limits = FIELD_LIMITS;
  protected readonly isCreate = computed(() => this.congregation() === null);
  protected readonly pending = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly codeError = signal<string | null>(null);
  protected readonly municipalityError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  /** False when the country of the chosen legal entity has no municipality loaded. */
  protected readonly municipalitiesAvailable = signal(true);

  protected readonly options = rxResource({
    params: () => (this.open() ? true : undefined),
    stream: () => this.repository.congregationFormOptions(),
  });

  /** Loaded options, or null while loading or after an error (`value()` throws in that state). */
  private readonly loadedOptions = computed(() =>
    this.options.hasValue() ? this.options.value() : null,
  );
  /** Active legal entities, plus the current one of the sede if it was deactivated. */
  protected readonly legalEntities = computed(() => {
    const currentId = this.congregation()?.legalEntityId;
    return (this.loadedOptions()?.legalEntities ?? []).filter(
      (option) => option.isActive || option.id === currentId,
    );
  });
  protected readonly districts = computed(() => this.loadedOptions()?.districts ?? []);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.congregationName)]],
    code: [
      '',
      [Validators.maxLength(FIELD_LIMITS.congregationCode), Validators.pattern(/^[A-Za-z0-9]*$/)],
    ],
    legalEntityId: ['', Validators.required],
    districtId: [''],
    municipalityCode: ['', Validators.required],
    neighborhood: ['', Validators.maxLength(FIELD_LIMITS.neighborhood)],
    address: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.address)]],
    phone: ['', Validators.maxLength(FIELD_LIMITS.phone)],
    email: ['', [Validators.email, Validators.maxLength(FIELD_LIMITS.email)]],
    acceptsApplications: [true],
  });

  /** Name of the chosen municipality, shown while its code is set. */
  protected readonly municipalityText = signal('');

  private readonly legalEntityId = toSignal(
    this.form.controls.legalEntityId.valueChanges.pipe(startWith(this.form.controls.legalEntityId.value)),
    { initialValue: '' },
  );
  /** The legal entity chosen in the form: the municipality of the sede must be of its country. */
  protected readonly selectedLegalEntity = computed(() => {
    const id = Number(this.legalEntityId());
    return this.loadedOptions()?.legalEntities.find((option) => option.id === id) ?? null;
  });
  protected readonly municipalityBlockedText = computed(() =>
    this.legalEntityId() === '' ? 'Elige primero la razón social.' : null,
  );
  /** Legal entity the chosen municipality was searched for; its country decides whether it stays valid. */
  private municipalityLegalEntityId = '';

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.congregation();
        untracked(() => this.reset(current));
      }
    });
  }

  /**
   * The municipality must be of the country of the legal entity: it is cleared when the new legal entity
   * is of another country (or its country is unknown).
   */
  protected onLegalEntityChanged(): void {
    const next = this.form.controls.legalEntityId.value;
    const countryOf = (id: string): number | null =>
      this.loadedOptions()?.legalEntities.find((option) => option.id === Number(id))?.countryId ?? null;
    const previousCountry = countryOf(this.municipalityLegalEntityId);
    if (previousCountry === null || previousCountry !== countryOf(next)) {
      this.onMunicipalityCleared();
    }
    this.municipalityLegalEntityId = next;
  }

  protected onMunicipalityPicked(picked: MunicipalityPicked): void {
    this.form.controls.municipalityCode.setValue(picked.code);
    this.form.controls.municipalityCode.markAsTouched();
    this.municipalityText.set(picked.label);
    this.municipalityError.set(null);
    this.municipalityLegalEntityId = this.form.controls.legalEntityId.value;
  }

  protected onMunicipalityCleared(): void {
    this.form.controls.municipalityCode.setValue('');
    this.municipalityText.set('');
  }

  protected showError(control: CongregationField, error: string): boolean {
    const target = this.form.controls[control];
    return target.touched && target.hasError(error);
  }

  protected submit(): void {
    this.nameError.set(null);
    this.codeError.set(null);
    this.municipalityError.set(null);
    this.formError.set(null);
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: CongregationInput = {
      name: value.name,
      code: value.code || null,
      legalEntityId: Number(value.legalEntityId),
      districtId: value.districtId === '' ? null : Number(value.districtId),
      municipalityCode: value.municipalityCode,
      neighborhood: value.neighborhood || null,
      address: value.address,
      phone: value.phone || null,
      email: value.email || null,
      acceptsApplications: value.acceptsApplications,
    };
    const current = this.congregation();
    const request = current
      ? this.repository.updateCongregation(current.id, input)
      : this.repository.createCongregation(input);
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (congregation) => {
        this.pending.set(false);
        this.open.set(false);
        this.saved.emit({ congregation, created: current === null });
      },
      error: (error: unknown) => {
        this.pending.set(false);
        const code = error instanceof DomainError ? error.code : '';
        const target =
          code === 'DUPLICATE_NAME'
            ? this.nameError
            : CODE_ERRORS.has(code)
              ? this.codeError
              : code === MUNICIPALITY_COUNTRY_MISMATCH
                ? this.municipalityError
                : this.formError;
        target.set(userMessage(error));
      },
    });
  }

  private reset(current: CongregationRow | null): void {
    this.form.reset({
      name: current?.name ?? '',
      code: current?.code ?? '',
      legalEntityId: current ? String(current.legalEntityId) : '',
      districtId: current?.districtId ? String(current.districtId) : '',
      municipalityCode: current?.municipalityCode ?? '',
      neighborhood: current?.neighborhood ?? '',
      address: current?.address ?? '',
      phone: current?.phone ?? '',
      email: current?.email ?? '',
      acceptsApplications: current?.acceptsApplications ?? true,
    });
    if (current && !current.isActive) {
      this.form.controls.acceptsApplications.disable();
    } else {
      this.form.controls.acceptsApplications.enable();
    }
    this.municipalityText.set(current ? placeLabel(current) : '');
    this.municipalityLegalEntityId = current ? String(current.legalEntityId) : '';
    this.nameError.set(null);
    this.codeError.set(null);
    this.municipalityError.set(null);
    this.formError.set(null);
  }
}
