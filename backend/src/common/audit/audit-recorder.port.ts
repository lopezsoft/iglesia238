import type { Transaction } from '../persistence/transaction.js';

export const AUDIT_RECORDER = Symbol('AUDIT_RECORDER');

/** Shape the frontend renders: one entry per changed field. */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

/** Who did it and where. A TenantContext fits this shape. */
export interface AuditActor {
  userId: number | null;
  denominationId: number | null;
  congregationId: number | null;
}

export interface AuditEntry {
  /** Verb in upper snake case, at most 40 characters: CREATED, UPDATED, CERTIFICATE_ISSUED. */
  action: string;
  /** Prisma model name, at most 80 characters: Congregation, VowPledge, Certificate. */
  entity: string;
  entityId: string | number;
  actor: AuditActor;
  /**
   * Tenant the change belongs to when it differs from the actor's, for example a platform
   * administrator creating a denomination.
   */
  denominationId?: number | null;
  congregationId?: number | null;
  /** Build it with buildAuditChanges(): it contains no personal data. */
  changes?: AuditChanges;
  ipAddress?: string | null;
}

/**
 * Writes to the append-only audit log. Pass the transaction of the operation so the log entry commits
 * or rolls back with the change it describes.
 */
export interface AuditRecorder {
  record(entry: AuditEntry, transaction?: Transaction): Promise<void>;
}
