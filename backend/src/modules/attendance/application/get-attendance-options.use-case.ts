import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  type CatalogEntry,
  MAX_HEADCOUNT,
  type NamedOption,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';

export interface AttendanceOptions {
  /** Sedes the active scope can record attendance for. */
  readonly congregations: readonly NamedOption[];
  readonly meetingTypes: readonly CatalogEntry[];
  readonly categories: readonly CatalogEntry[];
  /** Today in Bogota (ISO date): the latest date a session can have. */
  readonly today: string;
  readonly maxHeadcount: number;
}

/** What the attendance screen needs before it can render the form. */
@Injectable()
export class GetAttendanceOptions {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<AttendanceOptions> {
    const scope = tenant.tenantScope();
    const [congregations, meetingTypes, categories] = await Promise.all([
      this.repository.listCongregations(scope),
      this.repository.listMeetingTypes(),
      this.repository.listCategories(),
    ]);
    return {
      congregations,
      meetingTypes,
      categories,
      today: this.clock.today(),
      maxHeadcount: MAX_HEADCOUNT,
    };
  }
}
