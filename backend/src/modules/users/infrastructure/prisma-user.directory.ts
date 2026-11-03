import { Injectable } from '@nestjs/common';
import { toSkipTake } from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AssignmentRecord,
  NewAssignment,
  UserDirectory,
  UserListFilter,
  UserRecord,
  UserStatus,
  Visibility,
} from '../application/users.ports.js';

const ASSIGNMENT_SELECT = {
  id: true,
  userId: true,
  scope: true,
  denominationId: true,
  congregationId: true,
  grantedById: true,
  createdAt: true,
  revokedAt: true,
  role: { select: { code: true } },
  denomination: { select: { name: true } },
  congregation: { select: { name: true } },
  grantedBy: {
    select: {
      displayName: true,
      roleAssignments: {
        where: { scope: 'PLATFORM', revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.UserRoleSelect;

type AssignmentRow = Prisma.UserRoleGetPayload<{
  select: typeof ASSIGNMENT_SELECT;
}>;

/** Where clause that limits assignments to what the viewer may see. */
function assignmentVisibility(
  visibility: Visibility,
): Prisma.UserRoleWhereInput {
  return visibility.kind === 'DENOMINATION'
    ? { denominationId: visibility.denominationId }
    : {};
}

function toAssignment(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    userId: row.userId,
    roleCode: row.role.code,
    scope: row.scope,
    denominationId: row.denominationId,
    congregationId: row.congregationId,
    denominationName: row.denomination?.name ?? null,
    congregationName: row.congregation?.name ?? null,
    grantedById: row.grantedById,
    grantedByName: row.grantedBy?.displayName ?? null,
    grantedByPlatform: (row.grantedBy?.roleAssignments.length ?? 0) > 0,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

function userSelect(visibility: Visibility) {
  return {
    id: true,
    displayName: true,
    email: true,
    isActive: true,
    passwordHash: true,
    lastLoginAt: true,
    roleAssignments: {
      where: assignmentVisibility(visibility),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: ASSIGNMENT_SELECT,
    },
    _count: {
      select: {
        roleAssignments: {
          where:
            visibility.kind === 'DENOMINATION'
              ? {
                  // Revoked ones count too: an account that once worked elsewhere is not this tenant's.
                  OR: [
                    { denominationId: null },
                    { denominationId: { not: visibility.denominationId } },
                  ],
                }
              : // The platform sees every assignment: nothing is hidden from it (no id is negative).
                { id: -1 },
        },
      },
    },
  } satisfies Prisma.UserSelect;
}

type UserRow = Prisma.UserGetPayload<{
  select: ReturnType<typeof userSelect>;
}>;

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    isActive: row.isActive,
    hasPassword: row.passwordHash !== UNUSABLE_PASSWORD_HASH,
    lastLoginAt: row.lastLoginAt,
    assignments: row.roleAssignments.map(toAssignment),
    hasHiddenAssignments: row._count.roleAssignments > 0,
  };
}

function statusWhere(status: UserStatus): Prisma.UserWhereInput {
  switch (status) {
    case 'ACTIVE':
      return { isActive: true, NOT: { passwordHash: UNUSABLE_PASSWORD_HASH } };
    case 'INVITATION_PENDING':
      return { isActive: true, passwordHash: UNUSABLE_PASSWORD_HASH };
    case 'INACTIVE':
      return { isActive: false };
  }
}

@Injectable()
export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly prisma: PrismaService) {}

  private visibleUsers(visibility: Visibility): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      ...(visibility.kind === 'DENOMINATION'
        ? {
            roleAssignments: {
              some: { denominationId: visibility.denominationId },
            },
          }
        : {}),
    };
  }

  async list(
    visibility: Visibility,
    filter: UserListFilter,
  ): Promise<{ items: UserRecord[]; total: number }> {
    const filters: Prisma.UserWhereInput[] = [];
    if (filter.search !== '') {
      filters.push({
        OR: [
          { displayName: { contains: filter.search } },
          { email: { contains: filter.search } },
        ],
      });
    }
    if (filter.role !== null) {
      filters.push({
        roleAssignments: {
          some: {
            ...assignmentVisibility(visibility),
            revokedAt: null,
            role: { code: filter.role },
          },
        },
      });
    }
    if (filter.status !== null) {
      filters.push(statusWhere(filter.status));
    }
    const where: Prisma.UserWhereInput = {
      ...this.visibleUsers(visibility),
      AND: filters,
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userSelect(visibility),
        orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
        ...toSkipTake(filter),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toUser), total };
  }

  async findVisible(
    visibility: Visibility,
    userId: number,
  ): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { ...this.visibleUsers(visibility), id: userId },
      select: userSelect(visibility),
    });
    return row ? toUser(row) : null;
  }

  async findIdByEmail(email: string): Promise<number | null> {
    const row = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async createInvitedUser(
    data: { email: string; displayName: string },
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(this.prisma, transaction).user.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        passwordHash: UNUSABLE_PASSWORD_HASH,
      },
      select: { id: true },
    });
    return created.id;
  }

  async findAssignment(
    visibility: Visibility,
    assignmentId: number,
  ): Promise<AssignmentRecord | null> {
    const row = await this.prisma.userRole.findFirst({
      where: { id: assignmentId, ...assignmentVisibility(visibility) },
      select: ASSIGNMENT_SELECT,
    });
    return row ? toAssignment(row) : null;
  }

  async hasActiveAssignment(
    userId: number,
    roleCode: string,
    scopeKey: string,
  ): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, scopeKey, revokedAt: null, role: { code: roleCode } },
    });
    return count > 0;
  }

  async insertAssignment(
    assignment: NewAssignment,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const role = await client.role.findUniqueOrThrow({
      where: { code: assignment.roleCode },
      select: { id: true },
    });
    const created = await client.userRole.create({
      data: {
        userId: assignment.userId,
        roleId: role.id,
        scope: assignment.scope,
        denominationId: assignment.denominationId,
        congregationId: assignment.congregationId,
        scopeKey: assignment.scopeKey,
        grantedById: assignment.grantedById,
      },
      select: { id: true },
    });
    return created.id;
  }

  async revokeAssignment(
    assignmentId: number,
    revokedAt: Date,
    transaction: Transaction,
  ): Promise<void> {
    // activeKey goes back to NULL so the same role can be granted again later.
    await clientOf(this.prisma, transaction).userRole.update({
      where: { id: assignmentId },
      data: { revokedAt, activeKey: null },
    });
  }
}
