import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { AbstractControl, FormControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ageOn } from '../../../../core/models/membership.model';
import {
  ADULT_AGE,
  MARRIAGE_REGISTRIES,
  MARRIAGE_REGISTRY_LABELS,
  MarriageRegistry,
  RecordsContext,
  personLabel,
  todayIso,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { notFutureDate, showError } from './record-validators';

const DEFAULT_PLACE_SUFFIX = ' · Templo principal';

/** Create dialog of a marriage (D-04). Both spouses are people of the denomination. */
@Component({
  selector: 'app-marriage-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent, IconComponent],
  templateUrl: './marriage-dialog.component.html',
})
export class MarriageDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly context = input.required<RecordsContext>();
  /** People with a marriage that is not dissolved: they cannot marry again. */
  readonly marriedPersonIds = input<ReadonlySet<number>>(new Set());
  readonly defaultOfficiantId = input<number | null>(null);
  readonly saved = output<string>();

  protected readonly today = todayIso();
  protected readonly label = personLabel;
  protected readonly registries = MARRIAGE_REGISTRIES;
  protected readonly registryLabels = MARRIAGE_REGISTRY_LABELS;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group(
    {
      spouse1Id: new FormControl<number | null>(null, Validators.required),
      spouse2Id: new FormControl<number | null>(null, Validators.required),
      marriedOn: this.fb.control('', [Validators.required, notFutureDate]),
      place: this.fb.control('', [Validators.required, Validators.maxLength(150)]),
      registeredWith: this.fb.control<MarriageRegistry>('CHURCH', Validators.required),
      officiantId: new FormControl<number | null>(null),
    },
    { validators: differentSpouses },
  );

  /** Unmarried adults: minors cannot be spouses (the API rejects them with INVALID_SPOUSE). */
  protected readonly candidates = computed(() =>
    this.context().people.filter(
      (person) =>
        !this.marriedPersonIds().has(person.id) && (ageOn(person.birthDate, this.today) ?? ADULT_AGE) >= ADULT_AGE,
    ),
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
    return this.form.hasError('sameSpouse') && (this.form.controls.spouse2Id.touched || this.submitted());
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
          spouse1Id: value.spouse1Id as number,
          spouse2Id: value.spouse2Id as number,
          marriedOn: value.marriedOn,
          place: value.place,
          registeredWith: value.registeredWith,
          officiantId: value.officiantId,
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
    const sedes = this.context().congregations;
    this.form.reset({
      spouse1Id: null,
      spouse2Id: null,
      marriedOn: this.today,
      place: sedes.length === 1 ? `${sedes[0].name}${DEFAULT_PLACE_SUFFIX}` : '',
      registeredWith: 'CHURCH',
      officiantId: this.defaultOfficiantId(),
    });
    this.submitted.set(false);
    this.error.set(null);
  }
}

function differentSpouses(group: AbstractControl): ValidationErrors | null {
  const first = group.get('spouse1Id')?.value as number | null;
  const second = group.get('spouse2Id')?.value as number | null;
  return first !== null && first === second ? { sameSpouse: true } : null;
}
