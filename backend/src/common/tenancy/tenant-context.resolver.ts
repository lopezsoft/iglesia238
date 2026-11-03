import { Inject, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ForbiddenDomainException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import {
  ASSIGNMENTS_READER,
  type AssignmentsReader,
  type RoleAssignmentView,
} from './assignments-reader.port.js';
import { ParsedScope, parseScopeKey } from './scope-key.js';
import { TenantContext } from './tenant-context.js';

export interface ResolveScopeInput {
  userId: number;
  sessionId: string;
  /** Value of the X-Scope header. */
  rawScope: string;
}

const SCOPE_FORBIDDEN_MESSAGE = 'No tienes acceso a ese alcance.';

/**
 * Turns the requested scope into a TenantContext, or rejects it. Coverage rules:
 * PLATFORM covers only the platform; DENOMINATION covers itself and its congregations;
 * CONGREGATION covers only that congregation.
 */
@Injectable()
export class TenantContextResolver {
  constructor(
    @Inject(ASSIGNMENTS_READER) private readonly reader: AssignmentsReader,
  ) {}

  async resolve(input: ResolveScopeInput): Promise<TenantContext> {
    const requested = parseScopeKey(input.rawScope);
    const access = await this.reader.loadAccess(input.userId);
    if (!access?.isActive) {
      throw new UnauthenticatedException();
    }

    const denominationId = await this.denominationOf(
      requested,
      access.assignments,
    );
    const covering = access.assignments.filter((assignment) =>
      covers(assignment, requested, denominationId),
    );
    const isUnknownTenant =
      requested.kind !== 'PLATFORM' && denominationId === null;
    if (covering.length === 0 || isUnknownTenant) {
      // The same answer whether the scope does not exist or belongs to someone else.
      throw new ForbiddenDomainException(
        SCOPE_FORBIDDEN_MESSAGE,
        ErrorCode.SCOPE_FORBIDDEN,
      );
    }

    return new TenantContext({
      userId: input.userId,
      sessionId: input.sessionId,
      scopeKey: requested.scopeKey,
      kind: requested.kind,
      denominationId,
      congregationId: requested.congregationId,
      roleCodes: [...new Set(covering.map((a) => a.roleCode))],
      permissions: new Set(covering.flatMap((a) => a.permissions)),
    });
  }

  private async denominationOf(
    requested: ParsedScope,
    assignments: readonly RoleAssignmentView[],
  ): Promise<number | null> {
    if (requested.kind !== 'CONGREGATION') {
      return requested.denominationId;
    }
    const direct = assignments.find(
      (assignment) => assignment.congregationId === requested.congregationId,
    );
    if (direct) {
      return direct.denominationId;
    }
    // A denomination administrator reaches the congregation through its denomination.
    return this.reader.findCongregationDenominationId(
      requested.congregationId as number,
    );
  }
}

function covers(
  assignment: RoleAssignmentView,
  requested: ParsedScope,
  requestedDenominationId: number | null,
): boolean {
  switch (assignment.kind) {
    case 'PLATFORM':
      return requested.kind === 'PLATFORM';
    case 'DENOMINATION':
      return (
        requested.kind !== 'PLATFORM' &&
        assignment.denominationId === requestedDenominationId
      );
    case 'CONGREGATION':
      return (
        requested.kind === 'CONGREGATION' &&
        assignment.congregationId === requested.congregationId &&
        assignment.denominationId === requestedDenominationId
      );
  }
}
