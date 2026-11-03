import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { toCsvDocument } from '../../../common/export/csv-document.js';
import {
  type AttendanceFilter,
  MAX_SESSIONS_PER_QUERY,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';
import { scopeForFilter } from './list-attendance-sessions.use-case.js';

export interface AttendanceExport {
  readonly fileName: string;
  readonly content: string;
}

/** CSV of every session that matches the filter, most recent first. */
@Injectable()
export class ExportAttendanceSessions {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    filter: AttendanceFilter,
  ): Promise<AttendanceExport> {
    const scope = scopeForFilter(tenant, filter);
    const [categories, sessions] = await Promise.all([
      this.repository.listCategories(),
      this.repository.listAll(scope, filter, MAX_SESSIONS_PER_QUERY),
    ]);

    const header = [
      'Fecha',
      'Sede',
      'Reunión',
      ...categories.map((category) => category.name),
      'Total',
      'Registrado por',
    ];
    const rows = [...sessions]
      .reverse()
      .map((session) => [
        session.sessionDate,
        session.congregationName,
        session.meetingTypeName,
        ...categories.map(
          (category) =>
            session.attendanceCounts.find(
              (count) => count.categoryCode === category.code,
            )?.headcount ?? 0,
        ),
        session.total,
        session.recordedBy ?? 'Registro histórico',
      ]);

    // Defense in depth: the filter is validated at the edge, but the name ends up in a response header.
    const suffix =
      (filter.meetingTypeCode ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '') ||
      'todas';
    return {
      fileName: `asistencia-${suffix}.csv`,
      content: toCsvDocument(header, rows),
    };
  }
}
