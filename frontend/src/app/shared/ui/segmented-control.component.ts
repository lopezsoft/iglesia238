import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';

export interface SegmentOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
}

/**
 * Single-choice pill group ("Hoy | Ayer | 7 días | Mes"). `radiogroup` semantics with arrow-key
 * navigation; use `variant="on-brand"` on top of a gradient background.
 */
@Component({
  selector: 'app-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.segmented--on-brand]': 'variant() === "on-brand"' },
  styleUrl: './segmented-control.component.scss',
  template: `
    <div class="segmented" role="radiogroup" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.value) {
        <button
          #segment
          type="button"
          role="radio"
          class="segmented__option"
          [attr.aria-checked]="option.value === value()"
          [tabindex]="option.value === value() ? 0 : -1"
          (click)="select(option.value)"
          (keydown.arrowright)="move($event, 1)"
          (keydown.arrowdown)="move($event, 1)"
          (keydown.arrowleft)="move($event, -1)"
          (keydown.arrowup)="move($event, -1)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class SegmentedControlComponent {
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = model.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly variant = input<'default' | 'on-brand'>('default');

  private readonly segments = viewChildren<ElementRef<HTMLButtonElement>>('segment');

  protected select(value: string): void {
    this.value.set(value);
  }

  protected move(event: Event, delta: number): void {
    event.preventDefault();
    const options = this.options();
    const current = options.findIndex((option) => option.value === this.value());
    const next = (current + delta + options.length) % options.length;
    this.value.set(options[next].value);
    this.segments()[next]?.nativeElement.focus();
  }
}
