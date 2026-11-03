import { Inject, Injectable } from '@nestjs/common';
import { Page, buildPage } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  CONGREGATION_ROLE_CODES,
  managerOf,
  visibilityOf,
} from './role-policy.js';
import {
  GRANT_SCOPE_READER,
  ROLE_CATALOG,
  USER_DIRECTORY,
  type GrantScopeReader,
  type RoleCatalog,
  type UserDirectory,
  type UserListFilter,
} from './users.ports.js';
import { type ManagedUserView, toManagedUserView } from './users.views.js';
import type { ScopeKind } from '../../../common/tenancy/scope-key.js';
import { ROLE_SCOPE_KIND } from './role-policy.js';

@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_DIRECTORY) private readonly users: UserDirectory) {}

  async execute(
    context: TenantContext,
    filter: UserListFilter,
  ): Promise<Page<ManagedUserView>> {
    const manager = managerOf(context);
    const { items, total } = await this.users.list(
      visibilityOf(manager),
      filter,
    );
    return buildPage(
      items.map((user) => toManagedUserView(user, manager)),
      total,
      filter,
    );
  }
}

export interface ScopeOptionView {
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly label: string;
}

export interface GrantableRoleView {
  readonly role: string;
  readonly scopes: readonly ScopeOptionView[];
}

export interface GrantContextView {
  readonly isPlatformAdmin: boolean;
  /** "Iglesia Cristiana Monte de Sion" or "Plataforma". */
  readonly audienceLabel: string;
  readonly roles: readonly GrantableRoleView[];
}

/** Roles and scopes the administrator may grant: the same rules that grantRole enforces. */
@Injectable()
export class GetGrantContextUseCase {
  constructor(
    @Inject(GRANT_SCOPE_READER) private readonly scopes: GrantScopeReader,
  ) {}

  async execute(context: TenantContext): Promise<GrantContextView> {
    const manager = managerOf(context);
    if (manager.isPlatformAdmin) {
      return this.platformContext();
    }
    return this.denominationContext(manager.denominationId as number);
  }

  private async platformContext(): Promise<GrantContextView> {
    const [denominations, congregations] = await Promise.all([
      this.scopes.listActiveDenominations(),
      this.scopes.listActiveCongregations(null),
    ]);
    const congregationScopes: ScopeOptionView[] = congregations.map((row) => ({
      kind: 'CONGREGATION',
      denominationId: row.denominationId,
      congregationId: row.id,
      label: `${row.name} · ${row.denominationName}`,
    }));
    return {
      isPlatformAdmin: true,
      audienceLabel: 'Plataforma',
      roles: [
        {
          role: 'PLATFORM_ADMIN',
          scopes: [
            {
              kind: 'PLATFORM',
              denominationId: null,
              congregationId: null,
              label: 'Plataforma',
            },
          ],
        },
        {
          role: 'DENOMINATION_ADMIN',
          scopes: denominations.map((row) => ({
            kind: 'DENOMINATION',
            denominationId: row.id,
            congregationId: null,
            label: `Toda la denominación · ${row.name}`,
          })),
        },
        ...CONGREGATION_ROLE_CODES.map((role) => ({
          role,
          scopes: congregationScopes,
        })),
      ],
    };
  }

  private async denominationContext(
    denominationId: number,
  ): Promise<GrantContextView> {
    const [name, congregations] = await Promise.all([
      this.scopes.findDenominationName(denominationId),
      this.scopes.listActiveCongregations(denominationId),
    ]);
    const congregationScopes: ScopeOptionView[] = congregations.map((row) => ({
      kind: 'CONGREGATION',
      denominationId,
      congregationId: row.id,
      label: row.name,
    }));
    return {
      isPlatformAdmin: false,
      audienceLabel: name ?? 'Denominación',
      roles: [
        {
          role: 'DENOMINATION_ADMIN',
          scopes: [
            {
              kind: 'DENOMINATION',
              denominationId,
              congregationId: null,
              label: 'Toda la denominación',
            },
          ],
        },
        ...CONGREGATION_ROLE_CODES.map((role) => ({
          role,
          scopes: congregationScopes,
        })),
      ],
    };
  }
}

export interface RoleMatrixRow {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly scopeKind: ScopeKind | null;
  readonly permissions: readonly string[];
}

export interface RoleMatrixView {
  readonly roles: readonly RoleMatrixRow[];
  readonly permissions: readonly { code: string; description: string | null }[];
}

/** Roles with their permissions, read from the database (the single source of truth). */
@Injectable()
export class ListRolesUseCase {
  constructor(@Inject(ROLE_CATALOG) private readonly roles: RoleCatalog) {}

  async execute(): Promise<RoleMatrixView> {
    const roles = await this.roles.list();
    const permissions = new Map<string, string | null>();
    for (const role of roles) {
      for (const permission of role.permissions) {
        permissions.set(permission.code, permission.description);
      }
    }
    return {
      roles: roles.map((role) => ({
        code: role.code,
        name: role.name,
        description: role.description,
        scopeKind: ROLE_SCOPE_KIND[role.code] ?? null,
        permissions: role.permissions.map((permission) => permission.code),
      })),
      permissions: [...permissions]
        .map(([code, description]) => ({ code, description }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}
