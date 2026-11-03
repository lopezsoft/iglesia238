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
import { AttendanceAction, attendanceAuditEntry } from './attendance-audit.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';
import { sessionNotFound } from './get-attendance-session.use-case.js';

/** Removes a session recorded by mistake. The deletion stays in the audit log with the total it had. */
@Injectable()
export class DeleteAttendanceSession {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(tenant: TenantContext, id: number): Promise<void> {
    const scope = tenant.tenantScope();
    const current = await this.repository.findById(scope, id);
    if (!current) {
      throw sessionNotFound();
    }
    await this.transactions.run(async (transaction) => {
      await this.repository.delete(scope, id, transaction);
      await this.audit.record(
        attendanceAuditEntry(tenant, AttendanceAction.deleted, current, {
          before: current.total,
          after: null,
        }),
        transaction,
      );
    });
  }
}
