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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
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
import { MunicipalityPicked, MunicipalitySelectComponent } from './municipality-select.component';

type LegalEntityField =
  'legalName' | 'taxId' | 'legalRepresentative' | 'municipalityCode' | 'email';

const TAX_ID_ERROR_CODES: ReadonlySet<string> = new Set(['DUPLICATE_TAX_ID', 'INVALID_TAX_ID']);

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

  readonly open = model(false);
  readonly legalEntity = input<LegalEntityRow | null>(null);
  readonly saved = output<LegalEntitySaved>();

  protected readonly limits = FIELD_LIMITS;
  /** Name of the chosen municipality, shown while the DIVIPOLA code is set. */
  protected readonly municipalityText = signal('');
  protected readonly isCreate = computed(() => this.legalEntity() === null);
  protected readonly pending = signal(false);
  protected readonly taxIdError = signal<string | null>(null);
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
    municipalityCode: ['', Validators.required],
    email: ['', [Validators.email, Validators.maxLength(FIELD_LIMITS.email)]],
    phone: ['', Validators.maxLength(FIELD_LIMITS.phone)],
    address: ['', Validators.maxLength(FIELD_LIMITS.address)],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.legalEntity();
        untracked(() => this.reset(current));
      }
    });
  }

  protected onMunicipalityPicked(picked: MunicipalityPicked): void {
    this.form.controls.municipalityCode.setValue(picked.code);
    this.form.controls.municipalityCode.markAsTouched();
    this.municipalityText.set(picked.label);
  }

  protected onMunicipalityCleared(): void {
    this.form.controls.municipalityCode.setValue('');
    this.municipalityText.set('');
  }

  protected showError(control: LegalEntityField, error: string): boolean {
    const target = this.form.controls[control];
    return target.touched && target.hasError(error);
  }

  protected submit(): void {
    this.taxIdError.set(null);
    this.formError.set(null);
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
      municipalityCode: value.municipalityCode,
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
        const onTaxId = error instanceof DomainError && TAX_ID_ERROR_CODES.has(error.code);
        (onTaxId ? this.taxIdError : this.formError).set(userMessage(error));
      },
    });
  }

  private reset(current: LegalEntityRow | null): void {
    this.form.reset({
      legalName: current?.legalName ?? '',
      tradeName: current?.tradeName ?? '',
      taxId: current?.taxId ?? '',
      legalRepresentative: current?.legalRepresentative ?? '',
      municipalityCode: current?.municipalityCode ?? '',
      email: current?.email ?? '',
      phone: current?.phone ?? '',
      address: current?.address ?? '',
    });
    this.municipalityText.set(current ? placeLabel(current) : '');
    this.taxIdError.set(null);
    this.formError.set(null);
  }
}
