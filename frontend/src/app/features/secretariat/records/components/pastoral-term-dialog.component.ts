import { DatePipe } from '@angular/common';
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
import { toSignal } from '@angular/core/rxjs-interop';
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
  PastoralTerm,
  PersonSummary,
  RecordsContext,
  currentTerm,
  previousDay,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { PersonPickerComponent } from './person-picker.component';
import { dateOrder, showError } from './record-validators';

/** Create dialog of a pastoral term (D-05). Terms of the same sede cannot overlap. */
@Component({
  selector: 'app-pastoral-term-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, DialogComponent, IconComponent, PersonPickerComponent],
  templateUrl: './pastoral-term-dialog.component.html',
})
export class PastoralTermDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly context = input.required<RecordsContext>();
  readonly terms = input.required<readonly PastoralTerm[]>();
  readonly saved = output<string>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group(
    {
      congregationId: new FormControl<number | null>(null, Validators.required),
      pastor: new FormControl<PersonSummary | null>(null, Validators.required),
      startedOn: this.fb.control('', Validators.required),
      endedOn: this.fb.control(''),
      closeCurrent: this.fb.control(true),
    },
    { validators: dateOrder('startedOn', 'endedOn') },
  );

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );

  /** Open term of the chosen sede, which the new term can close. */
  protected readonly openTerm = computed(() => {
    const congregationId = this.value().congregationId;
    return congregationId === null ? null : currentTerm(this.terms(), congregationId);
  });

  protected readonly closingDate = computed(() => {
    const startedOn = this.value().startedOn;
    return startedOn ? previousDay(startedOn) : null;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return showError(control, this.submitted());
  }

  protected endBeforeStart(): boolean {
    return (
      this.form.hasError('dateOrder') && (this.form.controls.endedOn.touched || this.submitted())
    );
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.repository.createPastoralTerm({
          congregationId: value.congregationId as number,
          pastorId: (value.pastor as PersonSummary).id,
          startedOn: value.startedOn,
          endedOn: value.endedOn || null,
          closeCurrent: this.openTerm() !== null && value.closeCurrent,
        }),
      );
      this.saved.emit(`Periodo pastoral de ${created.pastor.fullName} registrado.`);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    const sedes = this.context().congregations;
    this.form.reset({
      congregationId: sedes.length === 1 ? sedes[0].id : null,
      pastor: null,
      startedOn: '',
      endedOn: '',
      closeCurrent: true,
    });
    this.submitted.set(false);
    this.error.set(null);
  }
}
