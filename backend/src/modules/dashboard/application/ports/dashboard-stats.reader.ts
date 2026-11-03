import type { DateRange } from '../dashboard.types.js';

export const DASHBOARD_STATS_READER = Symbol('DASHBOARD_STATS_READER');

/** Where the figures are taken from: the whole platform, one denomination, or one congregation. */
export interface StatsScope {
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export interface UserCounts {
  /** Enabled accounts that already chose their password. */
  readonly active: number;
  /** Enabled accounts invited but waiting for their first password. */
  readonly pendingInvitations: number;
}

export interface DenominationCounts {
  readonly active: number;
  readonly inactive: number;
}

/** Counts of the platform and of access management. The platform scope sees everything. */
export interface DashboardStatsReader {
  countDenominations(): Promise<DenominationCounts>;
  /** Active congregations in the scope (the whole platform when it has no denomination). */
  countActiveCongregations(scope: StatsScope): Promise<number>;
  /**
   * Users with an active role that covers the scope. In the platform scope every user counts.
   * A denomination role covers its congregations.
   */
  countUsers(scope: StatsScope): Promise<UserCounts>;
  /** Accounts blocked at this moment by failed attempts. */
  countLockedAccounts(now: Date): Promise<number>;
}

/** Counts of the audit log, taken from the same scope rules as the audit screen. */
export const AUDIT_ACTIVITY_READER = Symbol('AUDIT_ACTIVITY_READER');

export interface RecentAuditRow {
  readonly id: number;
  readonly createdAt: Date;
  readonly action: string;
  readonly entity: string;
  /** Name of the person, "Sistema" when nobody did it. */
  readonly userName: string;
  /** Congregation, denomination or "Plataforma". */
  readonly scopeLabel: string;
}

export interface AuditActivityReader {
  countEvents(
    scope: StatsScope,
    range: DateRange,
    action?: string,
  ): Promise<number>;
  /** Events per Bogota day; one entry per requested day, 0 when there were none. */
  eventsPerDay(scope: StatsScope, days: readonly string[]): Promise<number[]>;
  /** Events per month for `months` (YYYY-MM) up to `until` inclusive; one entry per month. */
  eventsPerMonth(
    scope: StatsScope,
    months: readonly string[],
    until: string,
  ): Promise<number[]>;
  recent(scope: StatsScope, limit: number): Promise<RecentAuditRow[]>;
}
