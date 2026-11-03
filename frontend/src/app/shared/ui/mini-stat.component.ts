import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconName } from './icon.component';
import { ChipTone, IconChipComponent } from './icon-chip.component';

/** White sub-card with a figure: lives inside an `<app-section-panel>`. */
@Component({
  selector: 'app-mini-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconChipComponent],
  host: { '[class]': '"tone-" + tone()' },
  styles: `
    @use 'tokens' as *;

    :host {
      display: flex;
      flex-direction: column;
      gap: $space-2;
      min-width: 0;
      padding: $space-4 14px;
      background: $color-surface;
      border-radius: $radius-panel - 4px;
      box-shadow: $shadow-card;
    }

    .mini__value {
      margin-top: $space-1;
      font-size: $font-size-lg;
      font-weight: $font-weight-extrabold;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    .mini__label {
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      color: $color-ink-muted;
    }

    .mini__meta {
      font-size: $font-size-2xs;
      color: $color-ink-subtle;
    }
  `,
  template: `
    @if (icon(); as name) {
      <app-icon-chip [icon]="name" [tone]="tone()" size="lg" />
    }
    <span class="mini__value">{{ value() }}</span>
    <span class="mini__label">{{ label() }}</span>
    @if (meta()) {
      <span class="mini__meta">{{ meta() }}</span>
    }
  `,
})
export class MiniStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly meta = input<string | null>(null);
  readonly icon = input<IconName | null>(null);
  readonly tone = input<ChipTone>('slate');
}
