import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

export type ChipTone = 'cyan' | 'green' | 'orange' | 'red' | 'indigo' | 'slate';

/** Tinted rounded square that holds an icon. `solid` paints the tone color behind a white icon. */
@Component({
  selector: 'app-icon-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '[class]': '"tone-" + tone()',
    '[class.icon-chip--solid]': 'solid()',
    '[class.icon-chip--lg]': 'size() === "lg"',
  },
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    :host {
      @include icon-chip(2.25rem);
    }

    :host(.icon-chip--lg) {
      width: 2.5rem;
      height: 2.5rem;
    }

    :host(.icon-chip--solid) {
      background: $tone-fg;
      color: $color-on-primary;
    }
  `,
  template: `<app-icon [name]="icon()" [size]="size() === 'lg' ? 20 : 18" [variant]="solid() ? 'line' : 'duotone'" />`,
})
export class IconChipComponent {
  readonly icon = input.required<IconName>();
  readonly tone = input<ChipTone>('slate');
  readonly size = input<'md' | 'lg'>('md');
  readonly solid = input(false);
}
