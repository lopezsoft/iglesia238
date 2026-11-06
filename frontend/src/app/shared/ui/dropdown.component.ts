import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CustomTooltipDirective } from './custom-tooltip.directive';

/**
 * Button that opens a floating menu. Project the button content in `[dropdown-trigger]` and the
 * menu entries in the default slot: each entry must carry `role="menuitem"` (or
 * `menuitemradio`) and is activated by a click or Enter. Choosing an entry closes the menu; so
 * do Escape and a press outside. Arrow keys move between entries and focus returns to the
 * button on close.
 */
@Component({
  selector: 'app-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CustomTooltipDirective],
  host: {
    '(document:keydown.escape)': 'closeAndFocus()',
    '(document:pointerdown)': 'closeOnOutsidePress($event)',
  },
  styleUrl: './dropdown.component.scss',
  template: `
    <button
      #trigger
      type="button"
      [class]="triggerClass()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [appCustomTooltip]="tooltip()"
      (click)="toggle()"
      (keydown.arrowdown)="openFromKeyboard($event)"
    >
      <ng-content select="[dropdown-trigger]" />
    </button>
    @if (open()) {
      <div
        #panel
        class="dropdown__panel"
        [class.dropdown__panel--end]="align() === 'end'"
        role="menu"
        [attr.aria-label]="label()"
        (click)="closeAfterChoice($event)"
        (keydown.arrowdown)="focusSibling($event, 1)"
        (keydown.arrowup)="focusSibling($event, -1)"
        (keydown.home)="focusSibling($event, 0)"
        (keydown.end)="focusSibling($event, -1, true)"
      >
        <ng-content />
      </div>
    }
  `,
})
export class DropdownComponent {
  /** Accessible name of the button and of the menu. */
  readonly label = input.required<string>();
  readonly tooltip = input<string | null>(null);
  readonly triggerClass = input('');
  readonly align = input<'start' | 'end'>('start');

  protected readonly open = signal(false);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.show();
  }

  protected openFromKeyboard(event: Event): void {
    event.preventDefault();
    if (!this.open()) {
      this.show();
    }
  }

  protected closeAndFocus(): void {
    if (this.open()) {
      this.open.set(false);
      this.trigger().nativeElement.focus();
    }
  }

  protected closeOnOutsidePress(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected closeAfterChoice(event: Event): void {
    if ((event.target as HTMLElement).closest('[role^="menuitem"]')) {
      this.open.set(false);
    }
  }

  protected focusSibling(event: Event, delta: number, last = false): void {
    event.preventDefault();
    const items = this.items();
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (delta === 0) {
      next = 0;
    } else if (last) {
      next = items.length - 1;
    } else {
      next = (current + delta + items.length) % items.length;
    }
    items[next].focus();
  }

  private show(): void {
    this.open.set(true);
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  private items(): HTMLElement[] {
    const panel = this.panel()?.nativeElement;
    return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')) : [];
  }
}
