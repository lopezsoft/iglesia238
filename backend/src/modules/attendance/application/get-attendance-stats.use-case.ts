import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  type AttendanceFilter,
  type AttendanceSessionRecord,
  MAX_SESSIONS_PER_QUERY,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';
import { scopeForFilter } from './list-attendance-sessions.use-case.js';

export type AttendanceGrouping = 'month' | 'year';

export interface AttendanceStatsQuery extends AttendanceFilter {
  readonly groupBy: AttendanceGrouping;
}

export interface AttendanceSeriesPoint {
  /** `YYYY-MM` or `YYYY`. */
  readonly period: string;
  readonly sessions: number;
  readonly total: number;
  /** Average headcount per session in the period. */
  readonly average: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

export interface AttendanceYearComparison {
  /** Year of the `to` date (today when absent) and the one before. */
  readonly year: number;
  readonly previousYear: number;
  readonly average: number | null;
  readonly previousAverage: number | null;
  /** Relative change of the yearly average; null when there is no previous year to compare with. */
  readonly changePercent: number | null;
}

export interface AttendanceStats {
  readonly groupBy: AttendanceGrouping;
  readonly from: string;
  readonly to: string;
  readonly sessionCount: number;
  readonly series: readonly AttendanceSeriesPoint[];
  readonly average: number;
  readonly max: { sessionDate: string; total: number } | null;
  readonly yearOverYear: AttendanceYearComparison;
}

const MONTHS_BY_DEFAULT = 12;
const YEARS_BY_DEFAULT = 5;

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function defaultFrom(to: string, groupBy: AttendanceGrouping): string {
  const year = Number(to.slice(0, 4));
  const month = Number(to.slice(5, 7));
  if (groupBy === 'year') {
    return `${year - (YEARS_BY_DEFAULT - 1)}-01-01`;
  }
  const index = year * 12 + (month - 1) - (MONTHS_BY_DEFAULT - 1);
  const fromYear = Math.floor(index / 12);
  const fromMonth = (index % 12) + 1;
  return `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
}

function periodOf(
  session: AttendanceSessionRecord,
  groupBy: AttendanceGrouping,
) {
  return session.sessionDate.slice(0, groupBy === 'year' ? 4 : 7);
}

function averageOf(
  sessions: readonly AttendanceSessionRecord[],
): number | null {
  if (sessions.length === 0) {
    return null;
  }
  return round(
    sessions.reduce((sum, session) => sum + session.total, 0) / sessions.length,
  );
}

/** Totals by month or year, the best session and the comparison with the previous year. */
@Injectable()
export class GetAttendanceStats {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    query: AttendanceStatsQuery,
  ): Promise<AttendanceStats> {
    const { groupBy, ...filter } = query;
    const scope = scopeForFilter(tenant, filter);
    const to = filter.to ?? this.clock.today();
    const from = filter.from ?? defaultFrom(to, groupBy);

    const year = Number(to.slice(0, 4));
    const comparisonStart = `${year - 1}-01-01`;
    const rows = await this.repository.listAll(
      scope,
      {
        ...filter,
        from: from < comparisonStart ? from : comparisonStart,
        to,
      },
      MAX_SESSIONS_PER_QUERY,
    );

    const inRange = rows.filter(
      (session) => session.sessionDate >= from && session.sessionDate <= to,
    );
    const thisYear = rows.filter((session) =>
      session.sessionDate.startsWith(String(year)),
    );
    const lastYear = rows.filter((session) =>
      session.sessionDate.startsWith(String(year - 1)),
    );
    const average = averageOf(thisYear);
    const previousAverage = averageOf(lastYear);

    return {
      groupBy,
      from,
      to,
      sessionCount: inRange.length,
      series: this.buildSeries(inRange, groupBy),
      average: averageOf(inRange) ?? 0,
      max: this.bestSession(inRange),
      yearOverYear: {
        year,
        previousYear: year - 1,
        average,
        previousAverage,
        changePercent:
          average !== null && previousAverage !== null && previousAverage > 0
            ? round(((average - previousAverage) / previousAverage) * 100)
            : null,
      },
    };
  }

  private buildSeries(
    sessions: readonly AttendanceSessionRecord[],
    groupBy: AttendanceGrouping,
  ): AttendanceSeriesPoint[] {
    const periods = new Map<string, AttendanceSessionRecord[]>();
    for (const session of sessions) {
      const period = periodOf(session, groupBy);
      periods.set(period, [...(periods.get(period) ?? []), session]);
    }
    return [...periods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, group]) => {
        const byCategory: Record<string, number> = {};
        for (const session of group) {
          for (const count of session.attendanceCounts) {
            byCategory[count.categoryCode] =
              (byCategory[count.categoryCode] ?? 0) + count.headcount;
          }
        }
        const total = group.reduce((sum, session) => sum + session.total, 0);
        return {
          period,
          sessions: group.length,
          total,
          average: round(total / group.length),
          byCategory,
        };
      });
  }

  private bestSession(sessions: readonly AttendanceSessionRecord[]) {
    let best: AttendanceSessionRecord | null = null;
    for (const session of sessions) {
      if (best === null || session.total > best.total) {
        best = session;
      }
    }
    return best ? { sessionDate: best.sessionDate, total: best.total } : null;
  }
}
