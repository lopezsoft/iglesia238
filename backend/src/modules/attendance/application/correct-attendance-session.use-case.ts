import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { AttendanceAction, attendanceAuditEntry } from './attendance-audit.js';
import { normalizeCounts } from './attendance-rules.js';
import {
  type AttendanceCountRecord,
  type AttendanceSessionRecord,
  sessionTotal,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';
import { sessionNotFound } from './get-attendance-session.use-case.js';

/** Corrects the headcounts of a session. Date, sede and meeting type never change. */
@Injectable()
export class CorrectAttendanceSession {
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
    id: number,
    counts: readonly AttendanceCountRecord[],
  ): Promise<AttendanceSessionRecord> {
    const scope = tenant.tenantScope();
    const current = await this.repository.findById(scope, id);
    if (!current) {
      throw sessionNotFound();
    }
    const attendanceCounts = normalizeCounts(
      counts,
      await this.repository.listCategories(),
    );

    return this.transactions.run(async (transaction) => {
      const updated = await this.repository.replaceCounts(
        scope,
        id,
        {
          attendanceCounts,
          recordedById: tenant.userId,
          recordedAt: this.clock.now(),
        },
        transaction,
      );
      await this.audit.record(
        attendanceAuditEntry(tenant, AttendanceAction.updated, updated, {
          before: current.total,
          after: sessionTotal(attendanceCounts),
        }),
        transaction,
      );
      return updated;
    });
  }
}
