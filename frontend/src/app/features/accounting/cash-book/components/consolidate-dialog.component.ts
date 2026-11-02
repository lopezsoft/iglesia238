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
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { LoadingComponent } from '../../../../shared/ui/feedback.components';
import { ConsolidationResult } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';

/** "Consolidar aportes": previews the pending contributions of a date and posts one inflow per account. */
@Component({
  selector: 'app-consolidate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, LoadingComponent, MoneyPipe],
  template: `
    <app-dialog [(open)]="open" title="Consolidar aportes" variant="wide">
      <div class="stack">
        <div class="field">
          <label for="consolidate-date">Fecha de los aportes *</label>
          <input
            id="consolidate-date"
            class="input"
            type="date"
            [value]="date()"
            [attr.min]="openRange()?.min"
            [attr.max]="maxDate()"
            [attr.aria-invalid]="dateInvalid()"
            aria-describedby="consolidate-date-help"
            (change)="onDate($event)"
          />
          <span id="consolidate-date-help" class="field__hint">
            Se consolidan los aportes registrados, no anulados y sin movimiento de caja de esa fecha. El movimiento queda con
            la misma fecha, que debe caer en un periodo abierto.
          </span>
          @if (dateInvalid()) {
            <span class="field__error">Elige una fecha de un periodo abierto que no sea posterior a hoy.</span>
          }
        </div>

        @if (dateInvalid()) {
          <p class="text-muted text-small">Elige una fecha válida para ver los aportes pendientes.</p>
        } @else if (preview.error(); as loadError) {
          <div class="alert alert--danger" role="alert">{{ message(loadError) }}</div>
        } @else if (!preview.value()) {
          <app-loading label="Buscando aportes pendientes…" />
        } @else if (preview.value()!.count === 0) {
          <p class="alert" role="status">No hay aportes pendientes de consolidar el {{ date() | date: 'dd/MM/yyyy' }}.</p>
        } @else {
          @let data = preview.value()!;
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">Movimientos de entrada que se registrarán</caption>
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Fondo</th>
                  <th scope="col" class="text-right">Aportes</th>
                  <th scope="col" class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                @for (group of data.groups; track group.accountId + '-' + group.fundId) {
                  <tr>
                    <td><span class="mono text-small">{{ group.accountCode }}</span> {{ group.accountName }}</td>
                    <td>{{ group.fundName }}</td>
                    <td class="num">{{ group.count }}</td>
                    <td class="num">{{ group.amount | money }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total</td>
                  <td class="num">{{ data.count }}</td>
                  <td class="num">{{ data.total | money }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="text-small">
            Se registrarán {{ data.groups.length }} {{ data.groups.length === 1 ? 'movimiento' : 'movimientos' }} de entrada con el
            comprobante <span class="chip chip--mono">{{ data.nextVoucherCode }}</span>, y los aportes quedarán vinculados a ellos.
          </p>
        }
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </div>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="button" class="btn btn--primary" [disabled]="!canConfirm()" (click)="confirm()">
          {{ pending() ? 'Consolidando…' : 'Consolidar aportes' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ConsolidateDialogComponent {
  private readonly repository = inject(CashBookRepository);

  readonly open = model(false);
  readonly today = input.required<string>();
  readonly openRange = input.required<{ readonly min: string; readonly max: string } | null>();
  readonly consolidated = output<ConsolidationResult>();

  protected readonly message = userMessage;
  protected readonly date = signal('');
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxDate = computed(() => {
    const range = this.openRange();
    return range && range.max < this.today() ? range.max : this.today();
  });
  protected readonly dateInvalid = computed(() => {
    const range = this.openRange();
    const date = this.date();
    return !range || !date || date < range.min || date > this.maxDate();
  });

  protected readonly preview = rxResource({
    params: () => (this.open() && !this.dateInvalid() ? { date: this.date() } : undefined),
    stream: ({ params }) => this.repository.consolidationPreview(params.date),
  });

  protected readonly canConfirm = computed(
    () => !this.pending() && !this.dateInvalid() && (this.preview.value()?.count ?? 0) > 0,
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.error.set(null);
          this.date.set(this.maxDate());
        });
      }
    });
  }

  protected onDate(event: Event): void {
    this.date.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected async confirm(): Promise<void> {
    if (!this.canConfirm()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.repository.consolidate(this.date()));
      this.consolidated.emit(result);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
