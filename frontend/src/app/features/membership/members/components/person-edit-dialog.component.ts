import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import {
  DEMO_MUNICIPALITIES,
  DOCUMENT_TYPES,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
} from '../../../../core/models/catalogs';
import { Sex } from '../../../../core/models/membership.model';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { MemberDetail, PersonUpdate, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';

const notFuture: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value && control.value > todayIso() ? { future: true } : null;

/** Document type and number go together: without the type the unique index does not protect. */
const documentPair: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const type = group.get('documentTypeCode')?.value as string;
  const number = (group.get('documentNumber')?.value as string).trim();
  return (type === '') !== (number === '') ? { documentPair: true } : null;
};

@Component({
  selector: 'app-person-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  templateUrl: './person-edit-dialog.component.html',
})
export class PersonEditDialogComponent {
  private readonly repository = inject(MembersRepository);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly saved = output<void>();

  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly maritalStatuses = MARITAL_STATUSES;
  protected readonly educationLevels = EDUCATION_LEVELS;
  protected readonly municipalities = DEMO_MUNICIPALITIES;
  protected readonly today = todayIso();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(80)]],
      secondLastName: ['', Validators.maxLength(80)],
      documentTypeCode: [''],
      documentNumber: ['', Validators.pattern(/^[A-Za-z0-9-]{3,30}$/)],
      birthDate: ['', notFuture],
      sex: ['' as Sex | ''],
      maritalStatusCode: [''],
      educationLevelCode: [''],
      occupation: ['', Validators.maxLength(120)],
      phone: ['', Validators.pattern(/^[0-9 +()-]{7,20}$/)],
      email: ['', [Validators.email, Validators.maxLength(191)]],
      address: ['', Validators.maxLength(200)],
      municipalityCode: [''],
    },
    { validators: documentPair },
  );

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const person = this.member().person;
      untracked(() => {
        this.error.set(null);
        this.submitted.set(false);
        this.form.reset({
          firstName: person.firstName,
          lastName: person.lastName,
          secondLastName: person.secondLastName ?? '',
          documentTypeCode: person.documentTypeCode ?? '',
          documentNumber: person.documentNumber ?? '',
          birthDate: person.birthDate ?? '',
          sex: person.sex ?? '',
          maritalStatusCode: person.maritalStatusCode ?? '',
          educationLevelCode: person.educationLevelCode ?? '',
          occupation: person.occupation ?? '',
          phone: person.phone ?? '',
          email: person.email ?? '',
          address: person.address ?? '',
          municipalityCode: person.municipalityCode ?? '',
        });
      });
    });
  }

  protected showError(name: keyof PersonUpdate): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected showDocumentPairError(): boolean {
    const touched =
      this.form.controls.documentNumber.touched || this.form.controls.documentTypeCode.touched;
    return this.form.hasError('documentPair') && (touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.repository.updatePerson(this.member().id, this.toUpdate()));
      this.open.set(false);
      this.saved.emit();
    } catch (error) {
      if (error instanceof DomainError && error.code === 'DUPLICATE_DOCUMENT') {
        this.form.controls.documentNumber.setErrors({ duplicate: error.message });
      }
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private toUpdate(): PersonUpdate {
    const value = this.form.getRawValue();
    const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
    return {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      secondLastName: optional(value.secondLastName),
      documentTypeCode: optional(value.documentTypeCode),
      documentNumber: optional(value.documentNumber),
      birthDate: optional(value.birthDate),
      sex: value.sex === '' ? null : value.sex,
      maritalStatusCode: optional(value.maritalStatusCode),
      educationLevelCode: optional(value.educationLevelCode),
      occupation: optional(value.occupation),
      phone: optional(value.phone),
      email: optional(value.email),
      address: optional(value.address),
      municipalityCode: optional(value.municipalityCode),
    };
  }
}
