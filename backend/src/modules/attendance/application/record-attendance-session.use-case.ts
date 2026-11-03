import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { AttendanceAction, attendanceAuditEntry } from './attendance-audit.js';
import {
  assertMeetingType,
  assertSessionDate,
  normalizeCounts,
} from './attendance-rules.js';
import {
  type AttendanceCountRecord,
  type AttendanceSessionRecord,
  sessionTotal,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';

export interface RecordAttendanceCommand {
  readonly congregationId: number;
  readonly meetingTypeCode: string;
  readonly sessionDate: string;
  readonly attendanceCounts: readonly AttendanceCountRecord[];
}

export const DUPLICATE_SESSION = 'DUPLICATE_SESSION';

/**
 * Records the headcount of one meeting. There is one session per sede, meeting type and date:
 * a second one is a conflict and the existing one is corrected instead.
 */
@Injectable()
export class RecordAttendanceSession {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    command: RecordAttendanceCommand,
  ): Promise<AttendanceSessionRecord> {
    const scope = tenant.congregationScope(command.congregationId);
    const congregation = await this.repository.findCongregation(
      scope,
      command.congregationId,
    );
    if (!congregation) {
      throw new NotFoundDomainException(
        'La sede no existe o no pertenece a tu alcance.',
      );
    }

    const [meetingTypes, categories] = await Promise.all([
      this.repository.listMeetingTypes(),
      this.repository.listCategories(),
    ]);
    const meetingType = assertMeetingType(
      command.meetingTypeCode,
      meetingTypes,
    );
    assertSessionDate(command.sessionDate, this.clock.today());
    const attendanceCounts = normalizeCounts(
      command.attendanceCounts,
      categories,
    );

    const existing = await this.repository.findByKey(scope, {
      congregationId: congregation.id,
      meetingTypeCode: meetingType.code,
      sessionDate: command.sessionDate,
    });
    if (existing) {
      throw new ConflictDomainException(
        `Ya existe una sesión de ${meetingType.name} en ${congregation.name} para esa fecha. Puedes cargarla y corregirla.`,
        DUPLICATE_SESSION,
      );
    }

    return this.transactions.run(async (transaction) => {
      const created = await this.repository.create(
        scope,
        {
          congregationId: congregation.id,
          meetingTypeCode: meetingType.code,
          sessionDate: command.sessionDate,
          attendanceCounts,
          recordedById: tenant.userId,
          recordedAt: this.clock.now(),
        },
        transaction,
      );
      await this.audit.record(
        attendanceAuditEntry(tenant, AttendanceAction.recorded, created, {
          before: null,
          after: sessionTotal(attendanceCounts),
        }),
        transaction,
      );
      return created;
    });
  }
}
