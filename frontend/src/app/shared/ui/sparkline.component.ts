import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextId = 0;

const WIDTH = 200;
const HEIGHT = 60;
const PADDING = 4;

/**
 * Minimal area chart for a series of numbers (oldest first). Decorative: the figure it
 * illustrates is always printed next to it. Draws nothing for fewer than two points.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.sparkline--primary]': 'tone() === "primary"' },
  styles: `
    @use 'tokens' as *;

    :host {
      display: block;
      color: $color-on-brand;
    }

    :host(.sparkline--primary) {
      color: $color-primary;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `,
  template: `
    @if (geometry(); as shape) {
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.35" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path [attr.d]="shape.area" [attr.fill]="'url(#' + gradientId + ')'" />
        <path
          [attr.d]="shape.line"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    }
  `,
})
export class SparklineComponent {
  readonly series = input.required<readonly number[]>();
  readonly tone = input<'on-brand' | 'primary'>('on-brand');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly gradientId = `app-sparkline-${nextId++}`;
  protected readonly geometry = computed(() => buildGeometry(this.series()));
}

/** Smooth line (midpoint quadratic curves) and the closed area under it. */
function buildGeometry(series: readonly number[]): { line: string; area: string } | null {
  if (series.length < 2) {
    return null;
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = (WIDTH - PADDING * 2) / (series.length - 1);
  const points = series.map((value, index) => ({
    x: PADDING + index * step,
    y: PADDING + (1 - (value - min) / range) * (HEIGHT - PADDING * 2),
  }));

  let line = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;
    line += ` C${midX.toFixed(2)} ${previous.y.toFixed(2)} ${midX.toFixed(2)} ${current.y.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${HEIGHT} L${points[0].x.toFixed(2)} ${HEIGHT} Z`;
  return { line, area };
}
