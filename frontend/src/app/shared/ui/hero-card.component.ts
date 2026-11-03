import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, IconName } from './icon.component';
import { SparklineComponent } from './sparkline.component';

export interface HeroComparison {
  /** Short text of the chip: "+12 %", "-4 %" or "Sin comparativo". */
  readonly text: string;
  readonly tone: 'up' | 'down' | 'neutral';
}

/**
 * Gradient card that headlines the page: eyebrow, title, the main figure, how it compares with
 * the previous period and a sparkline. Controls (period, congregation, refresh) go in
 * `[hero-controls]`. Pass an empty `series` when the API has no history: the chart is hidden
 * instead of inventing values.
 */
@Component({
  selector: 'app-hero-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SparklineComponent],
  styleUrl: './hero-card.component.scss',
  template: `
    <div class="hero__body">
      <span class="hero__eyebrow">
        <app-icon [name]="eyebrowIcon()" [size]="12" />
        {{ eyebrow() }}
      </span>
      <h2 class="hero__title">{{ title() }}</h2>
      <div class="hero__figure">
        <span class="hero__label">{{ label() }}</span>
        <span class="hero__value">{{ value() }}</span>
        @if (comparison(); as compare) {
          <div class="hero__compare">
            <span
              class="hero__chip"
              [class.hero__chip--up]="compare.tone === 'up'"
              [class.hero__chip--down]="compare.tone === 'down'"
              [class.hero__chip--neutral]="compare.tone === 'neutral'"
            >
              @if (compare.tone !== 'neutral') {
                <app-icon [name]="compare.tone === 'up' ? 'trending-up' : 'trending-down'" [size]="12" />
              }
              {{ compare.text }}
            </span>
            @if (compareLabel()) {
              <span class="hero__compare-label">{{ compareLabel() }}</span>
            }
          </div>
        }
        @if (date()) {
          <span class="hero__date"><app-icon name="calendar" [size]="12" />{{ date() }}</span>
        }
      </div>
    </div>
    <div class="hero__controls"><ng-content select="[hero-controls]" /></div>
    @if (series().length > 1) {
      <app-sparkline class="hero__chart" [series]="series()" />
    }
  `,
})
export class HeroCardComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input.required<string>();
  readonly eyebrowIcon = input<IconName>('zap');
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly comparison = input<HeroComparison | null>(null);
  readonly compareLabel = input<string | null>(null);
  readonly date = input<string | null>(null);
  readonly series = input<readonly number[]>([]);
}
