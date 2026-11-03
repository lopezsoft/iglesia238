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
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { DenominationSummary } from '../data/denominations.models';
import { DenominationsRepository } from '../data/denominations.repository';

/** Confirms activating or deactivating a denomination. */
@Component({
  selector: 'app-denomination-status-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  template: `
    <app-dialog [(open)]="open" [title]="title()">
      @if (denomination(); as target) {
        <div class="stack">
          @if (target.isActive) {
            <p>
              Los usuarios de <strong>{{ target.name }}</strong> ya no podrán iniciar sesión. Sus
              datos se conservan y la acción queda registrada en Auditoría.
            </p>
          } @else {
            <p>
              Los usuarios de <strong>{{ target.name }}</strong> podrán volver a iniciar sesión con
              sus roles vigentes.
            </p>
          }
          @if (error(); as message) {
            <div class="alert alert--danger" role="alert">{{ message }}</div>
          }
        </div>
      }
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="denomination()?.isActive"
          [class.btn--primary]="!denomination()?.isActive"
          [disabled]="pending()"
          (click)="confirm()"
        >
          {{ pending() ? 'Guardando…' : denomination()?.isActive ? 'Desactivar' : 'Activar' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class DenominationStatusDialogComponent {
  private readonly repository = inject(DenominationsRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = model(false);
  readonly denomination = input<DenominationSummary | null>(null);
  readonly changed = output<DenominationSummary>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly title = computed(() =>
    this.denomination()?.isActive ? '¿Desactivar la denominación?' : '¿Activar la denominación?',
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.error.set(null);
      }
    });
  }

  protected confirm(): void {
    const target = this.denomination();
    if (!target || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    this.repository
      .setActive(target.id, !target.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pending.set(false);
          this.open.set(false);
          this.changed.emit(updated);
        },
        error: (error: unknown) => {
          this.pending.set(false);
          this.error.set(userMessage(error));
        },
      });
  }
}
