import { Injectable } from '@nestjs/common';
import {
  AssignmentsReader,
  UserAccess,
} from '../../common/tenancy/assignments-reader.port.js';
import { PrismaService } from './prisma.service.js';

/**
 * Reads the active role assignments (revoked_at IS NULL) with the permissions of each role. The roles of
 * a denomination that was deactivated (or deleted) do not count: its users cannot act on it anymore.
 * Neither do the roles tied to a congregation that was deactivated or deleted, so the API closes the
 * same door the session hides in the UI.
 */
@Injectable()
export class PrismaAssignmentsReader implements AssignmentsReader {
  constructor(private readonly prisma: PrismaService) {}

  async loadAccess(userId: number): Promise<UserAccess | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        isActive: true,
        roleAssignments: {
          where: {
            revokedAt: null,
            AND: [
              {
                OR: [
                  { denominationId: null },
                  { denomination: { isActive: true, deletedAt: null } },
                ],
              },
              {
                OR: [
                  { congregationId: null },
                  { congregation: { isActive: true, deletedAt: null } },
                ],
              },
            ],
          },
          select: {
            scope: true,
            scopeKey: true,
            denominationId: true,
            congregationId: true,
            role: {
              select: {
                code: true,
                rolePermissions: {
                  select: { permission: { select: { code: true } } },
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

    return {
      userId: user.id,
      isActive: user.isActive,
      assignments: user.roleAssignments.map((assignment) => ({
        roleCode: assignment.role.code,
        kind: assignment.scope,
        scopeKey: assignment.scopeKey,
        denominationId: assignment.denominationId,
        congregationId: assignment.congregationId,
        permissions: assignment.role.rolePermissions.map(
          (link) => link.permission.code,
        ),
      })),
    };
  }

  async findCongregationDenominationId(
    congregationId: number,
  ): Promise<number | null> {
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: congregationId,
        isActive: true,
        deletedAt: null,
        denomination: { isActive: true, deletedAt: null },
      },
      select: { denominationId: true },
    });
    return congregation?.denominationId ?? null;
  }
}
