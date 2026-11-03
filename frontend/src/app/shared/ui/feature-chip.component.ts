import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/** Translucent pill that names a capability on a brand background. */
@Component({
  selector: 'app-feature-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    :host {
      @include glass($radius-pill);
      display: inline-flex;
      align-items: center;
      gap: $space-2;
      min-height: 2.25rem;
      padding: 0 $space-3 + 0.125rem;
      background: $glass-bg;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
    }
  `,
  template: `<app-icon [name]="icon()" [size]="14" />{{ label() }}`,
})
export class FeatureChipComponent {
  readonly label = input.required<string>();
  readonly icon = input.required<IconName>();
}
