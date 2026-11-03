import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { monthLabel } from '../../../../shared/utils/period';
import { OpenPeriodCommand, PeriodRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';

/**
 * Opens an accounting period of the active sede. The first one of a new sede can be any month of the
 * year in course up to today; the next ones must touch the periods that already exist.
 */
@Component({
  selector: 'app-open-period-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="first() ? 'Abrir el primer periodo contable' : 'Abrir periodo contable'">
      <form id="open-period-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">
          @if (first()) {
            {{ scopeLabel() }} todavía no tiene periodos. Elige el mes desde el cual llevará su contabilidad en el sistema;
            sin un periodo abierto no se pueden registrar aportes ni movimientos de caja.
          } @else {
            Solo se puede abrir el mes anterior al primero o el siguiente al último periodo existente, para no dejar meses sin abrir.
          }
        </p>
        <div class="field">
          <label for="period-month">Mes de {{ year() }} *</label>
          <select id="period-month" class="select" formControlName="month">
            @for (option of months(); track option.month) {
              <option [ngValue]="option.month" [disabled]="option.exists">
                {{ option.label }}{{ option.exists ? ' · ya existe' : '' }}
              </option>
            }
          </select>
          <span class="field__hint">Los saldos iniciales de los fondos corresponden al año {{ year() }}.</span>
        </div>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="open-period-form" class="btn btn--primary" [disabled]="pending() || form.invalid">
          {{ pending() ? 'Abriendo…' : 'Abrir periodo' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class OpenPeriodDialogComponent {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  /** Year of today: periods can only be opened in it. */
  readonly year = input.required<number>();
  /** Month of today: the last one that can be opened. */
  readonly currentMonth = input.required<number>();
  readonly periods = input.required<readonly PeriodRow[]>();
  readonly scopeLabel = input('La sede');
  readonly opened = output<PeriodRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly first = computed(() => this.periods().length === 0);
  protected readonly months = computed(() => {
    const existing = new Set(this.periods().filter((p) => p.year === this.year()).map((p) => p.month));
    return Array.from({ length: this.currentMonth() }, (_, index) => {
      const month = index + 1;
      return { month, label: monthLabel({ year: this.year(), month }), exists: existing.has(month) };
    });
  });

  protected readonly form = this.fb.group({ month: [1, [Validators.required, Validators.min(1), Validators.max(12)]] });

  constructor() {
    effect(() => {
      if (this.open()) {
        const suggestion = this.suggestedMonth();
        untracked(() => {
          this.error.set(null);
          this.form.reset({ month: suggestion });
        });
      }
    });
  }

  /** Current month for a new sede, otherwise the month right after the last (or before the first) period. */
  private suggestedMonth(): number {
    const periods = this.periods().filter((p) => p.year === this.year());
    if (periods.length === 0) {
      return this.currentMonth();
    }
    const months = periods.map((p) => p.month);
    const after = Math.max(...months) + 1;
    return after <= this.currentMonth() ? after : Math.max(1, Math.min(...months) - 1);
  }

  protected async submit(): Promise<void> {
    if (this.pending() || this.form.invalid) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    const command: OpenPeriodCommand = { year: this.year(), month: this.form.getRawValue().month };
    try {
      const period = await firstValueFrom(this.repository.openPeriod(command));
      this.opened.emit(period);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
