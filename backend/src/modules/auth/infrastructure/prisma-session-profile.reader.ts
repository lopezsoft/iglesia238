import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { SessionProfileReader } from '../application/ports/session-profile.reader.js';
import {
  type AssignmentView,
  PLATFORM_SCOPE_LABEL,
  type ScopeView,
  denominationScopeLabel,
  displayNameOf,
  scopeKeyOf,
  type SessionView,
} from '../application/session-view.js';

const KIND_ORDER = { PLATFORM: 0, DENOMINATION: 1, CONGREGATION: 2 } as const;

@Injectable()
export class PrismaSessionProfileReader implements SessionProfileReader {
  constructor(private readonly prisma: PrismaService) {}

  async load(userId: number): Promise<SessionView | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerifiedAt: true,
        roleAssignments: {
          where: { revokedAt: null },
          orderBy: { id: 'asc' },
          select: {
            scope: true,
            denominationId: true,
            congregationId: true,
            role: {
              select: {
                code: true,
                name: true,
                rolePermissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
            denomination: {
              select: { name: true, isActive: true, deletedAt: true },
            },
            congregation: {
              select: {
                name: true,
                isActive: true,
                deletedAt: true,
                denomination: {
                  select: { isActive: true, deletedAt: true },
                },
              },
            },
          },
        },
      },
    });
    if (!user) {
      return null;
    }

    const assignments: AssignmentView[] = [];
    for (const row of user.roleAssignments) {
      const scope = this.scopeOf(row);
      if (!scope) {
        continue;
      }
      assignments.push({
        role: row.role.code,
        roleName: row.role.name,
        permissions: row.role.rolePermissions
          .map((link) => link.permission.code)
          .sort(),
        scope,
      });
    }

    return {
      id: user.id,
      displayName: displayNameOf(user.displayName, user.email),
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      assignments,
      selectableScopes: await this.selectableScopes(assignments),
    };
  }

  /** The scope of a role, or null when what it points to cannot be used anymore. */
  private scopeOf(row: AssignmentRow): ScopeView | null {
    switch (row.scope) {
      case 'PLATFORM':
        return {
          kind: 'PLATFORM',
          denominationId: null,
          congregationId: null,
          label: PLATFORM_SCOPE_LABEL,
        };
      case 'DENOMINATION': {
        const denomination = row.denomination;
        if (!denomination || !denomination.isActive || denomination.deletedAt) {
          return null;
        }
        return {
          kind: 'DENOMINATION',
          denominationId: row.denominationId,
          congregationId: null,
          label: denominationScopeLabel(denomination.name),
        };
      }
      case 'CONGREGATION': {
        const congregation = row.congregation;
        const parent = congregation?.denomination;
        if (
          !congregation ||
          !congregation.isActive ||
          congregation.deletedAt ||
          !parent?.isActive ||
          parent.deletedAt
        ) {
          return null;
        }
        return {
          kind: 'CONGREGATION',
          denominationId: row.denominationId,
          congregationId: row.congregationId,
          label: congregation.name,
        };
      }
    }
  }

  /**
   * The scope of every role, plus each active congregation of the denominations the user administers.
   * Ordered platform, denomination, congregations by name.
   */
  private async selectableScopes(
    assignments: readonly AssignmentView[],
  ): Promise<ScopeView[]> {
    const scopes = new Map<string, ScopeView>();
    for (const assignment of assignments) {
      scopes.set(scopeKeyOf(assignment.scope), assignment.scope);
    }

    const denominationIds = assignments
      .filter((assignment) => assignment.scope.kind === 'DENOMINATION')
      .map((assignment) => assignment.scope.denominationId as number);
    if (denominationIds.length > 0) {
      const congregations = await this.prisma.congregation.findMany({
        where: {
          denominationId: { in: denominationIds },
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, denominationId: true, name: true },
      });
      for (const congregation of congregations) {
        const scope: ScopeView = {
          kind: 'CONGREGATION',
          denominationId: congregation.denominationId,
          congregationId: congregation.id,
          label: congregation.name,
        };
        scopes.set(scopeKeyOf(scope), scope);
      }
    }

    return [...scopes.values()].sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.label.localeCompare(b.label, 'es'),
    );
  }
}

interface AssignmentRow {
  scope: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';
  denominationId: number | null;
  congregationId: number | null;
  denomination: {
    name: string;
    isActive: boolean;
    deletedAt: Date | null;
  } | null;
  congregation: {
    name: string;
    isActive: boolean;
    deletedAt: Date | null;
    denomination: { isActive: boolean; deletedAt: Date | null };
  } | null;
}
