import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import type { AuditEntry } from '../../../common/audit/audit-recorder.port.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';

export const ATTENDANCE_ENTITY = 'AttendanceSession';

export const AttendanceAction = {
  recorded: 'ATTENDANCE_RECORDED',
  updated: 'ATTENDANCE_UPDATED',
  deleted: 'ATTENDANCE_DELETED',
} as const;

/** Audit entry of a session change: only the total and the sede, never personal data. */
export function attendanceAuditEntry(
  tenant: TenantContext,
  action: string,
  session: { id: number; congregationId: number },
  totals: { before: number | null; after: number | null },
): AuditEntry {
  return {
    action,
    entity: ATTENDANCE_ENTITY,
    entityId: session.id,
    actor: tenant,
    congregationId: session.congregationId,
    changes: buildAuditChanges(
      { total: totals.before },
      { total: totals.after },
      ['total'],
    ),
  };
}
