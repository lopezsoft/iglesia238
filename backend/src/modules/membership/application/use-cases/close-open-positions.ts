import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { CommandContext } from '../command-context.js';
import type { PositionRepository } from '../ports/member-details.repositories.js';

/**
 * Only active members hold church positions: leaving ACTIVE closes every open position on the same
 * date (never before the position started). Returns how many were closed.
 */
export async function closeOpenPositions(
  positions: PositionRepository,
  audit: AuditRecorder,
  context: CommandContext,
  member: { id: number; congregationId: number },
  date: string,
  transaction: Transaction,
): Promise<number> {
  const open = await positions.openPositionsOf(
    context.scope,
    member.id,
    transaction,
  );
  for (const row of open) {
    const endedOn =
      row.startedOn !== null && row.startedOn > date ? row.startedOn : date;
    await positions.close(context.scope, row.id, endedOn, transaction);
    await audit.record(
      {
        action: 'UPDATED',
        entity: 'MemberPosition',
        entityId: row.id,
        actor: context.actor,
        congregationId: member.congregationId,
        changes: { endedOn: { from: null, to: endedOn } },
        ipAddress: context.ipAddress,
      },
      transaction,
    );
  }
  return open.length;
}
