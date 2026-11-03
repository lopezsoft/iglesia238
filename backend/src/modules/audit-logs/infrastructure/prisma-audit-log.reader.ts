import { Injectable } from '@nestjs/common';
import { bigIntToNumber } from '../../../common/mappers/value-mappers.js';
import { toSkipTake } from '../../../common/pagination/page.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AuditLogReader,
  AuditRow,
  AuditScope,
  AuditSearch,
  AuditUserRef,
} from '../application/audit-logs.ports.js';

function scopeWhere(scope: AuditScope): Prisma.AuditLogWhereInput {
  return {
    ...(scope.denominationId === null
      ? {}
      : { denominationId: scope.denominationId }),
    ...(scope.congregationId === null
      ? {}
      : { congregationId: scope.congregationId }),
  };
}

function searchWhere(
  scope: AuditScope,
  search: Pick<AuditSearch, 'from' | 'to' | 'userId' | 'action' | 'entity'>,
): Prisma.AuditLogWhereInput {
  return {
    ...scopeWhere(scope),
    ...(search.from || search.to
      ? {
          createdAt: {
            ...(search.from ? { gte: search.from } : {}),
            ...(search.to ? { lte: search.to } : {}),
          },
        }
      : {}),
    ...(search.userId === null ? {} : { userId: search.userId }),
    ...(search.action ? { action: search.action } : {}),
    ...(search.entity ? { entity: search.entity } : {}),
  };
}

@Injectable()
export class PrismaAuditLogReader implements AuditLogReader {
  constructor(private readonly prisma: PrismaService) {}

  async search(scope: AuditScope, search: AuditSearch) {
    const where = searchWhere(scope, search);
    const [rows, total, counts] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(search),
      }),
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true },
      }),
    ]);
    return {
      rows: rows.map((row): AuditRow => ({
        id: bigIntToNumber(row.id),
        createdAt: row.createdAt,
        userId: row.userId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        denominationId: row.denominationId,
        congregationId: row.congregationId,
        changes: row.changes,
        ipAddress: row.ipAddress,
      })),
      total,
      actionCounts: new Map(counts.map((c) => [c.action, c._count._all])),
    };
  }

  async findUsers(
    ids: readonly number[],
  ): Promise<ReadonlyMap<number, AuditUserRef>> {
    if (ids.length === 0) {
      return new Map();
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        displayName: true,
        email: true,
        roleAssignments: {
          where: { scope: 'PLATFORM', revokedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    return new Map(
      users.map((user) => [
        user.id,
        {
          name: user.displayName?.trim() || user.email,
          isPlatformAdmin: user.roleAssignments.length > 0,
        },
      ]),
    );
  }

  async findCongregationNames(
    ids: readonly number[],
  ): Promise<ReadonlyMap<number, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.congregation.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async findFilterValues(scope: AuditScope, since: Date) {
    const where: Prisma.AuditLogWhereInput = {
      ...scopeWhere(scope),
      createdAt: { gte: since },
    };
    const [users, actions, entities] = await Promise.all([
      this.prisma.auditLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
      }),
      this.prisma.auditLog.groupBy({ by: ['action'], where }),
      this.prisma.auditLog.groupBy({ by: ['entity'], where }),
    ]);
    return {
      userIds: users.flatMap((row) =>
        row.userId === null ? [] : [row.userId],
      ),
      actions: actions.map((row) => row.action),
      entities: entities.map((row) => row.entity),
    };
  }
}
