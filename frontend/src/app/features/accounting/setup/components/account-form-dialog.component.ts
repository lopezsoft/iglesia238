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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ACCOUNT_NATURES, ACCOUNT_NATURE_LABELS, AccountNature } from '../../data/accounting.models';
import { AccountRow, FundRow } from '../data/accounting-setup.models';
import { AccountingSetupRepository } from '../data/accounting-setup.repository';

/** Create or edit an account of the chart. A child inherits the nature of its parent. */
@Component({
  selector: 'app-account-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="account() ? 'Editar cuenta ' + account()!.code : 'Nueva cuenta'">
      <form id="account-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="acc-parent">Cuenta padre</label>
          <select id="acc-parent" class="select" formControlName="parentId">
            <option [ngValue]="null">Ninguna (cuenta de clase)</option>
            @for (parent of parentOptions(); track parent.id) {
              <option [ngValue]="parent.id">{{ parent.code }} · {{ parent.name }}</option>
            }
          </select>
          @if (parentWillBecomeGroup()) {
            <span class="field__hint">La cuenta padre es imputable: al crear esta subcuenta dejará de serlo.</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="acc-code">Código *</label>
            <input id="acc-code" class="input mono" type="text" inputmode="numeric" formControlName="code" maxlength="20" aria-describedby="acc-code-help" />
            <span id="acc-code-help" class="field__hint">Solo números. Debe empezar por el código de la cuenta padre.</span>
            @if (form.controls.code.touched && form.controls.code.invalid) {
              <span class="field__error">Escribe un código numérico de hasta 20 dígitos.</span>
            }
          </div>
          <div class="field">
            <label for="acc-nature">Naturaleza</label>
            <select id="acc-nature" class="select" formControlName="nature">
              @for (nature of natures; track nature) {
                <option [ngValue]="nature">{{ natureLabels[nature] }}{{ selectedParent() ? ' (heredada)' : '' }}</option>
              }
            </select>
          </div>
        </div>
        <div class="field">
          <label for="acc-name">Nombre *</label>
          <input id="acc-name" class="input" type="text" formControlName="name" maxlength="150" placeholder="Ej. Ofrendas especiales" />
          @if (form.controls.name.touched && form.controls.name.invalid) {
            <span class="field__error">Escribe un nombre de 3 a 150 caracteres.</span>
          }
        </div>
        <div class="field">
          <label for="acc-fund">Fondo sugerido</label>
          <select id="acc-fund" class="select" formControlName="defaultFundId" aria-describedby="acc-fund-help">
            <option [ngValue]="null">Sin fondo sugerido</option>
            @for (fund of activeFunds(); track fund.id) {
              <option [ngValue]="fund.id">{{ fund.name }}</option>
            }
          </select>
          <span id="acc-fund-help" class="field__hint">Solo es una sugerencia: el fondo real se elige en cada movimiento.</span>
        </div>
        <label class="checkbox" for="acc-postable">
          <input id="acc-postable" type="checkbox" formControlName="isPostable" />
          <span>
            Cuenta imputable
            <span class="text-muted text-small">
              {{ account()?.hasChildren ? 'Tiene subcuentas: no puede ser imputable.' : 'Recibe movimientos. Si luego le creas subcuentas, dejará de ser imputable.' }}
            </span>
          </span>
        </label>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="account-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar cuenta' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class AccountFormDialogComponent {
  private readonly repository = inject(AccountingSetupRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  /** Account being edited, or null to create one. */
  readonly account = input<AccountRow | null>(null);
  /** Parent preselected when creating from "Subcuenta". */
  readonly parentId = input<number | null>(null);
  readonly accounts = input.required<readonly AccountRow[]>();
  readonly funds = input.required<readonly FundRow[]>();
  readonly saved = output<AccountRow>();

  protected readonly natures = ACCOUNT_NATURES;
  protected readonly natureLabels = ACCOUNT_NATURE_LABELS;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    parentId: this.fb.control<number | null>(null),
    code: ['', [Validators.required, Validators.pattern(/^\d{1,20}$/)]],
    nature: this.fb.control<AccountNature>('INCOME'),
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    defaultFundId: this.fb.control<number | null>(null),
    isPostable: [true],
  });

  private readonly selectedParentId = signal<number | null>(null);

  /** Groups and accounts that can still become groups (no movements nor contribution types). */
  protected readonly parentOptions = computed(() =>
    this.accounts().filter(
      (a) => a.id !== this.account()?.id && (!a.isPostable || (!a.hasMovements && a.linkedTypes === 0)),
    ),
  );
  protected readonly activeFunds = computed(() => this.funds().filter((f) => f.isActive));
  protected readonly selectedParent = computed(() =>
    this.accounts().find((a) => a.id === this.selectedParentId()) ?? null,
  );
  protected readonly parentWillBecomeGroup = computed(
    () => this.account() === null && (this.selectedParent()?.isPostable ?? false),
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
    this.form.controls.parentId.valueChanges.pipe(takeUntilDestroyed()).subscribe((parentId) => this.onParentChange(parentId));
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
        this.repository.saveAccount({
          id: this.account()?.id ?? null,
          parentId: value.parentId,
          code: value.code,
          name: value.name,
          nature: value.nature,
          isPostable: value.isPostable,
          defaultFundId: value.defaultFundId,
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
    const account = this.account();
    this.error.set(null);
    const parentId = account ? account.parentId : this.parentId();
    this.form.reset(
      {
        parentId,
        code: account?.code ?? '',
        nature: account?.nature ?? 'INCOME',
        name: account?.name ?? '',
        defaultFundId: account?.defaultFundId ?? null,
        isPostable: account?.isPostable ?? true,
      },
      { emitEvent: false },
    );
    this.toggle(this.form.controls.parentId, account === null);
    this.toggle(this.form.controls.isPostable, !(account?.hasChildren ?? false));
    if (account === null) {
      this.onParentChange(parentId);
    } else {
      this.selectedParentId.set(parentId);
      this.form.controls.nature.disable({ emitEvent: false });
      this.toggle(this.form.controls.code, !account.hasChildren && !account.hasMovements);
    }
  }

  /** The child inherits the parent nature and gets the next free code as a suggestion. */
  private onParentChange(parentId: number | null): void {
    this.selectedParentId.set(parentId);
    if (this.account() !== null) {
      return;
    }
    const parent = this.accounts().find((a) => a.id === parentId);
    this.toggle(this.form.controls.nature, !parent);
    if (parent) {
      this.form.controls.nature.setValue(parent.nature, { emitEvent: false });
      if (!this.form.controls.code.dirty) {
        this.form.controls.code.setValue(this.suggestCode(parent), { emitEvent: false });
      }
    }
  }

  private suggestCode(parent: AccountRow): string {
    const children = this.accounts()
      .filter((a) => a.parentId === parent.id && a.code.length === parent.code.length + 2)
      .map((a) => Number(a.code.slice(parent.code.length)));
    const next = children.length === 0 ? 5 : Math.max(...children) + 5;
    return next > 99 ? parent.code : `${parent.code}${String(next).padStart(2, '0')}`;
  }

  private toggle(control: { enable(o?: object): void; disable(o?: object): void }, enabled: boolean): void {
    if (enabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }
}
