import { Injectable } from '@nestjs/common';
import { UNUSABLE_PASSWORD_HASH } from '../../../common/security/password-hasher.port.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  DashboardStatsReader,
  DenominationCounts,
  StatsScope,
  UserCounts,
} from '../application/ports/dashboard-stats.reader.js';

@Injectable()
export class PrismaDashboardStatsReader implements DashboardStatsReader {
  constructor(private readonly prisma: PrismaService) {}

  async countDenominations(): Promise<DenominationCounts> {
    const [active, inactive] = await Promise.all([
      this.prisma.denomination.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.denomination.count({
        where: { deletedAt: null, isActive: false },
      }),
    ]);
    return { active, inactive };
  }

  countActiveCongregations(scope: StatsScope): Promise<number> {
    return this.prisma.congregation.count({
      where: {
        isActive: true,
        deletedAt: null,
        ...(scope.denominationId === null
          ? {}
          : { denominationId: scope.denominationId }),
        ...(scope.congregationId === null ? {} : { id: scope.congregationId }),
      },
    });
  }

  async countUsers(scope: StatsScope): Promise<UserCounts> {
    const covering = this.rolesCovering(scope);
    const enabled: Prisma.UserWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(covering ? { roleAssignments: { some: covering } } : {}),
    };
    const [active, pendingInvitations] = await Promise.all([
      this.prisma.user.count({
        where: { ...enabled, passwordHash: { not: UNUSABLE_PASSWORD_HASH } },
      }),
      this.prisma.user.count({
        where: { ...enabled, passwordHash: UNUSABLE_PASSWORD_HASH },
      }),
    ]);
    return { active, pendingInvitations };
  }

  countLockedAccounts(now: Date): Promise<number> {
    return this.prisma.user.count({
      where: { deletedAt: null, lockedUntil: { gt: now } },
    });
  }

  /** Active roles that reach the scope: a denomination role reaches its congregations. Null for the platform. */
  private rolesCovering(scope: StatsScope): Prisma.UserRoleWhereInput | null {
    if (scope.denominationId === null) {
      return null;
    }
    if (scope.congregationId === null) {
      return { revokedAt: null, denominationId: scope.denominationId };
    }
    return {
      revokedAt: null,
      denominationId: scope.denominationId,
      OR: [{ congregationId: scope.congregationId }, { scope: 'DENOMINATION' }],
    };
  }
}
