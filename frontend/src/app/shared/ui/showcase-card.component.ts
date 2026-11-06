import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';
import { SparklineComponent } from './sparkline.component';

/**
 * Translucent illustration card for brand panels. It is decorative marketing material: it shows
 * a title, a caption and an optional trend line with NO figures, so it can never be mistaken for
 * real data. Hidden from assistive technology.
 */
@Component({
  selector: 'app-showcase-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SparklineComponent],
  host: { 'aria-hidden': 'true', '[attr.title]': 'null' },
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    :host {
      @include glass;
      display: flex;
      flex-direction: column;
      gap: $space-2;
      padding: $space-3 $space-4;
    }

    .showcase__row {
      display: flex;
      align-items: center;
      gap: $space-3;
    }

    .showcase__icon {
      display: inline-grid;
      flex-shrink: 0;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: $radius-pill;
      background: $glass-bg-strong;
    }

    .showcase__title {
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
    }

    .showcase__caption {
      font-size: $font-size-2xs;
      color: $color-on-brand-muted;
    }

    .showcase__chart {
      height: 3.5rem;
    }
  `,
  template: `
    <div class="showcase__row">
      <span class="showcase__icon"><app-icon [name]="icon()" [size]="16" /></span>
      <div>
        <p class="showcase__title">{{ title() }}</p>
        <p class="showcase__caption">{{ caption() }}</p>
      </div>
    </div>
    @if (trend().length > 1) {
      <app-sparkline class="showcase__chart" [series]="trend()" />
    }
  `,
})
export class ShowcaseCardComponent {
  readonly title = input.required<string>();
  readonly caption = input.required<string>();
  readonly icon = input.required<IconName>();
  /** Shape of the illustrative line (relative heights, not data). Empty hides the chart. */
  readonly trend = input<readonly number[]>([]);
}
