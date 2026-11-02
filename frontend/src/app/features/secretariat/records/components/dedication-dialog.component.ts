import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { ageOn } from '../../../../core/models/membership.model';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ADULT_AGE, ParentInput, PersonSummary, RecordsContext, personLabel, todayIso } from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { notFutureDate, showError } from './record-validators';

interface ChildOption {
  readonly person: PersonSummary;
  readonly age: number | null;
  readonly label: string;
}

function isMinor(age: number | null): boolean {
  return age !== null && age < ADULT_AGE;
}

/** Create dialog of a presentation of a child (D-04). */
@Component({
  selector: 'app-dedication-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent, IconComponent],
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
  readonly currentPastors = input<ReadonlyMap<number, number>>(new Map());
  readonly saved = output<string>();

  protected readonly today = todayIso();
  protected readonly label = personLabel;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    congregationId: new FormControl<number | null>(null, Validators.required),
    childId: new FormControl<number | null>(null, Validators.required),
    dedicatedOn: this.fb.control('', [Validators.required, notFutureDate]),
    pastorId: new FormControl<number | null>(null),
    fatherId: new FormControl<number | null>(null),
    fatherName: this.fb.control('', Validators.maxLength(120)),
    motherId: new FormControl<number | null>(null),
    motherName: this.fb.control('', Validators.maxLength(120)),
  });

  /** Minors first (the usual case), then everyone else, each with their age. */
  protected readonly children = computed<ChildOption[]>(() => {
    const options = this.context().people.map((person) => {
      const age = ageOn(person.birthDate, this.today);
      return { person, age, label: `${personLabel(person)}${age === null ? '' : ` · ${age} años`}` };
    });
    return [...options.filter((o) => isMinor(o.age)), ...options.filter((o) => !isMinor(o.age))];
  });
  protected readonly fathers = computed(() => this.context().people.filter((person) => person.sex !== 'FEMALE'));
  protected readonly mothers = computed(() => this.context().people.filter((person) => person.sex !== 'MALE'));
  protected readonly hasMinors = computed(() => this.children().some((option) => isMinor(option.age)));

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
    // Free-text names only apply when the parent is not a registered person.
    const { controls } = this.form;
    controls.fatherId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => toggleName(controls.fatherName, id));
    controls.motherId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => toggleName(controls.motherName, id));
    controls.congregationId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (id !== null) {
        this.form.controls.pastorId.setValue(this.currentPastors().get(id) ?? null);
      }
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return showError(control, this.submitted());
  }

  protected dateError(): string {
    const control = this.form.controls.dedicatedOn;
    return control.hasError('futureDate') ? 'La fecha no puede ser futura.' : 'Indica la fecha de presentación.';
  }

  protected missingParent(): boolean {
    const { fatherId, fatherName, motherId, motherName } = this.form.getRawValue();
    return fatherId === null && !fatherName.trim() && motherId === null && !motherName.trim();
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
          childId: value.childId as number,
          dedicatedOn: value.dedicatedOn,
          pastorId: value.pastorId,
          father: parentInput(value.fatherId, value.fatherName),
          mother: parentInput(value.motherId, value.motherName),
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
    const sedes = this.context().congregations;
    const congregationId = sedes.length === 1 ? sedes[0].id : null;
    this.form.reset({
      congregationId,
      childId: null,
      dedicatedOn: this.today,
      pastorId: congregationId === null ? null : (this.currentPastors().get(congregationId) ?? null),
      fatherId: null,
      fatherName: '',
      motherId: null,
      motherName: '',
    });
    this.submitted.set(false);
    this.error.set(null);
  }
}

function toggleName(control: FormControl<string>, personId: number | null): void {
  if (personId === null) {
    control.enable({ emitEvent: false });
  } else {
    control.setValue('', { emitEvent: false });
    control.disable({ emitEvent: false });
  }
}

function parentInput(personId: number | null, name: string): ParentInput | null {
  if (personId !== null) {
    return { personId, name: null };
  }
  return name.trim() ? { personId: null, name: name.trim() } : null;
}
