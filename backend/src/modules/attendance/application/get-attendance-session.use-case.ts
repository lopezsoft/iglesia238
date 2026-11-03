import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { AttendanceSessionRecord } from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';

export const SESSION_NOT_FOUND = 'SESSION_NOT_FOUND';

export function sessionNotFound(): NotFoundDomainException {
  return new NotFoundDomainException(
    'La sesión no existe o no pertenece a tu alcance.',
    SESSION_NOT_FOUND,
  );
}

/** One session by id. A session of another sede or denomination does not exist for the caller. */
@Injectable()
export class GetAttendanceSession {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
  ): Promise<AttendanceSessionRecord> {
    const session = await this.repository.findById(tenant.tenantScope(), id);
    if (!session) {
      throw sessionNotFound();
    }
    return session;
  }
}

export interface AttendanceSessionKeyQuery {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  readonly sessionDate: string;
}

/** The session recorded for a sede, meeting type and date (the screen uses it to correct a duplicate). */
@Injectable()
export class FindAttendanceSessionByKey {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    key: AttendanceSessionKeyQuery,
  ): Promise<AttendanceSessionRecord> {
    if (!isIsoDate(key.sessionDate)) {
      throw new InvalidInputException(
        'Selecciona una fecha válida.',
        'INVALID_DATE',
      );
    }
    const scope = tenant.congregationScope(key.congregationId);
    const session = await this.repository.findByKey(scope, key);
    if (!session) {
      throw sessionNotFound();
    }
    return session;
  }
}
