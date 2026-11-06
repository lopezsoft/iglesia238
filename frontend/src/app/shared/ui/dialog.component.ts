import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

let nextId = 0;

const FIRST_FIELD_SELECTOR = [
  '.dialog__body input:not([disabled]):not([type="hidden"]):not([readonly])',
  '.dialog__body select:not([disabled])',
  '.dialog__body textarea:not([disabled])',
].join(', ');

/**
 * Modal dialog or side drawer on the native <dialog>: focus trap, Escape and the backdrop come
 * from the browser. Two-way bind `open`; the body and the footer (`dialog-footer`) are projected.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '[attr.title]': 'null' },
  styleUrl: './dialog.component.scss',
  template: `
    <dialog
      #dialog
      class="dialog"
      [class.dialog--drawer]="variant() === 'drawer'"
      [class.dialog--wide]="variant() === 'wide'"
      [attr.aria-labelledby]="titleId"
      (close)="open.set(false)"
      (pointerdown)="rememberPressStart($event)"
      (click)="closeOnBackdrop($event)"
    >
      <div class="dialog__panel">
        <header class="dialog__header">
          <h2 [id]="titleId">{{ title() }}</h2>
          <button type="button" class="btn btn--ghost btn--icon" aria-label="Cerrar" (click)="open.set(false)">
            <app-icon name="x" />
          </button>
        </header>
        <div class="dialog__body">
          <ng-content />
        </div>
        <footer class="dialog__footer">
          <ng-content select="[dialog-footer]" />
        </footer>
      </div>
    </dialog>
  `,
})
export class DialogComponent {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly variant = input<'modal' | 'wide' | 'drawer'>('modal');
  protected readonly titleId = `app-dialog-title-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private pressStartedOnBackdrop = false;

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
        this.focusFirstControl(element);
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  /**
   * Native `showModal()` focuses the first focusable node in DOM order (the header close button).
   * When the dialog body contains form controls, move focus to any explicit `[autofocus]` field
   * first, or to the first enabled field in DOM order.
   */
  private focusFirstControl(element: HTMLDialogElement): void {
    const applyFocus = () => {
      if (!element.open) {
        return;
      }
      const control =
        element.querySelector<HTMLElement>('.dialog__body [autofocus]:not([disabled])') ??
        element.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR);
      control?.focus();
    };
    applyFocus();
    queueMicrotask(applyFocus);
  }

  /**
   * A click whose press started inside the panel (e.g. selecting text in an input and releasing
   * over the backdrop) is dispatched to the <dialog> too: only a press that started on the
   * backdrop may close it.
   */
  protected rememberPressStart(event: PointerEvent): void {
    this.pressStartedOnBackdrop = event.target === this.dialog().nativeElement;
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    const startedOnBackdrop = this.pressStartedOnBackdrop;
    this.pressStartedOnBackdrop = false;
    if (startedOnBackdrop && event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
