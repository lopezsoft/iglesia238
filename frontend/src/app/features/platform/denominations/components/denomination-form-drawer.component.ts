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
import { RouterLink } from '@angular/router';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  DENOMINATION_DEFAULT_CONTRIBUTION_TYPES,
  DENOMINATION_NAME_MAX_LENGTH,
  DenominationSummary,
} from '../data/denominations.models';
import { DenominationsRepository } from '../data/denominations.repository';

export interface DenominationSaved {
  readonly denomination: DenominationSummary;
  readonly created: boolean;
}

/** Drawer to create a denomination or rename it (`denomination` set). */
@Component({
  selector: 'app-denomination-form-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './denomination-form-drawer.component.html',
  styleUrl: './denomination-form-drawer.component.scss',
})
export class DenominationFormDrawerComponent {
  private readonly repository = inject(DenominationsRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model(false);
  readonly denomination = input<DenominationSummary | null>(null);
  readonly saved = output<DenominationSaved>();

  protected readonly maxLength = DENOMINATION_NAME_MAX_LENGTH;
  protected readonly contributionTypes = DENOMINATION_DEFAULT_CONTRIBUTION_TYPES;
  protected readonly isCreate = computed(() => this.denomination() === null);
  protected readonly pending = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(DENOMINATION_NAME_MAX_LENGTH)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        const current = this.denomination();
        untracked(() => {
          this.form.reset({ name: current?.name ?? '' });
          this.nameError.set(null);
          this.formError.set(null);
        });
      }
    });
  }

  protected submit(): void {
    this.nameError.set(null);
    this.formError.set(null);
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const input = { name: this.form.controls.name.value };
    const current = this.denomination();
    const request = current
      ? this.repository.rename(current.id, input)
      : this.repository.create(input);
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (denomination) => {
        this.pending.set(false);
        this.open.set(false);
        this.saved.emit({ denomination, created: current === null });
      },
      error: (error: unknown) => {
        this.pending.set(false);
        const target = isNameError(error) ? this.nameError : this.formError;
        target.set(userMessage(error));
      },
    });
  }
}

const NAME_ERROR_CODES: ReadonlySet<string> = new Set([
  'DUPLICATE_NAME',
  'NAME_REQUIRED',
  'NAME_TOO_LONG',
]);

function isNameError(error: unknown): boolean {
  return error instanceof DomainError && NAME_ERROR_CODES.has(error.code);
}
