import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TrendWidget } from '../data/dashboard.models';
import { formatWidgetValue } from '../data/widget-format';

/** The tallest bar is 100 %; a value of zero keeps a thin stub so the month is still visible. */
const MIN_BAR_PERCENT = 3;

/** Bar chart of a `trends` widget. Every bar prints its value, so the figures never depend on the height. */
@Component({
  selector: 'app-widget-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './widget-trend.component.scss',
  template: `
    <section class="card trend" [class]="'tone-' + widget().tone" [attr.aria-labelledby]="'widget-' + widget().key">
      <header class="trend__header">
        <h2 [id]="'widget-' + widget().key">{{ widget().title }}</h2>
        @if (widget().subtitle) {
          <p class="text-muted text-small">{{ widget().subtitle }}</p>
        }
      </header>
      <ol class="trend__chart">
        @for (bar of bars(); track bar.label; let last = $last) {
          <li class="trend__column" [class.trend__column--current]="last">
            <span class="trend__value">{{ bar.text }}</span>
            <span class="trend__track">
              <span class="trend__bar" [style.height.%]="bar.percent" aria-hidden="true"></span>
            </span>
            <span class="trend__label">{{ bar.label }}</span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class WidgetTrendComponent {
  readonly widget = input.required<TrendWidget>();

  protected readonly bars = computed(() => {
    const { points, format } = this.widget();
    const max = Math.max(...points.map((point) => point.value), 0);
    return points.map((point) => ({
      label: point.label,
      text: formatWidgetValue(point.value, format),
      percent: max > 0 ? Math.max((point.value / max) * 100, MIN_BAR_PERCENT) : MIN_BAR_PERCENT,
    }));
  });
}
