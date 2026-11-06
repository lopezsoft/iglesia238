import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A total not saved yet, drawn as a dashed bar next to the saved ones. */
export interface AttendanceDraft {
  readonly label: string;
  readonly total: number;
}

export interface TrendPoint {
  readonly key: string;
  readonly label: string;
  readonly total: number;
}

interface TrendBar extends TrendPoint {
  readonly height: number;
  readonly isDraft: boolean;
}

const MIN_BAR_PERCENT = 3;

/** Totals as CSS bars, backed by an accessible table. Points go oldest first. */
@Component({
  selector: 'app-attendance-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.title]': 'null' },
  templateUrl: './attendance-trend.component.html',
  styleUrl: './attendance-trend.component.scss',
})
export class AttendanceTrendComponent {
  readonly points = input.required<readonly TrendPoint[]>();
  readonly draft = input<AttendanceDraft | null>(null);
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly unit = input('asistentes');

  protected readonly average = computed(() => {
    const points = this.points();
    return points.length
      ? Math.round(points.reduce((sum, p) => sum + p.total, 0) / points.length)
      : 0;
  });

  protected readonly maximum = computed(() =>
    this.points().reduce<{ total: number; label: string | null }>(
      (best, point) =>
        point.total > best.total ? { total: point.total, label: point.label } : best,
      { total: 0, label: null },
    ),
  );

  /** Draft total minus the latest saved point. */
  protected readonly delta = computed(() => {
    const draft = this.draft();
    const latest = this.points().at(-1);
    return draft && latest ? { value: draft.total - latest.total, against: latest.label } : null;
  });

  protected readonly bars = computed<TrendBar[]>(() => {
    const draft = this.draft();
    const all = [
      ...this.points().map((point) => ({ ...point, isDraft: false })),
      ...(draft ? [{ key: 'draft', label: draft.label, total: draft.total, isDraft: true }] : []),
    ];
    const scale = Math.max(1, ...all.map((point) => point.total));
    return all.map((point) => ({
      ...point,
      height: Math.max(MIN_BAR_PERCENT, (point.total / scale) * 100),
    }));
  });
}
