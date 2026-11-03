import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder block with a shimmer while content loads. Decorative. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
  },
  styles: `
    @use 'tokens' as *;

    :host {
      display: block;
      max-width: 100%;
      border-radius: $radius-control;
      background: linear-gradient(
        90deg,
        $color-surface-2 25%,
        $color-surface-tint 37%,
        $color-surface-2 63%
      );
      background-size: 200% 100%;
      animation: app-shimmer 1.4s ease infinite;
    }
  `,
  template: '',
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
}
