/** Largest headcount accepted per category: an application rule, the database only requires >= 0. */
export const MAX_HEADCOUNT = 2000;

/** Sessions an export or a statistics query reads at most. */
export const MAX_SESSIONS_PER_QUERY = 20_000;

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
}

export interface NamedOption {
  readonly id: number;
  readonly name: string;
}

export interface AttendanceCountRecord {
  readonly categoryCode: string;
  readonly headcount: number;
}

/** A recorded meeting as the API exposes it. Dates are ISO (`YYYY-MM-DD`, instants in UTC). */
export interface AttendanceSessionRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly meetingTypeCode: string;
  readonly meetingTypeName: string;
  readonly sessionDate: string;
  /** One entry per category of the catalog, in catalog order. */
  readonly attendanceCounts: readonly AttendanceCountRecord[];
  readonly total: number;
  readonly recordedBy: string | null;
  readonly recordedAt: string;
}

export interface AttendanceFilter {
  readonly congregationId?: number;
  readonly meetingTypeCode?: string;
  /** Inclusive, ISO date. */
  readonly from?: string;
  readonly to?: string;
}

export interface NewAttendanceSession {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  readonly sessionDate: string;
  readonly attendanceCounts: readonly AttendanceCountRecord[];
  readonly recordedById: number;
  readonly recordedAt: Date;
}

export interface AttendanceCountsUpdate {
  readonly attendanceCounts: readonly AttendanceCountRecord[];
  readonly recordedById: number;
  readonly recordedAt: Date;
}

export function sessionTotal(counts: readonly AttendanceCountRecord[]): number {
  return counts.reduce((sum, count) => sum + count.headcount, 0);
}
