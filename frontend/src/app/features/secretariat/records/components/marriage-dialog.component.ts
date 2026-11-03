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
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  MARRIAGE_REGISTRIES,
  MARRIAGE_REGISTRY_LABELS,
  MAX_PLACE_LENGTH,
  MarriageRegistry,
  PersonSummary,
  RecordsContext,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { PersonPickerComponent } from './person-picker.component';
import { notAfterToday, showError } from './record-validators';

const DEFAULT_PLACE_SUFFIX = ' · Templo principal';

/** Create dialog of a marriage (D-04). Both spouses are people of the denomination, searched on the server. */
@Component({
  selector: 'app-marriage-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent, IconComponent, PersonPickerComponent],
  templateUrl: './marriage-dialog.component.html',
})
export class MarriageDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly context = input.required<RecordsContext>();
  /** Current pastor of the sede, suggested as officiant. */
  readonly defaultOfficiant = input<PersonSummary | null>(null);
  readonly saved = output<string>();

  protected readonly registries = MARRIAGE_REGISTRIES;
  protected readonly registryLabels = MARRIAGE_REGISTRY_LABELS;
  protected readonly maxPlaceLength = MAX_PLACE_LENGTH;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group(
    {
      spouse1: new FormControl<PersonSummary | null>(null, Validators.required),
      spouse2: new FormControl<PersonSummary | null>(null, Validators.required),
      marriedOn: this.fb.control('', Validators.required),
      place: this.fb.control('', [Validators.required, Validators.maxLength(MAX_PLACE_LENGTH)]),
      registeredWith: this.fb.control<MarriageRegistry>('CHURCH', Validators.required),
      officiant: new FormControl<PersonSummary | null>(null),
    },
    { validators: differentSpouses },
  );

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );
  protected readonly excludeForFirst = computed(() =>
    idsOf(this.value().spouse2, this.value().officiant),
  );
  protected readonly excludeForSecond = computed(() =>
    idsOf(this.value().spouse1, this.value().officiant),
  );
  protected readonly excludeForOfficiant = computed(() =>
    idsOf(this.value().spouse1, this.value().spouse2),
  );

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

  protected sameSpouse(): boolean {
    return (
      this.form.hasError('sameSpouse') && (this.form.controls.spouse2.touched || this.submitted())
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
      await firstValueFrom(
        this.repository.createMarriage({
          spouse1Id: (value.spouse1 as PersonSummary).id,
          spouse2Id: (value.spouse2 as PersonSummary).id,
          marriedOn: value.marriedOn,
          place: value.place.trim(),
          registeredWith: value.registeredWith,
          officiantId: value.officiant?.id ?? null,
        }),
      );
      this.saved.emit('Matrimonio registrado.');
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    const { today, congregations } = this.context();
    this.form.controls.marriedOn.setValidators([Validators.required, notAfterToday(today)]);
    this.form.reset({
      spouse1: null,
      spouse2: null,
      marriedOn: today,
      place: congregations.length === 1 ? `${congregations[0].name}${DEFAULT_PLACE_SUFFIX}` : '',
      registeredWith: 'CHURCH',
      officiant: this.defaultOfficiant(),
    });
    this.submitted.set(false);
    this.error.set(null);
  }
}

function idsOf(...people: (PersonSummary | null)[]): number[] {
  return people
    .filter((person): person is PersonSummary => person !== null)
    .map((person) => person.id);
}

function differentSpouses(group: AbstractControl): ValidationErrors | null {
  const first = group.get('spouse1')?.value as PersonSummary | null;
  const second = group.get('spouse2')?.value as PersonSummary | null;
  return first !== null && first?.id === second?.id ? { sameSpouse: true } : null;
}
