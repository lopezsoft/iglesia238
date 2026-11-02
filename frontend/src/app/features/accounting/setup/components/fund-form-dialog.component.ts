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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { FundRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';

/** Create or edit a fund and, in a sede, its opening balance of the year. */
@Component({
  selector: 'app-fund-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="fund() ? 'Editar fondo' : 'Nuevo fondo'">
      <form id="fund-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="fund-name">Nombre del fondo *</label>
          <input id="fund-name" class="input" type="text" formControlName="name" maxlength="120" placeholder="Ej. Comité de Caballeros" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <span class="field__error">Escribe un nombre de 3 a 120 caracteres.</span>
          }
        </div>
        <div class="field">
          <label for="fund-opening">Saldo inicial {{ year() }} (COP) *</label>
          <input
            id="fund-opening"
            class="input"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            formControlName="openingBalance"
            aria-describedby="fund-opening-help"
          />
          <span id="fund-opening-help" class="field__hint">{{ openingHint() }}</span>
          @if (form.controls.openingBalance.touched && form.controls.openingBalance.invalid) {
            <span class="field__error">El saldo inicial debe ser un valor igual o mayor que cero.</span>
          }
        </div>
        @if (fund()) {
          <label class="checkbox" for="fund-active">
            <input id="fund-active" type="checkbox" formControlName="isActive" />
            <span>Fondo activo <span class="text-muted text-small">(los inactivos no reciben movimientos nuevos)</span></span>
          </label>
        }
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="fund-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar fondo' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class FundFormDialogComponent {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly fund = input<FundRow | null>(null);
  readonly year = input.required<number>();
  /** False when acting on the whole denomination: the opening balance is read-only. */
  readonly congregationScoped = input(true);
  readonly saved = output<FundRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly openingEditable = computed(() => this.congregationScoped() && !(this.fund()?.openingLocked ?? false));
  protected readonly openingHint = computed(() => {
    if (!this.congregationScoped()) {
      return 'Consolidado de todas las sedes. Selecciona una sede para editarlo.';
    }
    return this.openingEditable()
      ? 'Valor con que el fondo abre el año. Después del primer movimiento solo se ajusta con un comprobante.'
      : 'El fondo ya tiene movimientos este año: el saldo inicial solo se ajusta con un comprobante.';
  });

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    openingBalance: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
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
      const row = await firstValueFrom(
        this.repository.saveFund({
          id: this.fund()?.id ?? null,
          name: value.name,
          isActive: value.isActive,
          openingBalance: this.openingEditable() ? Number(value.openingBalance) : null,
        }),
      );
      this.saved.emit(row);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    const fund = this.fund();
    this.error.set(null);
    this.form.reset({
      name: fund?.name ?? '',
      openingBalance: fund?.openingBalance ?? 0,
      isActive: fund?.isActive ?? true,
    });
    if (this.openingEditable()) {
      this.form.controls.openingBalance.enable();
    } else {
      this.form.controls.openingBalance.disable();
    }
  }
}
