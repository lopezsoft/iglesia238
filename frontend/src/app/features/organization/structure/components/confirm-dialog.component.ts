import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { DialogComponent } from '../../../../shared/ui/dialog.component';

/** Confirmation of an activate/deactivate action; the parent runs the command. */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  host: { '[attr.title]': 'null' },
  template: `
    <app-dialog [(open)]="open" [title]="title()">
      <div class="stack">
        <p>{{ message() }}</p>
        @if (error(); as text) {
          <div class="alert alert--danger" role="alert">{{ text }}</div>
        }
      </div>
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="danger()"
          [class.btn--primary]="!danger()"
          [disabled]="pending()"
          (click)="confirmed.emit()"
        >
          {{ pending() ? 'Guardando…' : confirmLabel() }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ConfirmDialogComponent {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly danger = input(false);
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
}
