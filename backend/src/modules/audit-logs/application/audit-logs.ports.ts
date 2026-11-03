export const AUDIT_LOG_READER = Symbol('AUDIT_LOG_READER');

/** Whose entries a viewer may read: everything (platform), one denomination, or one sede of it. */
export interface AuditScope {
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export interface AuditSearch {
  /** Inclusive lower bound (instant). */
  readonly from: Date | null;
  /** Inclusive upper bound (instant). */
  readonly to: Date | null;
  readonly userId: number | null;
  readonly action: string | null;
  readonly entity: string | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface AuditRow {
  readonly id: number;
  readonly createdAt: Date;
  readonly userId: number | null;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  /** `{ field: { from, to } }` as the recorder wrote it. */
  readonly changes: unknown;
  /** Complete in the database; masked before it leaves the application layer. */
  readonly ipAddress: string | null;
}

export interface AuditUserRef {
  readonly name: string;
  readonly isPlatformAdmin: boolean;
}

export interface AuditLogReader {
  search(
    scope: AuditScope,
    search: AuditSearch,
  ): Promise<{
    rows: AuditRow[];
    total: number;
    /** Entries per action over the WHOLE filtered result, not just the page. */
    actionCounts: ReadonlyMap<string, number>;
  }>;
  /** Names of the users that appear in a page, in one query. */
  findUsers(ids: readonly number[]): Promise<ReadonlyMap<number, AuditUserRef>>;
  /** Names of the sedes that appear in a page, in one query. */
  findCongregationNames(
    ids: readonly number[],
  ): Promise<ReadonlyMap<number, string>>;
  /** Distinct users, actions and entities with entries in scope since the given instant. */
  findFilterValues(
    scope: AuditScope,
    since: Date,
  ): Promise<{ userIds: number[]; actions: string[]; entities: string[] }>;
}
