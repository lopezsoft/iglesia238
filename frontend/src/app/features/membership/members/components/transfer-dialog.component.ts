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
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  TRANSFER_REASONS,
  MemberDetail,
  TransferInput,
  TransferResult,
  todayIso,
} from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

type Destination = TransferInput['kind'];

/**
 * Transfer to another sede of the denomination (new registry entry and number there) or to an
 * external church (the member becomes TRANSFERRED). The adapter enforces every rule again.
 */
@Component({
  selector: 'app-transfer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  styleUrl: './transfer-dialog.component.scss',
  templateUrl: './transfer-dialog.component.html',
})
export class TransferDialogComponent {
  private readonly repository = inject(MembersRepository);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly transferred = output<TransferResult>();

  protected readonly reasons = TRANSFER_REASONS;
  protected readonly today = todayIso();
  protected readonly command = new CommandState();
  protected readonly destination = signal<Destination>('INTERNAL');
  protected readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    destinationCongregationId: [0],
    externalName: [''],
    externalCity: ['', Validators.maxLength(60)],
    transferDate: [this.today, Validators.required],
    reason: [TRANSFER_REASONS[0], Validators.required],
    notes: ['', Validators.maxLength(200)],
  });

  protected readonly destinations = rxResource({
    params: () => (this.open() ? { memberId: this.member().id } : undefined),
    stream: ({ params }) => this.repository.transferDestinations(params.memberId),
  });

  protected readonly options = computed(() =>
    this.destinations.hasValue() ? (this.destinations.value() ?? []) : [],
  );
  protected readonly destinationsError = computed(() =>
    this.destinations.error() ? userMessage(this.destinations.error()) : null,
  );
  /** An internal transfer cannot be submitted while there is no sede to choose. */
  protected readonly submitBlocked = computed(
    () => this.destination() === 'INTERNAL' && this.options().length === 0,
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected chooseDestination(destination: Destination): void {
    this.destination.set(destination);
    this.applyValidators();
  }

  protected showError(
    name: 'destinationCongregationId' | 'externalName' | 'externalCity' | 'transferDate' | 'notes',
  ): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const outcome = await this.command.execute(
      this.repository.transfer(this.member().id, this.toInput()),
      'Traslado registrado.',
    );
    if (outcome.ok) {
      this.open.set(false);
      this.transferred.emit(outcome.value);
    }
  }

  private toInput(): TransferInput {
    const value = this.form.getRawValue();
    const notes = value.notes.trim();
    const reason = notes === '' ? value.reason : `${value.reason}. ${notes}`;
    if (this.destination() === 'INTERNAL') {
      return {
        kind: 'INTERNAL',
        destinationCongregationId: Number(value.destinationCongregationId),
        transferDate: value.transferDate,
        reason,
      };
    }
    const city = value.externalCity.trim();
    const name = value.externalName.trim();
    return {
      kind: 'EXTERNAL',
      externalDestinationName: city === '' ? name : `${name} (${city})`,
      transferDate: value.transferDate,
      reason,
    };
  }

  private reset(): void {
    this.destination.set('INTERNAL');
    this.submitted.set(false);
    this.command.clear();
    this.form.reset();
    this.applyValidators();
  }

  private applyValidators(): void {
    const { destinationCongregationId, externalName } = this.form.controls;
    if (this.destination() === 'INTERNAL') {
      destinationCongregationId.setValidators(Validators.min(1));
      externalName.clearValidators();
    } else {
      destinationCongregationId.clearValidators();
      externalName.setValidators([
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(85),
      ]);
    }
    destinationCongregationId.updateValueAndValidity();
    externalName.updateValueAndValidity();
  }
}
