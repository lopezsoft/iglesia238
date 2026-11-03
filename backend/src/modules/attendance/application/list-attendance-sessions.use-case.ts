import { Inject, Injectable } from '@nestjs/common';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type { Page } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type {
  AttendanceFilter,
  AttendanceSessionRecord,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';

export interface ListAttendanceQuery extends AttendanceFilter {
  readonly page: number;
  readonly pageSize: number;
}

/** Narrows the scope to the requested sede (404 when it is outside the scope) and validates the dates. */
export function scopeForFilter(
  tenant: TenantContext,
  filter: AttendanceFilter,
) {
  for (const date of [filter.from, filter.to]) {
    if (date !== undefined && !isIsoDate(date)) {
      throw new InvalidInputException('Indica fechas válidas (aaaa-mm-dd).');
    }
  }
  if (filter.from && filter.to && filter.to < filter.from) {
    throw new InvalidInputException(
      'La fecha final no puede ser anterior a la inicial.',
      'INVALID_RANGE',
    );
  }
  return filter.congregationId === undefined
    ? tenant.tenantScope()
    : tenant.congregationScope(filter.congregationId);
}

/** Sessions of the scope, most recent first, with server-side paging. */
@Injectable()
export class ListAttendanceSessions {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ListAttendanceQuery,
  ): Promise<Page<AttendanceSessionRecord>> {
    const { page, pageSize, ...filter } = query;
    return this.repository.list(scopeForFilter(tenant, filter), filter, {
      page,
      pageSize,
    });
  }
}
