import type { DateRange } from '../dashboard.types.js';
import type { StatsScope } from './dashboard-stats.reader.js';

export const DASHBOARD_OPERATIONS_READER = Symbol(
  'DASHBOARD_OPERATIONS_READER',
);

export interface MemberCounts {
  readonly active: number;
  /** Members whose join date falls in the range. */
  readonly joinedInRange: number;
  /** Members whose join date falls in the comparison range. */
  readonly joinedInPrevious: number;
}

export interface LatestAttendance {
  readonly sessionDate: string;
  readonly meetingTypeName: string;
  readonly headcount: number;
}

/**
 * Counts of the secretariat areas for the dashboard. Every method reads inside the denomination (and the
 * congregation, when the scope has one); the platform scope never reaches this port.
 */
export interface DashboardOperationsReader {
  countMembers(
    scope: StatsScope,
    range: DateRange,
    previous: DateRange,
  ): Promise<MemberCounts>;
  /** Applications waiting for a decision (pending or in review). */
  countOpenApplications(scope: StatsScope): Promise<number>;
  countCertificatesIssued(scope: StatsScope, range: DateRange): Promise<number>;
  /** Valid cards that expire from `today` to `until`, both inclusive. */
  countCardsExpiring(
    scope: StatsScope,
    today: string,
    until: string,
  ): Promise<number>;
  /** Attendance sessions recorded in the range. */
  countAttendanceSessions(scope: StatsScope, range: DateRange): Promise<number>;
  /** Most recent session with its total headcount, or null when none was recorded. */
  latestAttendance(scope: StatsScope): Promise<LatestAttendance | null>;
}
