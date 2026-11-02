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
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { municipalityLabel } from '../../../../core/models/catalogs';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { CongregationInput, CongregationRow, FIELD_LIMITS } from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import { MUNICIPALITY_GROUPS } from './municipality-options';

type CongregationField = 'name' | 'legalEntityId' | 'municipalityCode' | 'address' | 'email';

export interface CongregationSaved {
  readonly congregation: CongregationRow;
  readonly created: boolean;
}

/** Dialog to create a sede or edit it (`congregation` set). */
@Component({
  selector: 'app-congregation-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, ReactiveFormsModule],
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
  protected readonly municipalityGroups = MUNICIPALITY_GROUPS;
  protected readonly isCreate = computed(() => this.congregation() === null);
  protected readonly pending = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

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
    legalEntityId: ['', Validators.required],
    districtId: [''],
    municipalityCode: ['', Validators.required],
    neighborhood: ['', Validators.maxLength(FIELD_LIMITS.neighborhood)],
    address: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.address)]],
    phone: ['', Validators.maxLength(FIELD_LIMITS.phone)],
    email: ['', [Validators.email, Validators.maxLength(FIELD_LIMITS.email)]],
    acceptsApplications: [true],
  });

  protected readonly municipalityHint = signal('Códigos DIVIPOLA del DANE.');

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.congregation();
        untracked(() => this.reset(current));
      }
    });
    this.form.controls.municipalityCode.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((code) => {
        this.municipalityHint.set(
          code ? `DIVIPOLA ${code}: ${municipalityLabel(code)}.` : 'Códigos DIVIPOLA del DANE.',
        );
      });
  }

  protected showError(control: CongregationField, error: string): boolean {
    const target = this.form.controls[control];
    return target.touched && target.hasError(error);
  }

  protected submit(): void {
    this.nameError.set(null);
    this.formError.set(null);
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: CongregationInput = {
      name: value.name,
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
        const duplicate = error instanceof DomainError && error.code === 'DUPLICATE_NAME';
        (duplicate ? this.nameError : this.formError).set(userMessage(error));
      },
    });
  }

  private reset(current: CongregationRow | null): void {
    this.form.reset({
      name: current?.name ?? '',
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
    this.nameError.set(null);
    this.formError.set(null);
  }
}
