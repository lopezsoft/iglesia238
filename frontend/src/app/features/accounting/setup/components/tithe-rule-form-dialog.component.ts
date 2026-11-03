import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom, map, startWith } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { TitheRuleRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';
import { percentFromRate, rateFromPercent } from '../data/tithe-rate';

/** Example gross tithe used to show the effect of the percentages while they are typed. */
const SAMPLE_GROSS = 1_000_000;

/**
 * Create or edit the tithe percentages that apply from a date. There is no default: each
 * denomination types its own, and a rule used by a settlement can no longer be edited.
 */
@Component({
  selector: 'app-tithe-rule-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, MoneyPipe, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="rule() ? 'Editar porcentaje del diezmo' : 'Nuevo porcentaje del diezmo'">
      <form id="tithe-rule-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="rule-date">Aplica desde *</label>
          <input id="rule-date" class="input" type="date" formControlName="effectiveFrom" aria-describedby="rule-date-help" />
          <span id="rule-date-help" class="field__hint">
            Primer día en que se usa. Las liquidaciones ya emitidas conservan los porcentajes con que se emitieron.
          </span>
          @if (form.controls.effectiveFrom.touched && form.controls.effectiveFrom.invalid) {
            <span class="field__error">Indica la fecha de inicio.</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="rule-national">Porcentaje nacional (%) *</label>
            <input id="rule-national" class="input" type="number" inputmode="decimal" min="0" max="100" step="0.01" formControlName="national" />
            <span class="field__hint">Se calcula sobre el diezmo bruto.</span>
            @if (form.controls.national.touched && form.controls.national.invalid) {
              <span class="field__error">Escribe un valor entre 0 y 100 (máximo dos decimales).</span>
            }
          </div>
          <div class="field">
            <label for="rule-local">Porcentaje del fondo local (%) *</label>
            <input id="rule-local" class="input" type="number" inputmode="decimal" min="0" max="100" step="0.01" formControlName="local" />
            <span class="field__hint">Se calcula sobre lo que queda después del nacional.</span>
            @if (form.controls.local.touched && form.controls.local.invalid) {
              <span class="field__error">Escribe un valor entre 0 y 100 (máximo dos decimales).</span>
            }
          </div>
        </div>
        @if (example(); as split) {
          <div class="alert" role="note">
            <span>
              Ejemplo con un diezmo de {{ sample | money }}: nacional {{ split.national | money }}, fondo local
              {{ split.local | money }} y neto del pastor {{ split.pastor | money }}.
            </span>
          </div>
        }
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="tithe-rule-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar porcentaje' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class TitheRuleFormDialogComponent {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly rule = input<TitheRuleRow | null>(null);
  /** Today ('YYYY-MM-DD'): the proposed start date of a new rule. */
  readonly today = input.required<string>();
  readonly saved = output<TitheRuleRow>();

  protected readonly sample = SAMPLE_GROSS;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    effectiveFrom: ['', Validators.required],
    national: [0, [Validators.required, Validators.min(0), Validators.max(100), twoDecimals]],
    local: [0, [Validators.required, Validators.min(0), Validators.max(100), twoDecimals]],
  });

  private readonly values = toSignal(this.form.valueChanges.pipe(startWith(null), map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  /** Effect of the typed percentages on the sample amount, with the formula of the settlement. */
  protected readonly example = computed(() => {
    const { national, local } = this.values();
    if (!Number.isFinite(national) || !Number.isFinite(local) || national < 0 || local < 0 || national > 100 || local > 100) {
      return null;
    }
    const nationalShare = Math.round(SAMPLE_GROSS * rateFromPercent(national) * 100) / 100;
    const localShare = Math.round((SAMPLE_GROSS - nationalShare) * rateFromPercent(local) * 100) / 100;
    return { national: nationalShare, local: localShare, pastor: SAMPLE_GROSS - nationalShare - localShare };
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const rule = this.rule();
        const today = this.today();
        untracked(() => {
          this.error.set(null);
          this.form.reset({
            effectiveFrom: rule?.effectiveFrom ?? today,
            national: rule ? percentFromRate(rule.nationalShareRate) : 0,
            local: rule ? percentFromRate(rule.localFundRate) : 0,
          });
        });
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(
        this.repository.saveTitheRule({
          id: this.rule()?.id ?? null,
          effectiveFrom: value.effectiveFrom,
          nationalShareRate: rateFromPercent(value.national),
          localFundRate: rateFromPercent(value.local),
        }),
      );
      this.saved.emit(saved);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}

/** A percentage with more than two decimals cannot be stored in the four-decimal rate. */
function twoDecimals(control: { value: unknown }): { decimals: true } | null {
  const value = Number(control.value);
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6 ? { decimals: true } : null;
}
