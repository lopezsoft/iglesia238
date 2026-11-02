import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AttendanceSession, sessionTotal } from '../data/attendance.models';

/** A total not saved yet, drawn as a dashed bar next to the history. */
export interface AttendanceDraft {
  readonly sessionDate: string;
  readonly total: number;
}

interface TrendPoint {
  readonly sessionDate: string;
  readonly total: number;
  readonly height: number;
  readonly isDraft: boolean;
}

const MIN_BAR_PERCENT = 3;

/** Totals of the last sessions as CSS bars, backed by an accessible table. */
@Component({
  selector: 'app-attendance-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './attendance-trend.component.html',
  styleUrl: './attendance-trend.component.scss',
})
export class AttendanceTrendComponent {
  /** Most recent first, as the history returns them. */
  readonly sessions = input.required<readonly AttendanceSession[]>();
  readonly draft = input<AttendanceDraft | null>(null);
  readonly meetingTypeName = input.required<string>();

  private readonly chronological = computed(() =>
    [...this.sessions()].reverse().map((session) => ({
      sessionDate: session.sessionDate,
      total: sessionTotal(session),
    })),
  );

  protected readonly average = computed(() => {
    const points = this.chronological();
    return points.length ? Math.round(points.reduce((sum, p) => sum + p.total, 0) / points.length) : 0;
  });

  protected readonly maximum = computed(() =>
    this.chronological().reduce<{ total: number; sessionDate: string | null }>(
      (best, point) => (point.total > best.total ? point : best),
      { total: 0, sessionDate: null },
    ),
  );

  /** Draft total minus the latest saved session. */
  protected readonly delta = computed(() => {
    const draft = this.draft();
    const latest = this.sessions()[0];
    return draft && latest ? { value: draft.total - sessionTotal(latest), against: latest.sessionDate } : null;
  });

  protected readonly points = computed<TrendPoint[]>(() => {
    const draft = this.draft();
    const all = [
      ...this.chronological().map((point) => ({ ...point, isDraft: false })),
      ...(draft ? [{ ...draft, isDraft: true }] : []),
    ];
    const scale = Math.max(1, ...all.map((point) => point.total));
    return all.map((point) => ({
      ...point,
      height: Math.max(MIN_BAR_PERCENT, (point.total / scale) * 100),
    }));
  });
}
