import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { DistrictInput, DistrictRow, FIELD_LIMITS } from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';

export interface DistrictSaved {
  readonly district: DistrictRow;
  readonly created: boolean;
}

/** Dialog to create a district or edit it (`district` set). */
@Component({
  selector: 'app-district-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="isCreate() ? 'Nuevo distrito' : 'Editar distrito'">
      <form id="district-form" class="stack" novalidate [formGroup]="form" (ngSubmit)="submit()">
        <p class="text-muted">Agrupación territorial de sedes para supervisión pastoral.</p>

        @if (formError(); as message) {
          <div class="alert alert--danger" role="alert">
            <app-icon name="alert" />
            <span>{{ message }}</span>
          </div>
        }

        <div class="field">
          <label for="district-number">Número *</label>
          <input
            id="district-number"
            class="input mono"
            type="text"
            formControlName="number"
            autocomplete="off"
            placeholder="Ej.: 3"
            [attr.maxlength]="limits.districtNumber"
            aria-describedby="district-number-hint district-number-error"
          />
          <span id="district-number-hint" class="field__hint"
            >Único dentro de la denominación.</span
          >
          <span id="district-number-error" class="field__error" aria-live="polite">
            @if (numberError(); as message) {
              {{ message }}
            } @else if (form.controls.number.touched && form.controls.number.hasError('required')) {
              El número es obligatorio.
            }
          </span>
        </div>

        <div class="field">
          <label for="district-name">Nombre</label>
          <input
            id="district-name"
            class="input"
            type="text"
            formControlName="name"
            autocomplete="off"
            placeholder="Ej.: Distrito Sabana"
            [attr.maxlength]="limits.districtName"
          />
        </div>
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="district-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : isCreate() ? 'Crear distrito' : 'Guardar cambios' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class DistrictFormDialogComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model(false);
  readonly district = input<DistrictRow | null>(null);
  readonly saved = output<DistrictSaved>();

  protected readonly limits = FIELD_LIMITS;
  protected readonly isCreate = computed(() => this.district() === null);
  protected readonly pending = signal(false);
  protected readonly numberError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    number: ['', [Validators.required, Validators.maxLength(FIELD_LIMITS.districtNumber)]],
    name: ['', Validators.maxLength(FIELD_LIMITS.districtName)],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.district();
        untracked(() => {
          this.form.reset({ number: current?.number ?? '', name: current?.name ?? '' });
          this.numberError.set(null);
          this.formError.set(null);
        });
      }
    });
  }

  protected submit(): void {
    this.numberError.set(null);
    this.formError.set(null);
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const input: DistrictInput = { number: value.number, name: value.name || null };
    const current = this.district();
    const request = current
      ? this.repository.updateDistrict(current.id, input)
      : this.repository.createDistrict(input);
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (district) => {
        this.pending.set(false);
        this.open.set(false);
        this.saved.emit({ district, created: current === null });
      },
      error: (error: unknown) => {
        this.pending.set(false);
        const duplicate =
          error instanceof DomainError && error.code === 'DUPLICATE_DISTRICT_NUMBER';
        (duplicate ? this.numberError : this.formError).set(userMessage(error));
      },
    });
  }
}
