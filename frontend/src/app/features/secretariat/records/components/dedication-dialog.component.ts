import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  MAX_PARENT_NAME_LENGTH,
  ParentInput,
  PersonSummary,
  RecordsContext,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { PersonPickerComponent } from './person-picker.component';
import { notAfterToday, showError } from './record-validators';

/** Create dialog of a presentation of a child (D-04). People are searched on the server. */
@Component({
  selector: 'app-dedication-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent, IconComponent, PersonPickerComponent],
  templateUrl: './dedication-dialog.component.html',
  styles: `
    .parents {
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-bottom: 0.5rem;
      font-weight: 600;
    }
  `,
})
export class DedicationDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly context = input.required<RecordsContext>();
  /** Current pastor of each sede, suggested as officiant. */
  readonly currentPastors = input<ReadonlyMap<number, PersonSummary>>(new Map());
  readonly saved = output<string>();

  protected readonly maxNameLength = MAX_PARENT_NAME_LENGTH;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    congregationId: new FormControl<number | null>(null, Validators.required),
    child: new FormControl<PersonSummary | null>(null, Validators.required),
    dedicatedOn: this.fb.control('', Validators.required),
    pastor: new FormControl<PersonSummary | null>(null),
    father: new FormControl<PersonSummary | null>(null),
    fatherName: this.fb.control('', Validators.maxLength(MAX_PARENT_NAME_LENGTH)),
    mother: new FormControl<PersonSummary | null>(null),
    motherName: this.fb.control('', Validators.maxLength(MAX_PARENT_NAME_LENGTH)),
    guardian: new FormControl<PersonSummary | null>(null),
    guardianName: this.fb.control('', Validators.maxLength(MAX_PARENT_NAME_LENGTH)),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );
  /** The child cannot be listed as their own parent. */
  protected readonly childId = computed(() => {
    const child = this.value().child;
    return child ? [child.id] : [];
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
    // Free-text names only apply when the parent is not a registered person.
    const { controls } = this.form;
    controls.father.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((p) => toggleName(controls.fatherName, p));
    controls.mother.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((p) => toggleName(controls.motherName, p));
    controls.guardian.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((p) => toggleName(controls.guardianName, p));
    controls.congregationId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (id !== null) {
        controls.pastor.setValue(this.currentPastors().get(id) ?? null);
      }
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return showError(control, this.submitted());
  }

  protected dateError(): string {
    return this.form.controls.dedicatedOn.hasError('futureDate')
      ? 'La fecha no puede ser futura.'
      : 'Indica la fecha de presentación.';
  }

  protected missingParent(): boolean {
    const { father, fatherName, mother, motherName, guardian, guardianName } =
      this.form.getRawValue();
    return (
      father === null &&
      !fatherName.trim() &&
      mother === null &&
      !motherName.trim() &&
      guardian === null &&
      !guardianName.trim()
    );
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.missingParent() || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.repository.createDedication({
          congregationId: value.congregationId as number,
          childId: (value.child as PersonSummary).id,
          dedicatedOn: value.dedicatedOn,
          pastorId: value.pastor?.id ?? null,
          father: parentInput(value.father, value.fatherName),
          mother: parentInput(value.mother, value.motherName),
          guardian: parentInput(value.guardian, value.guardianName),
        }),
      );
      this.saved.emit(`Presentación de ${created.child.fullName} registrada.`);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    const { today, congregations } = this.context();
    const congregationId = congregations.length === 1 ? congregations[0].id : null;
    this.form.controls.dedicatedOn.setValidators([Validators.required, notAfterToday(today)]);
    this.form.reset({
      congregationId,
      child: null,
      dedicatedOn: today,
      pastor: congregationId === null ? null : (this.currentPastors().get(congregationId) ?? null),
      father: null,
      fatherName: '',
      mother: null,
      motherName: '',
      guardian: null,
      guardianName: '',
    });
    this.submitted.set(false);
    this.error.set(null);
  }
}

function toggleName(control: FormControl<string>, person: PersonSummary | null): void {
  if (person === null) {
    control.enable({ emitEvent: false });
  } else {
    control.setValue('', { emitEvent: false });
    control.disable({ emitEvent: false });
  }
}

function parentInput(person: PersonSummary | null, name: string): ParentInput | null {
  if (person !== null) {
    return { personId: person.id, name: null };
  }
  return name.trim() ? { personId: null, name: name.trim() } : null;
}
