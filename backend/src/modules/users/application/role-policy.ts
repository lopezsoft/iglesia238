import {
  ErrorCode,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  formatScopeKey,
  type ScopeKind,
} from '../../../common/tenancy/scope-key.js';
import type { GrantScopeReader, Visibility } from './users.ports.js';

/** Roles that let a user manage users: revoking your own would lock you out. */
export const ADMIN_ROLE_CODES: readonly string[] = [
  'PLATFORM_ADMIN',
  'DENOMINATION_ADMIN',
];

/** Kind of scope each role is granted on. */
export const ROLE_SCOPE_KIND: Readonly<Record<string, ScopeKind>> = {
  PLATFORM_ADMIN: 'PLATFORM',
  DENOMINATION_ADMIN: 'DENOMINATION',
  PASTOR: 'CONGREGATION',
  SECRETARY: 'CONGREGATION',
  TREASURER: 'CONGREGATION',
};

export const CONGREGATION_ROLE_CODES: readonly string[] = [
  'PASTOR',
  'SECRETARY',
  'TREASURER',
];

/** Who is managing users: the platform team or the administrator of one denomination. */
export interface UserManager {
  readonly userId: number;
  readonly isPlatformAdmin: boolean;
  readonly denominationId: number | null;
}

export function managerOf(context: TenantContext): UserManager {
  if (context.kind === 'PLATFORM') {
    return {
      userId: context.userId,
      isPlatformAdmin: true,
      denominationId: null,
    };
  }
  return {
    userId: context.userId,
    isPlatformAdmin: false,
    denominationId: context.tenantScope().denominationId,
  };
}

export function visibilityOf(manager: UserManager): Visibility {
  return manager.isPlatformAdmin || manager.denominationId === null
    ? { kind: 'PLATFORM' }
    : { kind: 'DENOMINATION', denominationId: manager.denominationId };
}

export interface RequestedScope {
  readonly role: string;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export interface ResolvedScope {
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly scopeKey: string;
}

/**
 * Decides where a role may be granted and by whom. Granting and inviting use the SAME policy, and
 * the grant context offered to the screen is built from the same rules.
 */
export async function resolveGrantScope(
  manager: UserManager,
  requested: RequestedScope,
  scopes: GrantScopeReader,
): Promise<ResolvedScope> {
  const kind = ROLE_SCOPE_KIND[requested.role];
  if (!kind) {
    throw new InvalidInputException('El rol no es válido.', 'INVALID_ROLE');
  }

  switch (kind) {
    case 'PLATFORM':
      if (!manager.isPlatformAdmin) {
        throw new ForbiddenDomainException(
          'Solo el equipo de plataforma puede otorgar el rol Administrador de plataforma.',
        );
      }
      return {
        scope: 'PLATFORM',
        denominationId: null,
        congregationId: null,
        scopeKey: formatScopeKey('PLATFORM'),
      };

    case 'DENOMINATION': {
      if (
        !manager.isPlatformAdmin &&
        requested.denominationId !== null &&
        requested.denominationId !== manager.denominationId
      ) {
        throw new ForbiddenDomainException(
          'Solo puedes otorgar roles dentro de tu denominación.',
        );
      }
      const denominationId = manager.isPlatformAdmin
        ? requested.denominationId
        : manager.denominationId;
      if (denominationId === null) {
        throw new InvalidInputException(
          'Selecciona la denominación.',
          ErrorCode.SCOPE_REQUIRED,
        );
      }
      const denomination = await scopes.findActiveDenomination(denominationId);
      if (!denomination) {
        throw new InvalidInputException(
          'Selecciona una denominación activa.',
          'INVALID_SCOPE',
        );
      }
      return {
        scope: 'DENOMINATION',
        denominationId: denomination.id,
        congregationId: null,
        scopeKey: formatScopeKey('DENOMINATION', denomination.id),
      };
    }

    case 'CONGREGATION': {
      if (requested.congregationId === null) {
        throw new InvalidInputException(
          'Selecciona la sede en la que aplica el rol.',
          ErrorCode.SCOPE_REQUIRED,
        );
      }
      const congregation = await scopes.findActiveCongregation(
        requested.congregationId,
      );
      // A sede of another denomination looks the same as one that does not exist.
      if (
        !congregation ||
        (!manager.isPlatformAdmin &&
          congregation.denominationId !== manager.denominationId)
      ) {
        throw new NotFoundDomainException('La sede no existe o está inactiva.');
      }
      return {
        scope: 'CONGREGATION',
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        scopeKey: formatScopeKey('CONGREGATION', congregation.id),
      };
    }
  }
}
