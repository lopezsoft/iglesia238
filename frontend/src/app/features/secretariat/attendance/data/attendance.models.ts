// Attendance (D-03), mirroring the `/api/attendance-sessions` contract. Meeting types, categories
// and the sedes of the active scope come from the API (`options`), never from constants.

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
}

export interface NamedOption {
  readonly id: number;
  readonly name: string;
}

export interface AttendanceCount {
  readonly categoryCode: string;
  readonly headcount: number;
}

export interface AttendanceSession {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly meetingTypeCode: string;
  readonly meetingTypeName: string;
  /** ISO date (yyyy-MM-dd). */
  readonly sessionDate: string;
  readonly attendanceCounts: readonly AttendanceCount[];
  readonly total: number;
  /** Display name of the user who recorded or last corrected it. */
  readonly recordedBy: string | null;
  readonly recordedAt: string;
}

/** What the form needs before it renders. `today` is the server date (Bogotá). */
export interface AttendanceOptions {
  readonly congregations: readonly NamedOption[];
  readonly meetingTypes: readonly CatalogEntry[];
  readonly categories: readonly CatalogEntry[];
  readonly today: string;
  readonly maxHeadcount: number;
}

export interface AttendanceFilter {
  readonly congregationId?: number | null;
  readonly meetingTypeCode?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
}

export interface AttendanceListQuery extends AttendanceFilter {
  readonly page: number;
  readonly pageSize: number;
}

export type AttendanceGrouping = 'month' | 'year';

export interface AttendanceStatsQuery extends AttendanceFilter {
  readonly groupBy: AttendanceGrouping;
}

export interface AttendanceSeriesPoint {
  /** `YYYY-MM` or `YYYY`. */
  readonly period: string;
  readonly sessions: number;
  readonly total: number;
  readonly average: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

export interface AttendanceStats {
  readonly groupBy: AttendanceGrouping;
  readonly from: string;
  readonly to: string;
  readonly sessionCount: number;
  readonly series: readonly AttendanceSeriesPoint[];
  readonly average: number;
  readonly max: { readonly sessionDate: string; readonly total: number } | null;
  readonly yearOverYear: {
    readonly year: number;
    readonly previousYear: number;
    readonly average: number | null;
    readonly previousAverage: number | null;
    readonly changePercent: number | null;
  };
}

export interface AttendanceSessionKey {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  readonly sessionDate: string;
}

export interface AttendanceSessionInput extends AttendanceSessionKey {
  readonly attendanceCounts: readonly AttendanceCount[];
}

export const HISTORY_PAGE_SIZE = 10;
export const TREND_SESSIONS = 12;

export function sessionTotal(session: {
  readonly attendanceCounts: readonly AttendanceCount[];
}): number {
  return session.attendanceCounts.reduce((sum, count) => sum + count.headcount, 0);
}

export function headcountOf(
  session: { readonly attendanceCounts: readonly AttendanceCount[] },
  categoryCode: string,
): number {
  return (
    session.attendanceCounts.find((count) => count.categoryCode === categoryCode)?.headcount ?? 0
  );
}

/** Day of the week of an ISO date (0 = Sunday), independent of the time zone. */
export function weekdayOf(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export const WEEKDAY_NAMES: readonly string[] = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const MONTH_NAMES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "oct 2026" for `2026-10`, "2026" for `2026`. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-');
  return month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : year;
}
