import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { yearMonthOf } from '../../data/year-month';
import {
  CONTRIBUTION_CATEGORY_LABELS,
  METHODS_WITH_REFERENCE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  PersonOption,
} from '../../data/accounting.models';
import {
  ContributionFormOptions,
  ContributionRow,
  ContributionTypeOption,
  VowPaymentTarget,
} from '../data/contributions.models';
import { ContributionsRepository } from '../data/contributions.repository';
import { PersonSearchComponent } from './person-search.component';

type DonorMode = 'NOMINAL' | 'ANONYMOUS' | 'COLLECTION';

const REFERENCE_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Referencia (opcional)',
  BANK_TRANSFER: 'Referencia de la transferencia *',
  CARD: 'Número de aprobación *',
  BANK_DEPOSIT: 'Número de consignación *',
  OTHER: 'Referencia (opcional)',
};

const CATEGORY_HELP: Readonly<Record<string, string>> = {
  TITHE: 'Entra en la liquidación del diezmo del periodo.',
  VOW: 'Abono a una promesa de voto: requiere aportante nominal y la promesa.',
  FIRST_FRUITS: 'Primicia: se registra en su cuenta de ingreso.',
};

/** Registration form of a contribution (contributions.write, sede scope). */
@Component({
  selector: 'app-contribution-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PersonSearchComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './contribution-form.component.html',
  styleUrl: './contribution-form.component.scss',
})
export class ContributionFormComponent {
  private readonly repository = inject(ContributionsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly options = input.required<ContributionFormOptions>();
  /** Vow payment preselected from Votos (?vowPledgeId=…). */
  readonly preset = input<VowPaymentTarget | null>(null);
  readonly recorded = output<ContributionRow>();

  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly searchPersons = (query: string) => this.repository.searchPersons(query);

  protected readonly typeId = signal<number | null>(null);
  protected readonly donorMode = signal<DonorMode>('NOMINAL');
  protected readonly person = signal<PersonOption | null>(null);
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    receivedOn: ['', Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    paymentMethod: this.fb.control<PaymentMethod>('CASH'),
    paymentReference: ['', Validators.maxLength(80)],
    vowPledgeId: this.fb.control<number | null>(null),
    notes: ['', Validators.maxLength(255)],
  });

  private readonly method = toSignal(this.form.controls.paymentMethod.valueChanges, { initialValue: 'CASH' as PaymentMethod });
  /** Signal mirror of the form, so the computed errors refresh while typing. */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly selectedType = computed<ContributionTypeOption | null>(
    () => this.options().types.find((t) => t.id === this.typeId()) ?? null,
  );
  protected readonly isVow = computed(() => this.selectedType()?.category === 'VOW');
  protected readonly typeHelp = computed(() => {
    const category = this.selectedType()?.category;
    return category ? (CATEGORY_HELP[category] ?? 'Se registra en la cuenta de ingreso del tipo de aporte.') : 'Selecciona el tipo de aporte.';
  });
  protected readonly referenceLabel = computed(() => REFERENCE_LABELS[this.method()]);
  protected readonly referenceRequired = computed(() => METHODS_WITH_REFERENCE.includes(this.method()));
  protected readonly openPeriodsText = computed(() => {
    const open = this.options().periods.filter((p) => p.status === 'OPEN').map((p) => p.label.toLowerCase());
    return open.length > 0 ? `Periodos abiertos: ${open.join(', ')}.` : 'No hay periodos abiertos en la sede.';
  });

  /** Open pledges of the selected person for the selected VOW type. */
  protected readonly pledges = rxResource({
    params: () => {
      const person = this.person();
      const typeId = this.typeId();
      return this.isVow() && person && typeId !== null ? { personId: person.id, typeId } : undefined;
    },
    stream: ({ params }) => this.repository.openPledges(params.personId, params.typeId),
  });

  /** `value()` throws while a resource is in error, so the template reads this instead. */
  protected readonly pledgeOptions = computed(() => (this.pledges.hasValue() ? this.pledges.value() : []));

  protected readonly vowPlaceholder = computed(() => {
    if (this.donorMode() !== 'NOMINAL') {
      return 'Requiere aportante nominal';
    }
    if (!this.person()) {
      return 'Primero selecciona la persona';
    }
    if (this.pledges.isLoading()) {
      return 'Cargando promesas…';
    }
    return this.pledgeOptions().length === 0 ? 'La persona no tiene promesas con saldo' : 'Selecciona la promesa';
  });

  // Field errors, visible after the first submit attempt.
  protected readonly errors = computed(() => {
    if (!this.submitted()) {
      return {} as Partial<Record<'type' | 'person' | 'vow' | 'date' | 'amount' | 'reference', string>>;
    }
    return this.validate();
  });

  constructor() {
    effect(() => {
      const options = this.options();
      untracked(() => {
        if (!this.form.controls.receivedOn.value) {
          this.form.controls.receivedOn.setValue(options.maxDate ?? options.today);
        }
        if (this.typeId() === null && options.types.length > 0) {
          this.typeId.set(options.types[0].id);
        }
      });
    });
    effect(() => {
      const preset = this.preset();
      if (preset) {
        untracked(() => this.applyPreset(preset));
      }
    });
  }

  protected selectType(type: ContributionTypeOption): void {
    this.typeId.set(type.id);
    this.form.controls.vowPledgeId.setValue(null);
    if (type.category === 'VOW') {
      this.donorMode.set('NOMINAL');
    }
  }

  protected setDonorMode(mode: DonorMode): void {
    this.donorMode.set(mode);
    this.form.controls.vowPledgeId.setValue(null);
    if (mode !== 'NOMINAL') {
      this.person.set(null);
    }
  }

  protected onPersonChange(person: PersonOption | null): void {
    this.person.set(person);
    this.form.controls.vowPledgeId.setValue(null);
  }

  protected reset(): void {
    this.submitted.set(false);
    this.error.set(null);
    this.person.set(null);
    this.donorMode.set('NOMINAL');
    this.form.reset({
      receivedOn: this.form.controls.receivedOn.value || (this.options().maxDate ?? this.options().today),
      amount: null,
      paymentMethod: 'CASH',
      paymentReference: '',
      vowPledgeId: null,
      notes: '',
    });
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const typeId = this.typeId();
    if (Object.keys(this.validate()).length > 0 || this.form.invalid || typeId === null || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const row = await firstValueFrom(
        this.repository.record({
          contributionTypeId: typeId,
          personId: this.donorMode() === 'NOMINAL' ? (this.person()?.id ?? null) : null,
          receivedOn: value.receivedOn,
          amount: Number(value.amount),
          paymentMethod: value.paymentMethod,
          paymentReference: value.paymentReference.trim() || null,
          vowPledgeId: this.isVow() ? value.vowPledgeId : null,
          notes: this.donorMode() === 'COLLECTION' ? value.notes.trim() || 'Colecta agregada' : null,
        }),
      );
      this.recorded.emit(row);
      this.reset();
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private validate(): Partial<Record<'type' | 'person' | 'vow' | 'date' | 'amount' | 'reference', string>> {
    const errors: Partial<Record<'type' | 'person' | 'vow' | 'date' | 'amount' | 'reference', string>> = {};
    this.formValue();
    const value = this.form.getRawValue();
    if (this.typeId() === null) {
      errors.type = 'Selecciona el tipo de aporte.';
    }
    if (this.donorMode() === 'NOMINAL' && !this.person()) {
      errors.person = 'Selecciona la persona que aporta.';
    }
    if (this.isVow()) {
      if (this.donorMode() !== 'NOMINAL') {
        errors.vow = 'Los abonos a votos requieren un aportante nominal.';
      } else if (this.person() && value.vowPledgeId === null) {
        errors.vow = 'Selecciona la promesa a la que se abona.';
      }
    }
    const dateError = this.dateError(value.receivedOn);
    if (dateError) {
      errors.date = dateError;
    }
    if (value.amount === null || !(value.amount > 0)) {
      errors.amount = 'Escribe un valor mayor que cero.';
    }
    if (this.referenceRequired() && !value.paymentReference.trim()) {
      errors.reference = 'La referencia es obligatoria para este medio de pago.';
    }
    return errors;
  }

  private dateError(date: string): string | null {
    if (!date) {
      return 'Selecciona la fecha del aporte.';
    }
    if (date > this.options().today) {
      return 'La fecha no puede ser posterior a hoy.';
    }
    const { year, month } = yearMonthOf(date);
    const period = this.options().periods.find((p) => p.year === year && p.month === month);
    if (period?.status !== 'OPEN') {
      return 'La fecha debe caer en un periodo contable abierto.';
    }
    const settled =
      this.selectedType()?.category === 'TITHE' &&
      this.options().settledTitheRanges.some((range) => range.from <= date && date <= range.to);
    return settled ? 'Los diezmos de esa fecha ya fueron liquidados: anula la liquidación o usa otra fecha.' : null;
  }

  private applyPreset(preset: VowPaymentTarget): void {
    this.typeId.set(preset.pledge.contributionTypeId);
    this.donorMode.set('NOMINAL');
    this.person.set(preset.person);
    this.form.controls.vowPledgeId.setValue(preset.pledge.id);
  }
}
