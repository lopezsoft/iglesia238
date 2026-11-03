import type { Page } from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type {
  AttendanceCountsUpdate,
  AttendanceFilter,
  AttendanceSessionRecord,
  CatalogEntry,
  NamedOption,
  NewAttendanceSession,
} from './attendance.models.js';

export const ATTENDANCE_REPOSITORY = Symbol('ATTENDANCE_REPOSITORY');

/**
 * Persistence port of the attendance module. Every method that touches tenant data receives a
 * TenantScope: the denomination always filters, and the congregation too when the scope has one.
 */
export interface AttendanceRepository {
  /** Global catalogs, in the order the screens show them. */
  listMeetingTypes(): Promise<CatalogEntry[]>;
  listCategories(): Promise<CatalogEntry[]>;

  /** Active congregations of the scope (the one of a congregation scope, all of a denomination one). */
  listCongregations(scope: TenantScope): Promise<NamedOption[]>;
  findCongregation(scope: TenantScope, id: number): Promise<NamedOption | null>;

  findById(
    scope: TenantScope,
    id: number,
  ): Promise<AttendanceSessionRecord | null>;
  findByKey(
    scope: TenantScope,
    key: {
      congregationId: number;
      meetingTypeCode: string;
      sessionDate: string;
    },
  ): Promise<AttendanceSessionRecord | null>;

  /** Most recent first. */
  list(
    scope: TenantScope,
    filter: AttendanceFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<AttendanceSessionRecord>>;
  /** Oldest first, up to `limit` rows: for exports and statistics. */
  listAll(
    scope: TenantScope,
    filter: AttendanceFilter,
    limit: number,
  ): Promise<AttendanceSessionRecord[]>;

  create(
    scope: TenantScope,
    data: NewAttendanceSession,
    transaction: Transaction,
  ): Promise<AttendanceSessionRecord>;
  replaceCounts(
    scope: TenantScope,
    id: number,
    data: AttendanceCountsUpdate,
    transaction: Transaction,
  ): Promise<AttendanceSessionRecord>;
  delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void>;
}
