import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { monthLabel } from '../../data/accounting-rules';
import { CashPeriodOption } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';

/** Confirmation to close an accounting period of the sede (every fund at once). */
@Component({
  selector: 'app-close-period-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, MoneyPipe],
  styles: `
    .balance {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.5rem;
    }
  `,
  template: `
    <app-dialog [(open)]="open" [title]="'¿Cerrar ' + period().label + ' de ' + congregationName() + '?'">
      <div class="stack">
        <p>
          Al cerrar el periodo no se podrán registrar movimientos, reversas ni consolidaciones en él, en ningún fondo de la
          sede. El saldo final de cada fondo pasa como saldo inicial de {{ nextLabel() }}.
        </p>
        <div class="alert balance">
          <span>Saldo final a trasladar · {{ fundName() }}</span>
          <strong class="amount">{{ closing() | money }}</strong>
        </div>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </div>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="button" class="btn btn--danger" [disabled]="pending()" (click)="confirm()">
          {{ pending() ? 'Cerrando…' : 'Cerrar periodo' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ClosePeriodDialogComponent {
  private readonly repository = inject(CashBookRepository);

  readonly open = model(false);
  readonly period = input.required<CashPeriodOption>();
  readonly congregationName = input.required<string>();
  readonly fundName = input.required<string>();
  readonly closing = input.required<number>();
  readonly closed = output<CashPeriodOption>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nextLabel = computed(() => {
    const { year, month } = this.period();
    return monthLabel(month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.error.set(null);
      }
    });
  }

  protected async confirm(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const period = await firstValueFrom(this.repository.closePeriod(this.period().id));
      this.closed.emit(period);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
