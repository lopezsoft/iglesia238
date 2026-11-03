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
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_CATEGORY_LABELS,
  ContributionCategory,
} from '../../data/accounting.models';
import { AccountRow, ContributionTypeRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';

/** Create or edit a contribution type. Only postable income accounts are offered. */
@Component({
  selector: 'app-contribution-type-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="type() ? 'Editar tipo de aporte' : 'Nuevo tipo de aporte'">
      <form id="type-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="type-name">Nombre *</label>
          <input id="type-name" class="input" type="text" formControlName="name" maxlength="100" placeholder="Ej. Ofrenda de acción de gracias" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <span class="field__error">Escribe un nombre de 3 a 100 caracteres.</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="type-code">Código *</label>
            <input id="type-code" class="input mono" type="text" formControlName="code" maxlength="30" placeholder="OFRENDA_GRACIAS" aria-describedby="type-code-help" />
            <span id="type-code-help" class="field__hint">Mayúsculas, números y guion bajo. Único en la denominación.</span>
            @if (form.controls.code.touched && form.controls.code.invalid) {
              <span class="field__error">Usa de 2 a 30 caracteres: A–Z, 0–9 o _.</span>
            }
          </div>
          <div class="field">
            <label for="type-category">Categoría *</label>
            <select id="type-category" class="select" formControlName="category" aria-describedby="type-category-help">
              @for (category of categories; track category) {
                <option [ngValue]="category">{{ categoryLabels[category] }} ({{ category }})</option>
              }
            </select>
            <span id="type-category-help" class="field__hint">Solo Diezmo entra en la liquidación y solo Voto admite promesa.</span>
          </div>
        </div>
        <div class="field">
          <label for="type-account">Cuenta contable *</label>
          <select id="type-account" class="select" formControlName="accountId" aria-describedby="type-account-help">
            <option [ngValue]="null" disabled>Selecciona una cuenta</option>
            @for (account of incomeAccounts(); track account.id) {
              <option [ngValue]="account.id">{{ account.code }} · {{ account.name }}</option>
            }
          </select>
          <span id="type-account-help" class="field__hint">Solo se listan cuentas imputables de ingreso.</span>
          @if (form.controls.accountId.touched && form.controls.accountId.invalid) {
            <span class="field__error">Selecciona la cuenta contable.</span>
          }
        </div>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="type-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar tipo' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ContributionTypeFormDialogComponent {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly type = input<ContributionTypeRow | null>(null);
  readonly accounts = input.required<readonly AccountRow[]>();
  readonly saved = output<ContributionTypeRow>();

  protected readonly categories = CONTRIBUTION_CATEGORIES;
  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly incomeAccounts = computed(() =>
    this.accounts().filter((a) => a.nature === 'INCOME' && a.isPostable && a.isActive),
  );

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_]{2,30}$/)]],
    category: this.fb.control<ContributionCategory>('OFFERING'),
    accountId: this.fb.control<number | null>(null, Validators.required),
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
    const value = this.form.getRawValue();
    if (this.form.invalid || value.accountId === null || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const row = await firstValueFrom(
        this.repository.saveContributionType({
          id: this.type()?.id ?? null,
          code: value.code,
          name: value.name,
          category: value.category,
          accountId: value.accountId,
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
    const type = this.type();
    this.error.set(null);
    this.form.reset({
      name: type?.name ?? '',
      code: type?.code ?? '',
      category: type?.category ?? 'OFFERING',
      accountId: type?.accountId ?? null,
    });
  }
}
