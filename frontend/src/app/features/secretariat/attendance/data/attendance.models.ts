// Attendance, mirroring AttendanceSession and AttendanceCount of
// backend/prisma/schema/secretariat.prisma. Meeting types and categories are global catalogs
// (MEETING_TYPES, ATTENDANCE_CATEGORIES): the frontend references them by code.

export interface AttendanceCount {
  readonly categoryCode: string;
  readonly headcount: number;
}

export interface AttendanceSession {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  /** ISO date (yyyy-MM-dd). */
  readonly sessionDate: string;
  readonly attendanceCounts: readonly AttendanceCount[];
  /** Display name of the user who recorded it, resolved from the audit log by the API. */
  readonly recordedBy: string | null;
  readonly recordedAt: string;
}

/** A sede the active scope can record attendance for. */
export interface AttendanceCongregation {
  readonly id: number;
  readonly name: string;
}

export interface AttendanceHistoryQuery {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  /** Most recent sessions to return. */
  readonly limit: number;
}

export interface AttendanceHistory {
  /** Most recent first. */
  readonly sessions: readonly AttendanceSession[];
  /** Sessions recorded for the sede and meeting type. */
  readonly total: number;
}

export interface AttendanceSessionKey {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  readonly sessionDate: string;
}

export interface AttendanceSessionInput extends AttendanceSessionKey {
  readonly attendanceCounts: readonly AttendanceCount[];
}

export const MAX_HEADCOUNT = 2000;
export const HISTORY_SIZE = 8;

export function sessionTotal(session: Pick<AttendanceSession, 'attendanceCounts'>): number {
  return session.attendanceCounts.reduce((sum, count) => sum + count.headcount, 0);
}

export function headcountOf(session: Pick<AttendanceSession, 'attendanceCounts'>, categoryCode: string): number {
  return session.attendanceCounts.find((count) => count.categoryCode === categoryCode)?.headcount ?? 0;
}

/** Today in the local time zone as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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
