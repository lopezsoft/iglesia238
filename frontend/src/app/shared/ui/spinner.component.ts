import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Indeterminate loader. Decorative: pair it with visible text or a live region. */
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--spinner-size.px]': 'size()' },
  styles: `
    @use 'tokens' as *;

    :host {
      display: inline-block;
      flex-shrink: 0;
      width: var(--spinner-size, 16px);
      height: var(--spinner-size, 16px);
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: $radius-pill;
      animation: app-spin 700ms linear infinite;
    }
  `,
  template: '',
})
export class SpinnerComponent {
  readonly size = input(16);
}
