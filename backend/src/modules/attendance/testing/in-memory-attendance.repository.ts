import { type Page, buildPage } from '../../../common/pagination/page.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  type AttendanceCountsUpdate,
  type AttendanceFilter,
  type AttendanceSessionRecord,
  type CatalogEntry,
  type NamedOption,
  type NewAttendanceSession,
  sessionTotal,
} from '../application/attendance.models.js';
import type { AttendanceRepository } from '../application/attendance.repository.js';

export const MEETING_TYPES: CatalogEntry[] = [
  { code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' },
  { code: 'PRAYER_MEETING', name: 'Reunión de oración' },
];

export const CATEGORIES: CatalogEntry[] = [
  { code: 'CHILDREN', name: 'Niños' },
  { code: 'TEENAGERS', name: 'Adolescentes' },
  { code: 'WOMEN', name: 'Hermanas' },
  { code: 'MEN', name: 'Hermanos' },
  { code: 'VISITORS', name: 'Visitas' },
];

/** Congregations of the fake world: 10 and 11 belong to denomination 1, 20 to denomination 2. */
export const CONGREGATIONS: (NamedOption & { denominationId: number })[] = [
  { id: 10, denominationId: 1, name: 'Sede Central' },
  { id: 11, denominationId: 1, name: 'Sede Norte' },
  { id: 20, denominationId: 2, name: 'Sede Vida Nueva' },
];

function inScope(
  scope: TenantScope,
  row: { denominationId: number; congregationId: number },
): boolean {
  return (
    row.denominationId === scope.denominationId &&
    (scope.congregationId === null ||
      row.congregationId === scope.congregationId)
  );
}

function matches(row: AttendanceSessionRecord, filter: AttendanceFilter) {
  return (
    (filter.meetingTypeCode === undefined ||
      row.meetingTypeCode === filter.meetingTypeCode) &&
    (filter.from === undefined || row.sessionDate >= filter.from) &&
    (filter.to === undefined || row.sessionDate <= filter.to)
  );
}

/** In-memory port that honors the tenant scope exactly like the SQL adapter does. */
export class InMemoryAttendanceRepository implements AttendanceRepository {
  readonly sessions: AttendanceSessionRecord[] = [];
  private nextId = 1;

  listMeetingTypes(): Promise<CatalogEntry[]> {
    return Promise.resolve([...MEETING_TYPES]);
  }

  listCategories(): Promise<CatalogEntry[]> {
    return Promise.resolve([...CATEGORIES]);
  }

  listCongregations(scope: TenantScope): Promise<NamedOption[]> {
    return Promise.resolve(
      CONGREGATIONS.filter((c) =>
        inScope(scope, {
          denominationId: c.denominationId,
          congregationId: c.id,
        }),
      ).map(({ id, name }) => ({ id, name })),
    );
  }

  async findCongregation(
    scope: TenantScope,
    id: number,
  ): Promise<NamedOption | null> {
    const found = (await this.listCongregations(scope)).find(
      (c) => c.id === id,
    );
    return found ?? null;
  }

  findById(
    scope: TenantScope,
    id: number,
  ): Promise<AttendanceSessionRecord | null> {
    return Promise.resolve(
      this.sessions.find((row) => row.id === id && inScope(scope, row)) ?? null,
    );
  }

  findByKey(
    scope: TenantScope,
    key: {
      congregationId: number;
      meetingTypeCode: string;
      sessionDate: string;
    },
  ): Promise<AttendanceSessionRecord | null> {
    return Promise.resolve(
      this.sessions.find(
        (row) =>
          inScope(scope, row) &&
          row.congregationId === key.congregationId &&
          row.meetingTypeCode === key.meetingTypeCode &&
          row.sessionDate === key.sessionDate,
      ) ?? null,
    );
  }

  list(
    scope: TenantScope,
    filter: AttendanceFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<AttendanceSessionRecord>> {
    const rows = this.sessions
      .filter((row) => inScope(scope, row) && matches(row, filter))
      .sort(
        (a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.id - a.id,
      );
    const start = (page.page - 1) * page.pageSize;
    return Promise.resolve(
      buildPage(rows.slice(start, start + page.pageSize), rows.length, page),
    );
  }

  listAll(
    scope: TenantScope,
    filter: AttendanceFilter,
    limit: number,
  ): Promise<AttendanceSessionRecord[]> {
    return Promise.resolve(
      this.sessions
        .filter((row) => inScope(scope, row) && matches(row, filter))
        .sort(
          (a, b) => a.sessionDate.localeCompare(b.sessionDate) || a.id - b.id,
        )
        .slice(0, limit),
    );
  }

  create(
    scope: TenantScope,
    data: NewAttendanceSession,
  ): Promise<AttendanceSessionRecord> {
    const congregation = CONGREGATIONS.find(
      (c) => c.id === data.congregationId,
    );
    const meetingType = MEETING_TYPES.find(
      (t) => t.code === data.meetingTypeCode,
    );
    const record: AttendanceSessionRecord = {
      id: this.nextId++,
      denominationId: scope.denominationId,
      congregationId: data.congregationId,
      congregationName: congregation?.name ?? '',
      meetingTypeCode: data.meetingTypeCode,
      meetingTypeName: meetingType?.name ?? '',
      sessionDate: data.sessionDate,
      attendanceCounts: data.attendanceCounts,
      total: sessionTotal(data.attendanceCounts),
      recordedBy: `Usuario ${data.recordedById}`,
      recordedAt: data.recordedAt.toISOString(),
    };
    this.sessions.push(record);
    return Promise.resolve(record);
  }

  replaceCounts(
    scope: TenantScope,
    id: number,
    data: AttendanceCountsUpdate,
  ): Promise<AttendanceSessionRecord> {
    const index = this.sessions.findIndex(
      (row) => row.id === id && inScope(scope, row),
    );
    const updated: AttendanceSessionRecord = {
      ...this.sessions[index],
      attendanceCounts: data.attendanceCounts,
      total: sessionTotal(data.attendanceCounts),
      recordedBy: `Usuario ${data.recordedById}`,
      recordedAt: data.recordedAt.toISOString(),
    };
    this.sessions[index] = updated;
    return Promise.resolve(updated);
  }

  delete(scope: TenantScope, id: number): Promise<void> {
    const index = this.sessions.findIndex(
      (row) => row.id === id && inScope(scope, row),
    );
    this.sessions.splice(index, 1);
    return Promise.resolve();
  }

  /** Test helper: stores a session of any tenant. */
  seed(
    denominationId: number,
    congregationId: number,
    sessionDate: string,
    headcounts: readonly number[],
    meetingTypeCode = 'SUNDAY_SCHOOL',
  ): AttendanceSessionRecord {
    const attendanceCounts = CATEGORIES.map((category, index) => ({
      categoryCode: category.code,
      headcount: headcounts[index] ?? 0,
    }));
    const record: AttendanceSessionRecord = {
      id: this.nextId++,
      denominationId,
      congregationId,
      congregationName:
        CONGREGATIONS.find((c) => c.id === congregationId)?.name ?? '',
      meetingTypeCode,
      meetingTypeName:
        MEETING_TYPES.find((t) => t.code === meetingTypeCode)?.name ?? '',
      sessionDate,
      attendanceCounts,
      total: sessionTotal(attendanceCounts),
      recordedBy: 'Marta Castillo',
      recordedAt: `${sessionDate}T17:40:00.000Z`,
    };
    this.sessions.push(record);
    return record;
  }
}
