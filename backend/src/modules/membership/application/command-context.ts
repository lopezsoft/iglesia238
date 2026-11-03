import type { AuditActor } from '../../../common/audit/audit-recorder.port.js';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { MemberReference } from './member.models.js';
import type { MemberRepository } from './ports/member.repository.js';

/** Who acts and where. Built by the controller from the TenantContext of the request. */
export interface CommandContext {
  readonly scope: TenantScope;
  readonly actor: AuditActor;
  readonly ipAddress: string | null;
}

export const MEMBER_NOT_FOUND_MESSAGE =
  'No encontramos el miembro en la sede o denominación en la que actúas.';

/** A member of another congregation or denomination answers 404, never 403. */
export async function requireMember(
  members: MemberRepository,
  scope: TenantScope,
  memberId: number,
  transaction?: Transaction,
): Promise<MemberReference> {
  const member = await members.findReference(scope, memberId, transaction);
  if (!member) {
    throw new NotFoundDomainException(
      MEMBER_NOT_FOUND_MESSAGE,
      'MEMBER_NOT_FOUND',
    );
  }
  return member;
}
