import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconName } from './icon.component';
import { ChipTone, IconChipComponent } from './icon-chip.component';

/**
 * Tinted section of a page: solid icon badge, title, subtitle and a body. Project
 * `<app-mini-stat>` for a figure grid, or any content with `layout="stack"`. Buttons for the
 * header go in `[panel-actions]`.
 */
@Component({
  selector: 'app-section-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconChipComponent],
  host: { '[class]': '"tone-" + tone()', '[attr.title]': 'null' },
  styles: `
    @use 'tokens' as *;

    :host {
      display: flex;
      flex-direction: column;
      gap: $space-3;
      padding: $space-3 $space-4 $space-4;
      background: $tone-panel;
      border: 1px solid $tone-border;
      border-radius: $radius-panel;
    }

    .panel__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: $space-3;
    }

    .panel__text {
      display: flex;
      flex: 1 1 12rem;
      flex-direction: column;
      min-width: 0;
    }

    .panel__title {
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
      color: $color-ink;
    }

    .panel__subtitle {
      font-size: $font-size-2xs;
      color: $color-ink-muted;
    }

    .panel__actions:empty {
      display: none;
    }

    .panel__body--grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: $space-3;
    }

    .panel__body--stack {
      display: flex;
      flex-direction: column;
      gap: $space-3;
    }
  `,
  template: `
    <header class="panel__header">
      <app-icon-chip [icon]="icon()" [tone]="tone()" size="lg" [solid]="true" />
      <div class="panel__text">
        <h2 class="panel__title">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="panel__subtitle">{{ subtitle() }}</p>
        }
      </div>
      <div class="panel__actions"><ng-content select="[panel-actions]" /></div>
    </header>
    <div [class]="'panel__body--' + layout()"><ng-content /></div>
  `,
})
export class SectionPanelComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly icon = input.required<IconName>();
  readonly tone = input<ChipTone>('green');
  /** `grid`: figure cards side by side; `stack`: free content in a column. */
  readonly layout = input<'grid' | 'stack'>('grid');
}
